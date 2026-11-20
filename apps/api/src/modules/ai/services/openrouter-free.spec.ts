import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  AiTask,
  OPENROUTER_FREE_AUTO,
  OPENROUTER_FREE_PROVIDER,
} from '@openathlete/shared';

import { AiCredentialCipher } from './ai-credential-cipher';
import { AiService } from './ai.service';
import {
  OPENROUTER_API,
  parseFreeModels,
} from './openrouter-free-catalog.service';
import { OpenRouterFreeSettingsService } from './openrouter-free-settings.service';

jest.mock('@mastra/core/agent', () => ({ Agent: jest.fn() }));

describe('OpenRouter Free', () => {
  afterEach(() => jest.restoreAllMocks());

  it('includes official zero-price text variants and rejects costs or paid slugs', () => {
    const base = {
      name: 'Model',
      pricing: { prompt: '0', completion: '0', request: '0' },
    };
    expect(
      parseFreeModels({
        data: [
          {
            ...base,
            id: 'sample/free:free',
            supported_parameters: ['structured_outputs'],
          },
          { ...base, id: 'sample/paid' },
          {
            ...base,
            id: 'sample/paid-with-overrides',
            pricing: { ...base.pricing, overrides: [{ prompt: '9' }] },
          },
          {
            ...base,
            id: 'sample/request-cost:free',
            pricing: { ...base.pricing, request: '0.03' },
          },
          {
            ...base,
            id: 'sample/image:free',
            architecture: { output_modalities: ['image'] },
          },
          {
            ...base,
            id: 'sample/blank:free',
            pricing: { prompt: '', completion: '0' },
          },
        ],
      }),
    ).toEqual([
      { id: 'sample/free:free', name: 'Model', structuredOutput: true },
    ]);
  });

  it('binds the PKCE state to the signed-in user and exchanges only the correct verifier', async () => {
    const write = jest.fn().mockResolvedValue({});
    const tx = {
      $queryRaw: jest.fn(),
      aiCredential: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: write,
      },
    };
    const db = { $transaction: jest.fn(async (execute) => execute(tx)) };
    const cipher = new AiCredentialCipher('unit-test-secret');
    const service = new OpenRouterFreeSettingsService(
      db as never,
      {
        get: () => 'http://127.0.0.1:8766',
        getOrThrow: () => 'test-signing-secret',
      } as never,
      { openRouterFreeEnabled: true } as never,
      {} as never,
      cipher,
    );
    const auth = new URL(service.createAuthorization(7).url);
    expect(auth.origin).toBe('https://openrouter.ai');
    const callback = new URL(auth.searchParams.get('callback_url')!);
    expect(callback.pathname).toBe('/dashboard/settings');
    expect(callback.searchParams.get('tab')).toBe('ai');

    const upstream = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        Response.json({ key: 'sk-or-v1-test-only' }),
      );
    const state = auth.searchParams.get('state')!;
    await expect(service.exchange(8, 'code', state)).rejects.toThrow();
    expect(upstream).not.toHaveBeenCalled();
    await service.exchange(7, 'code', state);
    expect(upstream.mock.calls[0][0]).toBe(`${OPENROUTER_API}/auth/keys`);
    const request = JSON.parse(String(upstream.mock.calls[0][1]?.body));
    const challenge = createHash('sha256')
      .update(request.code_verifier)
      .digest('base64url');
    expect(challenge).toBe(auth.searchParams.get('code_challenge'));
    const stored = write.mock.calls[0][0].data;
    expect(stored).toMatchObject({
      userId: 7,
      provider: OPENROUTER_FREE_PROVIDER,
    });
    expect(stored.encryptedApiKey).not.toContain('sk-or-v1-test-only');
    expect(cipher.decrypt(stored.encryptedApiKey)).toBe('sk-or-v1-test-only');
  });

  it('sends zero-price constraints to inference and refuses a paid model before calling it', async () => {
    const upstream = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        Response.json({
          choices: [{ message: { content: '{"headline":"Easy run"}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 4 },
        }),
      );
    const ai = new AiService(
      {
        aiCustomInstruction: { findUnique: jest.fn().mockResolvedValue(null) },
      } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
    );
    const agent = { id: 'test', name: 'Test', instructions: 'Use given facts' };
    const model = {
      task: AiTask.ACTIVITY_SUMMARY as const,
      source: 'own_key' as const,
      userId: 7,
      provider: OPENROUTER_FREE_PROVIDER,
      modelId: OPENROUTER_FREE_AUTO,
      credentialId: null,
      config: {
        providerId: OPENROUTER_FREE_PROVIDER,
        apiKey: 'test-only-key',
        url: OPENROUTER_API,
        modelId: OPENROUTER_FREE_AUTO,
      },
    };
    const schema = z.object({ headline: z.string() });
    await expect(
      ai.generateObject(agent, model, 'Sample activity', schema),
    ).resolves.toEqual({ headline: 'Easy run' });
    expect(upstream.mock.calls[0][0]).toBe(
      `${OPENROUTER_API}/chat/completions`,
    );
    const posted = JSON.parse(String(upstream.mock.calls[0][1]?.body));
    expect(posted).toMatchObject({
      model: OPENROUTER_FREE_AUTO,
      provider: {
        max_price: { prompt: 0, completion: 0, request: 0 },
        data_collection: 'deny',
      },
      response_format: { type: 'json_schema' },
    });
    await expect(
      ai.generateText(
        agent,
        {
          ...model,
          config: { ...model.config, modelId: 'openai/paid' },
        },
        'Sample activity',
      ),
    ).rejects.toThrow();
    expect(upstream).toHaveBeenCalledTimes(1);

    const messages = [
      { role: 'user' as const, content: 'My goal is 10K.' },
      { role: 'assistant' as const, content: 'When is the race?' },
      { role: 'user' as const, content: 'Next month.' },
    ];
    await ai.generateText(agent, model, messages);
    const conversation = JSON.parse(String(upstream.mock.calls[1][1]?.body));
    expect(conversation.messages).toEqual([
      { role: 'system', content: 'Use given facts' },
      ...messages,
    ]);
  });
});
