import {View,Text} from 'react-native';
import {useTranslations} from '@/hooks/useTranslations';
import {AdminCatalog} from '@/components/admin/Catalog';
import {Badge} from '@/components/ui/Badge';
interface Challenge{id:string;title:string;participant_count:number;xp_reward:number;is_active:boolean;}
export default function AdminWritingChallengesScreen(){const {t}=useTranslations('admin'),native=useTranslations('nativeAdmin');return <AdminCatalog<Challenge> scope="writing" title={t('writingChallenges')} renderItem={({item})=><View className="px-4 py-4 border-b border-border gap-2"><Text className="font-semibold text-foreground">{item.title}</Text><Text className="text-xs text-muted-foreground">{native.t('challengeSummary',{count:item.participant_count,xp:item.xp_reward})}</Text><Badge variant={item.is_active?'accent':'default'}>{t(item.is_active?'active':'inactive')}</Badge></View>}/>;}
