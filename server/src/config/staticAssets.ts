const publicAssets = [
  /^(?:index\.html|offline\.html|offline-fallback\.(?:css|js)|favicon\.svg|manifest\.webmanifest|sw\.js)$/,
  /^licenses\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\.txt$/,
  /^(?:art|icons)\/[a-zA-Z0-9_-]+\.(?:png|webp|jpe?g|svg)$/,
  /^assets\/[a-zA-Z0-9_.-]+\.(?:js|mjs|css|woff2|svg|webp|png|jpe?g|wav)$/,
];

export function isPublicAsset(asset: string) {
  return publicAssets.some(pattern => pattern.test(asset));
}
