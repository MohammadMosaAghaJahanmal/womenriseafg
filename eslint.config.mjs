import javascript from '@eslint/js';
import globals from 'globals';
import typescript from 'typescript-eslint';

export default typescript.config(
  { ignores: ['**/dist/**', '**/coverage/**', 'How the complete website should look/**'] },
  javascript.configs.recommended,
  ...typescript.configs.recommended,
  {
    files: ['app.js', '*.mjs', 'scripts/**/*.mjs', 'server/**/*.{js,cjs,mjs,ts}', 'client/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['client/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['app.js', 'server/**/*.{js,cjs}'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
