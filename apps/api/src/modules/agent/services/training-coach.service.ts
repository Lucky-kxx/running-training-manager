import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, SportType } from '@openathlete/database';
import {
  CoachActivity,
  CoachFeedbackDto,
  CoachFeedbackResult,
  CoachUndoDto,
} from '@openathlete/shared';

import { CalendarWebSocketService } from '../../calendar/services/calendar-websocket.service';
import { PrismaService } from '../../prisma/services/prisma.service';

const feedbackFields = {
  eventActivityId: true,
  eventId: true,
  distance: true,
  description: true,
  rpe: true,
  event: { select: { name: true, startDate: true, athleteId: true } },
} satisfies Prisma.EventActivitySelect;

type Match = Prisma.EventActivityGetPayload<{ select: typeof feedbackFields }>;
const runningSports = [SportType.RUNNING, SportType.TRAIL_RUNNING];

export function readCoachFeedback(message: string) {
  const normalized = message
    .normalize('NFKC')
    .toLowerCase()
    .replace(
      /(\brpe\s*[:=]?\s*)([零一二三四五六七八九十])(?:点([零五]))?/g,
      (_, label: string, score: string, fraction?: string) =>
        label +
        '零一二三四五六七八九十'.indexOf(score) +
        (fraction === '五' ? '.5' : ''),
    )
    .replace(/十\s*(?=公里|千米)/g, '10');
  const scores = [
    ...normalized.matchAll(
      /\brpe\s*[:：=]?\s*(10|[0-9])(?:[.。]([05]))?(?![\d.]|\s*[.。]\s*\d)(?:\s*\/\s*10\b)?/g,
    ),
  ];
  if (
    scores.length !== 1 ||
    /[?？]|不要记录|不用记录|别记录|(?:目标|计划|取消|不是)\s*rpe|\b(?:target|not)\s+rpe/.test(
      normalized,
    )
  )
    return null;
  const score = Number(scores[0][1]) + (scores[0][2] === '5' ? 0.5 : 0);
  if (score > 10 || /\d\s*\/\s*(?!10\b)\d/.test(normalized)) return null;
  const distances = [
    ...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(?:km\b|k\b|公里|千米)/g),
  ];
  return {
    rpe: score / 10,
    distance:
      distances.length === 1 ? Number(distances[0][1]) * 1000 : undefined,
    multipleDistances: distances.length > 1,
  };
}

@Injectable()
export class TrainingCoachService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: CalendarWebSocketService,
  ) {}

  private ownActivity(userId: number) {
    return { event: { athlete: { userId } } };
  }

  async getActivityId(userId: number, eventId: number) {
    const activity = await this.prisma.eventActivity.findFirst({
      where: { eventId, ...this.ownActivity(userId) },
      select: { eventActivityId: true },
    });
    if (!activity) throw new NotFoundException();
    return activity.eventActivityId;
  }

  async record(
    userId: number,
    input: CoachFeedbackDto,
  ): Promise<CoachFeedbackResult> {
    const feedback = readCoachFeedback(input.message);
    if (!feedback) return { status: 'invalid-rpe' };
    const gte = new Date(input.from);
    const lt = new Date(input.to);
    const duration = lt.getTime() - gte.getTime();
    if (duration < 22 * 3600000 || duration > 26 * 3600000) {
      throw new BadRequestException('Select one calendar day');
    }
    const where = {
      ...this.ownActivity(userId),
      sport: { in: runningSports },
    };
    let activity: Match;
    if (input.eventId !== undefined) {
      const selected = await this.prisma.eventActivity.findFirst({
        where: {
          ...where,
          eventId: input.eventId,
          event: { ...where.event, startDate: { gte, lt } },
        },
        select: feedbackFields,
      });
      if (!selected) throw new NotFoundException();
      activity = selected;
    } else {
      const runs = await this.prisma.eventActivity.findMany({
        where: { ...where, event: { ...where.event, startDate: { gte, lt } } },
        select: feedbackFields,
        orderBy: [{ event: { startDate: 'desc' } }, { eventId: 'desc' }],
      });
      const distance = feedback.distance;
      const matching =
        distance === undefined
          ? runs
          : runs.filter(
              (run) =>
                Math.abs(run.distance - distance) <=
                Math.max(150, distance * 0.05),
            );
      if (!runs.length) return { status: 'no-match' };
      if (matching.length !== 1 || feedback.multipleDistances) {
        return {
          status: 'choose',
          activities: (matching.length ? matching : runs).map((run) =>
            this.present(run),
          ),
        };
      }
      activity = matching[0];
    }

    const candidate = this.present(activity);
    if (
      activity.rpe !== null &&
      activity.rpe !== feedback.rpe &&
      activity.rpe !== input.replaceRpe
    ) {
      return {
        status: 'replace',
        activity: candidate,
        previous: activity.rpe,
        rpe: feedback.rpe,
      };
    }
    const before = { rpe: activity.rpe, description: activity.description };
    const description = activity.description
      .split('\n\n')
      .includes(input.message)
      ? activity.description
      : [activity.description, input.message].filter(Boolean).join('\n\n');
    const after = { rpe: feedback.rpe, description };
    if (before.description === after.description && before.rpe === after.rpe) {
      return { status: 'saved', activity: candidate, rpe: feedback.rpe };
    }
    const { count } = await this.prisma.eventActivity.updateMany({
      where: {
        ...this.ownActivity(userId),
        eventId: activity.eventId,
        ...before,
      },
      data: after,
    });
    if (!count) return { status: 'changed' };
    this.notify(activity.eventId, activity.event.athleteId);
    return {
      status: 'saved',
      activity: candidate,
      rpe: feedback.rpe,
      undo: { before, after },
    };
  }

  async undo(userId: number, eventId: number, input: CoachUndoDto) {
    const activity = await this.prisma.eventActivity.findFirst({
      where: { ...this.ownActivity(userId), eventId },
      select: { event: { select: { athleteId: true } } },
    });
    if (!activity) throw new NotFoundException();
    const { count } = await this.prisma.eventActivity.updateMany({
      where: { ...this.ownActivity(userId), eventId, ...input.after },
      data: input.before,
    });
    if (count) this.notify(eventId, activity.event.athleteId);
    return { undone: count === 1 };
  }

  private present(activity: Match): CoachActivity {
    return {
      eventId: activity.eventId,
      name: activity.event.name,
      startDate: activity.event.startDate.toISOString(),
      distance: activity.distance,
    };
  }

  private notify(eventId: number, athleteId: number | null) {
    if (athleteId !== null)
      this.calendar.notifyActivityProcessed(eventId, athleteId);
  }
}
