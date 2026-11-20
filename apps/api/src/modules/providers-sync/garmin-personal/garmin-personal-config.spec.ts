import { ApiEnvSchema } from '@openathlete/shared';

describe('Garmin Personal opt-in configuration', () => {
  it('enables only explicit true and remains off for unset, empty or false values', () => {
    const flag = ApiEnvSchema.innerType().shape.GARMIN_PERSONAL_API_ENABLED;
    for (const value of [undefined, '', 'false', '0', 'TRUE'])
      expect(flag.parse(value)).toBe(false);
    expect(flag.parse('true')).toBe(true);
  });
  it('allows only the two official regions and preserves the global default', () => {
    const region = ApiEnvSchema.innerType().shape.GARMIN_PERSONAL_API_REGION;
    expect(region.parse(undefined)).toBe('com');
    expect(region.parse('')).toBe('com');
    expect(region.parse('cn')).toBe('cn');
    expect(region.parse('com')).toBe('com');
    for (const value of ['CN', 'https://example.org', 'garmin.cn', 'other']) {
      expect(region.safeParse(value).success).toBe(false);
    }
  });
});
