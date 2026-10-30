import {useEffect,useState} from 'react';
import {View,Text,Alert} from 'react-native';
import {useRouter} from 'expo-router';
import {api} from '@/lib/api';
import {useAuthStore} from '@/stores/auth';
import {useTranslations} from '@/hooks/useTranslations';
import {Button} from '@/components/ui/Button';
import {SelectedEdition} from '@/components/books/SelectedEdition';
import type {ReadingDebate,DebateVoteReceipt} from '@/types';
export function DebateCard({initial,owner,detail=false}:{initial:ReadingDebate;owner:string|undefined;detail?:boolean}){
  const {t}=useTranslations('bookDebates'),{t:common}=useTranslations('common'),router=useRouter(),[debate,setDebate]=useState(initial),[saving,setSaving]=useState(false);useEffect(()=>setDebate(initial),[initial]);
  async function vote(value:'yes'|'no'){if(saving||!debate.can_vote||!owner)return;setSaving(true);try{const data=await api.post<DebateVoteReceipt>('/api/debates/'+debate.id+'/vote',{vote:value},{'X-Liravo-Actor':owner});if(data.actorId!==owner||data.debateId!==debate.id||data.vote!==value||data.success!==true)throw Error('Invalid debate receipt');if(useAuthStore.getState().user?.id===owner)setDebate(previous=>({...previous,current_vote:value,can_vote:false,...(typeof data.yes_count==='number'&&typeof data.no_count==='number'?{yes_count:data.yes_count,no_count:data.no_count}:{})}));}catch{try{const data=await api.get<{debate:ReadingDebate;actorId:string}>('/api/debates/'+debate.id);if(data.actorId===owner&&data.debate?.id===debate.id&&data.debate.current_vote===value){if(useAuthStore.getState().user?.id===owner)setDebate(data.debate);return;}}catch{}Alert.alert(common('error'),t('voteFailed'));}finally{setSaving(false);}}
  return <View className="rounded-xl border border-border p-4 gap-3"><Text accessibilityRole="header" className="text-lg font-semibold text-foreground">{debate.question}</Text><SelectedEdition book={debate.book}/><Text className="text-sm text-muted-foreground">{t('votes',{count:debate.yes_count+debate.no_count})}</Text><View className="flex-row gap-3"><Button disabled={saving||!debate.can_vote} accessibilityState={{selected:debate.current_vote==='yes'}} onPress={()=>void vote('yes')}>{t('yesCount',{count:debate.yes_count})}</Button><Button variant="outline" disabled={saving||!debate.can_vote} accessibilityState={{selected:debate.current_vote==='no'}} onPress={()=>void vote('no')}>{t('noCount',{count:debate.no_count})}</Button></View>{debate.current_vote&&<Text className="text-sm text-accent">{t('voted',{choice:t(debate.current_vote)})}</Text>}{!debate.is_active&&<Text className="text-sm text-muted-foreground">{t('closed')}</Text>}{!detail&&<Button variant="outline" onPress={()=>router.push('/debates/'+debate.id)}>{t('view')}</Button>}</View>;
}
