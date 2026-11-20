import { trainingCoachApi } from '@/api/agent/training-coach.api';
import { eventKeys } from '@/api/event/event.keys';
import { Button } from '@/components/ui/button';
import { getPath } from '@/routes/paths';
import { aiErrorCode, aiErrorMessage } from '@/utils/ai-errors';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { AiErrorCode } from '@openathlete/shared';

import { coachCopy, useChineseCoach } from './coach-copy';

export function SummaryAction({
  eventId,
  hasSummary,
}: {
  eventId: number;
  hasSummary: boolean;
}) {
  const chinese = useChineseCoach();
  const copy = coachCopy(chinese);
  const queryClient = useQueryClient();
  const queryKey = ['Coach.summaryStatus', eventId];
  const status = useQuery({
    queryKey,
    queryFn: () => trainingCoachApi.summaryStatus(eventId),
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? 2200 : false,
  });
  const mutation = useMutation({
    mutationFn: () => trainingCoachApi.summary(eventId, { chinese }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  useEffect(() => {
    // Polling complements the calendar socket when the worker is separate.
    if (status.data?.status === 'idle' && status.dataUpdatedAt) {
      void queryClient.invalidateQueries({
        queryKey: [eventKeys.getEvent, eventId],
      });
    }
  }, [eventId, queryClient, status.data?.status, status.dataUpdatedAt]);

  const pending = mutation.isPending || status.data?.status === 'pending';
  const code = aiErrorCode(mutation.error);
  const needsSetup =
    code === AiErrorCode.NOT_CONFIGURED ||
    code === AiErrorCode.CONSENT_REQUIRED;
  const error = mutation.error
    ? needsSetup && chinese
      ? copy.model()
      : (aiErrorMessage(mutation.error) ?? copy.failed())
    : status.data?.status === 'failed'
      ? copy.failed()
      : null;

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => mutation.mutate()}
      >
        {pending
          ? copy.pending()
          : hasSummary
            ? copy.regenerate()
            : copy.generate()}
      </Button>
      {error && !pending && (
        <p className="text-sm text-muted-foreground" role="status">
          {error}{' '}
          <Link
            className="font-medium underline"
            to={`${getPath(['dashboard', 'settings'])}?tab=ai`}
          >
            {copy.settings()}
          </Link>
        </p>
      )}
    </div>
  );
}
