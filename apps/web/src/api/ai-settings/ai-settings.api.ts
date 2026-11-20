import client, { routes } from '@/utils/axios';

import {
  AiAccessDto,
  AiCredentialDto,
  AiCustomInstructionDto,
  AiModelPreferenceDto,
  AiProvider,
  CreateAiCredentialDto,
  LocalAiModelsDto,
  OpenRouterFreeDto,
  SelectLocalAiModel,
  TestAiCredentialResponseDto,
  UpdateAiCustomInstructionsDto,
  UpdateAiModelPreferencesDto,
} from '@openathlete/shared';

export class AiSettingsAPI {
  static async getOpenRouterFree(): Promise<OpenRouterFreeDto> {
    const response = await client.get(routes.aiSettings.openRouterFree);
    return response.data;
  }

  static async authorizeOpenRouterFree(): Promise<{ url: string }> {
    const response = await client.post(
      routes.aiSettings.authorizeOpenRouterFree,
    );
    return response.data;
  }

  static async exchangeOpenRouterFree(params: { code: string; state: string }) {
    await client.post(routes.aiSettings.exchangeOpenRouterFree, params);
  }

  static async selectOpenRouterFree(modelId: string) {
    await client.put(routes.aiSettings.selectOpenRouterFree, { modelId });
  }

  static async getLocalModels(): Promise<LocalAiModelsDto> {
    const response = await client.get(routes.aiSettings.localModels);
    return response.data;
  }

  static async selectLocalModel(choice: SelectLocalAiModel): Promise<void> {
    await client.put(routes.aiSettings.localModelDefault, choice);
  }

  static async getProviders(): Promise<AiProvider[]> {
    const res = await client.get(routes.aiSettings.providers);
    return res.data;
  }

  static async getCredentials(): Promise<AiCredentialDto[]> {
    const res = await client.get(routes.aiSettings.credentials);
    return res.data;
  }

  static async createCredential(
    body: CreateAiCredentialDto,
  ): Promise<AiCredentialDto> {
    const res = await client.post(routes.aiSettings.credentials, body);
    return res.data;
  }

  static async deleteCredential(aiCredentialId: number): Promise<void> {
    await client.delete(routes.aiSettings.credential(aiCredentialId));
  }

  static async testCredential(
    aiCredentialId: number,
    modelId: string,
  ): Promise<TestAiCredentialResponseDto> {
    const res = await client.post(
      routes.aiSettings.testCredential(aiCredentialId),
      { modelId },
    );
    return res.data;
  }

  static async getModelPreferences(): Promise<AiModelPreferenceDto[]> {
    const res = await client.get(routes.aiSettings.models);
    return res.data;
  }

  static async updateModelPreferences(
    body: UpdateAiModelPreferencesDto,
  ): Promise<AiModelPreferenceDto[]> {
    const res = await client.put(routes.aiSettings.models, body);
    return res.data;
  }

  static async getCustomInstructions(): Promise<AiCustomInstructionDto[]> {
    const res = await client.get(routes.aiSettings.instructions);
    return res.data;
  }

  static async updateCustomInstructions(
    body: UpdateAiCustomInstructionsDto,
  ): Promise<AiCustomInstructionDto[]> {
    const res = await client.put(routes.aiSettings.instructions, body);
    return res.data;
  }

  static async getAccess(athleteId?: number): Promise<AiAccessDto> {
    const res = await client.get(routes.aiSettings.access, {
      params: athleteId === undefined ? undefined : { athleteId },
    });
    return res.data;
  }

  /** The user allows their data to be sent to AI providers */
  static async allowDataSharing(): Promise<AiAccessDto> {
    const res = await client.post(routes.aiSettings.consent);
    return res.data;
  }

  static async withdrawDataSharing(): Promise<AiAccessDto> {
    const res = await client.delete(routes.aiSettings.consent);
    return res.data;
  }
}
