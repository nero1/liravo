import {useTranslations} from '@/hooks/useTranslations';
import {View,Text,ScrollView,ActivityIndicator,Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {useRouter} from 'expo-router';
import {api,ApiError} from '@/lib/api';
import {ENDPOINTS} from '@/constants/api';
import {useAuthStore} from '@/stores/auth';
import {Card} from '@/components/ui/Card';
import {Badge} from '@/components/ui/Badge';
import {Button} from '@/components/ui/Button';
import {QueryError} from '@/components/ui/EmptyState';
import type {TasteProfile} from '@/types';

export default function TasteProfileScreen(){
  const {t,has,locale}=useTranslations('aiProfiles'),moods=useTranslations('moods'),common=useTranslations('common');
  const owner=useAuthStore(state=>state.user?.id),qc=useQueryClient(),router=useRouter(),queryKey=['taste-profile',owner,locale];
  const {data,isLoading,error,refetch}=useQuery({queryKey,enabled:!!owner,queryFn:({signal})=>api.get<{profile:TasteProfile|null;eligible:boolean;generatedAt:string|null}>(ENDPOINTS.tasteProfile,undefined,signal)});
  const generate=useMutation({mutationFn:()=>api.post(ENDPOINTS.tasteProfile,{}),onSuccess:()=>{if(useAuthStore.getState().user?.id===owner)void qc.invalidateQueries({queryKey});},onError:error=>{if(useAuthStore.getState().user?.id===owner)Alert.alert(common.t('error'),t(error instanceof ApiError&&['premiumRequired','insufficientHistory','busy','changed'].includes(error.code??'')?error.code!:'unavailable'));}});
  if(error instanceof ApiError&&error.code==='premiumRequired')return <SafeAreaView className="flex-1 bg-background p-4 gap-4" edges={['bottom']}><Text className="text-foreground">{t('premiumRequired')}</Text><Button onPress={()=>router.push('/premium')}>{t('premium')}</Button></SafeAreaView>;
  if(error)return <QueryError error={error} retry={()=>void refetch()} />;
  if(isLoading)return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator accessibilityLabel={common.t('loading')} color="#d97706" /></View>;
  const profile=data?.profile;
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
    <ScrollView className="px-4" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}>
      <Text className="text-2xl font-bold text-foreground">{t('tasteTitle')}</Text>
      {profile?<>
        <Card><Text className="text-foreground leading-relaxed">{profile.summary}</Text></Card>
        {profile.top_genres.length>0&&<Card><Text className="font-semibold text-foreground mb-3">{t('genres')}</Text><View className="flex-row flex-wrap gap-2">{profile.top_genres.map(genre=><Badge key={genre} variant="accent">{has('genreLabels.'+genre)?t('genreLabels.'+genre):genre}</Badge>)}</View></Card>}
        {profile.mood_preferences.length>0&&<Card><Text className="font-semibold text-foreground mb-3">{t('moods')}</Text><View className="flex-row flex-wrap gap-2">{profile.mood_preferences.map(mood=><Badge key={mood}>{moods.has(mood)?moods.t(mood):mood}</Badge>)}</View></Card>}
        {data.generatedAt&&<Text className="text-xs text-muted-foreground">{t('generated',{date:new Intl.DateTimeFormat(locale,{dateStyle:'long',timeZone:'UTC'}).format(new Date(data.generatedAt))})}</Text>}
      </>:<Text className="text-muted-foreground">{t(data?.eligible?'noTaste':'insufficientHistory')}</Text>}
      <Button onPress={()=>generate.mutate()} loading={generate.isPending} disabled={!data?.eligible}>{t(profile?'refresh':'generate')}</Button>
    </ScrollView>
  </SafeAreaView>;
}
