import { Download, ExternalLink } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, SelectField, StatePanel } from '../../components/ui/Primitives';
import { useEducationData } from '../education/useEducationData';
import { contentLanguageName, mediaFileUrl, previewText, type MediaRecord } from './api';

function TextPreview({ id }: { id: string }) {
  const { t } = useTranslation('media');
  const load = useCallback((signal: AbortSignal) => previewText(id, signal), [id]);
  const { result, reload } = useEducationData(load);
  if (result.status === 'loading') return <StatePanel kind="loading" title={t('loading')} />;
  if (result.status === 'error') return <StatePanel kind="error" title={t('textFallback')}>
    <Button variant="secondary" onClick={reload}>{t('retry')}</Button>
  </StatePanel>;
  return <>
    <pre className="media-text-preview" dir="auto" tabIndex={0} aria-label={t('preview')}>{result.data.text}</pre>
    {result.data.truncated && <p className="media-note">{t('textTruncated')}</p>}
  </>;
}

export function MediaPreview({ record }: { record: MediaRecord }) {
  const { t, i18n } = useTranslation('media');
  const [variant, setVariant] = useState('');
  const [imageError, setImageError] = useState(false);
  const poster = record.links.find(link => link.relation === 'thumbnail');
  const captions = record.links.filter(link => link.relation === 'subtitle');
  const variants = record.links.filter(link => link.relation === 'video-variant');
  const chosenVariant = variants.find(link => link.assetId === variant);
  const file = mediaFileUrl(record.id);
  const previewUrl = chosenVariant ? mediaFileUrl(chosenVariant.assetId) : file;
  const plainText = record.kind === 'subtitle' || record.kind === 'transcript' || record.mimeType === 'text/plain';
  const previewImage = record.kind === 'image' ? file : record.kind !== 'video' && poster ? mediaFileUrl(poster.assetId) : undefined;

  return <Card className="media-preview">
    <h2>{t('preview')}</h2>
    {record.kind === 'video' && <>
      {variants.length > 0 && <SelectField label={t('rendition')} value={chosenVariant?.assetId ?? ''}
        onChange={event => setVariant(event.target.value)}>
        <option value="">{t('original')}</option>{variants.map(link => <option key={link.slot} value={link.assetId}>{link.slot}</option>)}
      </SelectField>}
      <video key={previewUrl} controls preload="metadata" playsInline poster={poster ? mediaFileUrl(poster.assetId) : undefined}
        src={previewUrl} aria-label={record.title}>
        {captions.map(link => <track key={link.slot} kind="captions" src={mediaFileUrl(link.assetId)} srcLang={link.slot}
          label={t('trackLabel', { language: contentLanguageName(link.slot, i18n.language) })} />)}
        {t('mediaFallback')}
      </video>
    </>}
    {previewImage && (imageError
      ? <StatePanel kind="error" title={t('mediaFallback')}><Button variant="secondary" onClick={() => setImageError(false)}>{t('retry')}</Button></StatePanel>
      : <img src={previewImage} alt={record.title} decoding="async" onError={() => setImageError(true)} />)}
    {record.kind === 'audio' && <audio controls preload="metadata" src={file} aria-label={record.title}>{t('mediaFallback')}</audio>}
    {plainText && <TextPreview id={record.id} />}
    {(record.kind === 'pdf' || record.kind === 'attachment' && !plainText) && <p className="media-note">{t('downloadNote')}</p>}
    <div className="media-actions">
      <Button asChild variant="secondary"><a href={file} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={17} aria-hidden="true" />{t('openFile')}
      </a></Button>
      <Button asChild variant="ghost"><a href={mediaFileUrl(record.id, true)}>
        <Download size={17} aria-hidden="true" />{t('downloadFile')}
      </a></Button>
    </div>
  </Card>;
}
