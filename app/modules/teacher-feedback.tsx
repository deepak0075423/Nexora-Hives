import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import ModuleDisabled from '@/components/ModuleDisabled';
import { LoaderView } from '@/components/ui/kit';
import { Rail } from '@/components/feedback/parts';
import { TeacherBreakdown, TeacherDashboard, TeacherTrends } from '@/components/feedback/TeacherResults';

const TABS = [
  { key: 'results', label: 'My Feedback', icon: 'star-outline' },
  { key: 'breakdown', label: 'By subject & section', icon: 'grid-outline' },
  { key: 'trends', label: 'Trends', icon: 'trending-up-outline' },
];

/** A teacher's own feedback, in the web's three sections. */
export default function TeacherFeedbackScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState(TABS.some((t) => t.key === params.tab) ? String(params.tab) : 'results');
  const [blocked, setBlocked] = useState(false);
  const onBlocked = useCallback(() => setBlocked(true), []);

  if (blocked) return <><Stack.Screen options={{ title: 'My Feedback' }} /><ModuleDisabled /></>;
  if (!user?.role) return <><Stack.Screen options={{ title: 'My Feedback' }} /><LoaderView /></>;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'My Feedback' }} />
      <Rail tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'results' ? <TeacherDashboard onBlocked={onBlocked} />
        : tab === 'breakdown' ? <TeacherBreakdown onBlocked={onBlocked} />
        : <TeacherTrends onBlocked={onBlocked} />}
    </View>
  );
}
