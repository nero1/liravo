import {useEffect,useRef,useState} from 'react';
import {Modal,View,Text,ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';
import {randomUUID} from 'expo-crypto';
import {API_BASE} from '@/constants/api';
import {useTranslations} from '@/hooks/useTranslations';
import {Button} from '@/components/ui/Button';

export function HCaptchaChallenge({visible,onProof,onClose}:{visible:boolean;onProof:(token:string)=>void;onClose:()=>void}){
  const {t,locale}=useTranslations('auth'),[nonce,setNonce]=useState<string|null>(null),[failed,setFailed]=useState(false),current=useRef<string|null>(null);
  useEffect(()=>{setFailed(false);if(visible){try{const value=randomUUID();current.current=value;setNonce(value);}catch{setFailed(true);}}else{current.current=null;setNonce(null);}return()=>{current.current=null;};},[visible]);
  const base=new URL(API_BASE),url=new URL('/auth/captcha',base);url.searchParams.set('lang',locale);if(nonce)url.hash=new URLSearchParams({nonce}).toString();
  function close(){current.current=null;onClose();}
  function fail(){current.current=null;setFailed(true);}
  function allowed(value:string){
    if(value==='about:blank')return true;
    try{const target=new URL(value);return target.origin===base.origin&&target.pathname==='/auth/captcha'||target.protocol==='https:'&&(target.hostname==='hcaptcha.com'||target.hostname.endsWith('.hcaptcha.com'));}catch{return false;}
  }
  return <Modal visible={visible} onRequestClose={close} animationType="slide"><SafeAreaView className="flex-1 bg-background"><View className="px-4 py-3 gap-3"><Text className="text-lg font-semibold text-foreground">{t('captchaTitle')}</Text><Button variant="secondary" onPress={close}>{t('captchaClose')}</Button>{failed&&<Text accessibilityLiveRegion="polite" className="text-destructive">{t('captchaUnavailable')}</Text>}</View>
    {visible&&nonce&&!failed?<WebView key={nonce} source={{uri:url.toString()}} originWhitelist={['https://*','http://*','about:blank']} onShouldStartLoadWithRequest={request=>allowed(request.url)} javaScriptEnabled domStorageEnabled setSupportMultipleWindows={false} onError={fail} onHttpError={fail} onMessage={event=>{
      if(!current.current||event.nativeEvent.data.length>10000)return;
      try{const source=new URL(event.nativeEvent.url),proof=JSON.parse(event.nativeEvent.data);if(source.origin!==base.origin||source.pathname!=='/auth/captcha'||proof.nonce!==current.current||typeof proof.token!=='string'||proof.token.length<1||proof.token.length>8192)return;current.current=null;onProof(proof.token);}catch{}
    }}/>:!failed?<ActivityIndicator accessibilityLabel={t('captchaLoading')}/>:null}
  </SafeAreaView></Modal>;
}
