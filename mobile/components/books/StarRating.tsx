import { View, TouchableOpacity } from 'react-native';
import { Star } from 'lucide-react-native';

interface Props {
  value: number;
  onChange?: (rating: number) => void;
  size?: number;
  readonly?: boolean;
}

export function StarRating({ value, onChange, size = 24, readonly }: Props) {
  return (
    <View className="flex-row gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => !readonly && onChange?.(star)}
          disabled={readonly}
          activeOpacity={0.7}
        >
          <Star
            size={size}
            color="#d97706"
            fill={star <= value ? '#d97706' : 'transparent'}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}
