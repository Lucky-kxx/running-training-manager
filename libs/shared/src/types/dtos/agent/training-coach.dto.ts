import { z } from 'zod';

import { selectLocalAiModelSchema } from '../ai/ai-settings.dto';

export const COACH_CHAT_INPUT_LIMIT = 1600;
export const COACH_CHAT_REPLY_LIMIT = 3600;
export const COACH_CHAT_MESSAGE_LIMIT = 11;

const coachChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(COACH_CHAT_REPLY_LIMIT),
});

export type CoachChatMessage = z.infer<typeof coachChatMessageSchema>;

export const coachChatDtoSchema = z.object({
  messages: z
    .array(coachChatMessageSchema)
    .min(1)
    .max(COACH_CHAT_MESSAGE_LIMIT)
    .refine(
      (messages) =>
        messages.length % 2 === 1 &&
        messages.every(({ role, content }, index) =>
          index % 2 === 0
            ? role === 'user' && content.length <= COACH_CHAT_INPUT_LIMIT
            : role === 'assistant',
        ),
      'The conversation must alternate between user and assistant and end with a user message',
    ),
  localModel: selectLocalAiModelSchema.shape.modelId.optional(),
  chinese: z.boolean().optional(),
});

export type CoachChatDto = z.infer<typeof coachChatDtoSchema>;
export type CoachChatReply = { reply: string };

export const coachFeedbackDtoSchema = z.object({
  message: z.string().trim().min(1).max(800),
  from: z.string().datetime(),
  to: z.string().datetime(),
  eventId: z.number().int().positive().optional(),
  replaceRpe: z.number().min(0).max(1).optional(),
});

export type CoachFeedbackDto = z.infer<typeof coachFeedbackDtoSchema>;

export interface CoachActivity {
  eventId: number;
  name: string;
  startDate: string;
  distance: number;
}

export const coachUndoDtoSchema = z.object({
  before: z.object({
    rpe: z.number().min(0).max(1).nullable(),
    description: z.string(),
  }),
  after: z.object({
    rpe: z.number().min(0).max(1),
    description: z.string(),
  }),
});

export type CoachUndoDto = z.infer<typeof coachUndoDtoSchema>;

export type CoachFeedbackResult =
  | { status: 'invalid-rpe' | 'no-match' | 'changed' }
  | { status: 'choose'; activities: CoachActivity[] }
  | {
      status: 'replace';
      activity: CoachActivity;
      previous: number;
      rpe: number;
    }
  | {
      status: 'saved';
      activity: CoachActivity;
      rpe: number;
      undo?: CoachUndoDto;
    };

export const coachSummaryDtoSchema = z.object({
  chinese: z.boolean().optional(),
});

export type CoachSummaryDto = z.infer<typeof coachSummaryDtoSchema>;
export type CoachSummaryStatus = { status: 'idle' | 'pending' | 'failed' };
