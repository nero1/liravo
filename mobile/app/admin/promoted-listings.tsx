import {View,Text,Switch} from 'react-native';
import {useTranslations} from '@/hooks/useTranslations';
import {useAdminChange} from '@/hooks/useAdminChange';
import {AdminCatalog} from '@/components/admin/Catalog';
import {ENDPOINTS} from '@/constants/api';
interface Promotion{id:string;is_active:boolean;end_date:string|null;book:{title:string}|null;}
export default function PromotedListingsScreen(){
  const {t,locale}=useTranslations('nativeAdmin'),admin=useTranslations('admin'),change=useAdminChange<{id:string;is_active:boolean}>({path:ENDPOINTS.admin.promotedListings,catalog:'promotions',scope:body=>'admin.promotion.'+body.id,validate:(result,body)=>result.listing?.id===body.id&&result.listing.is_active===body.is_active});
  return <AdminCatalog<Promotion> scope="promotions" title={admin.t('promotedListings')} renderItem={({item})=><View className="px-4 py-4 border-b border-border flex-row items-center gap-3"><View className="flex-1"><Text className="font-semibold text-foreground">{item.book?.title??t('promotion')}</Text><Text className="text-sm text-muted-foreground">{item.end_date?t('until',{date:new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(item.end_date))}):t('noEndDate')}</Text></View><Switch value={item.is_active} disabled={change.isPending} accessibilityLabel={t('activate',{name:item.book?.title??t('promotion')})} onValueChange={is_active=>change.mutate({id:item.id,is_active})}/></View>}/>;
}
