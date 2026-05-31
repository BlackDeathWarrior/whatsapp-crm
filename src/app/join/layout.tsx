// ============================================================
// /join/[token] layout — minimal full-bleed dark shell.
//
// The route group sits outside both `(auth)` and `(dashboard)`
// because it's hybrid: the page must render for anonymous
// visitors (to show "Sign up to join Acme") *and* for signed-in
// users (to show "Accept invite"). Reusing `(auth)`'s layout
// would funnel signed-in users through the middleware's auth-
// page redirect; reusing `(dashboard)` would funnel anonymous
// visitors through its login redirect. A dedicated layout
// avoids both.
//
// Styling matches the login / signup pages — centered card on a
// slate-950 background — so the join experience feels like a
// natural step in the auth funnel rather than a foreign page.
// ============================================================

import type { ReactNode } from 'react';

export default function JoinLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      {children}
    </div>
  );
}
