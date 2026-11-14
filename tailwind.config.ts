import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: 'var(--bg)',
        surface: 'var(--surface)',
        ink: 'var(--text)',
        muted: 'var(--text-muted)',
        accent: 'var(--accent)',
        'accent-ink': 'var(--accent-text)',
        line: 'var(--border)',
        soft: 'var(--border-soft)',
        danger: 'var(--danger)',
      },
      borderWidth: { ui: 'var(--bw)' },
      fontFamily: {
        sans: ['"Noto Sans Variable"', '"Noto Sans"', 'system-ui', 'sans-serif'],
      },
      // Rule Zero: every tap target is at least 48 px. 3rem is 54 px at the base size and grows with text size.
      minHeight: { tap: '3rem' },
      minWidth: { tap: '3rem' },
      transitionDuration: { DEFAULT: '150ms' },
    },
  },
  plugins: [],
};

export default config;
