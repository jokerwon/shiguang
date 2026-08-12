// 4 Tab 导航布局：发现/食材/收藏/我的（ADR-0014 决策 2）
import { Tabs } from 'expo-router';
import { Text } from 'react-native';

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>
      {label}
    </Text>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#e85d04',
        tabBarInactiveTintColor: '#999',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '发现',
          tabBarIcon: ({ focused }) => <TabIcon label="🍳" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="pantry"
        options={{
          title: '食材',
          tabBarIcon: ({ focused }) => <TabIcon label="🥬" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="favorite"
        options={{
          title: '收藏',
          tabBarIcon: ({ focused }) => <TabIcon label="❤️" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarIcon: ({ focused }) => <TabIcon label="👤" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
