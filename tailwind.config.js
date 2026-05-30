/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors')

module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        violet: colors.violet,
        indigo: colors.indigo,
        brand: {
          50:  '#fdf4ff',
          100: '#f8e8ff',
          500: '#b94af0',
          600: '#9c27d4',
          700: '#831cb0',
        },
        coral:   '#E8635A',
        emerald: colors.emerald,
        amber:   colors.amber,
        sky:     colors.sky,
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-up': 'fadeUp 0.4s ease both',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
