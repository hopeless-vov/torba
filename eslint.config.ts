import js from '@eslint/js'
import vueI18n from '@intlify/eslint-plugin-vue-i18n'
import checkFile from 'eslint-plugin-check-file'
import pluginVue from 'eslint-plugin-vue'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import unusedImports from 'eslint-plugin-unused-imports'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['src/**/*.{ts,vue}'],
    plugins: {
      '@intlify/vue-i18n': vueI18n,
      'check-file': checkFile,
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    settings: {
      'vue-i18n': {
        localeDir: './src/locales/*.json',
      },
    },
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        project: './tsconfig.app.json',
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      // Core
      'no-undef': 'off', // Handled by TypeScript

      // Vue
      'vue/multi-word-component-names': 'off',
      'vue/block-order': ['error', { order: ['script', 'template', 'style'] }],
      'vue/component-api-style': ['error', ['script-setup']],
      'vue/define-props-declaration': ['error', 'type-based'],
      'vue/block-lang': [
        'error',
        {
          template: {},
          style: {},
          script: { lang: 'ts' },
        },
      ],

      // TypeScript
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/array-type': 'warn',
      '@typescript-eslint/explicit-member-accessibility': 'warn',
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'import',
          format: ['camelCase', 'PascalCase'],
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE'],
        },
        {
          selector: 'property',
          format: null,
        },
      ],

      // File naming
      'check-file/filename-naming-convention': [
        'error',
        {
          '**/*.{ts,json}': 'KEBAB_CASE',
          '**/*.vue': 'PASCAL_CASE',
        },
        {
          ignoreMiddleExtensions: true,
        },
      ],

      // Import sorting
      'simple-import-sort/imports': ['error', { groups: [['^']] }],
      'simple-import-sort/exports': 'error',

      // i18n
      '@intlify/vue-i18n/no-raw-text': 'error',
      '@intlify/vue-i18n/no-missing-keys': 'error',

      // Unused imports
      'unused-imports/no-unused-imports': 'warn',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'playwright-report/', 'supabase/'],
  },
)
