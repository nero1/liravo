import { View, Text } from 'react-native';
import { BookOpen } from 'lucide-react-native';

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
