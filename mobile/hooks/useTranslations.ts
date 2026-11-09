import { useMemo } from 'react';
import {IntlMessageFormat} from 'intl-messageformat';
import { useAuthStore } from '@/stores/auth';
import {useLocales} from 'expo-localization';
import {usePreferences,supportedLocale} from '@/stores/preferences';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import de from '../../messages/de.json';

const catalogs={en,fr,de};
export function useTranslations(namespace:string){
  const preference=useAuthStore(state=>state.user?.preferred_locale);
  const saved=usePreferences(state=>state.locale),devices=useLocales();
  const device=devices.map(value=>value.languageCode).find(supportedLocale);
  const locale=supportedLocale(preference)?preference:saved??device??'en';
  return useMemo(()=>{
    const messages=catalogs[locale] as unknown;
    const compiled=new Map<string,IntlMessageFormat>();
    const lookup=(key:string)=>[namespace,key].filter(Boolean).join('.').split('.').reduce<unknown>((value,part)=>value&&typeof value==='object'?(value as Record<string,unknown>)[part]:undefined,messages);
    return {locale,has:(key:string)=>typeof lookup(key)==='string',t:(key:string,values?:Record<string,string|number>)=>{
      const message=lookup(key);if(typeof message!=='string')return `${namespace}.${key}`;
      let formatter=compiled.get(key);
      if(!formatter){formatter=new IntlMessageFormat(message,locale);compiled.set(key,formatter);}
      return String(formatter.format(values));
    }};
  },[locale,namespace]);
}
