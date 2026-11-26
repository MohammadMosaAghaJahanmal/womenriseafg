import { ArrowRight, BookOpen, FolderTree, GraduationCap, Languages, Layers3, Tags } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router-dom';
import { Button, StatePanel } from '../../components/ui/Primitives';
import { educationError, educationPath, educationSummary, kinds, type Kind } from './api';
import { useEducationData } from './useEducationData';
import './strings';
import './education.css';

const icons = { categories: FolderTree, subjects: BookOpen, levels: Layers3, grades: GraduationCap, languages: Languages, tags: Tags };

export function EducationNavigation() {
  const { t } = useTranslation('education');
  return <nav className="education-nav" aria-label={t('families')}>
    {kinds.map(kind => <NavLink to={educationPath(kind)} key={kind}>{t(kind)}</NavLink>)}
  </nav>;
}

export function EducationHeading({ title, details, kind, children }: {
  title: string; details: string; kind?: Kind; children?: React.ReactNode;
}) {
  const { t } = useTranslation('education');
  const Icon = kind ? icons[kind] : FolderTree;
  return <header className="education-heading">
    <div className="education-heading-copy">
      <span className="education-mark"><Icon aria-hidden="true" size={23} /></span>
      <div>{kind && <Link to={educationPath()} className="education-parent">{t('backEducation')}</Link>}
        <h1>{title}</h1><p>{details}</p>
      </div>
    </div>
    {children}
  </header>;
}

export function EducationFamilies({ dashboard = false }: { dashboard?: boolean }) {
  const { t, i18n } = useTranslation('education');
  const { result, reload } = useEducationData(educationSummary);
  const numeric = new Intl.NumberFormat(i18n.language);
  return <section className="education-families" aria-labelledby="education-families-title" aria-busy={result.status === 'loading'}>
    <div className="education-family-head">
      <div><h2 id="education-families-title">{t(dashboard ? 'title' : 'families')}</h2><p>{t('teamHint')}</p></div>
      {dashboard && <Button asChild variant="secondary"><Link to={educationPath()}>{t('title')}<ArrowRight className="ui-direction" size={17} aria-hidden="true" /></Link></Button>}
    </div>
    {result.status === 'loading' && <StatePanel kind="loading" title={t('loading')} />}
    {result.status === 'error' && <StatePanel kind="error" title={t(educationError(result.error, 'loadError'))}>
      <Button variant="secondary" onClick={reload}>{t('retry')}</Button>
    </StatePanel>}
    {result.status === 'ready' && <div className="education-card-grid">
      {kinds.map(kind => {
        const counts = result.data.find(item => item.kind === kind);
        const Icon = icons[kind];
        return <Link className="education-family-card" to={educationPath(kind)} key={kind}>
          <span className="education-mark"><Icon size={21} aria-hidden="true" /></span>
          <span className="education-family-copy"><strong>{t(kind)}</strong><span>{t(kind + 'Hint')}</span></span>
          {counts && <span className="education-counts">
            <span>{t('total', { amount: numeric.format(counts.total) })}</span>
            <span>{t('published', { amount: numeric.format(counts.published) })}</span>
          </span>}
        </Link>;
      })}
    </div>}
  </section>;
}

export function EducationIndex() {
  const { t } = useTranslation('education');
  return <div className="education-module">
    <EducationHeading title={t('title')} details={t('intro')} />
    <EducationFamilies />
  </div>;
}
