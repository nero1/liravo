import { TouchableOpacity, Text, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';

interface Props {
  onPress: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  onPress,
  children,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  style,
  textStyle,
}: Props) {
  const isDisabled = disabled || loading;

  const baseContainer = 'rounded-lg items-center justify-center flex-row gap-2';
  const sizeMap = { sm: 'px-3 py-1.5', md: 'px-4 py-2.5', lg: 'px-6 py-3' };
  const variantMap = {
    primary: 'bg-primary',
    secondary: 'bg-secondary',
    destructive: 'bg-destructive',
    ghost: 'bg-transparent',
    outline: 'bg-transparent border border-border',
  };
  const textVariantMap = {
    primary: 'text-primary-foreground font-semibold',
    secondary: 'text-secondary-foreground font-medium',
    destructive: 'text-destructive-foreground font-semibold',
    ghost: 'text-foreground font-medium',
    outline: 'text-foreground font-medium',
  };
  const textSizeMap = { sm: 'text-sm', md: 'text-base', lg: 'text-lg' };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      className={`${baseContainer} ${sizeMap[size]} ${variantMap[variant]} ${isDisabled ? 'opacity-50' : ''}`}
      style={style}
      activeOpacity={0.7}
    >
      {loading && <ActivityIndicator size="small" color={variant === 'primary' ? '#fff' : '#1a1a1a'} />}
      {typeof children === 'string' ? (
        <Text className={`${textVariantMap[variant]} ${textSizeMap[size]}`} style={textStyle}>
          {children}
        </Text>
      ) : (
        children
      )}
    </TouchableOpacity>
  );
}
