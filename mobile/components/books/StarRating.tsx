import {View,TouchableOpacity} from 'react-native';
import {Star} from 'lucide-react-native';
import {useTranslations} from '@/hooks/useTranslations';
interface Props {value:number;onChange?:(rating:number)=>void;size?:number;readonly?:boolean;disabled?:boolean;}
export function StarRating({value,onChange,size=24,readonly=false,disabled=false}:Props){
  const {t}=useTranslations('reviewForm'),readOnly=readonly||!onChange;
  return <View className="flex-row gap-1" accessible={readOnly} accessibilityRole={readOnly?'image':'radiogroup'} accessibilityLabel={readOnly?t('ratingValue',{count:value}):t('rating')}>
    {[1,2,3,4,5].map(star=>{const icon=<Star size={size} color="#d97706" fill={star<=value?'#d97706':'transparent'}/>;return readOnly?<View key={star} accessible={false}>{icon}</View>:<TouchableOpacity key={star} accessibilityRole="radio" accessibilityLabel={t('ratingValue',{count:star})} accessibilityState={{checked:star===value,disabled}} disabled={disabled} onPress={()=>onChange?.(star)} activeOpacity={0.7}>{icon}</TouchableOpacity>;})}
  </View>;
}
