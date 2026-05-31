/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: '#ffffff',
        foreground: '#0f0f0f',
        muted: '#f5f5f5',
        'muted-foreground': '#6b7280',
        border: '#e5e7eb',
        input: '#e5e7eb',
        primary: '#1a1a1a',
        'primary-foreground': '#ffffff',
        secondary: '#f3f4f6',
        'secondary-foreground': '#1a1a1a',
        accent: '#d97706',
        'accent-foreground': '#ffffff',
        card: '#ffffff',
        'card-foreground': '#0f0f0f',
        destructive: '#ef4444',
        'destructive-foreground': '#ffffff',
      },
    },
  },
  plugins: [],
};
