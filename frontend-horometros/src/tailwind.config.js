/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        // "Concho de Vino" - acento de marca FRUGALP para estados de urgencia / destructivos
        vino: {
          50: '#fbeef1',
          100: '#f5d7de',
          200: '#e8adbd',
          300: '#d47f97',
          400: '#b8506f',
          500: '#973256',
          600: '#7a1f3d',
          700: '#5c1730',
          800: '#421022',
          900: '#2b0a16',
        },
      },
    },
  },
  plugins: [],
}