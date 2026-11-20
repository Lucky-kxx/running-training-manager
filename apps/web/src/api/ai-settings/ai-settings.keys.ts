export const aiSettingsKeys = {
  all: ['ai-settings'] as const,
  openRouterFree: () => [...aiSettingsKeys.all, 'openrouter-free'] as const,
  localModels: () => [...aiSettingsKeys.all, 'local-models'] as const,
  providers: () => [...aiSettingsKeys.all, 'providers'] as const,
  credentials: () => [...aiSettingsKeys.all, 'credentials'] as const,
  models: () => [...aiSettingsKeys.all, 'models'] as const,
  instructions: () => [...aiSettingsKeys.all, 'instructions'] as const,
  access: (athleteId?: number) =>
    [...aiSettingsKeys.all, 'access', athleteId ?? null] as const,
};
