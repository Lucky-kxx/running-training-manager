import { SparklesIcon } from '@/components/ui/sparkles-icon';
import { ArrowRight } from 'lucide-react';

import { ActivityEvent, activityAiSummarySchema } from '@openathlete/shared';

import { GarminAttributionText } from '../garmin-attribution/garmin-attribution';
import { garminActivityLabel } from '../garmin-attribution/garmin-source';
import { coachCopy, useChineseCoach } from '../training-coach/coach-copy';
import { SummaryAction } from '../training-coach/summary-action';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

/**
 * What the AI read in the activity: why it went the way it did, with the
 * figures behind it, and what to do next. Written in the background once
 * the activity is processed, when the athlete or a coach has AI.
 */
export function AiSummaryCard({
  event,
  canRequest = false,
}: {
  event: ActivityEvent;
  canRequest?: boolean;
}) {
  const copy = coachCopy(useChineseCoach());
  const parsed = activityAiSummarySchema.safeParse(event.aiSummary);
  if (!parsed.success && !canRequest) return null;
  const { headline, points = [], suggestion } = parsed.data ?? {};

  return (
    <Card className="col-span-2" data-ai-summary>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <SparklesIcon className="size-4" />
          {copy.recap_title()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {headline && <p className="font-medium">{headline}</p>}
        {points.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        )}
        {suggestion && (
          <p className="flex items-start gap-2 rounded-md bg-muted/60 p-2">
            <ArrowRight className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium">{copy.next()} </span>
              {suggestion}
            </span>
          </p>
        )}
        {/* The AI read a Garmin recording: Garmin requires saying so */}
        {parsed.success && garminActivityLabel(event) && (
          <GarminAttributionText kind="insights" />
        )}
        {canRequest && (
          <SummaryAction eventId={event.eventId} hasSummary={parsed.success} />
        )}
      </CardContent>
    </Card>
  );
}
