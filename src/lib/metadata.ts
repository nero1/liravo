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

export function jsonForHtml(value:unknown):string{
  return (JSON.stringify(value)??'null').replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
}
