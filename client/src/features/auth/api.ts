import axios from 'axios';
import { z } from '../../validation';

const identity = z.object({ username: z.string().min(1), permissions: z.array(z.string()) });
const sessionResponse = z.object({ user: identity.nullable() });
const signedInResponse = z.object({ user: identity });
export type Identity = z.infer<typeof identity>;

export interface Credentials {
  username: string;
  password: string;
}

export type AuthMode = 'login' | 'register' | 'admin-login';

const client = axios.create({ baseURL: '/api/v1', timeout: 12_000 });

export function authError(error: unknown) {
  if (!axios.isAxiosError<{error?: { code?: string }}>(error)) return undefined;
  return error.response?.data?.error?.code;
}

export function authStatus(error: unknown) {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

export async function authenticate(mode: AuthMode, credentials: Credentials) {
  const result = await client.post<unknown>('/auth/' + mode, credentials);
  signedInResponse.parse(result.data);
}

export async function readIdentity(signal: AbortSignal) {
  const result = await client.get<unknown>('/auth/session', { signal });
  return sessionResponse.parse(result.data).user;
}

export async function signOut() {
  const result = await client.post('/auth/logout', {});
  if (result.status !== 204) throw new Error('Unexpected logout response');
}

export async function checkAdminAccess(signal: AbortSignal) {
  const result = await client.get<unknown>('/admin/access', { signal });
  if (!signedInResponse.parse(result.data).user.permissions.includes('admin:access')) throw new Error('Unexpected administrator access response');
}
