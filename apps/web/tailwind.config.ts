import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:      'rgb(var(--color-bg)      / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        surface2:'rgb(var(--color-surface2)/ <alpha-value>)',
        border:  'rgb(var(--color-border)  / <alpha-value>)',
        green:   'rgb(var(--color-green)   / <alpha-value>)',
        text:    'rgb(var(--color-text)    / <alpha-value>)',
        text2:   'rgb(var(--color-text2)   / <alpha-value>)',
        text3:   'rgb(var(--color-text3)   / <alpha-value>)',
        error:   'rgb(var(--color-error)   / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['var(--font-display)', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
