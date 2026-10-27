import { View,Text,FlatList,Switch,Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery,useMutation,useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { EmptyState,QueryError } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
interface Promotion {id:string;is_active:boolean;end_date:string|null;book:{title:string}|null;}
export default function PromotedListingsScreen(){
  const qc=useQueryClient();
  const {data,isLoading,error,refetch}=useQuery({queryKey:['admin','promoted-listings'],queryFn:()=>api.get<{listings:Promotion[]}>(ENDPOINTS.admin.promotedListings)});
  const change=useMutation({mutationFn:(body:{id:string;is_active:boolean})=>api.patch(ENDPOINTS.admin.promotedListings,body),onSuccess:()=>qc.invalidateQueries({queryKey:['admin','promoted-listings']}),onError:error=>Alert.alert('Error',error.message)});
  if(error)return <QueryError error={error} retry={()=>void refetch()} />;
  if(isLoading)return <LoadingSpinner />;
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
    <FlatList data={data?.listings??[]} keyExtractor={listing=>listing.id} renderItem={({item})=><View className="px-4 py-4 border-b border-border flex-row items-center gap-3">
      <View className="flex-1"><Text className="font-semibold text-foreground">{item.book?.title}</Text><Text className="text-sm text-muted-foreground">Until {item.end_date?new Date(item.end_date).toLocaleDateString():'ongoing'}</Text></View>
      <Switch value={item.is_active} disabled={change.isPending} accessibilityLabel={`Activate ${item.book?.title??'promotion'}`} onValueChange={is_active=>change.mutate({id:item.id,is_active})} />
    </View>} ListEmptyComponent={<EmptyState title="No promoted listings" />} contentContainerStyle={{paddingBottom:24}} />
  </SafeAreaView>;
}
