import {create} from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Locale='en'|'fr'|'de';
export const supportedLocale=(value:unknown):value is Locale=>value==='en'||value==='fr'||value==='de';
const key='liravo_locale';
let revision=0,persistence=Promise.resolve();
let storedLocale:Locale|null=null;
let hydration:Promise<void>|null=null;
interface Preferences {
  locale:Locale|null;
  hydrated:boolean;
  hydrate:()=>Promise<void>;
  setLocale:(locale:Locale)=>Promise<void>;
}
export const usePreferences=create<Preferences>((set,get)=>({
  locale:null,hydrated:false,
  hydrate:()=>{
    if(get().hydrated)return Promise.resolve();
    if(hydration)return hydration;
    const started=revision;
    hydration=AsyncStorage.getItem(key).then(value=>{if(started===revision){storedLocale=supportedLocale(value)?value:null;set({locale:storedLocale});}}).catch(()=>{}).finally(()=>{set({hydrated:true});hydration=null;});
    return hydration;
  },
  setLocale:async(locale)=>{
    const started=++revision,previous=get().locale;
    if(get().hydrated&&previous===locale)return;
    set({locale,hydrated:true});
    persistence=persistence.catch(()=>{}).then(async()=>{await AsyncStorage.setItem(key,locale);storedLocale=locale;});
    try{await persistence;}catch(error){if(started===revision)set({locale:storedLocale});throw error;}
  },
}));
