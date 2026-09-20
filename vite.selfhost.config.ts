// Self-host (Docker / independent Node machine) build configuration — P19.
//
// The normal production build (vite.config.ts) is intentionally left untouched and
// keeps targeting the hosted deployment preset. This configuration exists only to
// emit a deterministic standalone Node server for the independent-reproduction path:
//
//   preset:    node-server (real standalone Node HTTP server, no edge runtime)
//   output:    .output
//   server:    .output/server/index.mjs
//   public:    .output/public
//
// The layout is pinned explicitly so the artifact contract is identical on every
// machine. There is no fallback to any other output directory.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

export default defineConfig({
  plugins: [mcpPlugin()],
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: {
    preset: "node-server",
    output: {
      dir: ".output",
      serverDir: ".output/server",
      publicDir: ".output/public",
    },
  },
});
