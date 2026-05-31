import { View, ViewProps } from 'react-native';

interface Props extends ViewProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '', style, ...props }: Props) {
  return (
    <View
      className={`bg-card rounded-xl border border-border p-4 ${className}`}
      style={style}
      {...props}
    >
      {children}
    </View>
  );
}
