import type { CoachChatMessage } from '@openathlete/shared';

export type CoachThread = {
  id: string;
  updatedAt: number;
  messages: CoachChatMessage[];
};

type StoredThread = CoachThread & { userId: number };

const storeName = 'conversations';

async function withChatStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, result: (value: T) => void) => void,
): Promise<T> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('openathlete-coach', 1);
    request.onupgradeneeded = () => {
      request.result
        .createObjectStore(storeName, { keyPath: ['userId', 'id'] })
        .createIndex('userId', 'userId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      let value: T;
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = () =>
        reject(
          transaction.error ?? new Error('Coach history update cancelled'),
        );
      run(transaction.objectStore(storeName), (result) => {
        value = result;
      });
    });
  } finally {
    database.close();
  }
}

export function loadCoachThreads(userId: number) {
  return withChatStore<CoachThread[]>('readonly', (store, result) => {
    const request = store.index('userId').getAll(userId);
    request.onsuccess = () => {
      const threads = request.result as StoredThread[];
      result(
        threads.sort((first, second) => second.updatedAt - first.updatedAt),
      );
    };
  });
}

export function saveCoachThread(
  userId: number,
  thread: CoachThread,
  previouslySaved: boolean,
) {
  return withChatStore<CoachThread>('readwrite', (store, result) => {
    const request = store.get([userId, thread.id]);
    request.onsuccess = () => {
      const previous = request.result as StoredThread | undefined;
      if (!previous && previouslySaved) {
        // A conversation removed in another tab must stay deleted.
        store.transaction.abort();
        return;
      }
      // Keep both versions when another tab answered from the same history.
      const saved =
        previous && previous.messages.length !== thread.messages.length - 2
          ? { ...thread, id: crypto.randomUUID() }
          : thread;
      store.put({ ...saved, userId });
      result(saved);
    };
  });
}

export function removeCoachThread(userId: number, id: string) {
  return withChatStore<void>('readwrite', (store, result) => {
    store.delete([userId, id]);
    result(undefined);
  });
}
