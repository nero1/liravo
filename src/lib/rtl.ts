export const RTL_LOCALES = ['ar', 'he', 'fa'] as const;
export type RTLLocale = typeof RTL_LOCALES[number];

export function isRTL(locale: string): boolean {
  return RTL_LOCALES.includes(locale as RTLLocale);
}

export function getDirection(locale: string): 'ltr' | 'rtl' {
  return isRTL(locale) ? 'rtl' : 'ltr';
}
