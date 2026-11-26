import axios from 'axios';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, SelectField, StatePanel } from '../../components/ui/Primitives';
import { useEducationData } from '../education/useEducationData';
import '../staff/strings';
import './strings';
import './operations.css';

export const operationsAdminPath = '/admin/operations';
const api = axios.create({ baseURL: '/api/v1', timeout: 15_000 });
const checkKinds = ['backup', 'restore-drill'] as const;
type CheckKind = typeof checkKinds[number];
type CheckResult = 'passed' | 'failed';
type BackupCheck = { kind: CheckKind; result: CheckResult; recordedAt: string };
interface Snapshot {
  checkedAt: string;
  storage: { kind: string; count: string; bytes: string }[];
  volume: { capacityBytes: number; freeBytes: number } | null;
  backupChecks: BackupCheck[];
  staffActivity: { id: string; event: string; createdAt: string }[];
}

async function load(signal: AbortSignal) {
  return (await api.get<Snapshot>(operationsAdminPath, { signal })).data;
}

function useFormats() {
  const { i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language);
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  return { number, date };
}

function Storage({ storage, volume }: Pick<Snapshot, 'storage' | 'volume'>) {
  const { t } = useTranslation('operations');
  const { number } = useFormats();
  const bytes = storage.reduce((sum, item) => sum + BigInt(item.bytes), 0n);
  const count = storage.reduce((sum, item) => sum + BigInt(item.count), 0n);
  return <Card className="operations-section">
    <h2>{t('storage')}</h2>
    <p>{t('storageHint')}</p>
    {storage.length ? <table className="operations-table" aria-label={t('storage')}>
      <thead><tr><th scope="col">{t('kind')}</th><th scope="col">{t('count')}</th><th scope="col">{t('bytes')}</th><th scope="col">{t('share')}</th></tr></thead>
      <tbody>{storage.map(item => <tr key={item.kind}>
        <th scope="row">{t(item.kind)}</th><td>{number.format(BigInt(item.count))}</td><td>{number.format(BigInt(item.bytes))}</td>
        <td><meter aria-label={t(item.kind) + ' · ' + t('share')} min={0} max={100}
          value={bytes ? Number(BigInt(item.bytes) * 10000n / bytes) / 100 : 0} /></td>
      </tr>)}</tbody>
      <tfoot><tr><th scope="row">{t('total')}</th><td>{number.format(count)}</td><td>{number.format(bytes)}</td><td /></tr></tfoot>
    </table> : <p>{t('mediaEmpty')}</p>}
    {volume ? <p>{t('volume')} <strong>{number.format(volume.freeBytes)}</strong> {t('bytes')}</p> : <p>{t('volumeUnknown')}</p>}
    <p>{t('quotaHint')}</p>
  </Card>;
}

function Check({ kind, record, changed }: { kind: CheckKind; record?: BackupCheck; changed: () => void }) {
  const { t } = useTranslation('operations');
  const { date } = useFormats();
  const [result, setResult] = useState<CheckResult | ''>('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<'failed'>();
  return <div className="operations-section">
    <h3>{t(kind)}</h3>
    {record ? <p>
      <strong>{t(record.result === 'passed' ? 'passed' : 'failedCheck')}</strong>
      {' · '}{t('recorded')} <time dateTime={record.recordedAt}>{date.format(new Date(record.recordedAt))}</time>
    </p> : <p>{t('missing')}</p>}
    <form className="operations-form" aria-busy={busy} onSubmit={async event => {
      event.preventDefault();
      if (!result || busy) return;
      setBusy(true);
      setFeedback(undefined);
      try {
        await api.put(operationsAdminPath + '/backup-checks/' + kind, { result });
        changed();
      } catch {
        setFeedback('failed');
      } finally {
        setBusy(false);
      }
    }}>
      <SelectField label={t('result') + ' · ' + t(kind)} required value={result} onChange={event => setResult(event.target.value as CheckResult | '')}>
        <option value="">{t('choose')}</option><option value="passed">{t('passed')}</option><option value="failed">{t('failedCheck')}</option>
      </SelectField>
      <Button type="submit" disabled={!result || busy}>{t(busy ? 'saving' : 'save')}</Button>
      {feedback && <p role="alert">{t(feedback)}</p>}
    </form>
  </div>;
}

export function AdminOperations() {
  const { t } = useTranslation(['operations', 'staff']);
  const { result, reload } = useEducationData(load);
  const { date } = useFormats();
  const [recorded, setRecorded] = useState(false);
  return <section className="operations-page">
    <h1>{t('title')}</h1>
    <p>{t('intro')}</p>
    {result.status === 'loading' && <StatePanel kind="loading" title={t('loading')} />}
    {result.status === 'error' && <StatePanel kind="error" title={t('failed')}>
      <Button onClick={reload}>{t('retry')}</Button>
    </StatePanel>}
    {result.status === 'ready' && <>
      <Card className="operations-section">
        <h2>{t('health')}</h2>
        <p><strong>{t('ready')}</strong> · {t('checked')} <time dateTime={result.data.checkedAt}>{date.format(new Date(result.data.checkedAt))}</time></p>
        <div><Button variant="secondary" onClick={reload}>{t('refresh')}</Button></div>
      </Card>
      <Storage storage={result.data.storage} volume={result.data.volume} />
      <Card className="operations-section">
        <h2>{t('backups')}</h2>
        <p>{t('backupHint')}</p>
        {recorded && <p role="status">{t('saved')}</p>}
        <div className="operations-checks">
          {checkKinds.map(kind => <Check key={kind} kind={kind}
            record={result.data.backupChecks.find(item => item.kind === kind)} changed={() => { setRecorded(true); reload(); }} />)}
        </div>
      </Card>
      <Card className="operations-section">
        <h2>{t('staff')}</h2>
        {result.data.staffActivity.length ? <ul className="operations-activity">{result.data.staffActivity.map(item =>
          <li key={item.id}>{t('staff:' + item.event)} <time dateTime={item.createdAt}>{date.format(new Date(item.createdAt))}</time></li>)}</ul>
          : <p>{t('activityEmpty')}</p>}
        <p>{t('auditHint')}</p>
        <div><Button asChild variant="secondary"><Link to="/admin/staff">{t('fullAudit')}</Link></Button></div>
      </Card>
    </>}
  </section>;
}

