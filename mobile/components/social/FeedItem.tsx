import {useState} from 'react';
import {View,Text,TouchableOpacity} from 'react-native';
import {Image} from 'expo-image';
import {useRouter} from 'expo-router';
import {Avatar} from '@/components/ui/Avatar';
import {StarRating} from '@/components/books/StarRating';
import {ReviewWantToReadButton} from '@/components/books/ReviewWantToReadButton';
import {useTranslations} from '@/hooks/useTranslations';
import type {FeedItem as Item} from '@/types';

export function FeedItem({item}:{item:Item}){
  const router=useRouter(),{t,locale}=useTranslations('feed'),[spoilers,setSpoilers]=useState(false);
  const action=t(item.type==='review'?'reviewed':item.finishedAt?'finished':item.shelf.default_type==='currently_reading'?'started':item.shelf.default_type==='want_to_read'?'wants':'shelved',{shelf:item.type==='shelf_book'?item.shelf.name:''});
  return <View className="bg-card border border-border rounded-xl p-4 gap-3"><View className="flex-row items-center gap-2"><TouchableOpacity accessibilityRole="link" accessibilityLabel={item.user.display_name??item.user.username} onPress={()=>router.push(`/user/${item.user.username}`)}><Avatar uri={item.user.avatar_url} name={item.user.display_name??item.user.username} size={36}/></TouchableOpacity><View className="flex-1"><Text className="text-foreground"><Text className="font-semibold">{item.user.display_name??item.user.username}</Text>{' '}{action}</Text><Text className="text-xs text-muted-foreground">{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(item.timestamp))}</Text></View></View>
    <TouchableOpacity accessibilityRole="link" onPress={()=>router.push(`/book/${item.book.id}`)} className="flex-row gap-3">{item.book.cover_url&&<Image source={{uri:item.book.cover_url}} style={{width:48,height:72,borderRadius:4}} contentFit="cover"/>}<View className="flex-1 justify-center gap-1"><Text className="font-semibold text-foreground" numberOfLines={2}>{item.book.title}</Text><Text className="text-sm text-muted-foreground">{item.book.author_name}</Text></View></TouchableOpacity>
    {item.type==='review'&&<View className="gap-2"><StarRating value={item.rating} size={16} readonly/>{item.hasSpoilers&&!spoilers?<TouchableOpacity accessibilityRole="button" accessibilityState={{expanded:false}} onPress={()=>setSpoilers(true)}><Text className="text-accent">{t('spoilers')}</Text></TouchableOpacity>:item.excerpt&&<Text className="text-sm text-foreground" numberOfLines={4}>{item.excerpt}</Text>}<ReviewWantToReadButton bookId={item.book.id} reviewId={item.reviewId} initialSelected={item.wantToRead}/></View>}
  </View>;
}
