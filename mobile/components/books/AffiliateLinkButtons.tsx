import { View, Text, TouchableOpacity, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { ShoppingCart } from 'lucide-react-native';
import { useTrackAffiliateClick } from '@/hooks/useBooks';
import type { AffiliateLink,BookRow } from '@/types';

export function AffiliateLinkButtons({book,links}:{book:BookRow;links:AffiliateLink[]}){
  const trackClick=useTrackAffiliateClick();
  async function openLink(link:AffiliateLink){
    try{
      trackClick.mutate({bookId:book.id,linkType:'book',storeName:link.name,isAffiliate:link.isAffiliate});
      await WebBrowser.openBrowserAsync(link.url);
    }catch(error){Alert.alert('Error',error instanceof Error?error.message:'Unable to open link');}
  }
  return <View className="gap-3">
    <Text className="font-semibold text-foreground">Buy this book</Text>
    <View className="flex-row flex-wrap gap-2">{links.map(link=><TouchableOpacity key={link.name} accessibilityRole="link" onPress={()=>openLink(link)} className="bg-accent rounded-lg px-3 py-2 flex-row items-center gap-1.5">
      <ShoppingCart size={14} color="#fff" /><Text className="text-accent-foreground text-sm font-medium">{link.name}</Text>
    </TouchableOpacity>)}</View>
    {links.some(link=>link.isAffiliate)&&<Text className="text-xs text-muted-foreground">Liravo may earn a commission from qualifying purchases.</Text>}
  </View>;
}
