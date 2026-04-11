import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import JavaScriptObfuscator from "javascript-obfuscator";

function obfuscateBuildOutput() {
  return {
    name: "obfuscate-build-output",
    apply: "build",
    enforce: "post",
    generateBundle(_, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== "chunk") continue;
        if (file.fileName.includes("vendor")) continue;
        if (file.fileName.endsWith(".map")) continue;
        if (!file.isEntry && !file.fileName.includes("index")) continue;
        if (file.code.length > 200_000) continue;

        const result = JavaScriptObfuscator.obfuscate(file.code, {
          compact: true,
          controlFlowFlattening: false,
          deadCodeInjection: false,
          identifierNamesGenerator: "hexadecimal",
          numbersToExpressions: true,
          renameGlobals: false,
          simplify: true,
          splitStrings: false,
          stringArray: true,
          stringArrayEncoding: ["base64"],
          stringArrayThreshold: 0.6,
          transformObjectKeys: true,
          unicodeEscapeSequence: false,
        });

        file.code = result.getObfuscatedCode();
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), obfuscateBuildOutput()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        ws: true,
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq, req) => {
            const h = req.headers.host;
            if (h) proxyReq.setHeader("X-Forwarded-Host", h);
          });
        },
      },
    },
  },
  build: {
    minify: "terser",
    sourcemap: false,
    terserOptions: {
      compress: {
        drop_debugger: true,
        passes: 2,
      },
      mangle: true,
      format: {
        comments: false,
      },
    },
  },
});
