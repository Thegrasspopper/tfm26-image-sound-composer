import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';


export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, ".", "");
    const clientEnv = {
      GEMINI_API_KEY: env.GEMINI_API_KEY,
      GEMINI_MODEL: env.GEMINI_MODEL,
      CLAUDE_API_KEY: env.CLAUDE_API_KEY,
      CLAUDE_MODEL: env.CLAUDE_MODEL,
      ELEVENLABS_API_KEY: env.ELEVENLABS_API_KEY,
      ELEVENLABS_MUSIC_MODEL: env.ELEVENLABS_MUSIC_MODEL
    };

    return {
      server: {
        port: 3000,
        host: "0.0.0.0"
      },
      define: {
        "process.env": JSON.stringify(clientEnv)
      },
      resolve: {
        alias: {
          "@": path.resolve(__dirname, ".")
        }
      },
      optimizeDeps: {
        include: ["midi-sounds-react"]
      },
      ssr: {
        noExternal: ["midi-sounds-react"]
      },
      base: "./",
      build: {
        manifest: true,
        outDir: "dist"
      }
    };
});
