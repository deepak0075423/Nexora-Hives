import React, { useCallback, useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { FocusRow } from '@/components/FocusHighlight';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as subApi from '@/api/substitute.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Card, Badge, SegTabs, StatTile, StatRow, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

/**
 * A teacher's own view: the substitute classes I have to take, and my own
 * periods someone else is covering while I'm away.
 *
 * The same six counts the admin sees when picking me are shown here, so the
 * fairness argument is visible from both sides rather than only to the person
 * doing the assigning.
 */

const todayIso = () => new Date().toISOString().slice(0, 10);
const plusDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmtDay = (d: string) => new Date(d).toLocaleDateString('en-IN', {
  weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
});
const periodTime = (p: any) => (p?.startTime ? `${p.startTime}${p.endTime ? `–${p.endTime}` : ''}` : '');

function DutyRow({ d, mine }: { d: any; mine?: boolean }) {
  const isToday = new Date(d.date).toISOString().slice(0, 10) === todayIso();
  return (
    <View style={[s.row, isToday && s.rowToday]}>
      <View style={s.when}>
        <Text style={s.day}>{fmtDay(d.date)}</Text>
        <Text style={s.period}>P{d.periodNumber}</Text>
        <Text style={s.time}>{periodTime(d) || '—'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={s.class}>{d.section?.label || '—'}</Text>
          {isToday && <Badge label="Today" tone="success" />}
        </View>
        <Text style={s.subject}>{d.subject?.name || '—'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
          <Ionicons name="person-outline" size={12} color={Colors.textSecondary} />
          {mine ? (
            <Text style={s.who}>Covering for {d.originalTeacher?.name || '—'}</Text>
          ) : d.substituteTeacher ? (
            <Text style={s.who}>Covered by {d.substituteTeacher.name}</Text>
          ) : (
            <Badge label="Not yet covered" tone="danger" />
          )}
        </View>
        {!!d.remarks && <Text style={s.remarks}>“{d.remarks}”</Text>}
      </View>
    </View>
  );
}

export default function MySubstitutionsScreen() {
  // First hook in the component on purpose: the early module-disabled
  // return sits below, and a hook after it would not run every render.
  // Held so a notification can scroll its record into view.
  const scrollRef = useRef<ScrollView>(null);
  const [tab, setTab]         = useState('duties');
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    try {
      setData(unwrap(await subApi.getMySubstitutions(todayIso(), plusDays(todayIso(), 14))));
      setError('');
    } catch (e: any) {
      if (MODULE_BLOCKED_CODES.includes(e?.data?.code)) setDisabled(true);
      else setError(e?.message ?? 'Failed to load');
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (disabled) return (<><Stack.Screen options={{ title: 'My Substitutions' }} /><ModuleDisabled /></>);

  const w = data?.workload;
  const duties: any[]     = data?.duties ?? [];
  const handedOver: any[] = data?.handedOver ?? [];
  const list = tab === 'duties' ? duties : handedOver;

  return (
    <>
      <Stack.Screen options={{ title: 'My Substitutions' }} />
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : (
          <>
            {!!error && <Text style={s.error}>{error}</Text>}

            {!!w && (
              <>
                <Text style={s.groupLabel}>SUBSTITUTE CLASSES</Text>
                <StatRow>
                  <StatTile label="Today" value={w.subsToday} icon="repeat"   tone="warning" />
                  <StatTile label="Week"  value={w.subsWeek}  icon="repeat"   tone="warning" />
                  <StatTile label="Month" value={w.subsMonth} icon="repeat"   tone="warning" />
                </StatRow>
                <Text style={s.groupLabel}>MY OWN PERIODS</Text>
                <StatRow>
                  <StatTile label="Today" value={w.normalToday} icon="book" tone="info" />
                  <StatTile label="Week"  value={w.normalWeek}  icon="book" tone="info" />
                  <StatTile label="Month" value={w.normalMonth} icon="book" tone="info" />
                </StatRow>
              </>
            )}

            <SegTabs
              tabs={[
                { key: 'duties',  label: `I'm covering (${duties.length})` },
                { key: 'covered', label: `Mine covered (${handedOver.length})` },
              ]}
              active={tab} onChange={setTab}
            />

            <Text style={s.rangeNote}>
              {data ? `${fmtDay(data.from)} – ${fmtDay(data.to)}` : ''}
            </Text>

            {!list.length ? (
              <Empty icon={tab === 'duties' ? 'checkmark-done-outline' : 'book-outline'}
                text={tab === 'duties'
                  ? 'No substitute classes assigned to you in the next two weeks.'
                  : 'None of your periods are down for substitution in the next two weeks.'} />
            ) : (
              <Card>
                {list.map((d: any) => (
                  <FocusRow key={d._id} id={d._id} scrollRef={scrollRef}>
                    <DutyRow d={d} mine={tab === 'duties'} />
                  </FocusRow>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  groupLabel: {
    fontSize: 10, fontWeight: '700', color: Colors.textSecondary,
    letterSpacing: 0.5, marginBottom: 6, marginTop: 4,
  },
  rangeNote: { fontSize: 11, color: Colors.textSecondary, marginBottom: Spacing.sm },
  row: {
    flexDirection: 'row', gap: 12, paddingVertical: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  rowToday: { backgroundColor: Colors.surfaceAlt, borderRadius: Radius.sm },
  when: { width: 64 },
  day: { fontSize: 12, fontWeight: '700', color: Colors.text },
  period: { fontSize: 13, fontWeight: '600', color: Colors.primary, marginTop: 2 },
  time: { fontSize: 9, color: Colors.textSecondary },
  class: { fontSize: 13, fontWeight: '600', color: Colors.text },
  subject: { fontSize: 11, color: Colors.textSecondary },
  who: { fontSize: 11, color: Colors.textSecondary },
  remarks: { fontSize: 11, color: Colors.textSecondary, fontStyle: 'italic', marginTop: 2 },
  error: {
    fontSize: 12, color: Colors.danger, backgroundColor: Colors.surface,
    padding: Spacing.sm, borderRadius: Radius.sm, marginBottom: Spacing.sm,
  },
});
