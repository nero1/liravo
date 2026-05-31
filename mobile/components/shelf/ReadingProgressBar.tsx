import { View, Text } from 'react-native';

interface Props {
  percent: number;
  pages?: number;
  totalPages?: number;
}

export function ReadingProgressBar({ percent, pages, totalPages }: Props) {
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <View className="gap-1">
      <View className="h-1.5 bg-muted rounded-full overflow-hidden">
        <View
          className="h-full bg-accent rounded-full"
          style={{ width: `${clamped}%` }}
        />
      </View>
      <Text className="text-xs text-muted-foreground">
        {pages && totalPages
          ? `${pages} / ${totalPages} pages`
          : `${Math.round(clamped)}%`}
      </Text>
    </View>
  );
}
