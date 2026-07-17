/** @type {import('tailwindcss').Config} */

// ─────────────────────────────────────────────────────────────────────────────
// Direction B — "Fjord & Marigold" (chosen by Omar 2026-07-17; mockups in the
// design-review artifact, rationale in CLAUDE.md §8).
//
// The recolor works by REMAPPING the Tailwind color names the codebase already
// uses, so every existing `violet-600`/`gray-50`/`amber-400` class renders in
// the new palette without touching call sites:
//   violet / indigo → fjord greens (primary; indigo slightly deeper for gradients)
//   gray            → warm pine-tinted neutrals (page ground = sand)
//   white           → warm white #FFFEFA
//   amber           → marigold (action / celebration)
//   orange          → clay (child-facing warmth)
//   emerald         → leaf (success, softer + warmer than stock emerald)
// Semantic exceptions that must NOT be remapped: red (errors) and the inline-hex
// Fitzgerald Key colours on AAC materials (clinical standard, not decoration).
// ─────────────────────────────────────────────────────────────────────────────

const fjord = {
  50:  '#EDF4F0',
  100: '#D8E7E0',
  200: '#B4CFC3',
  300: '#88B09F',
  400: '#578F7B',
  500: '#35735F',
  600: '#21564C',
  700: '#1A463E',
  800: '#143931',
  900: '#0F2D27',
}

const fjordDeep = { // gradients pair from-violet-600 → to-indigo-600
  50:  '#E9F1EE',
  100: '#CFE1DA',
  200: '#A5C4B9',
  300: '#77A392',
  400: '#4A8270',
  500: '#2C6455',
  600: '#1B4A41',
  700: '#163D36',
  800: '#12322C',
  900: '#0D2722',
}

const marigold = {
  50:  '#FDF7E7',
  100: '#FBEECB',
  200: '#F9E3A6',
  300: '#F7D67E',
  400: '#F6C453',
  500: '#EAB03A',
  600: '#D3952B',
  700: '#B07A22',
  800: '#8C601C',
  900: '#6E4B17',
}

const clay = {
  50:  '#FBEFE9',
  100: '#F7DDD2',
  200: '#EFBBA6',
  300: '#E99F82',
  400: '#E2704A',
  500: '#D55E38',
  600: '#C04E2B',
  700: '#9E3F23',
  800: '#7E331D',
  900: '#632818',
}

const leaf = {
  50:  '#EFF7F1',
  100: '#DBEEE1',
  200: '#B9DDC5',
  300: '#8FC7A3',
  400: '#66AE81',
  500: '#4E9B6F',
  600: '#3D8159',
  700: '#33684A',
  800: '#2A533D',
  900: '#224332',
}

const warmGray = {
  50:  '#F2EEE6', // sand — the page ground
  100: '#EAE5D9',
  200: '#DCD6C8',
  300: '#C4BEB0',
  400: '#98948B',
  500: '#7E7B72',
  600: '#5F5D55',
  700: '#45443E',
  800: '#2C332F',
  900: '#23312E', // pine ink
}

module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        violet:  fjord,
        indigo:  fjordDeep,
        fjord,
        marigold,
        amber:   marigold,
        orange:  clay,
        clay,
        emerald: leaf,
        leaf,
        gray:    warmGray,
        white:   '#FFFEFA',
        coral:   '#E2704A',
        // Marigold buttons carry dark text, never white
        'marigold-ink': '#3D3007',
      },
      fontFamily: {
        sans: ['var(--font-nunito)', 'system-ui', 'sans-serif'],
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
