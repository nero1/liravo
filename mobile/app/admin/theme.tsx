import * as Crypto from 'expo-crypto';
import {View,Text,Switch} from 'react-native';
import {useTranslations} from '@/hooks/useTranslations';
import {useAdminChange} from '@/hooks/useAdminChange';
import {AdminCatalog} from '@/components/admin/Catalog';
import {ENDPOINTS} from '@/constants/api';
interface Theme{name:string;is_active:boolean;css_overrides:string;}
export default function AdminThemeScreen(){
  const {t}=useTranslations('admin'),native=useTranslations('nativeAdmin'),change=useAdminChange<{name:string;is_active:boolean}>({path:ENDPOINTS.admin.themes,catalog:'themes',scope:async body=>'admin.theme.'+await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,body.name),validate:(result,body)=>result.ok===true&&result.theme?.name===body.name&&result.theme.is_active===body.is_active});
  return <AdminCatalog<Theme> scope="themes" title={t('existingThemes')} renderItem={({item})=><View className="flex-row items-center px-4 py-4 border-b border-border gap-3"><Text className="font-medium text-foreground flex-1">{item.name}</Text><Switch value={item.is_active} disabled={change.isPending} accessibilityLabel={native.t('activate',{name:item.name})} onValueChange={is_active=>change.mutate({name:item.name,is_active})}/></View>}/>;
}
