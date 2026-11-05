import {View,Text,TouchableOpacity,Alert} from 'react-native';
import {useTranslations} from '@/hooks/useTranslations';
import {useAdminChange} from '@/hooks/useAdminChange';
import {AdminCatalog} from '@/components/admin/Catalog';
import {Avatar} from '@/components/ui/Avatar';
import {Badge} from '@/components/ui/Badge';
import {ENDPOINTS} from '@/constants/api';
interface AdminUser{id:string;display_name:string;username:string;avatar_url:string|null;is_suspended:boolean;is_banned:boolean;is_admin:boolean;}
export default function AdminUsersScreen(){
  const {t}=useTranslations('admin'),native=useTranslations('nativeAdmin'),common=useTranslations('common');
  const change=useAdminChange<{userId:string;is_suspended:boolean}>({path:ENDPOINTS.admin.users,catalog:'users',scope:body=>'admin.user.'+body.userId,validate:(result,body)=>result.updated===true&&result.userId===body.userId});
  return <AdminCatalog<AdminUser> scope="users" title={t('userManagement')} searchLabel={t('searchByUsername')} renderItem={({item})=><View className="flex-row items-center px-4 py-3 border-b border-border gap-3"><Avatar uri={item.avatar_url} name={item.display_name} size={40}/><View className="flex-1"><Text className="font-medium text-foreground">{item.display_name}</Text><Text className="text-xs text-muted-foreground">@{item.username}</Text><View className="flex-row gap-1 mt-1">{item.is_suspended&&<Badge variant="destructive">{native.t('suspended')}</Badge>}{item.is_banned&&<Badge variant="destructive">{native.t('banned')}</Badge>}{item.is_admin&&<Badge variant="accent">{t('admin')}</Badge>}</View></View><TouchableOpacity accessibilityRole="button" accessibilityLabel={native.t('moderateUser',{name:item.display_name})} accessibilityState={{disabled:change.isPending}} disabled={change.isPending} onPress={()=>Alert.alert(native.t('actions'),native.t('moderateUser',{name:item.display_name}),[{text:common.t('cancel'),style:'cancel'},{text:native.t(item.is_suspended?'unsuspend':'suspend'),onPress:()=>change.mutate({userId:item.id,is_suspended:!item.is_suspended})}])} className="p-2"><Text className="text-muted-foreground">···</Text></TouchableOpacity></View>}/>;
}
