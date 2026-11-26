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
const CourseCatalog = lazy(() => import('./features/courses/student/Catalog'));
const CourseDetails = lazy(() => import('./features/courses/student/CourseDetails'));
const LessonPage = lazy(() => import('./features/courses/student/Lesson'));
const LearningMediaCatalog = lazy(() => import('./features/learning-media/student/Catalog'));
const LearningMediaDetail = lazy(() => import('./features/learning-media/student/Detail'));
const Shorts = lazy(() => import('./features/learning-media/student/Shorts'));
const LibraryCatalog = lazy(() => import('./features/library/student/Catalog'));
const BookDetails = lazy(() => import('./features/library/student/Details'));
const BookReader = lazy(() => import('./features/library/student/Reader'));
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
      <Route path="courses" element={<Suspense fallback={loading}><CourseCatalog /></Suspense>} />
      <Route path="courses/:slug" element={<Suspense fallback={loading}><CourseDetails /></Suspense>} />
      <Route path="learn/:courseSlug/:lessonSlug" element={<Suspense fallback={loading}><LessonPage /></Suspense>} />
      <Route path="videos" element={<Suspense fallback={loading}><LearningMediaCatalog collection="videos" /></Suspense>} />
      <Route path="videos/:slug" element={<Suspense fallback={loading}><LearningMediaDetail collection="videos" /></Suspense>} />
      <Route path="shorts" element={<Suspense fallback={loading}><Shorts /></Suspense>} />
      <Route path="shorts/:slug" element={<Suspense fallback={loading}><LearningMediaDetail collection="shorts" /></Suspense>} />
      <Route path="ai-learning" element={<Suspense fallback={loading}><LearningMediaCatalog collection="ai-learning" /></Suspense>} />
      <Route path="ai-learning/:slug" element={<Suspense fallback={loading}><LearningMediaDetail collection="ai-learning" /></Suspense>} />
      <Route path="library" element={<Suspense fallback={loading}><LibraryCatalog /></Suspense>} />
      <Route path="library/:slug" element={<Suspense fallback={loading}><BookDetails /></Suspense>} />
      <Route path="library/:slug/read" element={<Suspense fallback={loading}><BookReader /></Suspense>} />
      <Route path="login" element={<Suspense fallback={loading}><LoginPage mode="login" /></Suspense>} />
      <Route path="register" element={<Suspense fallback={loading}><LoginPage mode="register" /></Suspense>} />
      <Route path="account" element={<Suspense fallback={loading}><AccountPage /></Suspense>} />
      <Route path="admin/login" element={<Suspense fallback={loading}><LoginPage mode="admin-login" /></Suspense>} />
      <Route path="*" element={<Suspense fallback={loading}><WorkspacePage /></Suspense>} />
    </Route>
  </Routes>;
}
