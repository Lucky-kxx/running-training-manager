import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { Injectable, Logger } from '@nestjs/common';

import {
  AiErrorCode,
  LOCAL_OLLAMA_PROVIDER,
  OPENROUTER_FREE_AUTO,
  OPENROUTER_FREE_PROVIDER,
  instructionTaskFor,
  isOpenRouterFreeModelId,
} from '@openathlete/shared';

import {
  ClaudeEffort,
  claudeEffortFor,
} from 'src/common/constants/ai-models.constant';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { AiProviderException, toAiProviderException } from '../ai.errors';
import { withCustomInstructions } from '../custom-instructions';
import {
  AiModelConfig,
  LOCAL_OLLAMA_ORIGIN,
  ResolvedAiModel,
} from './ai-model-resolver.service';
import { AiUsageService, TokenUsage } from './ai-usage.service';
import { OPENROUTER_API } from './openrouter-free-catalog.service';

/** What an agent is, independently of the model it runs on. */
export interface AgentSpec {
  id: string;
  name: string;
  description?: string;
  instructions: string;
  localInstructions?: string;
  preferJsonObject?: boolean;
  maxOutputTokens?: number;
  skipReasoning?: boolean;
}

type AiTextInput = string | { role: 'user' | 'assistant'; content: string }[];

const asMessages = (input: AiTextInput) =>
  typeof input === 'string'
    ? [{ role: 'user' as const, content: input }]
    : input;

const asMastraInput = (input: AiTextInput) =>
  typeof input === 'string'
    ? input
    : input.map(({ role, content }) =>
        role === 'user'
          ? { role: 'user' as const, content }
          : { role: 'assistant' as const, content },
      );

/** Long structured generations (full workouts) can take a while. */
const CALL_TIMEOUT_MS = 120_000;

/**
 * The provider SDK already retries transient failures (3 attempts with
 * backoff), so callers only retry invalid answers, never provider errors.
 */
const callSettings = () => ({
  abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
});

/** Claude's reasoning effort for the feature, where the model takes one */
const anthropicOptions = (
  model: ResolvedAiModel,
): { anthropic?: { effort: ClaudeEffort } } => {
  const effort = claudeEffortFor(model.task, model.provider, model.modelId);
  return effort ? { anthropic: { effort } } : {};
};

/**
 * Runs AI agents on the model the resolver picked: the user's own key or the
 * instance's. Every model call of the API goes through here, so errors are
 * translated once (rejected key, quota...) and keys' health is tracked.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: AiUsageService,
  ) {}

  async generateText(
    agent: AgentSpec,
    model: ResolvedAiModel,
    prompt: AiTextInput,
  ): Promise<string> {
    const spec = await this.withUserInstructions(agent, model);
    if (model.provider === OPENROUTER_FREE_PROVIDER) {
      return (
        await this.run(model, () =>
          this.generateOpenRouterText(spec, model.config, prompt),
        )
      ).text;
    }
    if (model.provider === LOCAL_OLLAMA_PROVIDER) {
      return (
        await this.run(model, () =>
          this.generateLocalText(spec, model.modelId, prompt),
        )
      ).text;
    }
    const result = await this.run(model, () =>
      this.createAgent(spec, model.config).generate(asMastraInput(prompt), {
        ...callSettings(),
        providerOptions: anthropicOptions(model),
        ...(spec.maxOutputTokens && {
          modelSettings: { maxOutputTokens: spec.maxOutputTokens },
        }),
      }),
    );
    if (!result.text?.trim()) {
      throw new AiProviderException(
        AiErrorCode.PROVIDER_ERROR,
        'The AI model returned an empty answer',
      );
    }
    return result.text;
  }

  /**
   * Generates a value matching the schema. Models without native JSON output,
   * and Claude, get the schema in the prompt instead; OpenAI's strict mode
   * stays off as it rejects recursive schemas (workout repeat blocks).
   */
  async generateObject<S extends z.ZodTypeAny>(
    agent: AgentSpec,
    model: ResolvedAiModel,
    prompt: AiTextInput,
    schema: S,
  ): Promise<z.output<S>> {
    const spec = await this.withUserInstructions(agent, model);
    if (model.provider === OPENROUTER_FREE_PROVIDER) {
      const format = zodToJsonSchema(
        schema as unknown as Parameters<typeof zodToJsonSchema>[0],
      );
      const result = await this.run(model, async () => {
        const { text, usage } = await this.generateOpenRouterText(
          spec,
          model.config,
          prompt,
          format,
        );
        try {
          const json = text
            .trim()
            .replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');
          return { object: schema.parse(JSON.parse(json)), usage };
        } catch {
          throw new AiProviderException(
            AiErrorCode.PROVIDER_ERROR,
            'The free model returned an invalid structured answer',
          );
        }
      });
      return result.object;
    }
    if (model.provider === LOCAL_OLLAMA_PROVIDER) {
      const local = await this.run(model, async () => {
        const result = await this.generateLocalText(
          spec,
          model.modelId,
          prompt,
          zodToJsonSchema(
            schema as unknown as Parameters<typeof zodToJsonSchema>[0],
          ),
        );
        return {
          object: schema.parse(JSON.parse(result.text)),
          usage: result.usage,
        };
      });
      return local.object;
    }
    const result = await this.run(model, () =>
      this.createAgent(spec, model.config).generate(asMastraInput(prompt), {
        ...callSettings(),
        structuredOutput: {
          schema,
          // Claude's native JSON output refuses recursive schemas (workout
          // repeat blocks): the schema goes in the prompt and the answer is
          // validated against it here
          jsonPromptInjection: model.provider === 'anthropic' ? true : 'auto',
        },
        providerOptions: {
          openai: { strictJsonSchema: false },
          ...anthropicOptions(model),
        },
      }),
    );
    if (result.object === undefined || result.object === null) {
      throw new AiProviderException(
        AiErrorCode.PROVIDER_ERROR,
        'The AI model did not return a valid result',
      );
    }
    return result.object as z.output<S>;
  }

  // Ollama applies a JSON schema during decoding. A prompt alone is unreliable
  // for smaller local models that may echo the schema instead of filling it.
  private async generateLocalText(
    agent: AgentSpec,
    modelId: string,
    prompt: AiTextInput,
    format?: object,
  ) {
    const response = await fetch(`${LOCAL_OLLAMA_ORIGIN}/api/chat`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: agent.instructions },
          ...asMessages(prompt),
        ],
        stream: false,
        ...(format && { format }),
        ...(modelId === 'qwen3:4b' && { think: false }),
        options: {
          temperature: 0.2,
          num_predict: agent.maxOutputTokens ?? 4096,
        },
      }),
    });
    if (!response.ok) {
      throw new AiProviderException(
        AiErrorCode.PROVIDER_ERROR,
        `Local model returned HTTP ${response.status}`,
      );
    }
    const data = (await response.json()) as {
      message?: { content?: unknown };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    const text = data.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new AiProviderException(
        AiErrorCode.PROVIDER_ERROR,
        'The local model returned an empty answer',
      );
    }
    return {
      text,
      usage: {
        inputTokens: data.prompt_eval_count,
        outputTokens: data.eval_count,
      },
    };
  }

  private async generateOpenRouterText(
    agent: AgentSpec,
    config: AiModelConfig,
    prompt: AiTextInput,
    format?: object,
  ) {
    if (
      !('providerId' in config) ||
      config.providerId !== OPENROUTER_FREE_PROVIDER ||
      !isOpenRouterFreeModelId(config.modelId)
    ) {
      throw new AiProviderException(
        AiErrorCode.PROVIDER_ERROR,
        'Only OpenRouter free variants are allowed',
      );
    }
    const response = await fetch(`${OPENROUTER_API}/chat/completions`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.modelId,
        messages: [
          { role: 'system', content: agent.instructions },
          ...asMessages(
            format && typeof prompt === 'string'
              ? `${prompt}

Return only a JSON value matching this schema: ${JSON.stringify(format)}`
              : prompt,
          ),
        ],
        ...(format &&
          config.modelId === OPENROUTER_FREE_AUTO && {
            response_format: agent.preferJsonObject
              ? { type: 'json_object' }
              : {
                  type: 'json_schema',
                  json_schema: { name: 'coach_result', schema: format },
                },
          }),
        ...((agent.preferJsonObject || agent.skipReasoning) && {
          reasoning: { enabled: false },
        }),
        provider: {
          max_price: { prompt: 0, completion: 0, request: 0 },
          data_collection: 'deny',
          ...(format &&
            agent.preferJsonObject &&
            config.modelId === OPENROUTER_FREE_AUTO && {
              require_parameters: true,
            }),
        },
        stream: false,
        max_tokens: agent.maxOutputTokens ?? 4096,
      }),
    });
    if (!response.ok) throw toAiProviderException({ status: response.status });
    const answer = (await response.json()) as {
      error?: { code?: string | number };
      choices?: {
        error?: { code?: string | number };
        message?: { content?: unknown };
      }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const upstreamError = answer.error ?? answer.choices?.[0]?.error;
    if (upstreamError) {
      throw toAiProviderException({ status: Number(upstreamError.code) });
    }
    const text = answer.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new AiProviderException(
        AiErrorCode.PROVIDER_ERROR,
        'The free model returned an empty answer',
      );
    }
    return {
      text,
      usage: {
        inputTokens: answer.usage?.prompt_tokens,
        outputTokens: answer.usage?.completion_tokens,
      },
    };
  }

  /** A minimal call checking that a key and model work together. */
  async ping(config: AiModelConfig): Promise<void> {
    if (
      'providerId' in config &&
      config.providerId === OPENROUTER_FREE_PROVIDER
    ) {
      await this.generateOpenRouterText(
        {
          id: 'credential-check',
          name: 'Credential check',
          instructions: 'Answer with OK.',
        },
        config,
        'Say OK.',
      );
      return;
    }
    await this.createAgent(
      {
        id: 'credential-check',
        name: 'Credential check',
        instructions: 'Answer with the single word OK.',
      },
      config,
    ).generate('Say OK.', { abortSignal: AbortSignal.timeout(30_000) });
  }

  /**
   * The key's owner can tell a feature how to work for them (Settings > AI).
   * Their instructions never reach the instance keys: those run the generic
   * prompts only, and stay within the cost the allowance was sized for.
   */
  private async withUserInstructions(
    agent: AgentSpec,
    model: ResolvedAiModel,
  ): Promise<AgentSpec> {
    const instructions =
      model.provider === LOCAL_OLLAMA_PROVIDER ||
      (model.provider === OPENROUTER_FREE_PROVIDER && agent.preferJsonObject)
        ? (agent.localInstructions ?? agent.instructions)
        : agent.instructions;
    const task = instructionTaskFor(model.task);
    if (model.source !== 'own_key' || !task) return { ...agent, instructions };
    const custom = await this.prisma.aiCustomInstruction.findUnique({
      where: { userId_task: { userId: model.userId, task } },
      select: { instructions: true },
    });
    if (!custom) return { ...agent, instructions };
    return {
      ...agent,
      instructions: withCustomInstructions(instructions, custom.instructions),
    };
  }

  private createAgent(spec: AgentSpec, config: AiModelConfig) {
    return new Agent({
      id: spec.id,
      name: spec.name,
      description: spec.description,
      instructions: spec.instructions,
      model: config as MastraModelConfig,
    });
  }

  private async run<T extends { totalUsage?: TokenUsage; usage?: TokenUsage }>(
    model: ResolvedAiModel,
    call: () => Promise<T>,
  ): Promise<T> {
    const started = Date.now();
    try {
      const result = await call();
      this.logger.debug(
        `${model.task} ran on ${model.provider}/${model.modelId} (${model.source}) in ${Date.now() - started}ms`,
      );
      await this.recordCredentialUse(model, null);
      // Across all steps; failed calls are not counted, their usage is unknown
      await this.usage.record(model, result.totalUsage ?? result.usage);
      return result;
    } catch (error) {
      const failure = toAiProviderException(error);
      this.logger.warn(
        `${model.task} failed on ${model.provider}/${model.modelId} (${model.source}): ${failure.code} ${failure.providerStatus ?? ''} ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.recordCredentialUse(model, failure);
      throw failure;
    }
  }

  /** Lets the settings show which keys work, without failing the call. */
  private async recordCredentialUse(
    model: ResolvedAiModel,
    failure: AiProviderException | null,
  ) {
    if (model.credentialId === null) return;
    const keyProblem =
      failure?.code === AiErrorCode.CREDENTIAL_REJECTED ||
      failure?.code === AiErrorCode.QUOTA_EXCEEDED;
    if (failure && !keyProblem) return;
    try {
      await this.prisma.aiCredential.update({
        where: { aiCredentialId: model.credentialId },
        data: failure
          ? { lastError: failure.code, lastErrorAt: new Date() }
          : { lastUsedAt: new Date(), lastError: null, lastErrorAt: null },
      });
    } catch (error) {
      this.logger.warn(
        `Could not record use of AI credential ${model.credentialId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
