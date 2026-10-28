import {useTranslations} from '@/hooks/useTranslations';
import { View, Text } from 'react-native';
import { BookOpen } from 'lucide-react-native';
import { Button } from './Button';

interface Props {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

export function EmptyState({ title, description, icon }: Props) {
  return (
    <View className="flex-1 items-center justify-center p-8 gap-3">
      {icon ?? <BookOpen size={48} className="text-muted-foreground" color="#6b7280" />}
      <Text className="text-lg font-semibold text-foreground text-center">{title}</Text>
      {description && (
        <Text className="text-muted-foreground text-center">{description}</Text>
      )}
    </View>
  );
}

export function QueryError({retry}:{error:unknown;retry:()=>void}){
  const {t}=useTranslations('common');
  return <View className="flex-1 items-center justify-center bg-background p-6 gap-4" accessibilityLiveRegion="polite">
    <Text className="text-foreground text-center">{t('error')}</Text>
    <Button onPress={retry}>{t('retry')}</Button>
  </View>;
}
