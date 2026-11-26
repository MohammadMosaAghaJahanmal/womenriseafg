const sections = new Map([
  ['/courses','courses'], ['/videos','videos'], ['/shorts','shorts'], ['/library','library'], ['/ai-learning','ai'],
  ['/learning-paths','paths'], ['/saved','saved'], ['/my-learning','learning'], ['/downloads','downloads'],
  ['/settings','settings'], ['/status','status'],
]);
export function sectionLabel(path: string) {
  return sections.get(path.replace(/\/+$/, ''));
}
