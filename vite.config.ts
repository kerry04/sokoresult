import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    // Nitro handles the server build. It auto-detects Vercel (VERCEL=1) and
    // emits the Vercel preset there; local `vite build` falls back to a
    // plain Node server in .output/server/index.mjs.
    nitro(),
    tanstackStart(),
    viteReact(),
  ],
});
