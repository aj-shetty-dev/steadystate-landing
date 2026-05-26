module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: false,
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  env: { node: true, es2022: true },
  ignorePatterns: ['dist', 'node_modules', 'coverage', '*.config.ts', '*.config.js'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // NestJS DI relies on value imports for parameter types (emitDecoratorMetadata).
    // Forcing `import type` breaks runtime injection — leave imports as-is.
    '@typescript-eslint/consistent-type-imports': 'off',
  },
};
