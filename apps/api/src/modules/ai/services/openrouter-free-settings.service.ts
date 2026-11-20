import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AiTask,
  ApiEnvSchemaType,
  OPENROUTER_FREE_AUTO,
  OPENROUTER_FREE_PROVIDER,
  OpenRouterFreeDto,
} from '@openathlete/shared';

import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { AiCredentialCipher, apiKeyHint } from './ai-credential-cipher';
import { AI_CREDENTIAL_CIPHER } from './ai-model-resolver.service';
import { AiPolicyService } from './ai-policy.service';
import {
  OPENROUTER_API,
  OPENROUTER_ORIGIN,
  OpenRouterFreeCatalogService,
} from './openrouter-free-catalog.service';

const AUTH_TTL_MS = 10 * 60_000;

@Injectable()
export class OpenRouterFreeSettingsService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService<ApiEnvSchemaType, true>,
    private readonly policy: AiPolicyService,
    private readonly catalog: OpenRouterFreeCatalogService,
    @Inject(AI_CREDENTIAL_CIPHER) private readonly cipher: AiCredentialCipher,
  ) {}

  createAuthorization(userId: number) {
    this.assertEnabled();
    const payload = `${Date.now()}.${randomBytes(18).toString('base64url')}`;
    const state = `${payload}.${this.sign('state', userId, payload)}`;
    const challenge = createHash('sha256')
      .update(this.sign('verifier', userId, state))
      .digest('base64url');
    const callback = new URL('/dashboard/settings', this.config.get('APP_URL'));
    callback.searchParams.set('tab', 'ai');
    callback.searchParams.set('openrouter_return', '1');
    const authorization = new URL('/auth', OPENROUTER_ORIGIN);
    authorization.search = new URLSearchParams({
      callback_url: callback.href,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      key_label: 'OpenAthlete Free AI',
      limit: '0.01',
    }).toString();
    return { url: authorization.href };
  }

  async exchange(userId: number, code: string, state: string) {
    this.assertEnabled();
    const match = /^(\d{13}\.[A-Za-z0-9_-]{24})\.([A-Za-z0-9_-]{43})$/.exec(
      state,
    );
    const age = match ? Date.now() - Number(match[1].split('.')[0]) : Infinity;
    if (
      !match ||
      age < 0 ||
      age > AUTH_TTL_MS ||
      !timingSafeEqual(
        Buffer.from(match[2]),
        Buffer.from(this.sign('state', userId, match[1])),
      )
    ) {
      throw new BadRequestException(
        'OpenRouter authorization has expired or is invalid',
      );
    }

    let key: string;
    try {
      const response = await fetch(`${OPENROUTER_API}/auth/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          code_verifier: this.sign('verifier', userId, state),
          code_challenge_method: 'S256',
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error();
      key = z
        .object({
          key: z
            .string()
            .min(12)
            .max(512)
            .regex(/^[A-Za-z0-9_-]+$/),
        })
        .parse(await response.json()).key;
    } catch {
      throw new BadRequestException(
        'Could not complete OpenRouter authorization. Start the sign-in again.',
      );
    }

    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT user_id FROM "user" WHERE user_id = ${userId} FOR UPDATE`;
      const existing = await tx.aiCredential.findFirst({
        where: { userId, provider: OPENROUTER_FREE_PROVIDER },
        select: { aiCredentialId: true },
      });
      const data = {
        encryptedApiKey: this.cipher.encrypt(key),
        apiKeyHint: apiKeyHint(key),
        lastError: null,
        lastErrorAt: null,
      };
      if (existing) {
        await tx.aiCredential.update({
          where: { aiCredentialId: existing.aiCredentialId },
          data,
        });
      } else {
        await tx.aiCredential.create({
          data: {
            ...data,
            userId,
            provider: OPENROUTER_FREE_PROVIDER,
            label: 'OpenRouter Free',
          },
        });
      }
    });
  }

  async status(userId: number): Promise<OpenRouterFreeDto> {
    if (!this.policy.openRouterFreeEnabled) {
      return {
        enabled: false,
        credentialId: null,
        selected: null,
        models: [],
        remaining: null,
      };
    }
    const [credential, preference, models] = await Promise.all([
      this.db.aiCredential.findFirst({
        where: { userId, provider: OPENROUTER_FREE_PROVIDER },
        select: { aiCredentialId: true, encryptedApiKey: true },
      }),
      this.db.aiModelPreference.findUnique({
        where: { userId_task: { userId, task: AiTask.DEFAULT } },
        select: { aiCredentialId: true, modelId: true },
      }),
      this.catalog.list().catch(() => []),
    ]);

    return {
      enabled: true,
      credentialId: credential?.aiCredentialId ?? null,
      selected:
        credential && preference?.aiCredentialId === credential.aiCredentialId
          ? preference.modelId
          : null,
      models,
      remaining: credential
        ? await this.freeQuota(credential.encryptedApiKey)
        : null,
    };
  }

  async selectModel(userId: number, modelId: string) {
    this.assertEnabled();
    if (
      modelId !== OPENROUTER_FREE_AUTO &&
      !(await this.catalog.list()).some((model) => model.id === modelId)
    ) {
      throw new BadRequestException(
        'This model is no longer in the free catalog',
      );
    }
    const credential = await this.db.aiCredential.findFirst({
      where: { userId, provider: OPENROUTER_FREE_PROVIDER },
      select: { aiCredentialId: true },
    });
    if (!credential)
      throw new ForbiddenException('Connect your OpenRouter account first');
    const data = { ...credential, modelId };
    await this.db.aiModelPreference.upsert({
      where: { userId_task: { userId, task: AiTask.DEFAULT } },
      create: { ...data, userId, task: AiTask.DEFAULT },
      update: data,
    });
  }

  private async freeQuota(encryptedKey: string) {
    try {
      const response = await fetch(`${OPENROUTER_API}/key`, {
        headers: {
          Authorization: `Bearer ${this.cipher.decrypt(encryptedKey)}`,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) return null;
      const schema = z.object({
        data: z.object({
          free_model_daily_requests: z
            .object({
              remaining: z.number().int().nonnegative(),
              limit: z.number().int().nonnegative(),
            })
            .optional(),
        }),
      });
      const info = schema.parse(await response.json()).data
        .free_model_daily_requests;
      return info ? { left: info.remaining, limit: info.limit } : null;
    } catch {
      return null;
    }
  }

  private assertEnabled() {
    if (!this.policy.openRouterFreeEnabled || !this.config.get('APP_URL')) {
      throw new ServiceUnavailableException('OpenRouter Free is disabled');
    }
  }

  private sign(purpose: string, userId: number, payload: string) {
    return createHmac('sha256', this.config.getOrThrow('JWT_SECRET_KEY'))
      .update(`openrouter-free:${purpose}:${userId}:${payload}`)
      .digest('base64url');
  }
}
