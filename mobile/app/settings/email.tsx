import {View,Text} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useEffect,useRef,useState} from 'react';
import {api} from '@/lib/api';
import {useAuthStore} from '@/stores/auth';
import {useTranslations} from '@/hooks/useTranslations';
import {Input} from '@/components/ui/Input';
import {Button} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';

export default function EmailSettingsScreen(){
  const {user}=useAuthStore(),{t}=useTranslations('emailSecurity');
  const [email,setEmail]=useState(user?.email??''),[pin,setPin]=useState(''),[configured,setConfigured]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState<'sent'|'failed'|null>(null),actor=useRef(user?.id);actor.current=user?.id;
  useEffect(()=>{let active=true;setEmail(user?.email??'');setPin('');setConfigured(null);setMessage(null);setBusy(false);api.get<{configured:boolean}>('/api/auth/pin').then(data=>{if(active&&typeof data.configured==='boolean')setConfigured(data.configured);}).catch(()=>{if(active)setMessage('failed');});return()=>{active=false;};},[user?.id,user?.email]);
  async function send(){
    if(busy||configured===null||!user)return;const owner=user.id;setBusy(true);setMessage(null);
    try{const data=await api.post<{ok:boolean}>('/api/users/send-verification',{email:email.trim().toLowerCase(),...(configured?{pin}:{})},{'X-Liravo-Actor':owner});if(!data.ok)throw new Error('Email unavailable');if(actor.current===owner){setPin('');setMessage('sent');}}
    catch{if(actor.current===owner)setMessage('failed');}finally{if(actor.current===owner)setBusy(false);}
  }
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><View className="px-4 py-4 gap-4"><Card><Text className="font-semibold text-foreground mb-2">{t('title')}</Text><Text className="text-sm text-muted-foreground mb-3">{t('description')}</Text>
    {email===user?.email&&<Text className="text-sm text-muted-foreground mb-3">{t(user?.email_verified?'verified':'unverified')}</Text>}
    <Input label={t('email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={254} editable={!busy}/>
    {configured&&<><Input label={t('pin')} value={pin} onChangeText={value=>setPin(value.replace(/\D/g,'').slice(0,4))} secureTextEntry keyboardType="number-pad" maxLength={4} editable={!busy}/><Text className="text-xs text-muted-foreground">{t('pinHint')}</Text></>}
    {message&&<Text accessibilityLiveRegion="polite" className="text-sm text-foreground my-2">{t(message)}</Text>}
    <Button onPress={send} loading={busy} disabled={configured===null||!email.trim()||!!configured&&pin.length!==4} style={{marginTop:12}}>{t('send')}</Button>
  </Card></View></SafeAreaView>;
}
