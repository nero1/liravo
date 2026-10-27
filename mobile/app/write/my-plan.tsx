import { View,Text,ScrollView,ActivityIndicator,Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery,useMutation,useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { QueryError } from '@/components/ui/EmptyState';
import type { WritingPlan } from '@/types';

export default function MyPlanScreen(){
  const qc=useQueryClient();
  const {data,isLoading,error,refetch}=useQuery({queryKey:['write','my-plan'],queryFn:()=>api.get<{plan:WritingPlan|null}>(ENDPOINTS.write.plan)});
  const generate=useMutation({mutationFn:()=>api.post(ENDPOINTS.write.plan,{}),onSuccess:()=>qc.invalidateQueries({queryKey:['write','my-plan']}),onError:error=>Alert.alert('Error',error.message)});
  if(error)return <QueryError error={error} retry={()=>void refetch()} />;
  if(isLoading)return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
    <ScrollView className="px-4" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}>
      <Text className="text-2xl font-bold text-foreground">Your Writing Plan</Text>
      {data?.plan?data.plan.tasks.map(task=><Card key={task.day}><Text className="font-semibold text-foreground mb-2">{task.day}</Text><Text className="text-foreground">{task.task}</Text><Text className="text-muted-foreground mt-2">Goal: {task.goal}</Text></Card>):<Text className="text-muted-foreground">Generate seven writing exercises for this week.</Text>}
      <Button onPress={()=>generate.mutate()} loading={generate.isPending}>{data?.plan?'Refresh':'Generate'}</Button>
    </ScrollView>
  </SafeAreaView>;
}
