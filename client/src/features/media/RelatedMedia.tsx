import { Link, useLocation } from 'react-router-dom';
import { useCallback, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, InputField, SelectField, StatePanel } from '../../components/ui/Primitives';
import { languageNames, languages } from '../../i18n';
import { useEducationData } from '../education/useEducationData';
import {
  contentLanguageName, getMedia, listMedia, mediaError, mediaPath, qualityLevels, relationKind, relationLabel,
  type MediaLink, type MediaRecord, type MediaRelation,
} from './api';

function MediaLinkList({ record, editable, busy, remove }: {
  record: MediaRecord; editable: boolean; busy: boolean; remove: (link: MediaLink) => Promise<boolean>;
}) {
  const { t, i18n } = useTranslation('media');
  const { search } = useLocation();
  const load = useCallback(async (signal: AbortSignal) => {
    const ids = [...new Set(record.links.map(link => link.assetId))];
    const rows = await Promise.allSettled(ids.map(id => getMedia(id, signal)));
    return new Map(rows.flatMap(row => row.status === 'fulfilled' ? [[row.value.id, row.value.title]] : []));
  }, [record.links]);
  const { result } = useEducationData(load);
  if (!record.links.length) return <p className="media-note">{t('linkEmpty')}</p>;
  return <ul className="media-linked-list">{record.links.map(link => {
    const title = result.status === 'ready' ? result.data.get(link.assetId) : undefined;
    const label = t(relationLabel[link.relation]);
    const slot = link.slot === 'default' ? '' : link.relation === 'video-variant' ? link.slot : contentLanguageName(link.slot, i18n.language);
    return <li key={link.relation + ':' + link.slot}>
      <span><Link to={mediaPath + '/' + link.assetId + search}><bdi>{title || label}</bdi></Link>
        <small>{label} {slot && <bdi>· {slot}</bdi>}</small></span>
      {editable && <Button variant="ghost" className="media-danger" disabled={busy} onClick={() => void remove(link)}>{t('unlink')}</Button>}
    </li>;
  })}</ul>;
}

function choices(record: MediaRecord): MediaRelation[] {
  if (record.kind === 'video') return ['thumbnail', 'video-variant', 'audio', 'subtitle', 'transcript'];
  if (record.kind === 'audio') return ['thumbnail', 'subtitle', 'transcript'];
  return record.kind === 'pdf' || record.kind === 'attachment' ? ['thumbnail'] : [];
}

function AttachForm({ record, busy, attach }: {
  record: MediaRecord; busy: boolean; attach: (link: MediaLink) => Promise<boolean>;
}) {
  const { t } = useTranslation('media');
  const [relation, setRelation] = useState<MediaRelation | ''>('');
  const [slot, setSlot] = useState('');
  const [assetId, setAssetId] = useState('');
  const [searched, setSearched] = useState('');
  const [query, setQuery] = useState('');
  const locked = !relation || busy;
  const load = useCallback(async (signal: AbortSignal) => {
    if (!relation) return [];
    const data = await listMedia({ kind: relationKind[relation], pageSize: 30, q: searched || undefined }, signal);
    return data.items.filter(item => item.id !== record.id && item.status !== 'archived');
  }, [relation, searched, record.id]);
  const { result, reload } = useEducationData(load);
  const existing = result.status === 'ready' && result.data.some(item => item.id === assetId);
  const autoSlot = relation === 'thumbnail' ? 'default' : slot;
  const relations = choices(record);

  function changeRelation(value: MediaRelation | '') {
    setRelation(value); setSlot(value === 'audio' || value === 'transcript' ? 'default' : ''); setAssetId('');
    setSearched(''); setQuery('');
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssetId('');
    setSearched(query.trim());
  }

  function submitAttach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!relation || !autoSlot || !existing || busy) return;
    void attach({ relation, slot: autoSlot, assetId }).then(success => { if (success) setAssetId(''); });
  }

  return <div className="media-attach">
    <h3>{t('addLink')}</h3>
    <div className="media-form-fields">
      <SelectField label={t('relation')} value={relation} disabled={busy} onChange={event => changeRelation(event.target.value as MediaRelation | '')}>
        <option value="">{t('chooseRelation')}</option>{relations.map(value => <option key={value} value={value}>{t(relationLabel[value])}</option>)}
      </SelectField>
      {relation && relation !== 'thumbnail' && <SelectField label={t(relation === 'video-variant' ? 'quality' : 'slot')}
        value={slot} disabled={busy} onChange={event => setSlot(event.target.value)}>
        <option value="" hidden>{t('none')}</option>
        {relation === 'video-variant'
          ? qualityLevels.map(value => <option key={value} value={value}>{value}</option>)
          : <>{relation !== 'subtitle' && <option value="default">{t('defaultSlot')}</option>}
            {languages.map(locale => <option key={locale} value={locale} lang={locale}>{languageNames[locale]}</option>)}</>}
      </SelectField>}
    </div>
    {relation && <>
      <form className="media-inline-form" role="search" aria-label={t('findAsset')} onSubmit={submitSearch}>
        <InputField type="search" label={t('findAsset')} value={query} onChange={event => setQuery(event.target.value)}
          maxLength={120} placeholder={t('candidateSearch')} disabled={busy} dir="auto" />
        <Button variant="secondary" type="submit" disabled={busy}>{t('searchAction')}</Button>
      </form>
      {result.status === 'loading' && <p role="status" className="media-note">{t('loading')}</p>}
      {result.status === 'error' && <StatePanel kind="error" title={t(mediaError(result.error))}>
        <Button onClick={reload} variant="secondary">{t('retry')}</Button>
      </StatePanel>}
      {result.status === 'ready' && (result.data.length ?
        <form className="media-form" onSubmit={submitAttach}>
          <SelectField label={t('asset')} value={assetId} disabled={locked} onChange={event => setAssetId(event.target.value)}>
            <option value="">{t('chooseAsset')}</option>{result.data.map(item =>
              <option key={item.id} value={item.id}>{item.title} · {item.originalName}</option>)}
          </SelectField>
          <p className="media-note">{t('replaceHint')}</p>
          <Button type="submit" disabled={locked || !autoSlot || !existing}>{t('attach')}</Button>
        </form>
        : <p role="status" className="media-note">{t('noCandidates')}</p>)}
    </>}
  </div>;
}

export function RelatedMedia({ record, editable, busy, attach, remove, error }: {
  record: MediaRecord; editable: boolean; busy: boolean; attach: (link: MediaLink) => Promise<boolean>;
  remove: (link: MediaLink) => Promise<boolean>; error?: string;
}) {
  const { t } = useTranslation('media');
  return <Card className="media-related">
    <h2>{t('attached')}</h2>
    <MediaLinkList record={record} editable={editable} busy={busy} remove={remove} />
    {editable && choices(record).length > 0 && <AttachForm record={record} busy={busy} attach={attach} />}
    {error && <p role="alert" className="media-message media-message-error">{t(error)}</p>}
  </Card>;
}
