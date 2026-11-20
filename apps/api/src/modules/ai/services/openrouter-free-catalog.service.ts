import { z } from 'zod';

import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import {
  OPENROUTER_FREE_AUTO,
  OpenRouterFreeModel,
  isOpenRouterFreeModelId,
} from '@openathlete/shared';

export const OPENROUTER_ORIGIN = 'https://openrouter.ai';
export const OPENROUTER_API = `${OPENROUTER_ORIGIN}/api/v1`;
const CATALOG_TTL_MS = 5 * 60_000;

const catalogSchema = z.object({ data: z.array(z.unknown()).max(2000) });
const modelSchema = z.object({
  id: z.string().max(180),
  name: z.string().max(250),
  supported_parameters: z.array(z.string()).optional(),
  architecture: z
    .object({ output_modalities: z.array(z.string()).optional() })
    .optional(),
  pricing: z.record(z.union([z.string(), z.number()])),
});

function isZero(value: unknown) {
  return (
    (typeof value === 'number' ||
      (typeof value === 'string' && value.trim() !== '')) &&
    Number(value) === 0
  );
}

export function parseFreeModels(value: unknown): OpenRouterFreeModel[] {
  const { data } = catalogSchema.parse(value);
  return data
    .flatMap((entry) => {
      const parsed = modelSchema.safeParse(entry);
      if (!parsed.success) return [];
      const model = parsed.data;
      if (
        !isOpenRouterFreeModelId(model.id) ||
        model.id === OPENROUTER_FREE_AUTO ||
        !isZero(model.pricing.prompt) ||
        !isZero(model.pricing.completion) ||
        !Object.values(model.pricing).every(isZero) ||
        (model.architecture?.output_modalities &&
          !model.architecture.output_modalities.includes('text'))
      )
        return [];

      return [
        {
          id: model.id,
          name: model.name,
          structuredOutput:
            model.supported_parameters?.includes('structured_outputs') ?? false,
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

@Injectable()
export class OpenRouterFreeCatalogService {
  private current?: { expiresAt: number; models: OpenRouterFreeModel[] };
  private pending?: Promise<OpenRouterFreeModel[]>;

  async list(): Promise<OpenRouterFreeModel[]> {
    if (this.current && this.current.expiresAt > Date.now())
      return this.current.models;
    this.pending ??= this.refresh().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async refresh(): Promise<OpenRouterFreeModel[]> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(`${OPENROUTER_API}/models`, {
          redirect: 'error',
          signal: AbortSignal.timeout(6500),
        });
        if (!response.ok) continue;
        const models = parseFreeModels(await response.json());
        this.current = { expiresAt: Date.now() + CATALOG_TTL_MS, models };
        return models;
      } catch {
        // A failed catalog refresh is retried once before reporting unavailability.
      }
    }
    throw new ServiceUnavailableException(
      'Could not load the OpenRouter free-model catalog',
    );
  }
}
