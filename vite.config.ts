import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "public/popup.html"),
        options: resolve(__dirname, "public/options.html"),
        background: resolve(__dirname, "src/background/serviceWorker.ts"),
        content: resolve(__dirname, "src/content/contentMain.ts")
      },
      output: {
        entryFileNames: (chunk) => {
          const id = chunk.facadeModuleId ?? "";
          if (id.endsWith("serviceWorker.ts")) {
            return "background/serviceWorker.js";
          }
          if (id.endsWith("contentMain.ts")) {
            return "content/contentMain.js";
          }
          return "assets/[name].js";
        },
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
