import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface TabConfig {
  name: string;
  title: string;
  icon: IoniconsName;
  activeIcon: IoniconsName;
}

const STUDENT_TABS: TabConfig[] = [
  { name: 'index',         title: 'Home',    icon: 'home-outline',          activeIcon: 'home' },
  { name: 'notifications', title: 'Alerts',  icon: 'notifications-outline', activeIcon: 'notifications' },
  { name: 'profile',       title: 'Profile', icon: 'person-outline',        activeIcon: 'person' },
];

const TEACHER_TABS: TabConfig[] = [
  { name: 'index',         title: 'Home',    icon: 'home-outline',          activeIcon: 'home' },
  { name: 'notifications', title: 'Alerts',  icon: 'notifications-outline', activeIcon: 'notifications' },
  { name: 'profile',       title: 'Profile', icon: 'person-outline',        activeIcon: 'person' },
];

const PARENT_TABS: TabConfig[] = [
  { name: 'index',         title: 'Home',    icon: 'home-outline',      activeIcon: 'home' },
  { name: 'notifications', title: 'Alerts',  icon: 'notifications-outline', activeIcon: 'notifications' },
  { name: 'profile',       title: 'Profile', icon: 'person-outline',    activeIcon: 'person' },
];

const ADMIN_TABS: TabConfig[] = [
  { name: 'index',         title: 'Home',    icon: 'home-outline',          activeIcon: 'home' },
  { name: 'notifications', title: 'Alerts',  icon: 'notifications-outline', activeIcon: 'notifications' },
  { name: 'profile',       title: 'Profile', icon: 'person-outline',        activeIcon: 'person' },
];

export default function TabLayout() {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const insets = useSafeAreaInsets();
  const role = user?.role;

  const tabs =
    role === 'teacher' ? TEACHER_TABS :
    role === 'parent'  ? PARENT_TABS  :
    role === 'admin' || role === 'super-admin' ? ADMIN_TABS :
    STUDENT_TABS;

  // Sit above the system navigation bar (Android edge-to-edge / iOS home indicator)
  const bottomPad = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.tabActive,
        tabBarInactiveTintColor: Colors.tabInactive,
        tabBarStyle: [styles.tabBar, { height: 56 + bottomPad, paddingBottom: bottomPad }],
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      {/* Hidden screens — still routable but not shown in tab bar */}
      <Tabs.Screen name="explore"  options={{ href: null }} />
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen name="stats"    options={{ href: null }} />

      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            ...(tab.name === 'notifications' && unreadCount > 0
              ? { tabBarBadge: unreadCount > 9 ? '9+' : unreadCount }
              : {}),
            tabBarIcon: ({ focused, color }) => (
              <Ionicons
                name={focused ? tab.activeIcon : tab.icon}
                size={22}
                color={color}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.tabBar,
    borderTopWidth: 0,
    elevation: 12,
    shadowColor: 'rgba(0,0,0,0.1)',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    paddingTop: 6,
  },
  tabLabel: { fontSize: 10, fontWeight: '500' },
  tabItem: { paddingTop: 2 },
});
