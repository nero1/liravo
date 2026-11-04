import {useTranslations} from '@/hooks/useTranslations';
import { View, Text } from 'react-native';

interface Props {
  percent: number;
  pages?: number;
  totalPages?: number;
}

export function ReadingProgressBar({ percent, pages, totalPages }: Props) {
  const {t,locale}=useTranslations('readingProgress');
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <View className="gap-1">
      <View accessibilityRole="progressbar" accessibilityLabel={t('label')} accessibilityValue={{min:0,max:100,now:clamped}} className="h-1.5 bg-muted rounded-full overflow-hidden">
        <View
          className="h-full bg-accent rounded-full"
          style={{ width: `${clamped}%` }}
        />
      </View>
      <Text className="text-xs text-muted-foreground">
        {pages!==undefined&&totalPages!==undefined&&totalPages>0
          ? t('pageCount',{current:pages,total:totalPages})
          : new Intl.NumberFormat(locale,{style:'percent',maximumFractionDigits:0}).format(clamped/100)}
      </Text>
    </View>
  );
}
