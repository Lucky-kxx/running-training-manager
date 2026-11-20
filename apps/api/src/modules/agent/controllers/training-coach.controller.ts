import { Queue } from 'bullmq';
import { ZodValidationPipe } from 'nestjs-zod';

import { InjectQueue } from '@nestjs/bullmq';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import {
  AiTask,
  CoachChatDto,
  CoachFeedbackDto,
  CoachSummaryDto,
  CoachSummaryStatus,
  CoachUndoDto,
  coachChatDtoSchema,
  coachFeedbackDtoSchema,
  coachSummaryDtoSchema,
  coachUndoDtoSchema,
} from '@openathlete/shared';

import { RATE_LIMITS } from 'src/common/security/rate-limits';

import { AiModelResolverService } from '../../ai';
import { JwtUser, UserTypeGuard } from '../../auth';
import { AuthUser } from '../../auth/decorators/user.decorator';
import { ActivitySummaryJobData } from '../../queue/processors/activity-summary.processor';
import { TrainingCoachChatService } from '../services/training-coach-chat.service';
import { TrainingCoachService } from '../services/training-coach.service';

@ApiTags('Agent')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), UserTypeGuard)
@Controller('agent/coach')
export class TrainingCoachController {
  constructor(
    private readonly coach: TrainingCoachService,
    private readonly models: AiModelResolverService,
    private readonly conversation: TrainingCoachChatService,
    @InjectQueue('activity-summary')
    private readonly summaries: Queue<ActivitySummaryJobData>,
  ) {}

  @Post('chat')
  @Throttle(RATE_LIMITS.coachChat)
  chat(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(coachChatDtoSchema)) input: CoachChatDto,
  ) {
    return this.conversation.reply(user.userId, input);
  }

  @Post('feedback')
  record(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(coachFeedbackDtoSchema))
    input: CoachFeedbackDto,
  ) {
    return this.coach.record(user.userId, input);
  }

  @Post('activities/:eventId/undo')
  undo(
    @JwtUser() user: AuthUser,
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body(new ZodValidationPipe(coachUndoDtoSchema)) input: CoachUndoDto,
  ) {
    return this.coach.undo(user.userId, eventId, input);
  }

  @Post('activities/:eventId/summary')
  async queueSummary(
    @JwtUser() user: AuthUser,
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body(new ZodValidationPipe(coachSummaryDtoSchema)) input: CoachSummaryDto,
  ): Promise<CoachSummaryStatus> {
    const eventActivityId = await this.coach.getActivityId(
      user.userId,
      eventId,
    );
    await this.models.resolveForUser(AiTask.ACTIVITY_SUMMARY, user.userId);
    const jobId = `activity-summary-${eventActivityId}`;
    const existing = await this.summaries.getJob(jobId);
    if (existing && (await existing.isFailed())) {
      // Keep the job ID for deduplication while retrying. Another request may
      // already have retried it between the state check and the retry.
      try {
        await existing.retry();
      } catch (error) {
        if ((await existing.getState()) === 'failed') throw error;
      }
    } else if (!existing) {
      await this.summaries.add(
        'summary',
        { eventActivityId, userId: user.userId, ...input },
        { jobId },
      );
    }
    return { status: 'pending' };
  }

  @Get('activities/:eventId/summary')
  async summaryStatus(
    @JwtUser() user: AuthUser,
    @Param('eventId', ParseIntPipe) eventId: number,
  ): Promise<CoachSummaryStatus> {
    const id = await this.coach.getActivityId(user.userId, eventId);
    const state = await this.summaries.getJobState(`activity-summary-${id}`);
    return {
      status:
        state === 'failed'
          ? 'failed'
          : state === 'unknown' || state === 'completed'
            ? 'idle'
            : 'pending',
    };
  }
}
