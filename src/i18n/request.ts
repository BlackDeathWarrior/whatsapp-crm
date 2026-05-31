import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing, type Locale } from './routing';

// Static import map. Template-literal dynamic imports (e.g.
// `import(\`../../messages/\${locale}.json\`)`) can confuse Next.js's
// file tracer in some build environments — the JSONs may be missing
// from the production artifact even though they resolve in `next dev`
// and `next start` locally. Naming each path explicitly forces every
// supported locale's message file into the bundle.
const LOADERS: Record<Locale, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => import('../../messages/en.json'),
  es: () => import('../../messages/es.json'),
  lt: () => import('../../messages/lt.json'),
};

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  // Fall back to English if the requested locale's bundle is missing
  // at runtime. A missing locale should display English content rather
  // than 503 the whole render path.
  let messages: Record<string, unknown>;
  try {
    messages = (await LOADERS[locale]()).default;
  } catch (err) {
    console.error(`[i18n] failed to load messages for locale "${locale}", falling back to en:`, err);
    messages = (await LOADERS[routing.defaultLocale]()).default;
  }

  return {
    locale,
    messages,
  };
});
