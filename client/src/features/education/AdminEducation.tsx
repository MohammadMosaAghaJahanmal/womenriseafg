import { EducationEditor } from './EducationEditor';
import { EducationIndex } from './EducationIndex';
import { EducationList } from './EducationList';
import { educationPath, kinds, type Kind } from './api';

type EducationRoute = { view: 'index' } | { view: 'list' | 'new'; kind: Kind } | { view: 'edit'; kind: Kind; id: string };

export function matchEducationRoute(path: string): EducationRoute | undefined {
  if (path === educationPath()) return { view: 'index' };
  const [, root, section, family, record, action, ...other] = path.split('/');
  if (root !== 'admin' || section !== 'education' || other.length) return;
  const kind = kinds.find(value => value === family);
  if (!kind) return;
  if (!record && !action) return { view: 'list', kind };
  if (record === 'new' && !action) return { view: 'new', kind };
  if (action === 'edit' && record && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(record)) return { view: 'edit', kind, id: record };
}

export function AdminEducation({ route }: { route: EducationRoute }) {
  if (route.view === 'index') return <EducationIndex />;
  if (route.view === 'list') return <EducationList kind={route.kind} />;
  return <EducationEditor kind={route.kind} id={route.view === 'edit' ? route.id : undefined} />;
}
