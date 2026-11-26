import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { LogIn, ShieldCheck, UserRound, UserRoundPlus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button, Card, InputField, StatePanel } from '../../components/ui/Primitives';
import { z } from '../../validation';
import { authenticate, authError, authStatus, checkAdminAccess, readIdentity, signOut, type AuthMode, type Credentials, type Identity } from './api';
import './strings';
import './auth.css';

const modes = {
  login: { icon: LogIn, description: 'authLoginIntro', path: '/account' },
  register: { icon: UserRoundPlus, description: 'authRegisterIntro', path: '/account' },
  'admin-login': { icon: ShieldCheck, description: 'authAdminIntro', path: '/admin' },
} as const;

const username = z.string().max(128, 'inputUsername').trim().regex(/^[a-z0-9][a-z0-9._-]{2,31}$/i, 'inputUsername');
function passwordHasLength(value: string, minimum: number) {
  const length = [...value].length;
  return length >= minimum && length <= 128;
}
const signInSchema = z.object({
  username,
  password: z.string().refine(value => passwordHasLength(value, 1), 'inputPassword'),
});
const registrationSchema = signInSchema.extend({
  password: z.string().refine(value => passwordHasLength(value, 15) && /\S/u.test(value), 'inputNewPassword'),
});

function errorMessage(error: unknown) {
  switch (authError(error)) {
    case 'INVALID_CREDENTIALS': return 'invalidCredentials';
    case 'INVALID_INPUT': return 'invalidInput';
    case 'USERNAME_TAKEN': return 'usernameTaken';
    case 'RATE_LIMITED': return 'tryLater';
    default: return 'unavailable';
  }
}

function AccountForm({ mode }: { mode: AuthMode }) {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const { icon: Icon, description, path } = modes[mode];
  const isRegistration = mode === 'register';
  const helpId = useId();
  const [error, setError] = useState<string>();
  const { register, handleSubmit, reset, resetField, formState: { errors, isSubmitting } } = useForm<Credentials>({
    resolver: zodResolver(isRegistration ? registrationSchema : signInSchema),
    defaultValues: { username: '', password: '' },
  });

  async function submit(values: Credentials) {
    setError(undefined);
    try {
      const user = await authenticate(mode, values);
      reset();
      const target = mode === 'admin-login' && !user.permissions.includes('admin:access') ? '/staff' : path;
      void navigate(target, { replace: true });
    } catch (failure) {
      resetField('password');
      setError(errorMessage(failure));
    }
  }

  const usernameError = errors.username?.message;
  const passwordError = errors.password?.message;
  return <div className="auth-page">
    <header className="auth-heading">
      <span className="auth-mark"><Icon size={25} aria-hidden="true" /></span>
      <h1>{t(mode)}</h1>
      <p>{t(description)}</p>
    </header>
    <Card>
      <form method="post" noValidate className="auth-form" aria-busy={isSubmitting}
        onSubmit={handleSubmit(submit, () => setError(undefined))}>
        <div className="auth-field">
          <InputField label={t('username')} autoComplete="username" autoCapitalize="none" spellCheck={false}
            dir="ltr" required aria-invalid={Boolean(usernameError)}
            aria-describedby={helpId + '-username'} {...register('username')} />
          <p className={usernameError ? 'auth-warning' : 'auth-hint'} id={helpId + '-username'}>
            {t(usernameError || 'usernameHelp')}
          </p>
        </div>
        <div className="auth-field">
          <InputField label={t('password')} type="password" autoComplete={isRegistration ? 'new-password' : 'current-password'}
            dir="ltr" required aria-invalid={Boolean(passwordError)}
            aria-describedby={passwordError || isRegistration ? helpId + '-password' : undefined} {...register('password')} />
          {(passwordError || isRegistration) && <p className={passwordError ? 'auth-warning' : 'auth-hint'} id={helpId + '-password'}>
            {t(passwordError || 'passwordHelp')}
          </p>}
        </div>
        {error && <p className="auth-warning" role="alert">{t(error)}</p>}
        <Button type="submit" disabled={isSubmitting}>{t(isSubmitting ? 'submitting' : mode)}</Button>
      </form>
    </Card>
    <p className="auth-note">{t('sharedDevice')}</p>
    <div className="auth-links">
      {mode === 'login' && <Link to="/register">{t('register')}</Link>}
      {mode === 'register' && <Link to="/login">{t('login')}</Link>}
      <Link to="/explore">{t('guest')}</Link>
    </div>
  </div>;
}

export function LoginPage({ mode }: { mode: AuthMode }) {
  return <AccountForm key={mode} mode={mode} />;
}

type SessionState = { status: 'loading' | 'error' } | { status: 'ready'; user: Identity | null };

function useRestoreSession(recheck: () => void) {
  useEffect(() => {
    function restore(event: PageTransitionEvent) { if (event.persisted) recheck(); }
    window.addEventListener('pageshow', restore);
    return () => window.removeEventListener('pageshow', restore);
  }, [recheck]);
}

export function AccountPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string>();

  const recheck = useCallback(() => {
    setState({ status: 'loading' });
    setError(undefined);
    setAttempt(value => value + 1);
  }, []);
  useRestoreSession(recheck);

  useEffect(() => {
    const request = new AbortController();
    void readIdentity(request.signal).then(
      user => { if (!request.signal.aborted) setState({ status: 'ready', user }); },
      () => { if (!request.signal.aborted) setState({ status: 'error' }); },
    );
    return () => request.abort();
  }, [attempt]);

  async function logout() {
    setSigningOut(true);
    setError(undefined);
    try {
      await signOut();
      setState({ status: 'ready', user: null });
      void navigate('/', { replace: true });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSigningOut(false);
    }
  }

  return <div className="auth-page">
    <header className="auth-heading">
      <span className="auth-mark"><UserRound size={25} aria-hidden="true" /></span>
      <h1>{t('account')}</h1>
    </header>
    <Card>
      {state.status === 'loading' && <StatePanel kind="loading" title={t('checking')} />}
      {state.status === 'error' && <StatePanel kind="error" title={t('unavailable')}>
        <Button variant="secondary" onClick={recheck}>{t('retry')}</Button>
      </StatePanel>}
      {state.status === 'ready' && (state.user ? <div className="auth-identity">
        <dl><dt>{t('signedInAs')}</dt><dd><bdi>{state.user.username}</bdi></dd></dl>
        <p>{t('sharedDevice')}</p>
        {error && <p className="auth-warning" role="alert">{t(error)}</p>}
        <Button disabled={signingOut} onClick={() => void logout()}>{t(signingOut ? 'signingOut' : 'signOut')}</Button>
        {state.user.permissions.includes('admin:access') && <Button asChild variant="secondary"><Link to="/admin">{t('adminAccess')}</Link></Button>}
        {state.user.permissions.includes('staff:workspace') && <Button asChild variant="secondary"><Link to="/staff">{t('staffAccess')}</Link></Button>}
      </div> : <div className="auth-identity">
        <p>{t('guestDescription')}</p>
        <div className="auth-links">
          <Link to="/login">{t('login')}</Link>
          <Link to="/register">{t('register')}</Link>
          <Link to="/explore">{t('guest')}</Link>
        </div>
      </div>)}
    </Card>
  </div>;
}

type Access = 'loading' | 'allowed' | 'anonymous' | 'forbidden' | 'error';

export function AdminGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation('auth');
  const [access, setAccess] = useState<Access>('loading');
  const [attempt, setAttempt] = useState(0);
  const recheck = useCallback(() => { setAccess('loading'); setAttempt(value => value + 1); }, []);
  useRestoreSession(recheck);

  useEffect(() => {
    const request = new AbortController();
    void checkAdminAccess(request.signal).then(() => {
      if (!request.signal.aborted) setAccess('allowed');
    }, error => {
      if (request.signal.aborted) return;
      const status = authStatus(error);
      setAccess(status === 401 ? 'anonymous' : status === 403 ? 'forbidden' : 'error');
    });
    return () => request.abort();
  }, [attempt]);

  if (access === 'allowed') return children;
  if (access === 'anonymous') return <Navigate replace to="/admin/login" />;
  return <main className="auth-page">
    <header className="auth-heading"><h1>{t(access === 'forbidden' ? 'accessDenied' : 'adminAccess')}</h1></header>
    {access === 'loading' && <StatePanel kind="loading" title={t('checking')} />}
    {access === 'error' && <StatePanel kind="error" title={t('unavailable')}>
      <Button onClick={recheck}>{t('retry')}</Button>
    </StatePanel>}
    {access === 'forbidden' && <Card>
      <p>{t('accessDeniedDescription')}</p>
      <div className="auth-links">
        <Link to="/admin/login">{t('admin-login')}</Link>
        <Link to="/account">{t('account')}</Link>
        <Link to="/explore">{t('guest')}</Link>
      </div>
    </Card>}
  </main>;
}
