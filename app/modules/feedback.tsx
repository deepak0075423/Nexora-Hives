import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import * as fb from '@/api/feedback.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { unwrap, LoaderView, Empty, Badge, Card, SegTabs, fmtDate } from '@/components/ui/kit';

// Student feedback home: pending on one tab, completed on the other.
// Mirrors the web /student/feedback screen — same endpoints, same rules.
export default function StudentFeedbackScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState('pending');
  const [pending, setPending] = useState<any[] | undefined>(undefined);
  const [completed, setCompleted] = useState<any[]>([]);
  const [disabled, setDisabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([fb.getPending(), fb.getCompleted()]);
      setPending(unwrap(p) ?? []);
      setCompleted(unwrap(c) ?? []);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
      else setPending([]);
    } finally { setRefreshing(false); }
  }, []);

  useEffect(() => { if (user?.role) load(); }, [user?.role]); // eslint-disable-line

  if (disabled) return <><Stack.Screen options={{ title: 'Teacher Feedback' }} /><ModuleDisabled /></>;
  if (pending === undefined) return <><Stack.Screen options={{ title: 'Teacher Feedback' }} /><LoaderView /></>;

  const rows = tab === 'pending' ? pending : completed;

  return (
    <>
      <Stack.Screen options={{ title: 'Teacher Feedback' }} />
      <ScrollView
        style={s.root}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <Text style={s.intro}>
          Your feedback is confidential and helps your teachers improve. Each form takes about two minutes.
        </Text>

        <SegTabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'pending', label: `Pending${pending.length ? ` (${pending.length})` : ''}` },
            { key: 'completed', label: `Completed${completed.length ? ` (${completed.length})` : ''}` },
          ]}
        />

        <View style={{ height: Spacing.md }} />

        {rows.length === 0 ? (
          tab === 'pending'
            ? <Empty icon="checkmark-done-outline" text="No pending feedback — you're all caught up." />
            : <Empty icon="document-text-outline" text="No feedback submitted yet." />
        ) : (
          rows.map((r: any) => (
            <FeedbackCard
              key={r._id}
              row={r}
              done={tab === 'completed'}
              onPress={() => router.push({
                pathname: tab === 'completed' ? '/modules/feedback-view' : '/modules/feedback-form',
                params: { id: r._id },
              } as any)}
            />
          ))
        )}
      </ScrollView>
    </>
  );
}

function FeedbackCard({ row, done, onPress }: { row: any; done: boolean; onPress: () => void }) {
  const left = row.deadline
    ? Math.ceil((new Date(new Date(row.deadline).setHours(23, 59, 59, 999)).getTime() - Date.now()) / 864e5)
    : null;
  const urgent = !done && left != null && left <= 2;

  return (
    <Card>
      <View style={s.cardTop}>
        <View style={s.iconBox}>
          <Ionicons name={done ? 'checkmark-circle' : 'star'} size={20} color={Colors.modules.results.icon} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.subject}>{row.subject || 'General'}</Text>
          <Text style={s.teacher}>{row.teacher?.name}</Text>
          <Text style={s.meta}>
            {[row.className, row.sectionName].filter(Boolean).join(' · ') || row.campaign?.name}
          </Text>
        </View>
        <Badge label={done ? 'Completed' : 'Pending'} tone={done ? 'success' : 'warning'} />
      </View>

      <View style={s.footer}>
        <Text style={[s.deadline, urgent && { color: Colors.danger }]}>
          {done
            ? `Submitted ${fmtDate(row.submittedAt)}`
            : left == null ? '' : left <= 0 ? 'Closes today' : `Closes in ${left} day${left === 1 ? '' : 's'}`}
        </Text>
        <TouchableOpacity style={[s.btn, done && s.btnGhost]} onPress={onPress}>
          <Text style={[s.btnText, done && s.btnGhostText]}>{done ? 'View' : 'Give Feedback'}</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  intro: { ...Typography.bodySmall, color: Colors.textSecondary, marginBottom: Spacing.md, lineHeight: 18 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconBox: {
    width: 38, height: 38, borderRadius: Radius.md, backgroundColor: Colors.modules.results.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  subject: { ...Typography.h4, color: Colors.text },
  teacher: { fontSize: 13, color: Colors.text, marginTop: 1 },
  meta: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.divider, gap: 8,
  },
  deadline: { fontSize: 11, color: Colors.textSecondary, flex: 1 },
  btn: { backgroundColor: Colors.accent, paddingHorizontal: 16, paddingVertical: 9, borderRadius: Radius.md },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  btnGhost: { backgroundColor: Colors.surfaceAlt },
  btnGhostText: { color: Colors.textSecondary },
});
