import {useTranslations} from '@/hooks/useTranslations';
import { View,Text,ScrollView,ActivityIndicator,Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery,useMutation,useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { QueryError } from '@/components/ui/EmptyState';
import type { TasteProfile } from '@/types';

export default function TasteProfileScreen(){
  const {t:ui}=useTranslations('');
  const qc=useQueryClient();
  const {data,isLoading,error,refetch}=useQuery({queryKey:['taste-profile'],queryFn:()=>api.get<{profile:TasteProfile|null;eligible:boolean}>(ENDPOINTS.tasteProfile)});
  const generate=useMutation({mutationFn:()=>api.post(ENDPOINTS.tasteProfile,{}),onSuccess:()=>qc.invalidateQueries({queryKey:['taste-profile']}),onError:error=>Alert.alert('Error',error.message)});
  if(error)return <QueryError error={error} retry={()=>void refetch()} />;
  if(isLoading)return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  const profile=data?.profile;
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
    <ScrollView className="px-4" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}>
      <Text className="text-2xl font-bold text-foreground">{ui('aiProfiles.tasteTitle')}</Text>
      {profile?<>
        <Card><Text className="text-foreground leading-relaxed">{profile.summary}</Text></Card>
        {profile.top_genres.length>0&&<Card><Text className="font-semibold text-foreground mb-3">{ui('aiProfiles.genres')}</Text><View className="flex-row flex-wrap gap-2">{profile.top_genres.map(genre=><Badge key={genre} variant="accent">{genre}</Badge>)}</View></Card>}
        {profile.mood_preferences.length>0&&<Card><Text className="font-semibold text-foreground mb-3">{ui('aiProfiles.moods')}</Text><View className="flex-row flex-wrap gap-2">{profile.mood_preferences.map(mood=><Badge key={mood}>{mood}</Badge>)}</View></Card>}
      </>:<Text className="text-muted-foreground">{data?.eligible?'Generate a profile from your recent reading.':'Finish at least three books to generate your taste profile.'}</Text>}
      <Button onPress={()=>generate.mutate()} loading={generate.isPending} disabled={!data?.eligible}>{profile?'Refresh':'Generate'}</Button>
    </ScrollView>
  </SafeAreaView>;
}
