import { createServerClient } from '@supabase/ssr'
import createIntlMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { routing } from '@/i18n/routing'

const intlMiddleware = createIntlMiddleware(routing)

// Strip the leading /<locale> segment so the auth path checks below
// stay locale-agnostic. Returns ["en", "/dashboard"] for "/en/dashboard".
function splitLocale(pathname: string): [string | null, string] {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return [locale, '/']
    if (pathname.startsWith(`/${locale}/`)) {
      return [locale, pathname.slice(locale.length + 1)]
    }
  }
  return [null, pathname]
}

// Copy any cookies the intl middleware set (e.g. NEXT_LOCALE for
// sticky locale preference) onto the response we hand back, so its
// side-effects survive when auth needs to issue its own response.
function carryIntlCookies(intl: NextResponse, target: NextResponse) {
  for (const cookie of intl.cookies.getAll()) {
    target.cookies.set(cookie)
  }
}

export async function middleware(request: NextRequest) {
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/')

  // 1. Let next-intl handle locale routing (page routes only — API
  //    routes don't live under [locale] and would be wrongly prefixed).
  //    If next-intl redirects (missing locale), return immediately;
  //    the redirected URL re-enters middleware with the prefix in place.
  //
  //    The intlMiddleware call is wrapped because an unhandled throw
  //    here would cascade to a 503 in front of every page — we'd
  //    rather degrade to "no locale routing applied for this request"
  //    than take the whole site down. Errors are logged so they show
  //    up in Hostinger's process logs without being swallowed silently.
  let intlResponse: NextResponse | null = null
  if (!isApiRoute) {
    try {
      intlResponse = intlMiddleware(request)
      if (intlResponse.headers.get('location')) {
        return intlResponse
      }
    } catch (err) {
      console.error('[middleware] intl middleware threw, falling through to auth-only:', err)
      intlResponse = null
    }
  }

  // 2. Run Supabase auth against the locale-stripped pathname so the
  //    `/login`, `/dashboard`, etc. checks below don't have to know
  //    about every locale.
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const [locale, unprefixed] = splitLocale(request.nextUrl.pathname)
  const activeLocale = locale ?? routing.defaultLocale

  // Auth pages — bounce signed-in users to the dashboard, or to the
  // invite hand-off if they arrived via an invite link.
  if (
    user &&
    (unprefixed === '/login' ||
      unprefixed === '/signup' ||
      unprefixed === '/forgot-password')
  ) {
    const url = request.nextUrl.clone()
    const inviteToken = request.nextUrl.searchParams.get('invite')
    if (
      inviteToken &&
      (unprefixed === '/login' || unprefixed === '/signup')
    ) {
      url.pathname = `/${activeLocale}/join/${encodeURIComponent(inviteToken)}`
      url.search = ''
    } else {
      url.pathname = `/${activeLocale}/dashboard`
      url.search = ''
    }
    const redirectResponse = NextResponse.redirect(url)
    if (intlResponse) carryIntlCookies(intlResponse, redirectResponse)
    return redirectResponse
  }

  // Protected pages — bounce signed-out users to login.
  const protectedPaths = [
    '/dashboard',
    '/inbox',
    '/contacts',
    '/pipelines',
    '/broadcasts',
    '/automations',
    '/flows',
    '/settings',
  ]
  if (!user && protectedPaths.some(path => unprefixed.startsWith(path))) {
    const url = request.nextUrl.clone()
    url.pathname = `/${activeLocale}/login`
    const redirectResponse = NextResponse.redirect(url)
    if (intlResponse) carryIntlCookies(intlResponse, redirectResponse)
    return redirectResponse
  }

  // API routes that need auth (not webhooks).
  if (
    !user &&
    request.nextUrl.pathname.startsWith('/api/whatsapp/') &&
    !request.nextUrl.pathname.includes('/webhook')
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (intlResponse) carryIntlCookies(intlResponse, supabaseResponse)
  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
