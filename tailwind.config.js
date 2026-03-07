/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        neonBlue: '#00f3ff',
        neonPurple: '#9d00ff',
        neonPink: '#ff00aa',
        darkBg: '#0a0a0f',
        glassBg: 'rgba(255, 255, 255, 0.03)',
      },
      boxShadow: {
        'neon-blue': '0 0 10px rgba(0, 243, 255, 0.5)',
        'neon-purple': '0 0 10px rgba(157, 0, 255, 0.5)',
      }
    },
  },
  plugins: [],
}
