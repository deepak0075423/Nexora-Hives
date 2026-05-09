import { Stack } from 'expo-router';
import { Colors } from '@/constants/theme';

export default function ModulesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        headerShadowVisible: false,
        headerBackTitle: '',
        contentStyle: { backgroundColor: Colors.background },
      }}
    />
  );
}
