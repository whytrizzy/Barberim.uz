import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

/**
 * Import boundaries between top-level folders — see docs/ARCHITECTURE.md.
 * `forbid` lists `@/` paths the folder must not import; a RegExp entry forbids every import
 * matching it (used where a sub-path stays allowed, e.g. feature schemas from server/).
 */
const boundary = (folder, forbid) => {
  const message = `src/${folder}/ must not import this — see docs/ARCHITECTURE.md (dependency rules).`;
  const paths = forbid.filter((entry) => typeof entry === 'string');
  const regexes = forbid.filter((entry) => entry instanceof RegExp);
  return {
    files: [`src/${folder}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: paths.flatMap((path) => [`@/${path}`, `@/${path}/**`]), message },
            ...regexes.map((regex) => ({ regex: regex.source, message })),
          ],
        },
      ],
    },
  };
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  boundary('domain', ['app', 'server', 'bot', 'features', 'ui', 'telegram', 'i18n', 'env']),
  boundary('ui', ['app', 'server', 'bot', 'features', 'domain', 'telegram', 'env']),
  boundary('features', ['app', 'server', 'bot', 'env/server']),
  boundary('telegram', ['app', 'server', 'bot', 'features', 'env/server']),
  boundary('server', ['app', 'ui', 'telegram', /^@\/features\/(?![^/]+\/schemas$)/]),
  boundary('bot', ['app', 'ui', 'telegram', 'features']),
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'legacy/**',
    'agent1/**',
    '.claude/**',
    '.sst/**',
    '.open-next/**',
  ]),
]);
