import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import noHardcodedString from './eslint-rules/no-hardcoded-string.js'

export default tseslint.config(
  {
    ignores: ['dist', 'dev-dist', 'coverage', 'node_modules', 'api'],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // All UI copy must come from `src/core/i18n/vi.json` via `t('key')`.
    // The rule itself skips `src/core/i18n/**` and test files.
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      beyeu: {
        rules: {
          'no-hardcoded-string': noHardcodedString,
        },
      },
    },
    rules: {
      'beyeu/no-hardcoded-string': 'error',
    },
  },
  {
    files: ['vite.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
)
