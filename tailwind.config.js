/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Single source of truth for the brand accent.
        // Change these two values to re-theme the whole app.
        accent: {
          DEFAULT: "#2563EB", // blue-600
          hover: "#1D4ED8",  // blue-700 (darker, for hover states)
        },
      },
    },
  },
  plugins: [],
};
