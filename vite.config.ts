import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, join } from "path";
import { mkdir, copyFile, readdir, stat } from "fs/promises";

function staticCopyPlugin() {
  return {
    name: "static-copy",
    apply: "build",
    async closeBundle() {
      const outDir = resolve(__dirname, "dist");
      await mkdir(outDir, { recursive: true });
      await copyFile(resolve(__dirname, "manifest.json"), resolve(outDir, "manifest.json"));
      await copyDirectory(resolve(__dirname, "data"), resolve(outDir, "data"));
    }
  };
}

async function copyDirectory(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(source, entry.name);
    const destPath = join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath);
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    staticCopyPlugin()
  ],
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
