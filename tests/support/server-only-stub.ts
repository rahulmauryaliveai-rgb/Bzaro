/**
 * Stands in for the `server-only` package under Vitest.
 *
 * `server-only` throws on import outside a Server Component, which would leave
 * every server module untestable — including the ones most worth testing, like
 * upload verification and tenant scoping. The real package ships an identical
 * empty module for the `react-server` condition; this is the same thing, mapped
 * in `vitest.config.mts`, because that file is not reachable through the
 * package's own exports map.
 *
 * It changes nothing about the application build: Next.js still resolves the
 * real package, so an accidental import of a server module from client code is
 * still caught there.
 */
export {};
