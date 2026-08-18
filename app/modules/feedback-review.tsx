import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import * as fb from '@/api/feedback.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Colors, Spacing, Typography } from '@/constants/theme';
import {
  unwrap, LoaderView, Empty, Badge, Card, StatRow, StatTile, SegTabs, RowItem, Select,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

// Principal / Vice Principal view: school-wide, read-only, with the drill-down
// School → Department → Teacher. Access is decided by the backend from the
// TeacherProfile designation; a plain teacher hitting these endpoints gets 403.
const toneFor = (v?: number | null) => (v == null ? Colors.textSecondary : v >= 4 ? Colors.success : v >= 3 ? Colors.warning : Colors.danger);
const badgeTone = (v?: number | null) => (v == null ? 'neutral' : v >= 4 ? 'success' : v >= 3 ? 'warning' : 'danger') as any;

export default function FeedbackReviewScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState('overview');
  const [campaignId, setCampaignId] = useState('');
  const [dash, setDash] = useState<any>(undefined);
  const [dept, setDept] = useState<string | null>(null);
  const [state, setState] = useState<'ok' | 'disabled' | 'forbidden'>('ok');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setDash(unwrap(await fb.getDashboard(campaignId ? { campaignId } : {})));
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setState('disabled');
      else if (err?.status === 403) setState('forbidden');
      setDash(null);
    } finally { setRefreshing(false); }
  }, [campaignId]);

  useEffect(() => { if (user?.role) load(); }, [user?.role, campaignId]); // eslint-disable-line

  if (state === 'disabled') return <><Stack.Screen options={{ title: 'Feedback Review' }} /><ModuleDisabled /></>;
  if (state === 'forbidden') {
    return (
      <>
        <Stack.Screen options={{ title: 'Feedback Review' }} />
        <View style={s.root}>
          <Empty icon="lock-closed-outline" text="School-wide feedback review is available to the Principal and Vice Principal only." />
        </View>
      </>
    );
  }
  if (dash === undefined) return <><Stack.Screen options={{ title: 'Feedback Review' }} /><LoaderView /></>;
  if (!dash?.campaigns?.length) {
    return (
      <>
        <Stack.Screen options={{ title: 'Feedback Review' }} />
        <View style={s.root}><Empty icon="school-outline" text="No feedback has been collected yet." /></View>
      </>
    );
  }

  const c = dash.cards;
  const teachersOf = (name: string) => (dash.teachers || []).filter((t: any) => (t.department || 'Unassigned') === name);
  const needAttention = (dash.teachers || []).filter((t: any) => t.status === 'attention');

  return (
    <>
      <Stack.Screen options={{ title: 'Feedback Review' }} />
      <ScrollView
        style={s.root}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <Card>
          <View style={s.heroRow}>
            <Text style={[s.heroValue, { color: toneFor(c.averageRating) }]}>
              {c.averageRating == null ? '—' : c.averageRating.toFixed(1)}
            </Text>
            <Text style={s.heroUnit}>/ 5.0</Text>
          </View>
          <Text style={s.heroLabel}>Overall school feedback score</Text>
        </Card>

        <StatRow>
          <StatTile label="Teachers" value={c.teachersEvaluated} icon="people" tone="info" />
          <StatTile label="Responses" value={c.totalResponses} icon="chatbubbles" tone="success" />
          <StatTile label="Rate" value={`${c.responseRate}%`} icon="trending-up" tone="warning" />
        </StatRow>

        <Select
          label="Campaign"
          value={campaignId || dash.campaign?._id || ''}
          onChange={setCampaignId}
          options={(dash.campaigns || []).map((x: any) => ({ label: `${x.name}${x.term ? ` · ${x.term}` : ''}`, value: x._id }))}
        />

        <SegTabs active={tab} onChange={setTab} tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'departments', label: 'Departments' },
          { key: 'teachers', label: 'Teachers' },
          { key: 'trends', label: 'Trends' },
        ]} />
        <View style={{ height: Spacing.md }} />

        {tab === 'overview' && (
          <>
            <Card>
              <Text style={s.h}>Category performance</Text>
              {(dash.categories || []).map((cat: any) => (
                <Bar key={cat._id} label={cat.name} value={cat.average} max={5} />
              ))}
            </Card>
            <Card>
              <Text style={s.h}>Areas needing improvement</Text>
              {needAttention.length === 0
                ? <Text style={s.muted}>No teacher is currently below a 3.0 average.</Text>
                : needAttention.map((t: any) => (
                  <RowItem key={t._id} icon="alert-circle" iconBg={Colors.dangerLight} iconColor={Colors.danger}
                    title={t.name} sub={t.department || 'Teacher'}
                    right={<Badge label={t.rating?.toFixed(1) ?? '—'} tone="danger" />}
                    onPress={() => router.push({ pathname: '/modules/feedback-teacher-detail', params: { id: t._id } } as any)} />
                ))}
            </Card>
          </>
        )}

        {tab === 'departments' && (
          (dash.departments || []).length === 0
            ? <Empty icon="business-outline" text="No department data. Set departments on teacher profiles." />
            : (
              <>
                {dash.departments.map((d: any) => (
                  <RowItem
                    key={d.name}
                    icon={dept === d.name ? 'chevron-down' : 'chevron-forward'}
                    iconBg={Colors.modules.analytics.bg}
                    iconColor={Colors.modules.analytics.icon}
                    title={d.name}
                    sub={`${d.teachers} teacher(s) · ${d.responses} responses · ${d.responseRate}%`}
                    right={<Badge label={d.rating?.toFixed(1) ?? '—'} tone={badgeTone(d.rating)} />}
                    onPress={() => setDept(dept === d.name ? null : d.name)}
                  />
                ))}
                {dept && (
                  <Card>
                    <Text style={s.h}>{dept}</Text>
                    {teachersOf(dept).map((t: any) => (
                      <RowItem key={t._id} icon="person" title={t.name}
                        sub={`${t.responses}/${t.assigned} responses`}
                        right={t.locked ? <Badge label="Hidden" tone="neutral" /> : <Badge label={t.rating?.toFixed(1) ?? '—'} tone={badgeTone(t.rating)} />}
                        onPress={() => router.push({ pathname: '/modules/feedback-teacher-detail', params: { id: t._id } } as any)} />
                    ))}
                  </Card>
                )}
              </>
            )
        )}

        {tab === 'teachers' && (
          (dash.teachers || []).map((t: any) => (
            <RowItem
              key={t._id}
              icon="person"
              iconBg={Colors.modules.section.bg}
              iconColor={Colors.modules.section.icon}
              title={t.name}
              sub={`${[t.department, t.subjects?.slice(0, 2).join(', ')].filter(Boolean).join(' · ') || 'Teacher'}\n${t.responses}/${t.assigned} responses · ${t.responseRate}%`}
              right={t.locked ? <Badge label="Hidden" tone="neutral" /> : <Badge label={t.rating?.toFixed(1) ?? '—'} tone={badgeTone(t.rating)} />}
              onPress={() => router.push({ pathname: '/modules/feedback-teacher-detail', params: { id: t._id } } as any)}
            />
          ))
        )}

        {tab === 'trends' && (
          <Card>
            <Text style={s.h}>Rating by campaign</Text>
            {(dash.trend || []).length === 0
              ? <Empty icon="trending-up-outline" text="Not enough campaign history yet." />
              : dash.trend.map((p: any, i: number) => (
                <View key={i} style={{ marginBottom: 12 }}>
                  <Bar label={p.label} value={p.rating} max={5} />
                  <Text style={s.note}>{p.responses} response{p.responses === 1 ? '' : 's'}</Text>
                </View>
              ))}
          </Card>
        )}

        <Text style={s.footer}>
          <Ionicons name="lock-closed" size={10} color={Colors.textLight} />{' '}
          Individual responses are anonymous. Figures are withheld for any teacher below the campaign's minimum-response threshold.
        </Text>
      </ScrollView>
    </>
  );
}

function Bar({ label, value, max }: { label: string; value?: number | null; max: number }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={s.barHead}>
        <Text style={s.barLabel}>{label}</Text>
        <Text style={[s.barValue, { color: toneFor(value) }]}>{value == null ? '—' : value.toFixed(1)}</Text>
      </View>
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${((value || 0) / max) * 100}%`, backgroundColor: toneFor(value) }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background, padding: Spacing.md },
  h: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  muted: { fontSize: 12, color: Colors.textSecondary },
  note: { fontSize: 10, color: Colors.textLight },
  footer: { fontSize: 10, color: Colors.textLight, marginTop: Spacing.md, lineHeight: 15 },

  heroRow: { flexDirection: 'row', alignItems: 'baseline' },
  heroValue: { fontSize: 40, fontWeight: '700' },
  heroUnit: { fontSize: 15, color: Colors.textSecondary, marginLeft: 6 },
  heroLabel: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, gap: 10 },
  barLabel: { fontSize: 12, color: Colors.text, flex: 1 },
  barValue: { fontSize: 12, fontWeight: '700' },
  barTrack: { height: 7, borderRadius: 99, backgroundColor: Colors.divider, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 99 },
});
