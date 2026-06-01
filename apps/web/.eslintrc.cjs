module.exports = {
  root: true,
  extends: ['next/core-web-vitals', 'next/typescript'],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      },
    ],
    // Temporarily disabled — 32 existing `any` usages to clean up incrementally (TODO)
    '@typescript-eslint/no-explicit-any': 'off',
  },
};
