import { View, Text } from 'react-native';
import { Image } from 'expo-image';

interface Props {
  uri?: string | null;
  name?: string;
  size?: number;
}

export function Avatar({ uri, name, size = 40 }: Props) {
  const initials = name
    ? name
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
    : '?';

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    );
  }

  return (
    <View
      className="bg-accent items-center justify-center"
      style={{ width: size, height: size, borderRadius: size / 2 }}
    >
      <Text
        className="text-accent-foreground font-bold"
        style={{ fontSize: size * 0.38 }}
      >
        {initials}
      </Text>
    </View>
  );
}
