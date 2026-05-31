import { TextInput, Text, View, TextInputProps } from 'react-native';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, ...props }: Props) {
  return (
    <View className="gap-1">
      {label && <Text className="text-sm font-medium text-foreground">{label}</Text>}
      <TextInput
        className={`border rounded-lg px-3 py-2.5 text-base text-foreground bg-background ${
          error ? 'border-destructive' : 'border-input'
        }`}
        placeholderTextColor="#9ca3af"
        {...props}
      />
      {error && <Text className="text-xs text-destructive">{error}</Text>}
    </View>
  );
}
