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

