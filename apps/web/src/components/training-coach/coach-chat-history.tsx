import { ConfirmAction } from '@/components/confirm-action';
import { Button } from '@/components/ui/button';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { History, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';

import type { useCoachConversation } from './use-coach-conversation';

export function CoachChatHistory({
  conversation,
  busy,
}: {
  conversation: ReturnType<typeof useCoachConversation>;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string>();
  const listId = useId();
  const { threads, threadId, loadingHistory, deleting } = conversation;
  const date = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium' });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant={open ? 'secondary' : 'outline'}
          aria-controls={listId}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <History className="size-4" />
          {m.coach_chat_history()}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            conversation.newChat();
            setOpen(false);
          }}
          disabled={
            busy || loadingHistory || (!threadId && !conversation.draft)
          }
        >
          {m.coach_chat_new()}
        </Button>
      </div>
      <div id={listId} hidden={!open}>
        {open && (
          <div className="space-y-2 rounded-lg border p-2">
            <p className="px-1 text-xs text-muted-foreground">
              {m.coach_chat_history_device()}
            </p>
            {loadingHistory ? (
              <p role="status" className="px-1 text-sm">
                {m.loading()}
              </p>
            ) : threads.length ? (
              <ul className="max-h-48 space-y-1 overflow-y-auto overscroll-contain">
                {threads.map((thread) => (
                  <li
                    key={thread.id}
                    className="flex min-w-0 items-center gap-1"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-ring aria-pressed:bg-muted disabled:opacity-50"
                      aria-pressed={thread.id === threadId}
                      disabled={busy}
                      onClick={() => {
                        conversation.openThread(thread.id);
                        setOpen(false);
                      }}
                    >
                      <span className="block truncate text-sm font-medium">
                        {thread.messages[0].content}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {date.format(thread.updatedAt)}
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={m.coach_chat_delete()}
                      disabled={busy}
                      onClick={() => setDeleteId(thread.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-1 text-sm">{m.coach_chat_history_empty()}</p>
            )}
          </div>
        )}
      </div>
      {deleteId && (
        <ConfirmAction
          open
          title={m.coach_chat_delete()}
          message={m.coach_chat_delete_confirm()}
          confirmText={m.delete_()}
          isLoading={deleting}
          onClose={() => setDeleteId(undefined)}
          onConfirm={async () => {
            if (await conversation.deleteThread(deleteId))
              setDeleteId(undefined);
          }}
        />
      )}
    </div>
  );
}
