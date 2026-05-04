import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";

function sriPlugin(): Plugin {
  const addSriToHtml = (html: string, integrityByPath: Map<string, string>) => html.replace(
    /<(script|link)\b([^>]*?(?:src|href)=['"]([^'"]+)['"][^>]*)>/g,
    (full, tag, attrs, url) => {
      const integrity = integrityByPath.get(url);
      if (!integrity) return full;
      if (tag === "link" && !/rel=['"](?:stylesheet|modulepreload)['"]/.test(attrs)) return full;

      const cleaned = full
        .replace(/\sintegrity=(['"]).*?\1/g, "")
        .replace(/\scrossorigin=(['"]).*?\1/g, "");

      return cleaned.replace(/>$/, ` integrity="${integrity}" crossorigin="anonymous">`);
    },
  );

  return {
    name: "stratus-sri",
    apply: "build",
    writeBundle(outputOptions, bundle) {
      const outDir = outputOptions.dir ?? path.dirname(outputOptions.file ?? path.resolve("dist/index.html"));
      const integrityByPath = new Map<string, string>();

      for (const [fileName] of Object.entries(bundle)) {
        const absolutePath = path.join(outDir, fileName);
        if (!fs.existsSync(absolutePath) || absolutePath.endsWith('.html')) continue;
        const buffer = fs.readFileSync(absolutePath);
        const integrity = `sha384-${createHash("sha384").update(buffer).digest("base64")}`;
        integrityByPath.set(`/${fileName}`, integrity);
      }

      for (const htmlName of fs.readdirSync(outDir).filter((name) => name.endsWith('.html'))) {
        const htmlPath = path.join(outDir, htmlName);
        const html = fs.readFileSync(htmlPath, 'utf8');
        fs.writeFileSync(htmlPath, addSriToHtml(html, integrityByPath), 'utf8');
      }
    },
  };
}

function vaultObfuscationPlugin(): Plugin {
  return {
    name: "stratus-vault-obfuscation",
    apply: "build",
    async generateBundle(_, bundle) {
      const { default: JavaScriptObfuscator } = await import("javascript-obfuscator");

      const getChunkKind = (chunk: { name: string; facadeModuleId: string | null; modules: Record<string, unknown> }) => {
        if (chunk.name === "crypto-core") return "crypto-core" as const;
        const moduleIds = [chunk.facadeModuleId, ...Object.keys(chunk.modules)].filter(Boolean) as string[];
        if (moduleIds.some((id) =>
          id.includes("/src/lib/crypto") ||
          id.includes("/src/lib/vault-") ||
          id.includes("/src/lib/native-helper") ||
          id.includes("/src/lib/argon2-wasm")
        )) {
          return "vault-support" as const;
        }
        return "general" as const;
      };

      const baseOptions = {
        compact: true,
        debugProtection: false,
        disableConsoleOutput: false,
        identifierNamesGenerator: "hexadecimal" as const,
        ignoreImports: true,
        renameGlobals: false,
        selfDefending: false,
        unicodeEscapeSequence: false,
      };

      for (const entry of Object.values(bundle)) {
        if (entry.type !== "chunk") continue;
        const kind = getChunkKind(entry);

        const result = JavaScriptObfuscator.obfuscate(entry.code, kind === "crypto-core"
          ? {
              ...baseOptions,
              controlFlowFlattening: true,
              controlFlowFlatteningThreshold: 0.9,
              deadCodeInjection: true,
              deadCodeInjectionThreshold: 0.2,
              numbersToExpressions: true,
              simplify: true,
              splitStrings: true,
              splitStringsChunkLength: 4,
              stringArray: true,
              stringArrayEncoding: ["base64"],
              stringArrayRotate: true,
              stringArrayShuffle: true,
              stringArrayThreshold: 1,
              stringArrayWrappersCount: 4,
              stringArrayWrappersChainedCalls: true,
              stringArrayWrappersType: "function",
              transformObjectKeys: true,
            }
          : kind === "vault-support"
            ? {
                ...baseOptions,
                controlFlowFlattening: true,
                controlFlowFlatteningThreshold: 0.35,
                deadCodeInjection: false,
                simplify: true,
                splitStrings: true,
                splitStringsChunkLength: 6,
                stringArray: true,
                stringArrayEncoding: ["base64"],
                stringArrayRotate: true,
                stringArrayShuffle: true,
                stringArrayThreshold: 0.75,
                stringArrayWrappersCount: 2,
                stringArrayWrappersType: "function",
                transformObjectKeys: false,
              }
            : {
                ...baseOptions,
                controlFlowFlattening: true,
                controlFlowFlatteningThreshold: 0.28,
                deadCodeInjection: true,
                deadCodeInjectionThreshold: 0.04,
                numbersToExpressions: true,
                simplify: true,
                splitStrings: true,
                splitStringsChunkLength: 4,
                stringArray: true,
                stringArrayEncoding: ["base64"],
                stringArrayRotate: true,
                stringArrayShuffle: true,
                stringArrayThreshold: 0.85,
                stringArrayWrappersCount: 3,
                stringArrayWrappersChainedCalls: true,
                stringArrayWrappersType: "function",
                transformObjectKeys: true,
              });

        entry.code = result.getObfuscatedCode();
        entry.map = null;
      }
    },
  };
}

const rootDir = path.resolve(__dirname);
const PREVIEW_HEAVY_PACKAGES = [
  "mammoth",
  "xlsx",
  "bluebird",
  "jszip",
  "underscore",
  "xmlbuilder",
  "sax",
  "argparse",
  "cfb",
  "codepage",
  "crc-32",
  "frac",
  "ssf",
  "wmf",
  "word",
];

function isNodeModulePackage(id: string, pkg: string): boolean {
  return id.includes(`/node_modules/${pkg}/`) || id.includes(`\\node_modules\\${pkg}\\`);
}

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": {
        target: process.env.VITE_API_BASE_URL || "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  plugins: [react(), vaultObfuscationPlugin(), sriPlugin()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
  esbuild: mode === "production" ? {
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true,
    legalComments: "none",
    treeShaking: true,
    keepNames: false,
    drop: ["debugger"],
  } : undefined,
  build: {
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[hash].js",
        chunkFileNames: "assets/[hash].js",
        assetFileNames: "assets/[hash][extname]",
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("hash-wasm")) return "crypto-wasm";
            if (PREVIEW_HEAVY_PACKAGES.some((pkg) => isNodeModulePackage(id, pkg))) return "preview-heavy";
            return undefined;
          }

          if (
            id.includes("/src/lib/crypto") ||
            id.includes("/src/lib/crypto-engine") ||
            id.includes("/src/lib/vault-crypto-advanced") ||
            id.includes("/src/lib/argon2-wasm") ||
            id.includes("/src/lib/native-helper")
          ) {
            return "crypto-core";
          }

          if (id.includes("/src/components/preview/") || id.includes("/src/pages/SharePage")) {
            return "preview-ui";
          }
        },
      },
    },
  },
}));
