import { View, ActivityIndicator } from 'react-native';

export function LoadingSpinner({ size = 'large' }: { size?: 'small' | 'large' }) {
  return (
    <View className="flex-1 items-center justify-center">
      <ActivityIndicator size={size} color="#d97706" />
    </View>
  );
}
