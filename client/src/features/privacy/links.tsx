import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { privacyNamespace as ns } from './strings';
import './privacy.css';

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const publicResources = new Set(['courses', 'videos', 'shorts', 'ai-learning', 'library', 'quizzes', 'learning-paths', 'collections']);

export function reportablePath(path: string) {
  const [root, section, first, second, extra] = path.split('/');
  if (root !== '' || !section || !first || extra !== undefined || first.length > 80 || !slug.test(first)) return false;
  if (section === 'learn') return Boolean(second && second.length <= 80 && slug.test(second));
  return publicResources.has(section) && (second === undefined || (section === 'library' && second === 'read'));
}

export function PrivacyLink() {
  const { t } = useTranslation(ns);
  return <Link to="/privacy">{t('noticeTitle')}</Link>;
}

export function CorrectionLink() {
  const { pathname } = useLocation();
  const { t } = useTranslation(ns);
  const resource = pathname.replace(/\/+$/, '');
  return reportablePath(resource) ? <p className="correction-resource-link">
    <Link to={'/report-correction?' + new URLSearchParams({ resource })}>{t('reportTitle')}</Link>
  </p> : null;
}
