const sections = new Map([
  ['/courses','courses'], ['/videos','videos'], ['/shorts','shorts'], ['/library','library'], ['/ai-learning','ai'],
  ['/learning-paths','paths'], ['/saved','saved'], ['/my-learning','learning'],
  ['/settings','settings'], ['/status','status'],
  ['/quizzes','quizzes'], ['/search','search'], ['/daily-learning','daily'], ['/certificates','certificates'],
]);
export function sectionLabel(path: string) {
  return sections.get(sectionPath(path));
}

export function sectionPath(path: string) {
  const route = path.replace(/\/+$/, '') || '/';
  if (/^\/learn\/[^/]+\/[^/]+$/.test(route)) return '/courses';
  if (/^\/library\/[^/]+(?:\/read)?$/.test(route)) return '/library';
  if (/^\/courses\/[^/]+\/certificate$/.test(route)) return '/courses';
  if (/^\/certificates\/verify\/[^/]+$/.test(route)) return '/certificates';
  return route.replace(/^(\/(?:courses|videos|shorts|ai-learning|quizzes|learning-paths))\/[^/]+$/, '$1');
}
