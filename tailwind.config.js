/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
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
      },
      animation: {
        'fadeInOut':      'fadeInOut 1.2s ease-in-out forwards',
        'slideFromRight': 'slideFromRight 0.4s ease-out both',
        'slideFromLeft':  'slideFromLeft 0.4s ease-out both',
      },
    },
  },
  plugins: [],
}

