/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // gray + indigo come from CSS variables so the Christmas theme can remap them (see src/index.css)
      colors: {
      gray: {
        50: 'rgb(var(--gray-50) / <alpha-value>)',
        100: 'rgb(var(--gray-100) / <alpha-value>)',
        200: 'rgb(var(--gray-200) / <alpha-value>)',
        300: 'rgb(var(--gray-300) / <alpha-value>)',
        400: 'rgb(var(--gray-400) / <alpha-value>)',
        500: 'rgb(var(--gray-500) / <alpha-value>)',
        600: 'rgb(var(--gray-600) / <alpha-value>)',
        700: 'rgb(var(--gray-700) / <alpha-value>)',
        800: 'rgb(var(--gray-800) / <alpha-value>)',
        900: 'rgb(var(--gray-900) / <alpha-value>)',
        950: 'rgb(var(--gray-950) / <alpha-value>)',
      },
      indigo: {
        50: 'rgb(var(--indigo-50) / <alpha-value>)',
        100: 'rgb(var(--indigo-100) / <alpha-value>)',
        200: 'rgb(var(--indigo-200) / <alpha-value>)',
        300: 'rgb(var(--indigo-300) / <alpha-value>)',
        400: 'rgb(var(--indigo-400) / <alpha-value>)',
        500: 'rgb(var(--indigo-500) / <alpha-value>)',
        600: 'rgb(var(--indigo-600) / <alpha-value>)',
        700: 'rgb(var(--indigo-700) / <alpha-value>)',
        800: 'rgb(var(--indigo-800) / <alpha-value>)',
        900: 'rgb(var(--indigo-900) / <alpha-value>)',
        950: 'rgb(var(--indigo-950) / <alpha-value>)',
      },
      },
      keyframes: {
        fadeInOut: {
          '0%':   { opacity: '0', transform: 'translateX(-50%) translateY(8px)' },
          '20%':  { opacity: '1', transform: 'translateX(-50%) translateY(0)' },
          '70%':  { opacity: '1', transform: 'translateX(-50%) translateY(0)' },
          '100%': { opacity: '0', transform: 'translateX(-50%) translateY(-4px)' },
        },
        slideFromRight: {
          '0%':   { opacity: '0', transform: 'translateX(48px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideFromLeft: {
          '0%':   { opacity: '0', transform: 'translateX(-48px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        drain: {
          '0%':   { width: '100%' },
          '100%': { width: '0%' },
        },
        swipeGesture: {
          '0%':   { transform: 'translateX(0)',    opacity: '0.45' },
          '20%':  { transform: 'translateX(-14px)', opacity: '0.75' },
          '40%':  { transform: 'translateX(0)',    opacity: '0.45' },
          '60%':  { transform: 'translateX(14px)',  opacity: '0.75' },
          '80%':  { transform: 'translateX(0)',    opacity: '0.45' },
          '100%': { transform: 'translateX(0)',    opacity: '0.45' },
        },
        swipeFadeOut: {
          '0%':   { opacity: '1' },
          '75%':  { opacity: '1' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        'fadeInOut':      'fadeInOut 1.2s ease-in-out forwards',
        'slideFromRight': 'slideFromRight 0.4s ease-out both',
        'slideFromLeft':  'slideFromLeft 0.4s ease-out both',
        'drain':          'drain 2.5s linear forwards',
        'swipe-gesture':  'swipeGesture 2.4s ease-in-out infinite',
        'swipe-fade-out': 'swipeFadeOut 5s ease-in-out forwards',
      },
    },
  },
  plugins: [],
}

