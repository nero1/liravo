import {View,Text} from 'react-native';
import {useTranslations} from '@/hooks/useTranslations';
import {AdminCatalog} from '@/components/admin/Catalog';
import {Badge} from '@/components/ui/Badge';
interface Event{id:string;name:string;start_date:string;end_date:string;is_published:boolean;}
export default function SeasonalEventsScreen(){const {t,locale}=useTranslations('nativeAdmin'),admin=useTranslations('admin'),date=(value:string)=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value));return <AdminCatalog<Event> scope="seasons" title={admin.t('seasonalEvents')} renderItem={({item})=><View className="px-4 py-4 border-b border-border gap-2"><Text className="font-semibold text-foreground">{item.name}</Text><Text className="text-sm text-muted-foreground">{t('dateRange',{start:date(item.start_date),end:date(item.end_date)})}</Text><Badge variant={item.is_published?'accent':'default'}>{t(item.is_published?'published':'draft')}</Badge></View>}/>;}
