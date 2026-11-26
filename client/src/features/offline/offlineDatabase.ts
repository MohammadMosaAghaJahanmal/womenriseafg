import { isOfflineFileType } from './downloadFile';
import { OfflineError, offlineRecordLimit, offlineStorageLimitBytes, type OfflineRecord, type OfflineSummary } from './types';

const databaseName = 'womenriseafg.offline.v1';
const records = 'records';
const payloads = 'payloads';
const reservations = 'reservations';
const stores = [records, payloads, reservations];
const expiredReservationAge = 24 * 60 * 60 * 1000;
type Payload = Pick<OfflineRecord, 'key' | 'body' | 'blob'>;

let connection: IDBDatabase | undefined;
let checking: Promise<IDBDatabase | null> | undefined;
let creating: Promise<IDBDatabase | null> | undefined;

function openDatabase(create: boolean) {
  return new Promise<IDBDatabase | null>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new OfflineError('unavailable'));
    const open = create ? indexedDB.open(databaseName, 1) : indexedDB.open(databaseName);
    let blocked = false;
    let missing = false;
    open.onupgradeneeded = () => {
      if (!create) {
        // Opening an absent name starts a version upgrade. Abort it on read-only visits.
        missing = true;
        open.transaction?.abort();
        return;
      }
      for (const store of stores) open.result.createObjectStore(store, { keyPath: 'key' });
      open.transaction?.objectStore(reservations).createIndex('startedAt', 'startedAt');
    };
    open.onblocked = () => {
      blocked = true;
      reject(new OfflineError('unavailable'));
    };
    open.onerror = () => {
      if (missing) resolve(null);
      else reject(open.error);
    };
    open.onsuccess = () => {
      const db = open.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        db.close();
        if (connection === db) connection = undefined;
      };
      db.onclose = () => { if (connection === db) connection = undefined; };
      connection = db;
      resolve(db);
    };
  });
}

async function database(create: boolean) {
  if (connection) return connection;
  if (creating) return creating;
  if (!create) return checking ??= openDatabase(false).finally(() => { checking = undefined; });
  if (checking) {
    const existing = await checking;
    if (existing) return existing;
  }
  return creating ??= openDatabase(true).finally(() => { creating = undefined; });
}

type TransactionContext<T> = {
  store: (name: string) => IDBObjectStore;
  finish: (value: T) => void;
  follow: <Result>(request: IDBRequest<Result>, action: (value: Result) => void) => void;
};

async function transaction<T>(
  names: string[],
  mode: IDBTransactionMode,
  absent: T,
  operation: (context: TransactionContext<T>) => void,
  options: { signal?: AbortSignal; create?: boolean } = {},
) {
  const db = await database(options.create === true);
  if (!db) return absent;
  const { signal } = options;
  return new Promise<T>((resolve, reject) => {
    const write = db.transaction(names, mode);
    let result: T;
    let failure: unknown;
    function abort(error: unknown) {
      failure = error;
      try { write.abort(); } catch { reject(error); }
    }
    const cancel = () => abort(new OfflineError('cancelled'));
    const cleanup = () => signal?.removeEventListener('abort', cancel);
    write.oncomplete = () => { cleanup(); resolve(result); };
    write.onabort = () => { cleanup(); reject(failure ?? write.error ?? new OfflineError('unavailable')); };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) {
      cancel();
      return;
    }
    // Keep subsequent requests inside IndexedDB callbacks while the transaction is active.
    try {
      operation({
        store: name => write.objectStore(name),
        finish: value => { result = value; },
        follow(request, action) {
          request.onsuccess = () => {
            try { action(request.result); } catch (error) { abort(error); }
          };
        },
      });
    } catch (error) { abort(error); }
  });
}

export const listOfflineSummaries = () => transaction<OfflineSummary[]>([records], 'readonly', [], ({ store, finish, follow }) => {
  follow(store(records).getAll(), finish);
});

export function getOfflineRecord(key: string) {
  return transaction<OfflineRecord | null>([records, payloads], 'readonly', null, ({ store, finish, follow }) => {
    follow(store(records).get(key), (summary: OfflineSummary | undefined) => {
      if (!summary) return finish(null);
      follow(store(payloads).get(key), (payload: Payload | undefined) => {
        if (!payload || typeof payload.body !== 'string' ||
            (summary.file && (!isOfflineFileType(summary.file.mimeType) || !(payload.blob instanceof Blob) ||
              payload.blob.size !== summary.file.sizeBytes || payload.blob.type !== summary.file.mimeType)) ||
            (!summary.file && payload.blob !== null)) throw new OfflineError('unavailable');
        finish({ ...summary, body: payload.body, blob: payload.blob });
      });
    });
  });
}

export function reserveDownload(key: string, token: string, signal: AbortSignal) {
  return transaction<void>([reservations], 'readwrite', undefined, ({ store, follow }) => {
    const pending = store(reservations);
    const startedAt = Date.now();
    pending.put({ key, token, startedAt });
    const expired = IDBKeyRange.upperBound(startedAt - expiredReservationAge);
    const cursor = pending.index('startedAt').openCursor(expired);
    follow(cursor, entry => {
      if (!entry) return;
      entry.delete();
      entry.continue();
    });
  }, { signal, create: true });
}

export function reservationTokens(keys: string[]) {
  const values = new Array<string | undefined>(keys.length).fill(undefined);
  return transaction<(string | undefined)[]>([reservations], 'readonly', values, ({ store, finish, follow }) => {
    finish(values);
    keys.forEach((key, position) => follow(store(reservations).get(key), (value: { token: string } | undefined) => {
      values[position] = value?.token;
    }));
  });
}

export function releaseDownload(key: string, token: string) {
  return transaction<void>([reservations], 'readwrite', undefined, ({ store, follow }) => {
    const pending = store(reservations);
    follow(pending.get(key), (value: { token: string } | undefined) => {
      if (value?.token === token) pending.delete(key);
    });
  });
}

export function putOfflineRecord(summary: OfflineSummary, payload: Payload, token: string, signal: AbortSignal) {
  return transaction<void>(stores, 'readwrite', undefined, ({ store, follow }) => {
    const pending = store(reservations);
    const summaries = store(records);
    follow(pending.get(summary.key), (reservation: { token: string } | undefined) => {
      if (reservation?.token !== token) throw new OfflineError('cancelled');
      follow(summaries.getAll(), (saved: OfflineSummary[]) => {
        const other = saved.filter(item => item.key !== summary.key);
        const occupied = other.reduce((sum, item) => sum + item.sizeBytes, 0);
        if (other.length >= offlineRecordLimit || occupied + summary.sizeBytes > offlineStorageLimitBytes) {
          throw new OfflineError('quota');
        }
        summaries.put(summary);
        store(payloads).put(payload);
        pending.delete(summary.key);
      });
    });
  }, { signal });
}

export function deleteOfflineRecord(key: string) {
  return transaction<void>(stores, 'readwrite', undefined, ({ store }) => {
    for (const name of stores) store(name).delete(key);
  });
}

export function deleteOfflineRecords() {
  return transaction<void>(stores, 'readwrite', undefined, ({ store }) => {
    for (const name of stores) store(name).clear();
  });
}
