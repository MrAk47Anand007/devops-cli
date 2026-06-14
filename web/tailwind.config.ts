import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      backgroundImage: {
        "dashboard-glow":
          "radial-gradient(circle at top, rgba(34, 211, 238, 0.16), transparent 35%), radial-gradient(circle at bottom right, rgba(14, 165, 233, 0.12), transparent 30%)"
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        border: "hsl(var(--border))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))"
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem"
      },
      boxShadow: {
        panel: "0 24px 80px rgba(15, 23, 42, 0.35)"
      }
    }
  },
  plugins: []
} satisfies Config;
