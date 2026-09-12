import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      /**
       * `server-only` throws on import outside a Server Component, which would
       * make every server module untestable here.
       *
       * The real package ships an identical empty module for the
       * `react-server` condition — but its exports map does not expose that
       * path, so the stub lives in tests/support instead. Next.js still
       * resolves the real package, so a client component importing a
       * server-only module is still caught at build time.
       */
      "server-only": fileURLToPath(
        new URL("./tests/support/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // Tenant resolution and slug validation are pure functions by design, so
    // the rules that matter most are testable without a database or a browser.
    env: {
      NEXT_PUBLIC_ROOT_DOMAIN: "lvh.me:3000",
      NEXT_PUBLIC_PROTOCOL: "http",
      NEXT_PUBLIC_PLATFORM_NAME: "Bzaro",

      // Placeholders so modules that read validated server env can be imported.
      // Deliberately obvious fakes: nothing here reaches a real service, and a
      // value that looked plausible would be the kind that quietly gets copied
      // into a deployment.
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      AUTH_SECRET: "test-auth-secret-not-for-any-real-deployment",
      REVALIDATE_SECRET: "test-revalidate-secret-not-real",
      IP_HASH_SALT: "test-ip-hash-salt-not-real",
    },
  },
});
