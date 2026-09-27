import { defineConfig } from "vite";
export default defineConfig({ base: process.env.GITHUB_PAGES ? "/cheonmyeong/" : "./", server: { port: 5461, strictPort: true }, build: { target: "es2022", chunkSizeWarningLimit: 3000 } });
