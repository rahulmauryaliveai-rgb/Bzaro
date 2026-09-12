import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

/**
 * ESLint configuration.
 *
 * Beyond the Next.js defaults, three rules encode architectural boundaries that
 * would otherwise be enforced only by reviewer memory:
 *
 *   1. Dashboard code may not import the unscoped `db` client — it must go
 *      through `forSeller()` so queries are mechanically tenant-scoped.
 *   2. `dangerouslySetInnerHTML` is banned outright.
 *   3. Nothing outside `src/env*.ts` reads `process.env` directly, so every
 *      variable stays validated in one place.
 *
 * A boundary a linter enforces survives staff turnover. One documented in a
 * README does not.
 */

const eslintConfig = [
  // eslint-config-next v16 ships flat configs; FlatCompat is for the legacy
  // eslintrc format and fails to load these.
  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    ignores: [
      "src/generated/**",
      ".next/**",
      "node_modules/**",
      "prisma/migrations/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
    ],
  },

  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
    },
  },

  {
    // ── Tenant isolation boundary ──
    files: ["src/app/(dashboard)/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db",
              importNames: ["db"],
              message:
                "Dashboard code must use forSeller(scope.sellerId) from @/lib/db-tenant so every query is tenant-scoped. Importing the unscoped client here defeats the isolation layer.",
            },
          ],
        },
      ],
    },
  },

  {
    // ── XSS boundary ──
    // Expressed as a syntax restriction rather than react/no-danger so it needs
    // no plugin registration and applies to every file, JSX or not.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            "dangerouslySetInnerHTML is banned. Seller-supplied content must be sanitised at WRITE time, not rendered raw. For JSON-LD, use the escaping serialiser in @/lib/seo/jsonld.",
        },
        {
          selector: "Property[key.name='dangerouslySetInnerHTML']",
          message:
            "dangerouslySetInnerHTML is banned. See @/lib/seo/jsonld for the only sanctioned exception.",
        },
      ],
    },
  },

  {
    // ── Environment boundary ──
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/env.ts", "src/env.client.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Read configuration from @/env (server) or @/env.client (edge/browser). Both validate at boot, so a missing variable fails the build instead of surfacing as undefined at runtime.",
        },
      ],
    },
  },

  {
    // Config files, seeds, developer scripts and tests legitimately read raw
    // environment and log — printing to the terminal is the whole point of a
    // CLI script.
    files: [
      "*.config.{ts,mts,mjs,js}",
      "prisma/**/*.ts",
      "scripts/**/*.{ts,mts,mjs,js}",
      "tests/**/*.ts",
    ],
    rules: {
      "no-restricted-properties": "off",
      "no-restricted-syntax": "off",
      "no-console": "off",
    },
  },

  {
    // ── The one sanctioned dangerouslySetInnerHTML ──
    // JSON-LD must be injected as raw text inside a <script> tag; there is no
    // other insertion point. Both halves of that exception are named here, and
    // ONLY the XSS rule is relaxed — these files get every other rule.
    //
    // The payload goes through serializeJsonLd(), which escapes <, > and & so a
    // seller's business name containing </script> cannot break out of the tag.
    files: ["src/lib/seo/jsonld.ts", "src/components/seo/JsonLd.tsx"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },

  // Must come last: turns off every stylistic rule Prettier owns.
  prettier,
];

export default eslintConfig;
