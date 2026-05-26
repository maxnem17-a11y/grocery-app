import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages serves this repo at https://<user>.github.io/grocery-app/.
  // Without this prefix the emitted /assets/index-<hash>.js path 404s.
  base: "/grocery-app/",
  plugins: [react()],
});
