import { ChevronDown, ChevronUp } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, StatePanel } from '../../../components/ui/Primitives';
import { localizedNumber } from '../../courses/student/components';
import { useEducationData } from '../../education/useEducationData';
import { listLearning, readLearning } from './api';
import { CatalogFilters, useCatalogQuery, useLearningFacets } from './Catalog';
import { CollectionBanner, CollectionState } from './Components';
import { MediaArticle } from './Detail';
import { learningMediaNamespace } from './strings';

export default function Shorts() {
  const { t, i18n } = useTranslation(learningMediaNamespace);
  const catalog = useCatalogQuery();
  const { q, categoryId, language, page } = catalog.query;
  const facets = useLearningFacets();
  const filterKey = JSON.stringify([q, categoryId, language]);
  const [count, setCount] = useState<{ key: string; total: number }>();
  const navigation = useRef<HTMLElement>(null);
  const load = useCallback(async (signal: AbortSignal) => {
    const data = await listLearning('shorts', { q, categoryId, language, page }, signal, 1);
    if (!signal.aborted) setCount({ key: filterKey, total: data.total });
    const item = data.items[0];
    return item ? readLearning('shorts', item.slug, signal) : null;
  }, [q, categoryId, language, page, filterKey]);
  const { result, reload } = useEducationData(load);
  const total = count?.key === filterKey ? count.total : 0;
  const number = (value: number) => localizedNumber(value, i18n.language);

  function move(step: -1 | 1, fromKeyboard?: boolean) {
    const next = page + step;
    if (next < 1 || next > total || result.status === 'loading') return;
    if (fromKeyboard) navigation.current?.focus({ preventScroll: true });
    catalog.changePage(next);
  }

  return <div className="learn-page lm-page lm-feed">
    <CollectionBanner collection="shorts" />
    <CatalogFilters catalog={catalog} facets={facets} compact />
    {total > 0 && page <= total && <nav ref={navigation} tabIndex={-1} className="lm-short-navigation" aria-label={t('shortNavigation')}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        move(event.key === 'ArrowUp' ? -1 : 1);
      }}>
      <Button variant="secondary" aria-disabled={page <= 1 || result.status === 'loading'} onClick={() => move(-1)}>
        <ChevronUp size={18} aria-hidden="true" />{t('previousShort')}
      </Button>
      <p aria-live="polite">{t('position', { current: number(page), total: number(total) })}</p>
      <Button variant="secondary" aria-disabled={page >= total || result.status === 'loading'} onClick={() => move(1)}>
        {t('nextShort')}<ChevronDown size={18} aria-hidden="true" />
      </Button>
    </nav>}
    {result.status !== 'ready'
      ? <CollectionState loading={result.status === 'loading'} error={result.status === 'error' ? result.error : undefined} retry={reload} />
      : result.data
        ? <MediaArticle key={result.data.item.id} detail={result.data} contentLanguage={language || undefined} categories={facets.categories} feed
          move={total > 1 ? move : undefined} />
        : <StatePanel kind="empty" title={t(total > 0 ? 'noShortPage' : catalog.filtered ? 'noMatches' : 'noShorts')}>
          {catalog.filtered && <Button variant="secondary" onClick={catalog.clear}>{t('clear')}</Button>}
          {total > 0 && page > 1 && <Button variant="secondary" onClick={() => catalog.changePage(1)}>{t('firstPage')}</Button>}
        </StatePanel>}
  </div>;
}
