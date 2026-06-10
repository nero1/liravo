import { Tabs } from 'expo-router';
import { Home, Search, Feather, BookOpen, User } from 'lucide-react-native';
import { Platform } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#e5e7eb',
          paddingBottom: Platform.OS === 'android' ? 4 : 0,
          height: Platform.OS === 'android' ? 60 : 80,
        },
        tabBarActiveTintColor: '#d97706',
        tabBarInactiveTintColor: '#6b7280',
        tabBarLabelStyle: { fontSize: 11, marginBottom: 2 },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, size }) => <Search size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="write"
        options={{
          title: 'Write',
          tabBarIcon: ({ color, size }) => <Feather size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="shelf"
        options={{
          title: 'Shelf',
          tabBarIcon: ({ color, size }) => <BookOpen size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
      {/* Notifications accessible from profile quick links and header bell */}
      <Tabs.Screen
        name="notifications"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
