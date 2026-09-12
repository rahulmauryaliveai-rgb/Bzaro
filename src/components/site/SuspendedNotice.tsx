/**
 * Shown when a tenant is suspended or banned.
 *
 * Renders a complete document — `<html>` and `<body>` included — because the
 * microsite layout IS the root layout for this segment, and it is the thing
 * that called `forbidden()`. There is no parent layout left to wrap this.
 *
 * Deliberately plain: it must not look like the seller's own site, must not
 * imply the business no longer exists, and must not confirm which business the
 * subdomain belongs to.
 */
export function SuspendedNotice() {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-white text-neutral-900">
        <main className="mx-auto flex max-w-lg flex-1 flex-col justify-center px-4 py-24 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">This site is unavailable</h1>
          <p className="mt-3 text-neutral-600">This website is temporarily unavailable.</p>
          <p className="mt-6 text-sm text-neutral-500">
            If this is your business, sign in to your dashboard for details.
          </p>
        </main>
      </body>
    </html>
  );
}
