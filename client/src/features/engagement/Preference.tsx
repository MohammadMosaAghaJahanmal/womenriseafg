import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, DialogClose, PanelDialog } from '../../components/ui/Primitives';
import { setLearningEnabled, useLearning } from './local';
import { learningNamespace } from './strings';
import './engagement.css';

export function DeviceConsent({ trigger, onEnable, onFailure }: {
  trigger: ReactElement; onEnable?: () => void; onFailure?: () => void;
}) {
  const { t } = useTranslation(learningNamespace);
  return <PanelDialog title={t('onDevice')} description={t('privacy')} trigger={trigger} closeLabel={t('close')}>
    <p>{t('shared')}</p>
    <div className="learning-actions">
      <DialogClose asChild><Button variant="secondary">{t('cancel')}</Button></DialogClose>
      <DialogClose asChild><Button onClick={() => {
        if (setLearningEnabled(true)) onEnable?.();
        else onFailure?.();
      }}>{t('enable')}</Button></DialogClose>
    </div>
  </PanelDialog>;
}

export function LearningPreference() {
  const { t } = useTranslation(learningNamespace);
  const { enabled } = useLearning();
  const [notice, setNotice] = useState('');
  return <section className="learn-panel learning-preference" aria-label={t('onDevice')}>
    <h2>{t('onDevice')}</h2><p>{t('privacy')}</p><p>{t('shared')}</p>
    <p role="status">{t(notice || (enabled ? 'enabled' : 'disabled'))}</p>
    <div className="learning-actions">
      {enabled ? <PanelDialog title={t('clearTitle')} description={t('clearDescription')} closeLabel={t('close')}
        trigger={<Button variant="secondary">{t('clear')}</Button>}>
        <div className="learning-actions">
          <DialogClose asChild><Button variant="secondary">{t('cancel')}</Button></DialogClose>
          <DialogClose asChild><Button onClick={() => setNotice(setLearningEnabled(false) ? 'cleared' : 'unavailable')}>{t('clear')}</Button></DialogClose>
        </div>
      </PanelDialog> : <DeviceConsent trigger={<Button>{t('enable')}</Button>}
        onEnable={() => setNotice('enabled')} onFailure={() => setNotice('unavailable')} />}
    </div>
  </section>;
}
