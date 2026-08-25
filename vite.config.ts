import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: ["apps/website/src/routeTree.gen.ts", ".wrangler/**"],
  },
  lint: {
    ignorePatterns: ["apps/website/src/routeTree.gen.ts", ".wrangler/**"],
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    projects: ["apps/*", "packages/*"],
  },
});
