// Self-host (Docker / independent Node machine) build configuration.
//
// The normal production build (vite.config.ts) is intentionally left untouched and
// keeps targeting the hosted Cloudflare module preset. This configuration exists
// only to emit a standalone Node server for the P19 independent-reproduction path.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

export default defineConfig({
  plugins: [mcpPlugin()],
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: {
    preset: "node-server",
  },
});
