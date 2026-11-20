import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { m } from '@/paraglide/messages';
import { getPath } from '@/routes/paths';
import { MessageCircle, Send } from 'lucide-react';
import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';

import { COACH_CHAT_INPUT_LIMIT } from '@openathlete/shared';

import { CoachChatHistory } from './coach-chat-history';
import { CoachDictation } from './coach-dictation';
import type { useCoachConversation } from './use-coach-conversation';

export function CoachChat({
  conversation,
  onOpenSettings,
}: {
  conversation: ReturnType<typeof useCoachConversation>;
  onOpenSettings: () => void;
}) {
  const log = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const {
    history,
    pending,
    error,
    model,
    models,
    setSelection,
    draft,
    setDraft,
    send,
    loadingModels,
    loadingHistory,
    historyUnavailable,
    deleting,
    addDictation,
  } = conversation;
  const messages = pending ? [...history, pending] : history;
  const busy = Boolean(pending) || deleting;
  const canSend =
    !busy && !loadingModels && !loadingHistory && Boolean(draft.trim());
  const settings = `${getPath(['dashboard', 'settings'])}?tab=ai`;

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [history, pending]);

  return (
    <div className="min-w-0 space-y-3">
      <CoachChatHistory conversation={conversation} busy={busy} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <label htmlFor="coach-chat-model">{m.coach_chat_model()}</label>
          <select
            id="coach-chat-model"
            className="min-w-0 max-w-56 truncate rounded-md border bg-background px-2 py-1"
            value={model}
            disabled={busy || loadingModels}
            onChange={(event) => {
              const choice = models.find(({ id }) => id === event.target.value);
              setSelection(choice?.id ?? 'configured');
            }}
          >
            {models.map(({ id, name, ready }) => (
              <option key={id} value={id} disabled={!ready}>
                {m.coach_chat_local_model({ name })}
              </option>
            ))}
            <option value="configured">
              {m.coach_chat_configured_model()}
            </option>
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {model === 'configured'
          ? m.coach_chat_cloud_disclosure()
          : m.coach_chat_local_disclosure()}
      </p>
      {historyUnavailable && (
        <p role="status" className="text-sm text-muted-foreground">
          {m.coach_chat_history_unavailable()}
        </p>
      )}
      <div
        ref={log}
        role="log"
        aria-label={m.coach_chat_tab()}
        className="max-h-[42dvh] min-h-36 space-y-3 overflow-y-auto overscroll-contain rounded-xl border bg-muted/25 px-3 py-4"
      >
        {!messages.length && (
          <div className="space-y-3">
            <MessageCircle
              className="size-5 text-muted-foreground"
              aria-hidden
            />
            <p className="text-sm">{m.coach_chat_welcome()}</p>
            <div className="flex flex-wrap gap-2">
              {[m.coach_chat_example_injury(), m.coach_chat_example_race()].map(
                (example) => (
                  <Button
                    key={example}
                    type="button"
                    variant="outline"
                    className="h-auto whitespace-normal text-left"
                    size="sm"
                    onClick={() => {
                      setDraft(example);
                      composer.current?.focus();
                    }}
                  >
                    {example}
                  </Button>
                ),
              )}
            </div>
          </div>
        )}
        {messages.map(({ role, content }, index) => (
          <div
            key={index}
            className={
              role === 'user' ? 'flex justify-end' : 'flex justify-start'
            }
          >
            {role === 'user' ? (
              <p
                data-coach-role="user"
                className="max-w-[90%] rounded-xl bg-primary px-3 py-2 text-sm whitespace-pre-wrap break-words text-primary-foreground"
              >
                {content}
              </p>
            ) : (
              <div
                data-coach-role="assistant"
                className="prose prose-sm dark:prose-invert max-w-full min-w-0 rounded-xl border bg-card px-3 py-2 break-words text-card-foreground [&_p]:my-1"
              >
                <ReactMarkdown
                  skipHtml
                  disallowedElements={['img', 'a']}
                  unwrapDisallowed
                >
                  {content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        ))}
        {pending && (
          <p role="status" className="text-sm text-muted-foreground">
            {m.coach_chat_waiting()}
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-muted p-3 text-sm">
          {error}{' '}
          <Link
            to={settings}
            onClick={onOpenSettings}
            className="font-medium underline"
          >
            {m.ai_setup_open_settings()}
          </Link>
        </p>
      )}
      <form
        className="min-w-0 space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) void send();
        }}
      >
        <Textarea
          ref={composer}
          rows={2}
          aria-label={m.coach_chat_input()}
          placeholder={m.coach_chat_input()}
          value={draft}
          maxLength={COACH_CHAT_INPUT_LIMIT}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.keyCode !== 229
            ) {
              event.preventDefault();
              if (canSend) void send();
            }
          }}
        />
        <div className="flex items-start justify-between gap-2">
          <CoachDictation disabled={busy} onText={addDictation} />
          <Button type="submit" size="sm" disabled={!canSend}>
            <Send className="size-4" />
            {m.coach_chat_send()}
          </Button>
        </div>
      </form>
    </div>
  );
}
