/* ESLint configuration for TypeScript project */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: undefined, // type-aware rules disabled for speed; enable with tsconfig if needed
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  ignorePatterns: ['dist/', 'node_modules/', '*.js'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/ban-ts-comment': ['warn', { 'ts-ignore': 'allow-with-description' }],
    '@typescript-eslint/consistent-type-imports': 'warn',
    // Ensure Prettier uses single quotes and LF consistently
    'prettier/prettier': [
      'warn',
      {
        singleQuote: true,
        jsxSingleQuote: false,
        endOfLine: 'lf',
      },
    ],
    quotes: ['error', 'single', { avoidEscape: true }],
    '@typescript-eslint/quotes': ['error', 'single', { avoidEscape: true }],
  },
};
