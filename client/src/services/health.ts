import axios from 'axios';

export async function checkApiHealth(signal: AbortSignal): Promise<void> {
  const response = await axios.get<{ status?: unknown } | null>('/api/v1/health', {
    headers: { Accept: 'application/json' },
    timeout: 8000,
    signal,
  });

  if (response.data?.status !== 'ok') {
    throw new Error('Unexpected health response');
  }
}
