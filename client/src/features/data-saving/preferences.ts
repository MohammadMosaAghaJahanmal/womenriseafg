import { useSyncExternalStore } from 'react';

export type DataSavingPreference = 'auto' | 'on' | 'off';
type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };

const storageKey = 'womenriseafg.dataSaving';
const currentConnection = () => typeof navigator === 'undefined' ? undefined
  : (navigator as Navigator & { connection?: Connection }).connection;

function readPreference(): DataSavingPreference {
  try {
    const value = localStorage.getItem(storageKey);
    return value === 'on' || value === 'off' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function resolvesDataSaving(preference: DataSavingPreference, connection?: Pick<Connection, 'saveData' | 'effectiveType'>) {
  return preference === 'on' || (preference === 'auto' && Boolean(
    connection?.saveData || /^(?:slow-2g|2g|3g)$/.test(connection?.effectiveType ?? ''),
  ));
}

const serverSnapshot = { preference: 'auto' as DataSavingPreference, enabled: false };
const subscribers = new Set<() => void>();
let preference = readPreference();
let snapshot = { preference, enabled: resolvesDataSaving(preference, currentConnection()) };

function reflectPreference() {
  if (typeof document === 'undefined') return;
  if (snapshot.enabled) document.documentElement.dataset.dataSaving = 'on';
  else delete document.documentElement.dataset.dataSaving;
}

reflectPreference();

function publish() {
  const enabled = resolvesDataSaving(preference, currentConnection());
  if (snapshot.preference === preference && snapshot.enabled === enabled) return;
  snapshot = { preference, enabled };
  reflectPreference();
  for (const subscriber of subscribers) subscriber();
}

function onStorage(event: StorageEvent) {
  if (event.key !== storageKey && event.key !== null) return;
  preference = readPreference();
  publish();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', onStorage);
  currentConnection()?.addEventListener?.('change', publish);
}

function subscribe(listener: () => void) {
  subscribers.add(listener);
  return () => { subscribers.delete(listener); };
}

function setPreference(next: DataSavingPreference) {
  let persisted = true;
  try {
    if (next === 'auto') localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, next);
  } catch {
    persisted = false;
  }
  preference = next;
  publish();
  return persisted;
}

export function clearDataSavingPreference() {
  return setPreference('auto');
}

export function dataSavingEnabled() {
  return resolvesDataSaving(preference, currentConnection());
}

export function useDataSaving() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => serverSnapshot);
  return { ...state, setPreference, clearPreference: clearDataSavingPreference };
}
