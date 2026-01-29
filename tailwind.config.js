/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./index.tsx",
    "./App.tsx",
    "./components/**/*.{ts,tsx}",
    "./context/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./services/**/*.{ts,tsx}",
    "./utils/**/*.{ts,tsx}",
    // Use a more specific pattern that won't match node_modules
    "./admin/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Nunito', 'Work Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', 'sans-serif'],
        barcode: ['IDAutomationHC39M', 'monospace'],
      },
      colors: {
        primary: '#374151', // gray-700 (QuickBooks dark gray)
        secondary: '#6b7280', // gray-500
        accent: '#10b981', // green-500 (QuickBooks green)
        danger: '#ef4444', // red-500
        success: '#10b981', // green-500 (QuickBooks green)
        warning: '#f59e0b', // amber-500
        background: '#ffffff', // white (QuickBooks white)
      }
    },
  },
  plugins: [],
}
