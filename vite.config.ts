import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig(({ command }) => ({
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    // Cloudflare Workers target for `vite build` (see wrangler.jsonc).
    // Local dev runs on the plain Node-based Vite/Start dev server.
    ...(command === "build" ? [cloudflare()] : []),
  ],
}));
