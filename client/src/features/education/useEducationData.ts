import { useEffect, useState } from 'react';

type Load<T> = (signal: AbortSignal) => Promise<T>;
type Result<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: unknown };

export function useEducationData<T>(load: Load<T>) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ load: Load<T>; attempt: number; result: Result<T> }>();
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).then(data => {
      if (!controller.signal.aborted) setSettled({ load, attempt, result: { status: 'ready', data } });
    }, error => {
      if (!controller.signal.aborted) setSettled({ load, attempt, result: { status: 'error', error } });
    });
    return () => controller.abort();
  }, [load, attempt]);
  const result: Result<T> = settled?.load === load && settled.attempt === attempt ? settled.result : { status: 'loading' };
  return { result, reload: () => setAttempt(value => value + 1) };
}
