import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import ModuleDisabled from '@/components/ModuleDisabled';
import { LoaderView } from '@/components/ui/kit';
import { Rail } from '@/components/feedback/parts';
import Overview from '@/components/feedback/admin/Overview';
import Campaigns from '@/components/feedback/admin/Campaigns';
import Questions from '@/components/feedback/admin/Questions';
import Insights from '@/components/feedback/admin/Insights';
import Settings from '@/components/feedback/admin/Settings';

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'home-outline' },
  { key: 'campaigns', label: 'Campaigns', icon: 'megaphone-outline' },
  { key: 'questions', label: 'Questions', icon: 'help-circle-outline' },
  { key: 'insights', label: 'Insights', icon: 'bar-chart-outline' },
  { key: 'settings', label: 'Settings', icon: 'settings-outline' },
];

/**
 * Teacher Feedback for the school admin — the web's five sections behind one
 * rail. A section can send the admin to another (Overview's Create Campaign
 * opens the campaign form; a template's "Start a campaign" does too); `opts`
 * carries what the destination should open with.
 */
export default function AdminFeedbackScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tab?: string; view?: string }>();
  const [tab, setTab] = useState(TABS.some((t) => t.key === params.tab) ? String(params.tab) : 'overview');
  const [opts, setOpts] = useState<any>({ view: params.view });
  const [nonce, setNonce] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const onBlocked = useCallback(() => setBlocked(true), []);

  const go = useCallback((next: string, o: any = {}) => { setOpts(o); setTab(next); setNonce((n) => n + 1); }, []);

  if (blocked) return <><Stack.Screen options={{ title: 'Teacher Feedback' }} /><ModuleDisabled /></>;
  if (!user?.role) return <><Stack.Screen options={{ title: 'Teacher Feedback' }} /><LoaderView /></>;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Teacher Feedback' }} />
      <Rail tabs={TABS} value={tab} onChange={(k) => go(k)} />
      {tab === 'overview' ? <Overview key={nonce} onBlocked={onBlocked} go={go} />
        : tab === 'campaigns' ? <Campaigns key={nonce} onBlocked={onBlocked} go={go} createOnOpen={!!opts.create} />
        : tab === 'questions' ? <Questions key={nonce} onBlocked={onBlocked} go={go} initialView={opts.view} />
        : tab === 'insights' ? <Insights key={nonce} onBlocked={onBlocked} initialView={opts.view} />
        : <Settings key={nonce} onBlocked={onBlocked} />}
    </View>
  );
}
