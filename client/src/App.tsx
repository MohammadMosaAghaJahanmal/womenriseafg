import { useEffect, useState } from 'react';
import { checkApiHealth } from './services/health';

type HealthState = 'checking' | 'available' | 'unavailable';

const healthMessages: Record<HealthState, string> = {
  checking: 'Checking the API connection…',
  available: 'The API is responding.',
  unavailable: 'The connection check failed. Try again.',
};

export default function App() {
  const [health, setHealth] = useState<HealthState>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function checkConnection() {
      let result: HealthState;
      try {
        await checkApiHealth(controller.signal);
        result = 'available';
      } catch {
        result = 'unavailable';
      }
      if (!controller.signal.aborted) setHealth(result);
    }
    void checkConnection();
    return () => controller.abort();
  }, [attempt]);

  function checkAgain() {
    setHealth('checking');
    setAttempt((previous) => previous + 1);
  }

  return (
    <main>
      <header>
        <p className="brand">womenriseafg</p>
        <h1>Project foundation</h1>
        <p className="stage">Stage 1 development status</p>
      </header>
      <section aria-labelledby="connection-heading">
        <h2 id="connection-heading">API connection</h2>
        <p role="status" aria-live="polite" aria-atomic="true">{healthMessages[health]}</p>
        <button type="button" onClick={checkAgain} disabled={health === 'checking'}>
          {health === 'unavailable' ? 'Try again' : 'Check again'}
        </button>
      </section>
    </main>
  );
}
