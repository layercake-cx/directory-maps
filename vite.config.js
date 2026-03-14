import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Use "/" for Vercel/root deployment. For GitHub Pages at /directory-maps/, set VITE_BASE_PATH=/directory-maps/
  base: process.env.VITE_BASE_PATH || "/",
});