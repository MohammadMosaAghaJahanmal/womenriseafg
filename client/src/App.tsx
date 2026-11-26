import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StudentLayout from './layouts/StudentLayout';
import { HomePage, ExplorePage } from './features/discover/Discover';
import { sectionLabel } from './pages/routes';
import './pages/strings';

const AdminPage = lazy(() => import('./features/admin/AdminPage'));
const WorkspacePage = lazy(() => import('./pages/WorkspacePages'));

export default function App() {
  const { pathname } = useLocation();
  const { t } = useTranslation(['shell', 'pages']);
  useEffect(() => {
    const path = pathname.replace(/\/+$/, '');
    const key = path === '' ? 'home' : path === '/explore' ? 'explore' :
      path === '/admin' || path.startsWith('/admin/') ? 'admin' : sectionLabel(path);
    document.title = (key ? t(key) : t('pages:notFound')) + ' · womenriseafg';
  }, [pathname, t]);

  const loading = <p className="p-6" role="status">{t('pages:loading')}</p>;
  return <Routes>
    <Route path="admin/*" element={<Suspense fallback={loading}><AdminPage /></Suspense>} />
    <Route element={<StudentLayout />}>
      <Route index element={<HomePage />} />
      <Route path="explore" element={<ExplorePage />} />
      <Route path="*" element={<Suspense fallback={loading}><WorkspacePage /></Suspense>} />
    </Route>
  </Routes>;
}
