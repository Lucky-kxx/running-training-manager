import { z } from 'zod';

import {
  WORKOUT_DURATION_TYPE,
  WORKOUT_STEP_TYPE,
  createWorkoutStepTargetSchema,
  trainingEventSchema,
} from '@openathlete/shared';

const simpleStep = z.object({
  stepType: z.nativeEnum(WORKOUT_STEP_TYPE),
  name: z.string().nullable().optional(),
  durationType: z.nativeEnum(WORKOUT_DURATION_TYPE).nullable().optional(),
  durationValue: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  targets: z.array(createWorkoutStepTargetSchema).default([]),
});

const repeatedStep = simpleStep.refine(
  (step) => step.stepType !== WORKOUT_STEP_TYPE.REPEAT,
  'Repeat blocks cannot be nested',
);

const workoutStep = simpleStep
  .extend({
    repeatBlock: z
      .object({
        repetitions: z.number().int().min(1).max(99),
        childSteps: z.array(repeatedStep).min(1),
      })
      .nullable()
      .optional(),
  })
  .refine(
    (step) =>
      step.stepType !== WORKOUT_STEP_TYPE.REPEAT || Boolean(step.repeatBlock),
    'A repeat step needs a repeat block',
  );

/** Calendar dates and record metadata are assigned by the application. */
export const generatedWorkoutSchema = trainingEventSchema
  .pick({ name: true, sport: true, description: true, goalDuration: true })
  .extend({
    workout: z.object({
      steps: z.array(workoutStep).min(1),
    }),
  });
