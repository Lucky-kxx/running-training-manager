import { trainingCoachApi } from '@/api/agent/training-coach.api';
import { useGetEventQuery } from '@/api/event';
import { eventKeys } from '@/api/event/event.keys';
import { AiSummaryCard } from '@/components/activity-analysis/ai-summary-card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { m } from '@/paraglide/messages';
import { activityPath } from '@/routes/paths';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Sparkles } from 'lucide-react';
import { FormEvent, type RefObject, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  CoachActivity,
  CoachFeedbackDto,
  CoachUndoDto,
  EVENT_TYPE,
} from '@openathlete/shared';

import { CoachChat } from './coach-chat';
import { coachCopy, useChineseCoach } from './coach-copy';
import { CoachDictation } from './coach-dictation';
import { useCoachConversation } from './use-coach-conversation';

function CoachRecap({ eventId }: { eventId: number }) {
  const { data: event } = useGetEventQuery(eventId);
  return event?.type === EVENT_TYPE.ACTIVITY ? (
    <AiSummaryCard event={event} canRequest />
  ) : null;
}

export function TrainingCoach({
  userId,
  open,
  onOpenChange: setOpen,
  sidebarButton,
}: {
  userId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sidebarButton: RefObject<HTMLButtonElement | null>;
}) {
  const [mode, setMode] = useState<'chat' | 'feedback'>('chat');
  const [message, setMessage] = useState('');
  const [date, setDate] = useState('');
  const [notice, setNotice] = useState('');
  const chinese = useChineseCoach();
  const conversation = useCoachConversation(
    userId,
    open && mode === 'chat',
    chinese,
  );
  const copy = coachCopy(chinese);
  const queryClient = useQueryClient();
  const invalidate = (eventId: number) => {
    void queryClient.invalidateQueries({
      queryKey: [eventKeys.getEvent, eventId],
    });
    void queryClient.invalidateQueries({ queryKey: [eventKeys.getMyEvents] });
  };
  const feedback = useMutation({
    mutationFn: trainingCoachApi.feedback,
    onSuccess: (result) => {
      if (result.status === 'saved') {
        invalidate(result.activity.eventId);
        setMessage('');
      }
    },
  });
  const undo = useMutation({
    mutationFn: ({ eventId, data }: { eventId: number; data: CoachUndoDto }) =>
      trainingCoachApi.undo(eventId, data),
    onSuccess: (result, { eventId }) => {
      if (result.undone) {
        invalidate(eventId);
        feedback.reset();
      }
      setNotice(result.undone ? copy.undone() : copy.changed());
    },
    onError: () => setNotice(copy.request_error()),
  });

  const day = new Date();
  if (/昨天|yesterday/i.test(message)) day.setDate(day.getDate() - 1);
  const selectedDate = date || format(day, 'yyyy-MM-dd');
  const result = feedback.data;
  const busy = feedback.isPending || undo.isPending;

  const record = (
    input: Pick<CoachFeedbackDto, 'eventId' | 'replaceRpe'> = {},
  ) => {
    setNotice('');
    const from = new Date(`${selectedDate}T00:00:00`);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    feedback.mutate({
      message,
      from: from.toISOString(),
      to: to.toISOString(),
      ...input,
    });
  };

  const showActivity = (activity: CoachActivity) => (
    <>
      <span className="block break-words font-medium">{activity.name}</span>
      <span className="block text-sm text-muted-foreground">
        {new Date(activity.startDate).toLocaleString(undefined, {
          dateStyle: 'short',
          timeStyle: 'short',
        })}
        {' · '}
        {(activity.distance / 1000).toFixed(2)} km
      </span>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 rounded-full shadow-lg md:bottom-5 md:right-20"
          onClick={() => {
            sidebarButton.current = null;
          }}
        >
          <Sparkles className="size-4" />
          {copy.title()}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="grid-cols-1 sm:max-w-xl"
        mobileFullscreen={mode === 'chat'}
        onCloseAutoFocus={(event) => {
          if (!sidebarButton.current?.isConnected) return;
          event.preventDefault();
          sidebarButton.current.focus();
          sidebarButton.current = null;
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" />
            {copy.title()}
          </DialogTitle>
          <DialogDescription>
            {mode === 'chat' ? m.coach_chat_intro() : copy.intro()}
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={mode}
          onValueChange={(value) =>
            setMode(value === 'feedback' ? 'feedback' : 'chat')
          }
          className="min-w-0"
        >
          <TabsList className="w-full">
            <TabsTrigger value="chat">{m.coach_chat_tab()}</TabsTrigger>
            <TabsTrigger value="feedback">
              {m.coach_chat_feedback_tab()}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="chat">
            <CoachChat
              conversation={conversation}
              onOpenSettings={() => setOpen(false)}
            />
          </TabsContent>
          <TabsContent value="feedback" className="space-y-4">
            <form
              className="space-y-3"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                record();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="training-coach-date">{copy.date()}</Label>
                <Input
                  id="training-coach-date"
                  type="date"
                  value={selectedDate}
                  disabled={busy}
                  required
                  onChange={(event) => {
                    setDate(event.target.value);
                    feedback.reset();
                    setNotice('');
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="training-coach-message">{copy.message()}</Label>
                <Textarea
                  id="training-coach-message"
                  value={message}
                  disabled={busy}
                  maxLength={800}
                  rows={3}
                  onChange={(event) => {
                    setMessage(event.target.value);
                    if (result?.status !== 'saved') feedback.reset();
                    setNotice('');
                  }}
                  placeholder={copy.example()}
                />
              </div>
              <CoachDictation
                disabled={busy}
                onText={(text) => {
                  setMessage((old) =>
                    [old, text].filter(Boolean).join(' ').slice(0, 800),
                  );
                  if (result?.status !== 'saved') feedback.reset();
                  setNotice('');
                }}
              />
              <Button type="submit" disabled={busy || !message.trim()}>
                {copy.save()}
              </Button>
            </form>

            {(notice ||
              feedback.isError ||
              result?.status === 'invalid-rpe' ||
              result?.status === 'no-match' ||
              result?.status === 'changed') && (
              <p className="rounded-lg bg-muted p-3 text-sm" role="status">
                {notice ||
                  (feedback.isError
                    ? copy.request_error()
                    : result?.status === 'invalid-rpe'
                      ? copy.invalid()
                      : result?.status === 'no-match'
                        ? copy.no_match()
                        : copy.changed())}
              </p>
            )}
            {result?.status === 'choose' && (
              <div className="space-y-2">
                <p className="text-sm font-medium" role="status">
                  {copy.choose()}
                </p>
                {result.activities.map((activity) => (
                  <button
                    key={activity.eventId}
                    type="button"
                    disabled={busy}
                    className="block w-full rounded-lg border p-3 text-left hover:bg-muted focus-visible:ring-2"
                    onClick={() => record({ eventId: activity.eventId })}
                  >
                    {showActivity(activity)}
                  </button>
                ))}
              </div>
            )}
            {result?.status === 'replace' && (
              <div className="space-y-2 rounded-lg border p-3">
                {showActivity(result.activity)}
                <p className="text-sm" role="status">
                  {copy.replace(
                    String(result.previous * 10),
                    String(result.rpe * 10),
                  )}
                </p>
                <Button
                  variant="outline"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    record({
                      eventId: result.activity.eventId,
                      replaceRpe: result.previous,
                    })
                  }
                >
                  {copy.replace_button()}
                </Button>
              </div>
            )}
            {result?.status === 'saved' && (
              <>
                <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
                  <p role="status" className="text-sm">
                    {copy.saved(String(result.rpe * 10))}
                  </p>
                  {showActivity(result.activity)}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        to={activityPath(result.activity.eventId)}
                        onClick={() => setOpen(false)}
                      >
                        {copy.activity()}
                      </Link>
                    </Button>
                    {result.undo && (
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (result.undo)
                            undo.mutate({
                              eventId: result.activity.eventId,
                              data: result.undo,
                            });
                        }}
                      >
                        {copy.undo()}
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <CoachRecap eventId={result.activity.eventId} />
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
