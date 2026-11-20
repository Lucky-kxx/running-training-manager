import axios, { type AxiosRequestConfig } from 'axios';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiEnvSchemaType } from '@openathlete/shared';

const BASES = {
  com: 'https://personal.connectapi.garmin.com',
  cn: 'https://personal.connectapi.garmin.cn',
} as const;
const TOKEN_PATH =
  '/personalapitoken-service/personal-api/personal-api-key/token';
const MAX_BYTES = 25 * 1024 * 1024;
// Large activity pages returned HTTP 500 from the China endpoint for historical ranges.
export const PERSONAL_ACTIVITY_PAGE_SIZE = 20;
const RETRY_DELAYS = [500, 1500];
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENETUNREACH',
]);
export class GarminPersonalError extends Error {
  constructor(
    readonly code:
      | 'key_required'
      | 'rate_limited'
      | 'unavailable'
      | 'invalid_response'
      | 'access_denied',
  ) {
    super(code);
  }
}
export interface PersonalCredentials {
  apiKey: string;
  token: string;
  expiresAt: number;
}
export const garminActivityId = z.union([
  z.string().regex(/^[1-9]\d{0,19}$/),
  z.number().int().positive().safe().transform(String),
]);
export const activityListSchema = z.array(
  z.object({
    activityId: garminActivityId,
    activityName: z.string().max(500).optional(),
  }),
);

@Injectable()
export class GarminPersonalClient {
  private readonly logger = new Logger(GarminPersonalClient.name);

  constructor(private readonly config: ConfigService<ApiEnvSchemaType, true>) {}

  // Fixed origin, no redirects, bounded responses; no raw Axios error can escape with headers.
  private async request(
    method: 'GET' | 'POST',
    path: string,
    authorization: string,
    params?: Record<string, string | number>,
    binary = false,
  ): Promise<unknown> {
    const options: AxiosRequestConfig = {
      method,
      url:
        BASES[this.config.get('GARMIN_PERSONAL_API_REGION', { infer: true })] +
        path,
      headers: {
        Authorization: authorization,
        // Garmin serves FIT archives as application/x-zip-compressed.
        // Requiring application/zip causes its content negotiation to return 406.
        Accept: '*/*',
      },
      params,
      timeout: 30000,
      maxRedirects: 0,
      maxContentLength: MAX_BYTES,
      maxBodyLength: MAX_BYTES,
      responseType: binary ? 'arraybuffer' : 'text',
      transformResponse: [(data: unknown) => data],
    };
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await axios.request(options);
        return response.data;
      } catch (error) {
        const failure = axios.isAxiosError(error) ? error : undefined;
        const status = failure?.response?.status;
        const networkCode = failure?.code;
        const retryDelay = RETRY_DELAYS[attempt];
        const transient =
          status === undefined
            ? TRANSIENT_NETWORK_CODES.has(networkCode ?? '')
            : status >= 500 && status <= 599;
        if (method === 'GET' && retryDelay !== undefined && transient) {
          await delay(retryDelay);
          continue;
        }
        if (transient) {
          const operation =
            path === TOKEN_PATH
              ? 'token exchange'
              : binary
                ? 'FIT download'
                : 'activity or profile lookup';
          this.logger.warn(
            `Garmin ${operation} failed: ${status ? `HTTP ${status}` : networkCode}`,
          );
        }
        throw new GarminPersonalError(
          status === 401 ||
            (status === 403 && method === 'POST' && path === TOKEN_PATH)
            ? 'key_required'
            : status === 403
              ? 'access_denied'
              : status === 429
                ? 'rate_limited'
                : 'unavailable',
        );
      }
    }
  }
  async authorize(apiKey: string): Promise<PersonalCredentials> {
    const value = await this.request('POST', TOKEN_PATH, `ApiKey ${apiKey}`);
    try {
      const token = z.string().trim().max(32000).parse(value);
      const parts = token.split('.');
      if (
        parts.length !== 3 ||
        !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))
      )
        throw new Error();
      // Only cache expiry metadata from Garmin's HTTPS response, never use it as app authentication.
      const { exp } = z
        .object({ exp: z.number().int().positive() })
        .parse(JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')));
      if (exp * 1000 <= Date.now()) throw new Error();
      return {
        apiKey,
        token,
        expiresAt: Math.min(exp * 1000, Date.now() + 86400000),
      };
    } catch {
      throw new GarminPersonalError('invalid_response');
    }
  }
  async get(
    credentials: PersonalCredentials,
    path: string,
    params?: Record<string, string | number>,
    binary = false,
  ): Promise<unknown> {
    const value = await this.request(
      'GET',
      path,
      `Bearer ${credentials.token}`,
      params,
      binary,
    );
    if (binary) return Buffer.from(value as ArrayBuffer);
    if (value === '') return null;
    try {
      return JSON.parse(z.string().parse(value));
    } catch {
      throw new GarminPersonalError('invalid_response');
    }
  }
  activities(
    credentials: PersonalCredentials,
    startDate: string,
    endDate: string,
    start: number,
  ) {
    return this.get(
      credentials,
      '/activitylist-service/activities/search/activities',
      {
        start,
        limit: PERSONAL_ACTIVITY_PAGE_SIZE,
        startDate,
        endDate,
        sortOrder: 'asc',
        excludeChildren: 'true',
      },
    ).then((data) => {
      const parsed = activityListSchema
        .max(PERSONAL_ACTIVITY_PAGE_SIZE)
        .safeParse(data);
      if (!parsed.success) throw new GarminPersonalError('invalid_response');
      return parsed.data;
    });
  }
  async download(credentials: PersonalCredentials, id: string) {
    return this.get(
      credentials,
      `/download-service/files/activity/${garminActivityId.parse(id)}`,
      undefined,
      true,
    ) as Promise<Buffer>;
  }
}
