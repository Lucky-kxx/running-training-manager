import client, { routes } from '@/utils/axios';

import {
  CoachChatDto,
  CoachChatReply,
  CoachFeedbackDto,
  CoachFeedbackResult,
  CoachSummaryDto,
  CoachSummaryStatus,
  CoachUndoDto,
} from '@openathlete/shared';

const coach = routes.trainingCoach;

export const trainingCoachApi = {
  async chat(input: CoachChatDto) {
    return (
      await client.post<CoachChatReply>(coach.chat, input, { timeout: 130_000 })
    ).data;
  },
  async feedback(input: CoachFeedbackDto) {
    return (await client.post<CoachFeedbackResult>(coach.feedback, input)).data;
  },
  async undo(eventId: number, input: CoachUndoDto) {
    return (await client.post<{ undone: boolean }>(coach.undo(eventId), input))
      .data;
  },
  async summary(eventId: number, input: CoachSummaryDto) {
    return (
      await client.post<CoachSummaryStatus>(coach.summary(eventId), input)
    ).data;
  },
  async summaryStatus(eventId: number) {
    return (await client.get<CoachSummaryStatus>(coach.summary(eventId))).data;
  },
};
