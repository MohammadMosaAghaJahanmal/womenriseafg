import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { Button, StatePanel } from '../../components/ui/Primitives';
import { ContinueLearning } from './ContinueLearning';
import { resourceUrl, useLearning } from './local';
import { LearningPreference } from './Preference';
import { SaveResource } from './SaveResource';
import { learningNamespace } from './strings';

export default function LearningWorkspace() {
  const { t, i18n } = useTranslation(learningNamespace);
  const { pathname } = useLocation();
  const { enabled, saved, recent, results } = useLearning();
  const bookmarks = pathname.startsWith('/saved');
  const history = recent.slice(0, 20);
  const scores = results.slice(0, 20);
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  const percent = new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 1 });
  return <div className="learn-page learning-workspace">
    <h1>{t(bookmarks ? 'saved' : 'learning')}</h1>
    {!bookmarks || !enabled ? <LearningPreference /> : null}
    {enabled && (bookmarks ? <>
      {saved.length ? <ul className="learning-resource-list learning-saved-list">{saved.map(resource =>
        <li key={resource.kind + ':' + resource.id}><Link to={resourceUrl(resource)}>
          <span><small>{t(resource.kind)}</small><bdi lang={resource.locale}>{resource.title}</bdi></span>
        </Link><SaveResource resource={resource} /></li>)}</ul> :
        <StatePanel kind="empty" title={t('nothingSaved')}><Button asChild><Link to="/courses">{t('explore')}</Link></Button></StatePanel>}
    </> : <>
      <ContinueLearning />
      <section className="learn-panel" aria-label={t('history')}>
        <h2>{t('history')}</h2>
        {history.length ? <ul className="learning-resource-list">{history.map(({ resource, position, total }) =>
          <li key={resource.kind + ':' + resource.id}><Link to={resourceUrl(resource, true)}><span>
            <small>{t(resource.kind)}</small><bdi lang={resource.locale}>{resource.title}</bdi>
            {!!total && resource.kind === 'book' && <small>{t('page', { page: position, total })}</small>}
            {position > 0 && (resource.kind === 'video' || resource.kind === 'short') &&
              <small>{t('playback', { time: new Intl.NumberFormat(i18n.language, { style: 'unit', unit: 'minute', maximumFractionDigits: 1 }).format(position / 60) })}</small>}
          </span></Link></li>)}</ul> : <p>{t('nothingRecent')}</p>}
      </section>
      <section className="learn-panel" aria-label={t('results')}>
        <h2>{t('results')}</h2>
        {scores.length ? <ul className="learning-resource-list">{scores.map(({ resource, score, passed, takenAt }, index) =>
          <li key={resource.id + ':' + takenAt + ':' + index}><Link to={resourceUrl(resource)}>
            <span><bdi lang={resource.locale}>{resource.title}</bdi><small>{t('attemptDate', { date: date.format(takenAt) })}</small></span>
            <span>{t(passed ? 'passed' : 'notPassed')} · {t('score', { score: percent.format(score / 100) })}</span>
          </Link></li>)}</ul> : <p>{t('nothingResults')}</p>}
      </section>
    </>)}
  </div>;
}
