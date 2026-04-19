import {
  absoluteUrl,
  ORG_INFO,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from './site-config'
import { FAQ_ITEMS } from './faq-data'

/**
 * Builders for the JSON-LD blobs we inject on the landing page. Each
 * returns a plain object — the consumer wraps it in <script
 * type="application/ld+json">. Keeping them typed as `Record<string,
 * unknown>` so schema.org shapes don't leak into the rest of the app.
 */
type Ld = Record<string, unknown>

/** Generic site-level node. Helps search engines map the domain. */
export function websiteLd(): Ld {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: 'en',
  }
}

/** Publisher / brand. Paired with the WebSite node. */
export function organizationLd(): Ld {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: ORG_INFO.name,
    legalName: ORG_INFO.legalName,
    url: ORG_INFO.url,
    logo: ORG_INFO.logo,
  }
}

/**
 * Core product node. SoftwareApplication is the recommended type for
 * web-based SaaS in Google's Rich Results guidelines. The free-tier
 * `offers` block enables a "Free" badge in SERPs where eligible.
 */
export function softwareApplicationLd(): Ld {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
    featureList: [
      'Shared WhatsApp inbox',
      'Contact management with tags and custom fields',
      'Sales pipelines with kanban board',
      'Broadcast campaigns via approved WhatsApp templates',
      'No-code workflow automations',
      'Real-time analytics dashboard',
    ],
  }
}

/**
 * FAQPage — eligible for the FAQ rich result on Google.
 * We build this from the same source the UI renders, so answers
 * in SERP match answers on the page.
 */
export function faqPageLd(): Ld {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  }
}

/**
 * Convenience: an array of the nodes we want on the landing page.
 * The consumer component iterates and emits one <script> per node
 * (Google prefers one schema per script tag).
 */
export function landingPageLd(): Ld[] {
  return [
    websiteLd(),
    organizationLd(),
    softwareApplicationLd(),
    faqPageLd(),
  ]
}

// Kept exported for discoverability; unused by runtime code but handy
// for anyone building additional pages that need an absolute URL in
// their JSON-LD.
export { absoluteUrl }
