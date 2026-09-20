import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...reactRefresh.configs.recommended.rules,
    },
  },
  {
    // shadcn/ui CLI output co-locates variant helpers with components.
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Entry point: mounts the app, never a refreshable component module.
    files: ['src/main.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Hooks modules export hook functions alongside context helpers, and
    // shared component modules co-locate variant helpers with components.
    files: [
      'src/hooks/**/*.{ts,tsx}',
      'src/lib/**/*.{ts,tsx}',
      'src/components/common/**/*.{ts,tsx}',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
)
