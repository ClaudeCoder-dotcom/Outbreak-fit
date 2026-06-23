import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Capacitor loads the built site from the local filesystem, so use relative paths.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist" },
});
