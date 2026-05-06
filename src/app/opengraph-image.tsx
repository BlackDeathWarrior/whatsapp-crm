import { ImageResponse } from 'next/og'
import { SITE_NAME, SITE_TAGLINE } from '@/lib/seo/site-config'

/**
 * Auto-generated OG image served at /opengraph-image.
 * Next renders this JSX to a PNG at build time, caches it, and wires
 * the URL into the default `<meta property="og:image">` for every
 * page that inherits the root metadata.
 *
 * Facebook / LinkedIn / Slack / Twitter all fetch this when the link
 * is shared, so keep it readable at thumbnail sizes (no tiny text,
 * high contrast).
 */

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  // Satori (the renderer behind next/og) is strict about two things
  // that the first version of this file violated at BUILD time —
  // which meant `next build` failed on /opengraph-image during
  // static generation and the whole production build blew up.
  //
  //   1. Every <div> with more than one child must explicitly declare
  //      display: flex / contents / none.
  //   2. Any Unicode glyph outside the default font's coverage fails
  //      with "Failed to download dynamic font". ✓ was the worst
  //      offender — replaced below with plain text dot separators.
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          background:
            'linear-gradient(135deg, #020617 0%, #0f172a 55%, #2e1065 100%)',
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              background: '#7c3aed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            W
          </div>
          <div style={{ display: 'flex', fontSize: 36, fontWeight: 700, letterSpacing: -0.5 }}>
            {SITE_NAME}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            marginTop: 60,
            fontSize: 84,
            fontWeight: 800,
            lineHeight: 1.02,
            letterSpacing: -2,
            maxWidth: 1000,
          }}
        >
          <span>Run your WhatsApp® business from&nbsp;</span>
          <span style={{ color: '#a78bfa' }}>one inbox.</span>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 28,
            fontSize: 28,
            color: '#94a3b8',
            maxWidth: 900,
            lineHeight: 1.3,
          }}
        >
          Shared inbox, sales pipelines, broadcasts, and no-code automations — built on the official WhatsApp Business API.
        </div>

        <div
          style={{
            marginTop: 56,
            display: 'flex',
            gap: 24,
            fontSize: 22,
            color: '#cbd5e1',
          }}
        >
          <span>Shared inbox</span>
          <span>·</span>
          <span>Automations</span>
          <span>·</span>
          <span>Pipelines</span>
          <span>·</span>
          <span>Analytics</span>
        </div>
      </div>
    ),
    size,
  )
}
