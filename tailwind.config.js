/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        stage: {
          bg: '#08090c',
          panel: '#101218',
          card: '#171a23',
          border: '#252a38',
          gold: '#f5b942',
          amber: '#d99b26',
        },
      },
    },
  },
  plugins: [],
};

