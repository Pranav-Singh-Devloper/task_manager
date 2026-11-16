import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: 'var(--bg)',
        sunken: 'var(--bg-deep)',
        surface: 'var(--surface)',
        ink: 'var(--text)',
        muted: 'var(--text-muted)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-soft': 'var(--accent-soft)',
        'accent-ink': 'var(--accent-text)',
        line: 'var(--border)',
        soft: 'var(--border-soft)',
        danger: 'var(--danger)',
      },
      borderWidth: { ui: 'var(--bw)' },
      fontFamily: {
        sans: ['"Noto Sans Variable"', '"Noto Sans"', 'system-ui', 'sans-serif'],
        display: ['"Fraunces Variable"', '"Noto Serif"', 'Georgia', 'serif'],
      },
      // Softer corners for the warm look.
      borderRadius: { lg: '0.75rem', xl: '1rem', '2xl': '1.25rem', '3xl': '1.75rem' },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      // Rule Zero: every tap target is at least 48 px. 3rem is 54 px at the base size and grows with text size.
      minHeight: { tap: '3rem' },
      minWidth: { tap: '3rem' },
      transitionDuration: { DEFAULT: '200ms' },
    },
  },
  plugins: [],
};

export default config;
