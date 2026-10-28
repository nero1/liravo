import {useRef,useState} from 'react';
import {View,Text,TouchableOpacity,Alert} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import {ShoppingCart} from 'lucide-react-native';
import {useTrackAffiliateClick} from '@/hooks/useBooks';
import {useTranslations} from '@/hooks/useTranslations';
import type {AffiliateLink,BookRow} from '@/types';

export function AffiliateLinkButtons({book,links}:{book:BookRow;links:AffiliateLink[]}){
  const trackClick=useTrackAffiliateClick(),{t}=useTranslations('books'),common=useTranslations('common'),busy=useRef(false),[opening,setOpening]=useState(false);
  async function openLink(link:AffiliateLink){
    if(busy.current)return;busy.current=true;setOpening(true);
    try{
      const url=new URL(link.url);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Invalid store URL');
      void trackClick.mutateAsync({bookId:book.id,linkId:link.linkId}).catch(()=>{});
      await WebBrowser.openBrowserAsync(url.toString());
    }catch{Alert.alert(common.t('error'),t('openLinkFailed'));}finally{busy.current=false;setOpening(false);}
  }
  if(!links.length)return null;
  return <View className="gap-3"><Text className="font-semibold text-foreground">{t('getBook')}</Text><View className="flex-row flex-wrap gap-2">{links.map(link=><TouchableOpacity key={link.linkId} accessibilityRole="link" accessibilityState={{disabled:opening,busy:opening}} disabled={opening} onPress={()=>void openLink(link)} className="bg-accent rounded-lg px-3 py-2 flex-row items-center gap-1.5"><ShoppingCart size={14} color="#fff"/><Text className="text-accent-foreground text-sm font-medium">{link.name}</Text></TouchableOpacity>)}</View>{links.some(link=>link.isAffiliate)&&<Text className="text-xs text-muted-foreground">{t('affiliateDisclosure')}</Text>}</View>;
}
