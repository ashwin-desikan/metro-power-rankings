import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `import "server-only"` is a build-time marker with no runtime behaviour,
      // and the package is not a top-level dependency: it exists only inside
      // Next's bundle. Without this, a test that imports a server-only lib dies
      // with "Cannot find package 'server-only'" before a single assertion runs,
      // which is how lib/clubFootballLive.test.ts failed on 2026-09-19.
      //
      // Aliased to Next's `empty.js`, NOT its `index.js`: index.js deliberately
      // THROWS ("This module cannot be imported from a Client Component"), so
      // pointing at it would swap one failure for another. empty.js is the no-op
      // the bundler resolves to on the server path.
      "server-only": path.resolve(__dirname, "node_modules/next/dist/compiled/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "scripts/**/*.test.mjs"],
  },
});
