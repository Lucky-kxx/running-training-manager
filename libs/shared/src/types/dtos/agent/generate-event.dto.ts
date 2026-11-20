import { z } from 'zod';

import { selectLocalAiModelSchema } from '../ai/ai-settings.dto';
import { createEventDtoSchema } from '../core/create-event.dto';

export const generateEventDtoSchema = z.object({
  prompt: z.string().min(1).max(500),
  date: z.string().describe('ISO date string for the event date'),
  localModel: selectLocalAiModelSchema.shape.modelId.optional(),
  athleteId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("The session's athlete; default: the user's own athlete"),
});

export type GenerateEventDto = z.infer<typeof generateEventDtoSchema>;

export const generateEventResponseDtoSchema = createEventDtoSchema;

export type GenerateEventResponseDto = z.infer<
  typeof generateEventResponseDtoSchema
>;
