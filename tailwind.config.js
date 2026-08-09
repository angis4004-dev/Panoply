/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Both roles resolve to a single variable each, with the whole
        // fallback chain living in that variable (see the role block at the
        // top of styles/tailwind.css). Keeping the stack there rather than
        // here is what lets .type-dashboard swap the entire pairing for one
        // subtree; a family hardcoded in this array would leak past any such
        // override.
        sans: ['var(--font-sans)'],
        display: ['var(--font-display)'],
        // Was the bare string 'JetBrains Mono', which nothing ever loaded, so
        // every `font-mono` element fell back to the system default.
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        wordmark: ['var(--font-wordmark)', 'var(--font-sans)', 'sans-serif'],
      },
      colors: {
        border: '#212A35',
        background: '#0A0E13',
        foreground: '#E7ECF2',
        primary: {
          DEFAULT: '#FFF0C9',
          foreground: '#243B8F',
        },
        navy: {
          DEFAULT: '#243B8F',
          foreground: '#FFF0C9',
        },
        accent: '#212A35',
        brand: {
          ink: '#0A0F1C',
          blue: '#243B8F',
          cyan: '#00D4FF',
          purple: '#7B61FF',
          green: '#00C896',
          gray: '#64748B',
          paper: '#F2F5FA',
          cream: '#FFF0C9',
        },
        teal: {
          300: '#5EEAD4',
          400: '#2DD4BF',
          500: '#00D4AA',
          600: '#00A884',
          700: '#007A62',
        },
        // A ~37-entry Material Design token block used to sit here
        // ('on-surface-variant', 'surfaceContainerHigh', 'primaryFixed',
        // 'tertiary-container', ...) carried over from the starter this
        // project was scaffolded from. Every one of them was checked against
        // the component tree and matched zero files, so the config was
        // advertising a colour system the app has never used. Removed.
        //
        // Additional colors used in dashboard
        red: '#E5555A',
        blue: '#5B9BD9',

        // Design system tokens. Added alongside the existing palette so
        // nothing changes until a component opts in; see the `ds-*`
        // custom properties in src/styles/tailwind.css for the rationale.
        // Channel form, not `var(--ds-x)`. Tailwind 3 can only splice an alpha
        // into a colour whose channels it can see, so a bare var() token
        // silently emits nothing for an opacity modifier like `bg-x/60`. That
        // is why the design system was bypassed in favour of raw hex almost
        // everywhere: half the call sites need opacity, and the tokens could
        // not express it.
        ds: {
          text: {
            DEFAULT: 'rgb(var(--ds-text-primary-rgb) / <alpha-value>)',
            secondary: 'rgb(var(--ds-text-secondary-rgb) / <alpha-value>)',
            muted: 'rgb(var(--ds-text-muted-rgb) / <alpha-value>)',
          },
          surface: {
            DEFAULT: 'rgb(var(--ds-surface-base-rgb) / <alpha-value>)',
            raised: 'rgb(var(--ds-surface-raised-rgb) / <alpha-value>)',
            overlay: 'rgb(var(--ds-surface-overlay-rgb) / <alpha-value>)',
            inset: 'rgb(var(--ds-surface-inset-rgb) / <alpha-value>)',
            chrome: 'rgb(var(--ds-surface-chrome-rgb) / <alpha-value>)',
          },
          border: {
            DEFAULT: 'rgb(var(--ds-border-subtle-rgb) / <alpha-value>)',
            strong: 'rgb(var(--ds-border-strong-rgb) / <alpha-value>)',
          },
          brand: {
            DEFAULT: 'rgb(var(--ds-brand-rgb) / <alpha-value>)',
            ink: 'rgb(var(--ds-brand-ink-rgb) / <alpha-value>)',
          },
          value: {
            positive: 'var(--ds-value-positive)',
            negative: 'var(--ds-value-negative)',
            warning: 'var(--ds-value-warning)',
          },
        },
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
        // Design system radius scale - four steps, down from the six
        // values in circulation (4, 8, 12, 16, 9999 and 4px 4px 0 0).
        // 4px. Same value as the `rounded` DEFAULT above, exposed by name so
        // the inline-link/focus-ring radius is addressable as part of the
        // scale rather than looking like an unconsidered default.
        'ds-xs': 'var(--ds-radius-xs)',
        'ds-sm': 'var(--ds-radius-sm)',
        'ds-md': 'var(--ds-radius-md)',
        'ds-lg': 'var(--ds-radius-lg)',
      },
      spacing: {
        gutter: '24px',
        'container-max': '1440px',
        'margin-desktop': '40px',
        'margin-mobile': '16px',
        unit: '8px',
      },
      fontSize: {
        'display-lg': ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': [
          '32px',
          { lineHeight: '40px', letterSpacing: '-0.01em', fontWeight: '600' },
        ],
        'headline-lg-mobile': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-md': ['14px', { lineHeight: '20px', letterSpacing: '0.02em', fontWeight: '500' }],
        'label-sm': ['12px', { lineHeight: '16px', letterSpacing: '0.04em', fontWeight: '500' }],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],

        // Design system type scale - seven steps, replacing the ten
        // distinct sizes found in circulation (9/10/11/12/14/16/18/20/
        // 24/30/36px). 12px is the floor: the dashboard's most common
        // size was 10px, and anything under 16px in an <input> makes
        // iOS auto-zoom on focus. Body leading is 1.5; display tightens
        // as size grows.
        'ds-caption': ['12px', { lineHeight: '18px', letterSpacing: '0.04em', fontWeight: '500' }],
        'ds-label': ['14px', { lineHeight: '20px', letterSpacing: '0.02em', fontWeight: '500' }],
        'ds-body': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'ds-title': ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'ds-heading': ['24px', { lineHeight: '32px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'ds-display': ['32px', { lineHeight: '38px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'ds-display-lg': [
          '48px',
          { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '700' },
        ],
      },
      transitionDuration: {
        instant: 'var(--ds-dur-instant)',
        fast: 'var(--ds-dur-fast)',
        base: 'var(--ds-dur-base)',
        slow: 'var(--ds-dur-slow)',
        'exit-fast': 'var(--ds-dur-exit-fast)',
        'exit-base': 'var(--ds-dur-exit-base)',
        'exit-slow': 'var(--ds-dur-exit-slow)',
      },
      transitionTimingFunction: {
        'ds-out': 'var(--ds-ease-out)',
        'ds-out-expo': 'var(--ds-ease-out-expo)',
        'ds-in': 'var(--ds-ease-in)',
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease forwards',
        'slide-up': 'slide-up 0.4s ease forwards',
        'pulse-glow': 'pulse-glow 2s infinite',
        'shimmer-sweep': 'shimmer-sweep 2.8s ease-in-out infinite',
        // Keep existing if any
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(0, 212, 170, 0.4)' },
          '50%': { boxShadow: '0 0 0 6px rgba(0, 212, 170, 0)' },
        },
        'shimmer-sweep': {
          '0%': { transform: 'translateX(-130%) skewX(-20deg)' },
          '55%, 100%': { transform: 'translateX(280%) skewX(-20deg)' },
        },
        // Keep existing if any
      },
    },
  },
  plugins: [],
};
