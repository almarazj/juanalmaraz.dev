import astro from 'eslint-plugin-astro';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist', '.astro', 'node_modules', 'playwright-report', 'test-results'] },
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
];
