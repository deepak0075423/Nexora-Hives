/**
 * Teacher → Attendance, on the phone — four tabs, as on the web
 * (school-frontend pages/teacher/Attendance.jsx):
 *   Mark Students · Class Ranking · My Attendance · Student Corrections
 *
 * Each tab lives in components/attendance/teacher/. The tab keys are a link
 * contract: notifications open ?tab=mine, ?tab=corrections&focus=<request>,
 * ?tab=ranking&section=<id>&focus=<student>; My Section opens ?section=<id>.
 * The older ?tab=correct still opens Corrections.
 */
import React, { useRef, useState } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import ModuleDisabled from '@/components/ModuleDisabled';
import { MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import { BRAND, Head, TabBar, useFlash } from '@/components/attendance/parts';
import MarkTab from '@/components/attendance/teacher/MarkTab';
import RankingTab from '@/components/attendance/teacher/RankingTab';
import MineTab from '@/components/attendance/teacher/MineTab';
import CorrectionsTab from '@/components/attendance/teacher/CorrectionsTab';

const TABS = [
  { value: 'mark', label: 'Mark Students', icon: 'calendar-outline' },
  { value: 'ranking', label: 'Class Ranking', icon: 'trophy-outline' },
  { value: 'mine', label: 'My Attendance', icon: 'stats-chart-outline' },
  { value: 'corrections', label: 'Student Corrections', icon: 'time-outline' },
];
const ALIASES: Record<string, string> = { correct: 'corrections' };
const SUBTITLE: Record<string, string> = {
  mark: 'Take attendance, track student presence and manage corrections.',
  ranking: 'How regularly each student attends, and the class as a whole.',
  mine: 'Manage your attendance, view history and request regularization.',
  corrections: 'Review what students ask to have corrected, or correct a mark yourself.',
};

export default function TeacherAttendanceScreen() {
  // First hook on purpose — an early module-disabled return sits below.
  const scrollRef = useRef<ScrollView>(null);
  const params = useLocalSearchParams<{ tab?: string; section?: string }>();
  const wanted = ALIASES[String(params.tab)] || String(params.tab);
  const [tab, setTab] = useState(TABS.some((t) => t.value === wanted) ? wanted : 'mark');
  const [section] = useState(params.section ? String(params.section) : '');
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const flash = useFlash();

  const onBlocked = (e: any) => {
    if (MODULE_BLOCKED_CODES.includes(e?.data?.code)) { setDisabled(true); return true; }
    return false;
  };
  const onRefresh = () => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 700);
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Attendance' }} /><ModuleDisabled /></>);

  const common = { refreshKey, onBlocked, flash, scrollRef };
  return (
    <View style={{ flex: 1, backgroundColor: '#F6F7FB' }}>
      <Stack.Screen options={{ title: 'Attendance' }} />
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 100 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}>
        <Head title="Attendance" subtitle={SUBTITLE[tab]} />
        <TabBar tabs={TABS} value={tab} onChange={setTab} />
        {flash.node}
        {tab === 'mark' ? <MarkTab {...common} initialSection={section} />
          : tab === 'ranking' ? <RankingTab {...common} initialSection={section} />
          : tab === 'mine' ? <MineTab {...common} />
          : <CorrectionsTab {...common} />}
      </ScrollView>
    </View>
  );
}
