import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALES } from '@/constants/config';

export const locales = LOCALES;
export type Locale = typeof locales[number];
export const defaultLocale: Locale = 'en';

export default getRequestConfig(async ({locale:override}) => {
  const preferred = override ?? (await headers()).get('x-liravo-locale') ?? (await cookies()).get('NEXT_LOCALE')?.value;
  const locale = locales.includes(preferred as Locale) ? preferred as Locale : defaultLocale;
  return {
    locale,
    timeZone:'UTC',
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
