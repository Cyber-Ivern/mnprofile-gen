/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    'bg-red-600',
    'hover:bg-red-700',
    'focus:ring-red-500',
    'text-white'
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} 