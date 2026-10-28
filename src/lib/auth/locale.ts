import {LOCALES} from '@/constants/config';
export function accountLocale(request:Request){
  const preferences=[request.headers.get('x-liravo-preferred-locale'),request.headers.get('x-liravo-locale')];
  return preferences.find((value):value is typeof LOCALES[number]=>LOCALES.some(locale=>locale===value))??'en';
}
