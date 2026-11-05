import {useState,useEffect,useRef} from 'react';
import {View,Text,ScrollView,Switch,Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useRouter} from 'expo-router';
import {useAuthStore} from '@/stores/auth';
import {useTranslations} from '@/hooks/useTranslations';
import {useCreateShelf} from '@/hooks/useShelf';
import {Input} from '@/components/ui/Input';
import {Button} from '@/components/ui/Button';
export default function NewShelfScreen(){const owner=useAuthStore(state=>state.user?.id);return <NativeShelfForm key={owner} owner={owner}/>;}
export function NativeShelfForm({owner}:{owner:string|undefined}){
  const {t}=useTranslations('shelfForm'),{t:content}=useTranslations('nativeContent'),{t:common}=useTranslations('common'),router=useRouter(),create=useCreateShelf(),[name,setName]=useState(''),[description,setDescription]=useState(''),[isPublic,setIsPublic]=useState(true),[checking,setChecking]=useState(true),[restoreFailed,setRestoreFailed]=useState(false),alive=useRef(true),lock=useRef(false);
  async function restore(){setChecking(true);setRestoreFailed(false);try{const receipt=await create.recoverPending();if(!alive.current)return;if(receipt&&useAuthStore.getState().user?.id===owner)router.replace('/(tabs)/shelf/'+receipt.shelf.id);setChecking(false);}catch{if(alive.current)setRestoreFailed(true);}}
  useEffect(()=>{alive.current=true;void restore();return()=>{alive.current=false;};},[owner]); // eslint-disable-line react-hooks/exhaustive-deps
  async function submit(){if(!name.trim()||create.isPending||checking||lock.current)return;lock.current=true;try{const data=await create.mutateAsync({name:name.trim(),description:description.trim()||undefined,is_public:isPublic});if(useAuthStore.getState().user?.id===owner)router.replace('/(tabs)/shelf/'+data.shelf.id);}catch{if(alive.current)Alert.alert(common('error'),t('failed'));}finally{lock.current=false;}}
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><ScrollView className="px-4" keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}><Input label={t('name')} value={name} onChangeText={setName} placeholder={t('example')} editable={!create.isPending&&!checking} maxLength={100}/><Input label={t('description')} value={description} onChangeText={setDescription} placeholder={content('shelfDescription')} editable={!create.isPending&&!checking} multiline maxLength={2000} numberOfLines={3} style={{textAlignVertical:'top'}}/><View className="flex-row items-center justify-between gap-3"><Text className="text-foreground">{t('public')}</Text><Switch accessibilityLabel={t('public')} value={isPublic} onValueChange={setIsPublic} disabled={create.isPending||checking}/></View>{restoreFailed&&<View><Text accessibilityRole="alert" className="text-destructive">{t('failed')}</Text><Button onPress={()=>void restore()}>{common('retry')}</Button></View>}<Button onPress={()=>void submit()} loading={create.isPending||checking&&!restoreFailed} disabled={checking||!owner||!name.trim()}>{t('create')}</Button></ScrollView></SafeAreaView>;
}
