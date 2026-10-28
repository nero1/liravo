import {useState,useRef,useEffect} from 'react';
import {View,Text,TouchableOpacity,Alert} from 'react-native';
import {useTranslations} from '@/hooks/useTranslations';
import {usePreferences,type Locale} from '@/stores/preferences';
import {useAuthStore} from '@/stores/auth';
import {api} from '@/lib/api';

export function LocaleSwitcher(){
  const {t,locale}=useTranslations('navigation'),{t:common}=useTranslations('common'),setLocale=usePreferences(state=>state.setLocale);
  const [pending,setPending]=useState(false),busy=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  async function change(next:Locale){
    if(busy.current||next===locale)return;
    busy.current=true;setPending(true);
    const started=useAuthStore.getState(),actor=started.user?.id;
    try{
      if(actor){
        const result=await api.put<{success:boolean;locale:Locale}>('/api/users/locale',{locale:next});
        if(!result.success||result.locale!==next)throw new Error('Invalid locale acknowledgement');
        const current=useAuthStore.getState();
        if(current.user?.id!==actor||current.token!==started.token)return;
        current.setUser({...current.user,preferred_locale:next});
        await setLocale(next).catch(()=>{});return;
      }else if(useAuthStore.getState().user)return;
      await setLocale(next);
    }catch{if(mounted.current)Alert.alert(common('error'),t('languageFailed'));}
    finally{busy.current=false;if(mounted.current)setPending(false);}
  }
  return <View className="px-4 py-3 gap-2">
    <Text className="text-sm text-muted-foreground">{t('language')}</Text>
    <View className="flex-row gap-2">{(['en','fr','de'] as const).map(value=><TouchableOpacity key={value} accessibilityRole="radio" accessibilityState={{selected:locale===value,disabled:pending}} accessibilityLabel={t('languageName.'+value)} disabled={pending} onPress={()=>void change(value)} className={'rounded-lg border px-3 py-2 '+(locale===value?'border-accent bg-accent/10':'border-border')}>
      <Text className="text-foreground">{t('languageName.'+value)}</Text>
    </TouchableOpacity>)}</View>
  </View>;
}
