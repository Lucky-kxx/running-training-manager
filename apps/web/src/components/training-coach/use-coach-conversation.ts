import { trainingCoachApi } from '@/api/agent/training-coach.api';
import { useLocalAiModelsQuery } from '@/api/ai-settings';
import { m } from '@/paraglide/messages';
import { aiErrorMessage } from '@/utils/ai-errors';
import { useEffect, useRef, useState } from 'react';

import {
  COACH_CHAT_INPUT_LIMIT,
  COACH_CHAT_MESSAGE_LIMIT,
  CoachChatDto,
  CoachChatMessage,
} from '@openathlete/shared';

import {
  type CoachThread,
  loadCoachThreads,
  removeCoachThread,
  saveCoachThread,
} from './coach-chat-storage';

type Choice = NonNullable<CoachChatDto['localModel']> | 'configured';
const emptyHistory: CoachChatMessage[] = [];

export function useCoachConversation(
  userId: number,
  active: boolean,
  chinese: boolean,
) {
  const localModels = useLocalAiModelsQuery(active);
  const models = localModels.data?.models ?? [];
  const [selection, setSelection] = useState<Choice>();
  const model =
    selection ?? models.find(({ ready }) => ready)?.id ?? 'configured';
  const [threads, setThreads] = useState<CoachThread[]>([]);
  const [threadId, setThreadId] = useState<string>();
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<CoachChatMessage>();
  const [error, setError] = useState('');
  const sending = useRef(false);
  const savedIds = useRef(new Set<string>());
  const history =
    threads.find(({ id }) => id === threadId)?.messages ?? emptyHistory;

  useEffect(() => {
    let mounted = true;
    void loadCoachThreads(userId)
      .then((saved) => {
        if (!mounted) return;
        savedIds.current = new Set(saved.map(({ id }) => id));
        setThreads(saved);
        setThreadId(saved[0]?.id);
      })
      .catch(() => {
        if (mounted) setHistoryUnavailable(true);
      })
      .finally(() => {
        if (mounted) setLoadingHistory(false);
      });
    return () => {
      mounted = false;
    };
  }, [userId]);

  const openThread = (id?: string) => {
    if (sending.current || deleting || loadingHistory || id === threadId)
      return;
    setThreadId(id);
    setDraft('');
    setError('');
  };

  const send = async () => {
    const content = draft.trim();
    if (
      sending.current ||
      deleting ||
      loadingHistory ||
      localModels.isLoading ||
      !content
    )
      return;
    const message = { role: 'user', content } satisfies CoachChatMessage;
    const next = [...history, message];
    const input: CoachChatDto = {
      messages: next.slice(-COACH_CHAT_MESSAGE_LIMIT),
      ...(model !== 'configured' && { localModel: model }),
      chinese,
    };
    sending.current = true;
    setSelection(model);
    setPending(message);
    setDraft('');
    setError('');
    try {
      const { reply } = await trainingCoachApi.chat(input);
      const thread: CoachThread = {
        id: threadId ?? crypto.randomUUID(),
        updatedAt: Date.now(),
        messages: [...next, { role: 'assistant', content: reply }],
      };
      let saved = thread;
      try {
        saved = await saveCoachThread(
          userId,
          thread,
          savedIds.current.has(thread.id),
        );
        savedIds.current.add(saved.id);
      } catch {
        setHistoryUnavailable(true);
      }
      setThreads((previous) => [
        saved,
        ...previous.filter(({ id }) => id !== saved.id),
      ]);
      setThreadId(saved.id);
    } catch (failure) {
      setDraft(content);
      setError(aiErrorMessage(failure) ?? m.coach_chat_failed());
    } finally {
      sending.current = false;
      setPending(undefined);
    }
  };

  return {
    history,
    threads,
    threadId,
    loadingHistory,
    historyUnavailable,
    deleting,
    openThread,
    pending,
    error,
    model,
    models,
    setSelection,
    draft,
    setDraft,
    send,
    loadingModels: localModels.isLoading,
    addDictation(text: string) {
      setDraft((previous) =>
        [previous, text]
          .filter(Boolean)
          .join(' ')
          .slice(0, COACH_CHAT_INPUT_LIMIT),
      );
    },
    newChat() {
      if (sending.current || deleting || loadingHistory) return;
      setThreadId(undefined);
      setDraft('');
      setError('');
    },
    async deleteThread(id: string) {
      if (sending.current || deleting) return false;
      setDeleting(true);
      try {
        if (savedIds.current.has(id)) await removeCoachThread(userId, id);
        savedIds.current.delete(id);
        setThreads((previous) => previous.filter((thread) => thread.id !== id));
        if (threadId === id) {
          setThreadId(undefined);
          setDraft('');
          setError('');
        }
        return true;
      } catch {
        setHistoryUnavailable(true);
        return false;
      } finally {
        setDeleting(false);
      }
    },
  };
}
