import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./content/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        midnight: "#040816",
        ink: "#0b1228",
        azure: "#5e7dff",
        skyglow: "#8db4ff",
      },
      boxShadow: {
        soft: "0 20px 45px -24px rgba(39, 82, 255, 0.35)",
      },
      backgroundImage: {
        "hero-gradient":
          "radial-gradient(circle at 14% 16%, rgba(94, 125, 255, 0.34) 0%, rgba(7, 11, 25, 0) 48%), radial-gradient(circle at 86% 2%, rgba(52, 220, 216, 0.2) 0%, rgba(7, 11, 25, 0) 38%), linear-gradient(180deg, #060b1d 0%, #040816 72%)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        float: "float 7s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
