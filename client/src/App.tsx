import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StudentLayout from './layouts/StudentLayout';
import { useBranding } from './features/homepage/Branding';
import { sectionLabel } from './pages/routes';
import './pages/strings';
import './features/auth/strings';

const AdminPage = lazy(() => import('./features/admin/AdminPage'));
const HomePage = lazy(() => import('./features/homepage/HomePage'));
const ExplorePage = lazy(() => import('./features/discover/Discover').then(module => ({ default: module.ExplorePage })));
const DailyLearning = lazy(() => import('./features/discovery/Cards').then(module => ({ default: module.DailyLearning })));
const OfflinePage = lazy(() => import('./features/offline/OfflinePage'));
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
const LearningWorkspace = lazy(() => import('./features/engagement/Workspace'));
const CourseCertificate = lazy(() => import('./features/engagement/Certificates').then(module => ({ default: module.CourseCertificate })));
const VerifyCertificate = lazy(() => import('./features/engagement/Certificates').then(module => ({ default: module.VerifyCertificate })));
const QuizCatalog = lazy(() => import('./features/quizzes/Student').then(module => ({ default: module.QuizCatalog })));
const QuizDetail = lazy(() => import('./features/quizzes/Student').then(module => ({ default: module.QuizDetail })));
const DiscoveryCatalog = lazy(() => import('./features/discovery/PublicDiscovery').then(module => ({ default: module.DiscoveryCatalog })));
const LearningPath = lazy(() => import('./features/discovery/PublicDiscovery').then(module => ({ default: module.LearningPath })));

export default function App() {
  const { pathname } = useLocation();
  const { branding } = useBranding();
  const { t } = useTranslation(['shell', 'pages', 'auth']);
  useEffect(() => {
    const path = pathname.replace(/\/+$/, '');
    const accountTitles = {
      '/login': 'login', '/register': 'register', '/account': 'account',
      '/admin/login': 'admin-login', '/design-preview': 'adminPreview',
    } as const;
    const accountTitle = accountTitles[path as keyof typeof accountTitles];
    if (!accountTitle && (path === '/admin' || path.startsWith('/admin/'))) return;
    const key = accountTitle ? 'auth:' + accountTitle : path === '' ? 'home' : path === '/explore' ? 'explore' : sectionLabel(path);
    document.title = (key ? t(key) : t('pages:notFound')) + ' · ' + branding.name;
  }, [pathname, t, branding.name]);

  const loading = <p className="p-6" role="status">{t('pages:loading')}</p>;
  return <Routes>
    <Route path="design-preview" element={<Suspense fallback={loading}><ComponentPreviewPage /></Suspense>} />
    <Route path="admin/*" element={<Suspense fallback={loading}><AdminGate><AdminPage /></AdminGate></Suspense>} />
    <Route element={<StudentLayout />}>
      <Route index element={<Suspense fallback={loading}><HomePage /></Suspense>} />
      <Route path="explore" element={<Suspense fallback={loading}><ExplorePage /></Suspense>} />
      <Route path="courses" element={<Suspense fallback={loading}><CourseCatalog /></Suspense>} />
      <Route path="courses/:slug" element={<Suspense fallback={loading}><CourseDetails /></Suspense>} />
      <Route path="courses/:slug/certificate" element={<Suspense fallback={loading}><CourseCertificate /></Suspense>} />
      <Route path="certificates/verify/:code" element={<Suspense fallback={loading}><VerifyCertificate /></Suspense>} />
      <Route path="my-learning" element={<Suspense fallback={loading}><LearningWorkspace /></Suspense>} />
      <Route path="saved" element={<Suspense fallback={loading}><LearningWorkspace /></Suspense>} />
      <Route path="downloads/:key?" element={<Suspense fallback={loading}><OfflinePage /></Suspense>} />
      <Route path="quizzes" element={<Suspense fallback={loading}><QuizCatalog /></Suspense>} />
      <Route path="quizzes/:slug" element={<Suspense fallback={loading}><QuizDetail /></Suspense>} />
      <Route path="search" element={<Suspense fallback={loading}><DiscoveryCatalog /></Suspense>} />
      <Route path="learning-paths" element={<Suspense fallback={loading}><DiscoveryCatalog paths /></Suspense>} />
      <Route path="learning-paths/:slug" element={<Suspense fallback={loading}><LearningPath /></Suspense>} />
      <Route path="daily-learning" element={<Suspense fallback={loading}><DailyLearning /></Suspense>} />
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
