import { ArrowRight } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { learningKey, resourceUrl, useLearning, type LearningResource } from './local';
import { learningNamespace } from './strings';

export function ResourceList({ items, resume = false }: { items: LearningResource[]; resume?: boolean }) {
  const { t } = useTranslation(learningNamespace);
  return <ul className="learning-resource-list">
    {items.map(item => <li key={learningKey(item)}><Link to={resourceUrl(item, resume)}>
      <span><small>{t(item.kind)}</small><bdi lang={item.locale}>{item.title}</bdi></span>
      <ArrowRight size={17} aria-hidden="true" className="ui-direction" />
    </Link></li>)}
  </ul>;
}

export function ContinueLearning() {
  const { t } = useTranslation(learningNamespace);
  const { enabled, recent, completedLessons, completedItems } = useLearning();
  const heading = useId();
  const active = recent.filter(({ resource, position }) => resource.kind === 'lesson' ?
    !completedLessons.includes(resource.id) :
    position > 0 && !completedItems.includes(learningKey(resource))).slice(0, 4);
  if (!enabled || !active.length) return null;
  return <section className="learn-panel learning-continue" aria-labelledby={heading}>
    <h2 id={heading}>{t('continue')}</h2><ResourceList items={active.map(entry => entry.resource)} resume />
  </section>;
}
