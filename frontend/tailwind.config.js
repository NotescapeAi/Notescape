/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  safelist: [
    'is-scrolled'],
  theme: {
    extend: {
      fontFamily: {
        montserrat: ['Montserrat', 'sans-serif'],
      },
      colors: {
        violet: "#7B5FEF",
        pink: "#EF5F8B",
        lime: "#D3EF5F",
        mint: "#5FEFC3",
        black: "#000000",
        white: "#FFFFFF",
      },
    },
  },
  plugins: [],
};
