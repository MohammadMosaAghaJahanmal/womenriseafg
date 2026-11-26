const sections = new Map([
  ['/courses','courses'], ['/videos','videos'], ['/shorts','shorts'], ['/library','library'], ['/ai-learning','ai'],
  ['/learning-paths','paths'], ['/saved','saved'], ['/my-learning','learning'], ['/downloads','downloads'],
  ['/settings','settings'], ['/status','status'],
]);
export function sectionLabel(path: string) {
  return sections.get(sectionPath(path));
}

export function sectionPath(path: string) {
  const route = path.replace(/\/+$/, '') || '/';
  if (/^\/learn\/[^/]+\/[^/]+$/.test(route)) return '/courses';
  if (/^\/library\/[^/]+(?:\/read)?$/.test(route)) return '/library';
  return route.replace(/^(\/(?:courses|videos|shorts|ai-learning))\/[^/]+$/, '$1');
}
