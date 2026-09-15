import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import ModuleDisabled from '@/components/ModuleDisabled';
import { LoaderView } from '@/components/ui/kit';
import { Blank, Card, Page, Rail } from '@/components/feedback/parts';
import Overview from '@/components/feedback/admin/Overview';
import Insights from '@/components/feedback/admin/Insights';

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'home-outline' },
  { key: 'insights', label: 'Insights', icon: 'bar-chart-outline' },
];

/**
 * School-wide feedback for a Principal / Vice Principal — the same Overview and
 * Insights the admin reads, read-only. Campaigns, Questions and Settings are
 * configuration and stay with the admin; the server refuses them either way.
 * Access is decided by the backend from the teacher's designation.
 */
export default function FeedbackReviewScreen() {
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [state, setState] = useState<'ok' | 'blocked'>('ok');
  const onBlocked = useCallback(() => setState('blocked'), []);

  if (state === 'blocked') {
    return (
      <>
        <Stack.Screen options={{ title: 'Feedback Review' }} />
        {user?.role === 'teacher' ? (
          <Page>
            <Card><Blank icon="lock-closed-outline" title="Not available to you"
              body="School-wide feedback review is for the Principal and Vice Principal, or for a teacher whose designation grants it. If feedback is switched off for the school, it is hidden here too." /></Card>
          </Page>
        ) : <ModuleDisabled />}
      </>
    );
  }
  if (!user?.role) return <><Stack.Screen options={{ title: 'Feedback Review' }} /><LoaderView /></>;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Feedback Review' }} />
      <Rail tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'overview' ? <Overview onBlocked={onBlocked} go={(t) => setTab(t === 'insights' ? 'insights' : 'overview')} /> : <Insights onBlocked={onBlocked} />}
    </View>
  );
}
