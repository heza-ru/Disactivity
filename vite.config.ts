import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from '@tailwindcss/vite'
import path from "path"
import { visualizer } from "rollup-plugin-visualizer"

const host = process.env.TAURI_DEV_HOST;
const analyze = process.env.ANALYZE === "1" || process.env.ANALYZE === "true";
// React Compiler: on by default; set REACT_COMPILER=0 to disable
const reactCompiler = process.env.REACT_COMPILER !== "0" && process.env.REACT_COMPILER !== "false";

// https://vite.dev/config/
export default defineConfig(async () => ({
    plugins: [
        react(
            reactCompiler
                ? {
                    babel: {
                        plugins: [["babel-plugin-react-compiler", { target: "19" }]],
                    },
                }
                : {},
        ),
        tailwindcss(),
        ...(analyze
            ? [
                  visualizer({
                      open: false,
                      filename: "dist/stats.html",
                      template: "treemap",
                  }),
              ]
            : []),
    ],

    build: {
        // Default 500 kB; one combined app chunk (React + i18n + pages) often exceeds that without being "bad"
        chunkSizeWarningLimit: 900,
        rollupOptions: {
            output: {
                // Split out known heavy dependencies; the rest use Rollup’s default chunking
                manualChunks(id) {
                    if (!id.includes("node_modules")) return
                    if (id.includes("lucide-react")) return "lucide"
                    if (
                        id.includes("i18next")
                        || id.includes("react-i18next")
                        || id.includes("i18next-browser-languagedetector")
                    ) {
                        return "i18n"
                    }
                    if (id.includes("@tauri-apps")) {
                        return "tauri"
                    }
                },
            },
        },
    },

    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                protocol: "ws",
                host,
                port: 1421,
            }
            : undefined,
        watch: {
            // 3. tell Vite to ignore watching `src-tauri`
            ignored: ["**/src-tauri/**"],
        },
    },
}));
