/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fdf4ff',
          100: '#f8e8ff',
          200: '#f0d0fe',
          300: '#e4a9fd',
          400: '#d076f9',
          500: '#b94af0',
          600: '#9c27d4',
          700: '#831cb0',
          800: '#6e1c90',
          900: '#5c1a74',
        },
        coral:   '#E8635A',
        indigo:  '#5B7FE8',
        violet:  '#7C3AED',
        emerald: '#16A34A',
        amber:   '#D97706',
        sky:     '#0891B2',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-up': 'fadeUp 0.4s ease both',
        'pulse-dot': 'pulseDot 1.4s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        pulseDot: {
          '0%, 80%, 100%': { transform: 'scale(0)', opacity: '0' },
          '40%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
