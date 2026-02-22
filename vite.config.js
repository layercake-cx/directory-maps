import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Only use base path on GitHub Pages build
  base: command === "build" ? "/directory-maps/" : "/",
}));