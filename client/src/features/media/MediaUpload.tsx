import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useForm, type FieldError } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { z } from '../../validation';
import { Button, Card, InputField, SelectField } from '../../components/ui/Primitives';
import { languageNames, languages } from '../../i18n';
import { useEducationData } from '../education/useEducationData';
import { loadMediaUsage, mediaBytes, mediaError, mediaKinds, mediaPath, uploadMedia, type MediaKind, type MediaMetadata } from './api';
import { MediaHeading } from './MediaLibrary';

const required = (limit: number) => z.string().trim().min(1, 'required').max(limit, 'invalid');
const metadataSchema = z.object({
  title: required(150), license: required(150), source: required(700), author: z.string().trim().max(150, 'invalid'),
  language: z.string().trim().max(35, 'invalid'), downloadAllowed: z.boolean(),
});

const defaults: MediaMetadata = { title: '', license: '', source: '', author: '', language: '', downloadAllowed: false };
const acceptedFiles: Record<MediaKind, string> = {
  video: '.mp4', audio: '.mp3,.m4a,.wav', image: '.png,.jpg,.jpeg,.webp',
  pdf: '.pdf', subtitle: '.vtt', transcript: '.txt', attachment: '.pdf,.txt',
};

function FieldErrorText({ error }: { error?: FieldError }) {
  const { t } = useTranslation('media');
  return error ? <p role="alert" className="media-field-error">{t(error.message || 'invalid')}</p> : null;
}

export function MediaMetadataForm({ initial = defaults, save, children, submit, disabled, onDirty }: {
  initial?: MediaMetadata; save: (data: MediaMetadata) => Promise<boolean>; children?: ReactNode; submit?: string;
  disabled?: boolean; onDirty?: (dirty: boolean) => void;
}) {
  const { t } = useTranslation('media');
  const { register, handleSubmit, formState: { errors, isDirty, isSubmitting }, reset } = useForm<MediaMetadata>({
    resolver: zodResolver(metadataSchema), defaultValues: initial,
  });

  useEffect(() => { onDirty?.(isDirty); }, [isDirty, onDirty]);

  return <form noValidate onSubmit={handleSubmit(async values => {
    if (await save(values)) reset(values);
  })} className="media-form" aria-busy={isSubmitting} aria-label={t('rights')}>
    <fieldset disabled={disabled || isSubmitting} className="media-fields">
      {children}
      <div className="media-form-fields">
        <div><InputField label={t('fileTitle')} required maxLength={150} dir="auto" aria-invalid={Boolean(errors.title)} {...register('title')} />
          <FieldErrorText error={errors.title} /></div>
        <div><InputField label={t('license')} required maxLength={150} dir="auto" aria-invalid={Boolean(errors.license)} {...register('license')} />
          <FieldErrorText error={errors.license} /></div>
        <div className="media-wide"><InputField label={t('source')} required maxLength={700} dir="auto" aria-invalid={Boolean(errors.source)} {...register('source')} />
          <FieldErrorText error={errors.source} /></div>
        <div><InputField label={t('author')} maxLength={150} dir="auto" aria-invalid={Boolean(errors.author)} {...register('author')} />
          <FieldErrorText error={errors.author} /></div>
        <div><SelectField label={t('language')} {...register('language')}>
          <option value="">{t('none')}</option>
          {initial.language && !(languages as readonly string[]).includes(initial.language) && <option value={initial.language}>{initial.language}</option>}
          {languages.map(locale => <option value={locale} key={locale} lang={locale}>{languageNames[locale]}</option>)}
        </SelectField><FieldErrorText error={errors.language} /></div>
        <label className="media-wide media-check"><input type="checkbox" {...register('downloadAllowed')} />{t('downloads')}</label>
      </div>
    </fieldset>
    <Button type="submit" disabled={disabled || isSubmitting}>{submit ?? t(isSubmitting ? 'saving' : 'save')}</Button>
  </form>;
}

export function MediaUpload() {
  const { t, i18n } = useTranslation('media');
  const navigate = useNavigate();
  const operation = useRef<AbortController | null>(null);
  const [kind, setKind] = useState<MediaKind>('video');
  const [file, setFile] = useState<File>();
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<number>();
  const [message, setMessage] = useState<string>();
  const [failed, setFailed] = useState<string>();
  const { result: usage } = useEducationData(loadMediaUsage);
  const uploadLimit = usage.status === 'ready' ? usage.data.maxUploadBytes : undefined;
  useEffect(() => () => operation.current?.abort(), []);

  async function send(metadata: MediaMetadata) {
    setMessage(undefined);
    setFailed(undefined);
    if (!file) { setFailed('chooseFile'); return false; }
    if (uploadLimit && file.size > uploadLimit) { setFailed('limitError'); return false; }
    if (operation.current) return false;
    const controller = new AbortController();
    operation.current = controller;
    setPending(true);
    setProgress(0);
    try {
      const item = await uploadMedia(file, { ...metadata, kind }, controller.signal, ({ loaded, total }) => {
        if (!controller.signal.aborted && total) setProgress(Math.min(100, Math.round(100 * loaded / total)));
      });
      if (controller.signal.aborted) return false;
      void navigate(mediaPath + '/' + item.id, { replace: true, state: { message: 'uploaded' } });
      return true;
    } catch (error) {
      if (!controller.signal.aborted) setFailed(mediaError(error));
      return false;
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        if (!controller.signal.aborted) setPending(false);
      }
    }
  }

  function cancel() {
    operation.current?.abort();
    operation.current = null;
    setPending(false);
    setMessage('cancelled');
  }

  return <div className="media-module">
    <MediaHeading title={t('uploadTitle')} description={t('uploadHint')}
      navigation={<Link className="media-parent" to={mediaPath}>{t('back')}</Link>} />
    <Card className="media-upload">
      <MediaMetadataForm save={send} submit={t(pending ? 'uploading' : 'upload')}>
        <div className="media-form-fields">
          <SelectField label={t('kind')} value={kind} onChange={event => {
            setKind(event.target.value as MediaKind); setFile(undefined); setFailed(undefined);
          }}>
            {mediaKinds.map(value => <option value={value} key={value}>{t(value)}</option>)}
          </SelectField>
          <label className="ui-field">
            <span>{t('file')}</span>
            <span className="media-file-picker">
              <span className="media-file-trigger" aria-hidden="true">{t('chooseFile')}</span>
              <bdi aria-hidden="true">{file?.name || t('noFileSelected')}</bdi>
              <input aria-label={t('file')} type="file" key={kind} accept={acceptedFiles[kind]} required
                aria-invalid={failed === 'chooseFile'} aria-describedby="media-upload-file-help" onChange={event => {
                  setFile(event.target.files?.[0]); setFailed(undefined);
                }} />
            </span>
          </label>
          <p className="media-note media-wide" id="media-upload-file-help">{uploadLimit
            ? t('uploadLimitBytes', { limit: mediaBytes(uploadLimit, i18n.language) }) : t('uploadLimit')}</p>
        </div>
        <p className="media-note">{t('metadataHint')}</p>
      </MediaMetadataForm>
      {pending && <div className="media-upload-progress">
        <label htmlFor="upload-progress"><span>{t(progress === 100 ? 'processing' : 'progress')}</span>
          {progress !== undefined && <bdi>{new Intl.NumberFormat(i18n.language, { style: 'percent' }).format(progress / 100)}</bdi>}
        </label>
        <progress aria-label={t('progress')} className="ui-progress" id="upload-progress" max={100} value={progress} />
        <Button variant="secondary" onClick={cancel}>{t('cancelUpload')}</Button>
      </div>}
      {message && <p role="status" className="media-message">{t(message)}</p>}
      {failed && <p role="alert" className="media-message media-message-error">{t(failed)}</p>}
    </Card>
  </div>;
}
