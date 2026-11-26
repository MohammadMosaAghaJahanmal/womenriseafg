import { OfflineError } from './store';

export function offlinePath(key: string) {
  return '/downloads/' + encodeURIComponent(key);
}

export function displaySize(bytes: number, locale: string) {
  const [value, unit] = bytes >= 1_000_000 ? [bytes / 1_000_000, 'megabyte']
    : bytes >= 1000 ? [bytes / 1000, 'kilobyte'] : [bytes, 'byte'];
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: 1 }).format(value);
}

export function offlineFailure(error: unknown) {
  return error instanceof OfflineError ? error.code : 'unavailable';
}
