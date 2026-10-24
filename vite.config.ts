import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: process.env.PORT ? Number(process.env.PORT) : 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    // App-shell offline caching ONLY — lets POS/WaiterPanel still boot on a hard reload with
    // zero connectivity (Dexie/IndexedDB order data alone is useless if the page itself can't
    // load). Deliberately does NOT cache/intercept /api/* — that stays api.ts's + the offline
    // order queue's job, not this service worker's.
    VitePWA({
      // A new build's service worker takes over as soon as it installs (skipWaiting +
      // clientsClaim) but never reloads an open tab: the running page keeps its code, and the
      // next normal reload gets the new build. Without these two, the new worker sat in
      // "waiting" until every tab of the site was closed — a plain reload kept serving the old
      // precached build, so staff saw old screens days after a deploy (2026-10-24). An open tab
      // that later lazy-loads a chunk the new build removed is reloaded once by
      // src/lib/chunk-reload.ts. No update prompt is wired up, so 'prompt' only means
      // "register without auto-reloading".
      registerType: "prompt",
      injectRegister: "auto",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/],
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: false,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy third-party libs into separate, content-hashed chunks so the
        // browser caches them across deploys (only changed app code re-downloads),
        // and they don't bloat the per-route page chunks.
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          query: ["@tanstack/react-query"],
          // The offline order queue (OfflineSyncManager/OfflineIndicator) is mounted at the App
          // root, not lazy — it has to keep running on every route so a queue placed on POS
          // still flushes if the user browses elsewhere on the same device. Splitting Dexie into
          // its own chunk keeps that eager load from inflating the main entry bundle.
          dexie: ["dexie", "dexie-react-hooks"],
        },
      },
    },
  },
}));
