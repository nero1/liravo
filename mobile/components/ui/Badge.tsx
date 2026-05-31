import { View, Text } from 'react-native';

interface Props {
  children: React.ReactNode;
  variant?: 'default' | 'accent' | 'secondary' | 'destructive';
}

export function Badge({ children, variant = 'default' }: Props) {
  const variantMap = {
    default: 'bg-muted',
    accent: 'bg-accent',
    secondary: 'bg-secondary',
    destructive: 'bg-destructive',
  };
  const textMap = {
    default: 'text-muted-foreground',
    accent: 'text-accent-foreground',
    secondary: 'text-secondary-foreground',
    destructive: 'text-destructive-foreground',
  };

  return (
    <View className={`${variantMap[variant]} rounded-full px-2.5 py-0.5 self-start`}>
      <Text className={`${textMap[variant]} text-xs font-medium`}>{children}</Text>
    </View>
  );
}
