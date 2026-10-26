import type { Metadata } from 'next';
import { APP_URL, LOCALES } from '@/constants/config';

/** Public language variants resolve through middleware, independent of visitor cookies. */
export function languageAlternates(path: string): Metadata['alternates'] {
  const canonical = new URL(path, APP_URL).toString();
  return {
    canonical,
    languages: Object.fromEntries([
      ...LOCALES.map(locale => [locale, `${canonical}?lang=${locale}`]),
      ['x-default', `${canonical}?lang=en`],
    ]),
  };
}
