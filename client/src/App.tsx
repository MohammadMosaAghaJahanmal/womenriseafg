import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StudentLayout from './layouts/StudentLayout';
import { HomePage, ExplorePage } from './features/discover/Discover';
import { sectionLabel } from './pages/routes';
import './pages/strings';
import './features/auth/strings';

const AdminPage = lazy(() => import('./features/admin/AdminPage'));
const ComponentPreviewPage = lazy(() => import('./features/admin/AdminPage').then(module => ({ default: module.ComponentPreviewPage })));
const WorkspacePage = lazy(() => import('./pages/WorkspacePages'));
const AccountPage = lazy(() => import('./features/auth/AuthPages').then(module => ({ default: module.AccountPage })));
const LoginPage = lazy(() => import('./features/auth/AuthPages').then(module => ({ default: module.LoginPage })));
const AdminGate = lazy(() => import('./features/auth/AuthPages').then(module => ({ default: module.AdminGate })));

export default function App() {
  const { pathname } = useLocation();
  const { t } = useTranslation(['shell', 'pages', 'auth']);
  useEffect(() => {
    const path = pathname.replace(/\/+$/, '');
    const accountTitles = {
      '/login': 'login', '/register': 'register', '/account': 'account',
      '/admin/login': 'admin-login', '/design-preview': 'adminPreview',
    } as const;
    const accountTitle = accountTitles[path as keyof typeof accountTitles];
    const key = accountTitle ? 'auth:' + accountTitle : path === '' ? 'home' : path === '/explore' ? 'explore' :
      path === '/admin' || path.startsWith('/admin/') ? 'admin' : sectionLabel(path);
    document.title = (key ? t(key) : t('pages:notFound')) + ' · womenriseafg';
  }, [pathname, t]);

  const loading = <p className="p-6" role="status">{t('pages:loading')}</p>;
  return <Routes>
    <Route path="design-preview" element={<Suspense fallback={loading}><ComponentPreviewPage /></Suspense>} />
    <Route path="admin/*" element={<Suspense fallback={loading}><AdminGate><AdminPage /></AdminGate></Suspense>} />
    <Route element={<StudentLayout />}>
      <Route index element={<HomePage />} />
      <Route path="explore" element={<ExplorePage />} />
      <Route path="login" element={<Suspense fallback={loading}><LoginPage mode="login" /></Suspense>} />
      <Route path="register" element={<Suspense fallback={loading}><LoginPage mode="register" /></Suspense>} />
      <Route path="account" element={<Suspense fallback={loading}><AccountPage /></Suspense>} />
      <Route path="admin/login" element={<Suspense fallback={loading}><LoginPage mode="admin-login" /></Suspense>} />
      <Route path="*" element={<Suspense fallback={loading}><WorkspacePage /></Suspense>} />
    </Route>
  </Routes>;
}
