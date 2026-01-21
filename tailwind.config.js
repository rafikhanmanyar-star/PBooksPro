/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "index.html",
    "index.tsx",
    "App.tsx",
    "components/**/*.{ts,tsx}",
    "context/**/*.{ts,tsx}",
    "hooks/**/*.{ts,tsx}",
    "services/**/*.{ts,tsx}",
    "utils/**/*.{ts,tsx}",
    "admin/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Nunito', 'Work Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', 'sans-serif'],
        heading: ['Outfit', 'Inter', 'sans-serif'],
        barcode: ['IDAutomationHC39M', 'monospace'],
      },
      colors: {
        primary: {
          DEFAULT: '#020617', // slate-950
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        orange: {
          DEFAULT: '#f97316', // orange-500
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407',
        },
        accent: '#f97316', // orange-500
        danger: '#ef4444', // red-500
        success: '#10b981', // green-500
        warning: '#f59e0b', // amber-500
        background: '#ffffff', // white
      }
    },
  },
  plugins: [],
}
