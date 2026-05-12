/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        study: {
          base:     'rgb(var(--study-base) / <alpha-value>)',
          surface:  'rgb(var(--study-surface) / <alpha-value>)',
          bg:       'rgb(var(--study-bg) / <alpha-value>)',
          card:     'rgb(var(--study-card) / <alpha-value>)',
          elevated: 'rgb(var(--study-elevated) / <alpha-value>)',
          hover:    'rgb(var(--study-hover) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
