import { Injectable } from '@nestjs/common';

import {
  AiTask,
  SelectLocalAiModel,
  calculateWorkoutDuration,
} from '@openathlete/shared';

import { eventGenerationAgent } from 'src/mastra/agents';
import { AiModelResolverService, AiService } from 'src/modules/ai';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import {
  buildMetricsContext,
  buildTrainingProfileContext,
  buildWorkoutTargetsInstructions,
  buildZonesContext,
  convertWorkoutPaceTargetsToMs,
  createZoneIdMap,
  fetchAthleteMetrics,
  fetchAthleteZones,
  formatZonesByType,
  getLatestMetrics,
  normalizeGoalDuration,
  repsAsPoolLengths,
  validateWorkoutZoneTargets,
  withRetry,
} from './event-ai-helpers';
import { generatedWorkoutSchema } from './generated-workout.schema';

@Injectable()
export class EventGenerationService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly aiModelResolver: AiModelResolverService,
    private readonly aiService: AiService,
  ) {}

  async generateTrainingEvent(
    prompt: string,
    athleteId: number,
    userId: number,
    localModel?: SelectLocalAiModel['modelId'],
  ) {
    const zones = await fetchAthleteZones(this.prismaService, athleteId);
    const metrics = await fetchAthleteMetrics(this.prismaService, athleteId);
    const latestMetrics = getLatestMetrics(metrics);
    const zonesByType = formatZonesByType(zones);
    const zonesContext = buildZonesContext(zonesByType);
    const metricsContext = buildMetricsContext(latestMetrics);
    const athlete = await this.prismaService.athlete.findUnique({
      where: { athleteId },
      select: {
        user: {
          select: {
            practicedSports: true,
            trainingGoal: true,
            weeklyTrainingHours: true,
          },
        },
      },
    });
    const profileContext = athlete
      ? buildTrainingProfileContext(athlete.user)
      : '';

    const fullPrompt = `
Generate one workout for this request: ${prompt}

ATHLETE CONTEXT:
${zonesContext ? `TRAINING ZONES:\n${zonesContext}` : 'No training zones configured'}
${metricsContext ? `\nLATEST METRICS:\n${metricsContext}` : '\nNo metrics available'}
${profileContext ? `\nTRAINING PROFILE (told by the athlete):\n${profileContext}` : ''}

CRITICAL REQUIREMENTS:
- Return a complete training event with workout structure
- For intervals (e.g., "10x 30s/30s"), create ONE REPEAT step with repeatBlock
- Use proper step types: WARMUP, STEADY, INTERVAL_ACTIVE, INTERVAL_REST, COOLDOWN, REPEAT
- The app selects the calendar date. Return one workout and do not generate dates or multiple events.

${buildWorkoutTargetsInstructions()}`;

    const zoneIdMap = createZoneIdMap(zones);

    // Resolved once: a missing key fails fast, before any retry
    const model = localModel
      ? await this.aiModelResolver.resolveLocalForUser(
          AiTask.EVENT_GENERATION,
          userId,
          localModel,
        )
      : await this.aiModelResolver.resolveForUser(
          AiTask.EVENT_GENERATION,
          userId,
          { athleteId },
        );

    return withRetry(async () => {
      const event = await this.aiService.generateObject(
        eventGenerationAgent,
        model,
        fullPrompt,
        generatedWorkoutSchema,
      );

      validateWorkoutZoneTargets(event.workout, zoneIdMap, zones);
      convertWorkoutPaceTargetsToMs(event.workout);
      repsAsPoolLengths(event.workout, event.sport);

      return {
        ...event,
        goalDuration:
          normalizeGoalDuration(event.goalDuration) ??
          calculateWorkoutDuration(event.workout, undefined, event.sport),
      };
    });
  }
}
