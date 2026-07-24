/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Design system v2
        bg: '#0b0e12',
        surface: { DEFAULT: '#14181f', 2: '#1b212b' },
        line: '#262e3a',
        muted: '#8b95a7',
        dim: '#5a6474',
        gold: {
          DEFAULT: '#e8c079',
          400: '#e8c079',
          500: '#e8c079',
          600: '#c9973f',
          700: '#a17a30',
          ink: '#1a1206',
        },
        ok: '#52d98a',
        danger: '#ff6b6b',
        blue: '#4aa3ff',
      },
      borderRadius: {
        card: '20px',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'Inter',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
