import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        overlay: resolve(__dirname, "index.html"),
        room: resolve(__dirname, "room.html")
      }
    }
  }
});
