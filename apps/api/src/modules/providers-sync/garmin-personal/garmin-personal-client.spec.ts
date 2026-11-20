import axios from 'axios';
import { setTimeout as delay } from 'node:timers/promises';

import { ConfigService } from '@nestjs/config';

import { ApiEnvSchemaType } from '@openathlete/shared';

import {
  GarminPersonalClient,
  activityListSchema,
} from './garmin-personal-client';

jest.mock('axios');
jest.mock('node:timers/promises', () => ({
  setTimeout: jest.fn().mockResolvedValue(undefined),
}));
const request = axios.request as jest.Mock;
const jwt = (exp = Math.floor(Date.now() / 1000) + 86400) =>
  `header.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`;
const credentials = {
  apiKey: 'synthetic-personal-key',
  token: 'synthetic-token',
  expiresAt: Date.now() + 86400000,
};

describe('Garmin documented Personal API transport', () => {
  const client = new GarminPersonalClient(
    new ConfigService<ApiEnvSchemaType, true>({
      GARMIN_PERSONAL_API_REGION: 'com',
    }),
  );
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(delay).mockResolvedValue(undefined);
    (axios.isAxiosError as unknown as jest.Mock).mockImplementation(
      (e) => e?.isAxiosError === true,
    );
  });
  it('exchanges the key for the raw JWT returned by Garmin, without OAuth refresh', async () => {
    const token = jwt();
    request.mockResolvedValue({ data: token });
    expect(await client.authorize(credentials.apiKey)).toMatchObject({
      apiKey: credentials.apiKey,
      token,
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token',
        headers: expect.objectContaining({
          Authorization: `ApiKey ${credentials.apiKey}`,
        }),
        maxRedirects: 0,
      }),
    );
  });
  it('keeps the key exchange and authenticated downloads on the China origin', async () => {
    const china = new GarminPersonalClient(
      new ConfigService<ApiEnvSchemaType, true>({
        GARMIN_PERSONAL_API_REGION: 'cn',
      }),
    );
    request.mockResolvedValueOnce({ data: jwt() });
    await china.authorize(credentials.apiKey);
    request.mockResolvedValueOnce({ data: Buffer.from('synthetic zip') });
    await china.download(credentials, '123');
    expect(request.mock.calls.map(([options]) => options.url)).toEqual([
      'https://personal.connectapi.garmin.cn/personalapitoken-service/personal-api/personal-api-key/token',
      'https://personal.connectapi.garmin.cn/download-service/files/activity/123',
    ]);
    for (const [options] of request.mock.calls) {
      expect(options.maxRedirects).toBe(0);
    }
  });
  it.each(['not-a-token', jwt(1), JSON.stringify({ access_token: jwt() })])(
    'rejects malformed/expired token responses',
    async (data) => {
      request.mockResolvedValue({ data });
      await expect(client.authorize(credentials.apiKey)).rejects.toMatchObject({
        code: 'invalid_response',
      });
    },
  );
  it('uses documented date filters and pagination with Bearer authentication', async () => {
    request.mockResolvedValue({
      data: JSON.stringify([
        { activityId: 123, activityName: 'Synthetic ride' },
      ]),
    });
    expect(
      await client.activities(credentials, '2026-01-01', '2026-01-28', 20),
    ).toEqual([{ activityId: '123', activityName: 'Synthetic ride' }]);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          start: 20,
          limit: 20,
          startDate: '2026-01-01',
          endDate: '2026-01-28',
          excludeChildren: 'true',
        }),
        headers: expect.objectContaining({
          Authorization: 'Bearer synthetic-token',
        }),
      }),
    );
  });
  it('retries a reset and HTTP 500 at the same activity page without asking for a new key', async () => {
    request
      .mockRejectedValueOnce({ isAxiosError: true, code: 'ECONNRESET' })
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 500 } })
      .mockResolvedValueOnce({ data: '[{"activityId":123}]' });

    await expect(
      client.activities(credentials, '2026-01-01', '2026-01-28', 20),
    ).resolves.toEqual([{ activityId: '123' }]);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[1]).toEqual(request.mock.calls[0]);
    expect(request.mock.calls[2]).toEqual(request.mock.calls[0]);
    expect(jest.mocked(delay).mock.calls.map(([ms]) => ms)).toEqual([
      500, 1500,
    ]);
  });

  it('does not retry a rate-limited request before the sync queue backs off', async () => {
    request.mockRejectedValue({
      isAxiosError: true,
      response: { status: 429 },
    });
    await expect(client.download(credentials, '123')).rejects.toMatchObject({
      code: 'rate_limited',
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('returns ZIP bytes and rejects unsafe or imprecise IDs', async () => {
    request.mockResolvedValue({ data: Buffer.from('synthetic zip') });
    expect(await client.download(credentials, '123')).toEqual(
      Buffer.from('synthetic zip'),
    );
    expect(request.mock.calls[0][0].responseType).toBe('arraybuffer');
    // Garmin returns application/x-zip-compressed and rejects application/zip-only requests.
    expect(request.mock.calls[0][0].headers.Accept).toBe('*/*');
    await expect(client.download(credentials, '../profile')).rejects.toThrow();
    expect(
      activityListSchema.safeParse([
        { activityId: Number.MAX_SAFE_INTEGER + 1 },
      ]).success,
    ).toBe(false);
  });
  it.each([
    [401, 'key_required'],
    [403, 'access_denied'],
    [429, 'rate_limited'],
    [500, 'unavailable'],
  ])(
    'sanitizes upstream HTTP %s without exposing credentials or body',
    async (status, code) => {
      request.mockRejectedValue({
        isAxiosError: true,
        response: { status, data: credentials.apiKey },
        config: { headers: { Authorization: credentials.apiKey } },
      });
      try {
        await client.get(
          credentials,
          '/userprofile-service/userprofile/settings',
        );
        throw new Error('Expected failure');
      } catch (error) {
        expect(error).toMatchObject({ code });
        expect(JSON.stringify(error)).not.toContain(credentials.apiKey);
      }
      expect(request).toHaveBeenCalledTimes(status === 500 ? 3 : 1);
    },
  );
  it('treats a rejected key exchange as a key problem but not a forbidden activity download', async () => {
    request.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403 },
    });
    await expect(client.authorize(credentials.apiKey)).rejects.toMatchObject({
      code: 'key_required',
    });
    await expect(client.download(credentials, '123')).rejects.toMatchObject({
      code: 'access_denied',
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('rejects unexpected pagination envelopes and oversized pages', async () => {
    request.mockResolvedValueOnce({ data: '{}' }).mockResolvedValueOnce({
      data: JSON.stringify(
        Array.from({ length: 21 }, (_, i) => ({ activityId: i + 1 })),
      ),
    });
    await expect(
      client.activities(credentials, '2026-01-01', '2026-01-02', 0),
    ).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(
      client.activities(credentials, '2026-01-01', '2026-01-02', 0),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
