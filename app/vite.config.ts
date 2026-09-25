import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      base,
      scope: base,
      registerType: "prompt",
      includeAssets: ["surkara.svg"],
      manifest: {
        name: "SURKARA",
        short_name: "SURKARA",
        description: "Plataforma operacional agropecuaria offline-first",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#0b1014",
        theme_color: "#0b1014",
        icons: [
          {
            src: "surkara.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      }
    })
  ]
});
