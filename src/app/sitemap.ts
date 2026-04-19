import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo/site-config'

/**
 * Sitemap served at /sitemap.xml. Only lists public, indexable pages
 * — auth pages are explicitly noindex, and every route under /app is
 * gated. The landing anchors (#features, #how-it-works, #faq) don't
 * belong here; fragments aren't a sitemap concept.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
  ]
}
