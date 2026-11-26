import { Bookmark } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Primitives';
import { learningKey, toggleSaved, useLearning, type LearningResource } from './local';
import { DeviceConsent } from './Preference';
import { learningNamespace } from './strings';

export function SaveResource({ resource }: { resource: LearningResource }) {
  const { t } = useTranslation(learningNamespace);
  const { enabled, saved } = useLearning();
  const [failed, setFailed] = useState(false);
  const pressed = saved.some(item => learningKey(item) === learningKey(resource));
  const save = () => setFailed(!toggleSaved(resource));
  const label = pressed ? t('remove') : t('save');
  return <span className="learning-action">
    {enabled ? <Button variant="secondary" aria-pressed={pressed} onClick={save}>
      <Bookmark size={17} aria-hidden="true" fill={pressed ? 'currentColor' : 'none'} />{label}
    </Button> : <DeviceConsent trigger={<Button variant="secondary"><Bookmark size={17} aria-hidden="true" />{label}</Button>}
      onEnable={save} onFailure={() => setFailed(true)} />}
    {failed && <small role="alert">{t('unavailable')}</small>}
  </span>;
}
