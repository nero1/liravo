import { useMemo } from 'react';
import IntlMessageFormat from 'intl-messageformat';
import { useAuthStore } from '@/stores/auth';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import de from '../../messages/de.json';

const catalogs={en,fr,de};
export function useTranslations(namespace:string){
  const preference=useAuthStore(state=>state.user?.preferred_locale);
  const locale=preference==='fr'||preference==='de'?preference:'en';
  return useMemo(()=>{
    const messages=catalogs[locale] as unknown as Record<string,Record<string,string>>;
    const compiled=new Map<string,IntlMessageFormat>();
    return {locale,t:(key:string,values?:Record<string,string|number>)=>{
      const message=messages[namespace]?.[key];if(typeof message!=='string')return `${namespace}.${key}`;
      let formatter=compiled.get(key);
      if(!formatter){formatter=new IntlMessageFormat(message,locale);compiled.set(key,formatter);}
      return String(formatter.format(values));
    }};
  },[locale,namespace]);
}
