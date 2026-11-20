import { z } from 'zod';

import { INJURY_STATUS } from '../../misc';

export const athleteInjurySchema = z.object({
  athleteInjuryId: z.number(),
  athleteId: z.number(),
  location: z.string(),
  painScore: z.number().min(0).max(1),
  context: z.string(),
  status: z.nativeEnum(INJURY_STATUS),
  privateLog: z.boolean().optional(),
  sourceActivityId: z.number().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type AthleteInjury = z.infer<typeof athleteInjurySchema>;

export const saveInjuryLogSchema = z
  .object({
    location: z.string().trim().min(1).max(100),
    painScore: z.number().min(0).max(1),
    context: z.string().trim().max(2000),
    status: z.nativeEnum(INJURY_STATUS),
  })
  .strict();

export type SaveInjuryLog = z.infer<typeof saveInjuryLogSchema>;
