import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";
import scrollbar from "tailwind-scrollbar";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: {
    extend: {
      colors: {
        primary: "#08bccc",
        secondary: "#283c84",
        "light-gray": "#f8f4f4",
      },
      fontFamily: {
        sans: [
          "Figtree",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        figtree: ["Figtree", "sans-serif"],
      },
      fontWeight: {
        regular: "400",
        medium: "500",
        semibold: "600",
        bold: "700",
        extrabold: "800",
      },
      animation: {
        "modal-slide": "modalSlide 0.2s ease-out",
      },
      keyframes: {
        modalSlide: {
          "0%": { transform: "translateY(-20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      boxShadow: {
        "card-hover": "0 4px 12px rgba(0, 0, 0, 0.15)",
        "action-hover": "0 8px 25px rgba(0, 0, 0, 0.1)",
        carousel: "0 4px 20px rgba(0, 0, 0, 0.1)",
      },
    },
  },
  plugins: [forms, typography, scrollbar({ nocompatible: true })],
};
