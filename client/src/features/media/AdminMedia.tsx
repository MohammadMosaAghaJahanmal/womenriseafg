import { MediaDetail } from './MediaDetail';
import { MediaLibrary } from './MediaLibrary';
import { MediaUpload } from './MediaUpload';
import { mediaPath } from './api';
import './strings';
import './media.css';

type MediaRoute = { view: 'list' | 'upload' } | { view: 'detail'; id: string };

export function matchMediaRoute(path: string): MediaRoute | undefined {
  if (path === mediaPath) return { view: 'list' };
  if (path === mediaPath + '/upload') return { view: 'upload' };
  const parts = path.split('/');
  const id = parts[3] ?? '';
  if (parts.length === 4 && parts[1] === 'admin' && parts[2] === 'media' &&
      /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) return { view: 'detail', id };
}

export function AdminMedia({ route }: { route: MediaRoute }) {
  if (route.view === 'detail') return <MediaDetail id={route.id} />;
  return route.view === 'upload' ? <MediaUpload /> : <MediaLibrary />;
}
