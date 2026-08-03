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
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          900: '#312e81',
        },
        cbt: {
          answered: '#22c55e',      // Green
          notAnswered: '#ef4444',   // Red
          notVisited: '#6b7280',    // Grey
          review: '#a855f7',         // Purple
          answeredReview: '#3b82f6', // Blue dot
        },
      },
    },
  },
  plugins: [],
};
