import {useState} from 'react';
import {View,Text,TouchableOpacity,ScrollView,Alert,KeyboardAvoidingView,Platform} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useRouter} from 'expo-router';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import {manipulateAsync,SaveFormat} from 'expo-image-manipulator';
import {api} from '@/lib/api';
import {useAuthStore} from '@/stores/auth';
import {useTranslations} from '@/hooks/useTranslations';
import {Input} from '@/components/ui/Input';
import {Button} from '@/components/ui/Button';
import {GENRES,type UserRow,type UserType} from '@/types';
import {Avatar} from '@/components/ui/Avatar';

const roleOptions:UserType[]=['reader','author','newbie_writer','creator'];
export default function EditProfileScreen(){const user=useAuthStore(state=>state.user);return user?<ProfileEditor key={user.id} user={user}/>:null;}
function ProfileEditor({user}:{user:UserRow}){
  const router=useRouter(),qc=useQueryClient(),{t}=useTranslations('aiProfiles'),{t:p}=useTranslations('profile');
  const [displayName,setDisplayName]=useState(user.display_name),[bio,setBio]=useState(user.bio??''),[genres,setGenres]=useState<string[]>(user.genres??[]),[roles,setRoles]=useState<UserType[]>(user.user_types.filter((value):value is UserType=>roleOptions.includes(value as UserType)));
  const [photo,setPhoto]=useState<string|null>(null),[picking,setPicking]=useState(false);
  const update=useMutation({mutationFn:async()=>{
    const owner=user.id;let avatarUploadId:string|undefined;
    if(photo){
      const body=new FormData();body.append('file',{uri:photo,name:'avatar.jpg',type:'image/jpeg'} as unknown as Blob);
      const uploaded=await api.upload<{uploadId:string}>('/api/users/avatar',body,{'X-Liravo-Actor':owner});if(typeof uploaded.uploadId!=='string')throw new Error('Avatar unavailable');avatarUploadId=uploaded.uploadId;
    }
    return api.put<{user:UserRow}>('/api/users/profile',{display_name:displayName.trim(),bio:bio.trim()||null,user_types:roles,genres,...(avatarUploadId?{avatar_upload_id:avatarUploadId}:{})},{'X-Liravo-Actor':owner});
  },onSuccess:res=>{
    if(res.user?.id!==user.id||useAuthStore.getState().user?.id!==user.id)return;
    useAuthStore.getState().setUser(res.user);void qc.invalidateQueries({queryKey:['write','my-plan']});void qc.invalidateQueries({queryKey:['taste-profile']});router.back();
  },onError:()=>{if(useAuthStore.getState().user?.id===user.id)Alert.alert(p('editProfile'),p('saveFailed'));}});
  async function pickPhoto(){
    if(picking||update.isPending)return;setPicking(true);
    try{
      const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();if(!permission.granted){Alert.alert(p('photo'),p('photoDenied'));return;}
      const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:1});if(result.canceled||!result.assets[0])return;
      const asset=result.assets[0],scale=Math.min(1,512/asset.width,512/asset.height);
      const resized=await manipulateAsync(asset.uri,scale<1?[{resize:{width:Math.max(1,Math.round(asset.width*scale)),height:Math.max(1,Math.round(asset.height*scale))}}]:[],{compress:0.85,format:SaveFormat.JPEG});
      if(useAuthStore.getState().user?.id===user.id)setPhoto(resized.uri);
    }catch{if(useAuthStore.getState().user?.id===user.id)Alert.alert(p('photo'),p('avatarInvalid'));}finally{setPicking(false);}
  }
  const busy=update.isPending||picking;
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><KeyboardAvoidingView className="flex-1" behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView className="flex-1 px-4" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:20}}>
    <View className="items-center gap-3"><Avatar uri={photo??user.avatar_url} name={user.display_name} size={80}/><Button variant="secondary" disabled={busy} onPress={pickPhoto} loading={picking}>{p('uploadPhoto')}</Button></View>
    <Input label={p('displayName')} value={displayName} onChangeText={setDisplayName} placeholder={p('displayPlaceholder')} maxLength={50} editable={!busy}/>
    <Input label={p('bio')} value={bio} onChangeText={setBio} placeholder={p('aboutPlaceholder')} multiline numberOfLines={4} maxLength={280} editable={!busy} style={{minHeight:96,textAlignVertical:'top'}}/>
    <View className="gap-3"><Text className="font-semibold text-foreground">{t('rolesTitle')}</Text>{roleOptions.map(role=><TouchableOpacity key={role} disabled={busy} accessibilityRole="checkbox" accessibilityState={{checked:roles.includes(role),disabled:busy}} onPress={()=>setRoles(current=>current.includes(role)?current.filter(value=>value!==role):[...current,role])} className="border border-border rounded-xl p-3"><Text className="text-foreground">{roles.includes(role)?'✓ ':''}{t('roles.'+role)}</Text></TouchableOpacity>)}</View>
    <View className="gap-3"><Text className="font-semibold text-foreground">{t('genresTitle')}</Text><Text className="text-sm text-muted-foreground">{t('genresRequired')}</Text><View className="flex-row flex-wrap gap-2">{GENRES.map(genre=><TouchableOpacity key={genre} disabled={busy} accessibilityRole="checkbox" accessibilityState={{checked:genres.includes(genre),disabled:busy}} onPress={()=>setGenres(current=>current.includes(genre)?current.filter(value=>value!==genre):[...current,genre])} className="border border-border rounded-lg p-2"><Text className="text-foreground">{genres.includes(genre)?'✓ ':''}{t('genreLabels.'+genre)}</Text></TouchableOpacity>)}</View></View>
    <Button disabled={busy||!displayName.trim()||!roles.length||genres.length<5} onPress={()=>update.mutate()} loading={update.isPending} size="lg">{p('saveChanges')}</Button>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
