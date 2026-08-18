import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import * as fb from '@/api/feedback.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import {
  unwrap, LoaderView, Empty, Badge, Card, StatRow, StatTile, SegTabs, RowItem,
  Select, ActionBtn, confirmAsync, fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

// Admin feedback console on mobile: the numbers, the teacher table, and the
// campaign actions an admin actually needs on a phone (activate / close / remind
// / sync). Full campaign authoring stays on the web, where the targeting picker
// belongs.
const toneFor = (v?: number | null) => (v == null ? Colors.textSecondary : v >= 4 ? Colors.success : v >= 3 ? Colors.warning : Colors.danger);
const badgeTone = (v?: number | null) => (v == null ? 'neutral' : v >= 4 ? 'success' : v >= 3 ? 'warning' : 'danger') as any;

export default function AdminFeedbackScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState('overview');
  const [campaignId, setCampaignId] = useState('');
  const [dash, setDash] = useState<any>(undefined);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [disabled, setDisabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([
        fb.getDashboard(campaignId ? { campaignId } : {}),
        fb.getCampaigns({ limit: 50 }),
      ]);
      setDash(unwrap(d));
      setCampaigns(unwrap(c)?.data ?? []);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true); else setDash(null);
    } finally { setRefreshing(false); }
  }, [campaignId]);

  useEffect(() => { if (user?.role) load(); }, [user?.role, campaignId]); // eslint-disable-line

  const act = async (row: any, action: string) => {
    const copy: Record<string, [string, string]> = {
      activate: ['Activate campaign?', 'Assignments will be generated for every matching student and they will be notified.'],
      close:    ['Close campaign?', 'Students can no longer submit. Nothing is deleted.'],
      remind:   ['Send reminders?', 'Every student with pending feedback will be notified.'],
      sync:     ['Regenerate assignments?', 'New student–teacher pairs will be added. Existing feedback is untouched.'],
    };
    const [title, msg] = copy[action];
    if (!(await confirmAsync(title, msg, 'Yes'))) return;

    setBusy(row._id);
    try {
      if (action === 'activate')   { const r = unwrap(await fb.activateCampaign(row._id)); Alert.alert('Done', `${r.created} assignment(s) created`); }
      else if (action === 'close') { await fb.closeCampaign(row._id); Alert.alert('Done', 'Campaign closed'); }
      else if (action === 'remind'){ const r = unwrap(await fb.sendReminders(row._id)); Alert.alert('Done', `Reminded ${r.reminded} student(s)`); }
      else if (action === 'sync')  { const r = unwrap(await fb.syncAssignments(row._id)); Alert.alert('Done', `${r.created} new assignment(s)`); }
      load();
    } catch (e: any) {
      Alert.alert('Could not complete', e?.message || 'Please try again.');
    } finally { setBusy(''); }
  };

  if (disabled) return <><Stack.Screen options={{ title: 'Teacher Feedback' }} /><ModuleDisabled /></>;
  if (dash === undefined) return <><Stack.Screen options={{ title: 'Teacher Feedback' }} /><LoaderView /></>;

  if (!dash?.campaigns?.length) {
    return (
      <>
        <Stack.Screen options={{ title: 'Teacher Feedback' }} />
        <View style={s.root}>
          <Empty icon="megaphone-outline" text="No feedback campaigns yet. Create one on the web console to start collecting feedback." />
        </View>
      </>
    );
  }

  const c = dash.cards;
  const min = dash.campaign?.minimumResponses || 5;

  return (
    <>
      <Stack.Screen options={{ title: 'Teacher Feedback' }} />
      <ScrollView
        style={s.root}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <StatRow>
          <StatTile label="Campaigns" value={c.totalCampaigns} icon="megaphone" tone="info" />
          <StatTile label="Active" value={c.activeCampaigns} icon="radio-button-on" tone="success" />
          <StatTile label="Evaluated" value={c.teachersEvaluated} icon="people" tone="warning" />
        </StatRow>
        <StatRow>
          <StatTile label="Responses" value={c.totalResponses} icon="chatbubbles" tone="info" />
          <StatTile label="Pending" value={c.pendingResponses} icon="time" tone={c.pendingResponses ? 'warning' : 'neutral'} />
          <StatTile label="Rate" value={`${c.responseRate}%`} icon="trending-up" tone="success" />
        </StatRow>

        <Card>
          <View style={s.heroRow}>
            <Text style={[s.heroValue, { color: toneFor(c.averageRating) }]}>
              {c.averageRating == null ? '—' : c.averageRating.toFixed(1)}
            </Text>
            <Text style={s.heroUnit}>/ 5.0</Text>
          </View>
          <Text style={s.heroLabel}>School-wide average rating</Text>
        </Card>

        <Select
          label="Campaign"
          value={campaignId || dash.campaign?._id || ''}
          onChange={setCampaignId}
          options={(dash.campaigns || []).map((x: any) => ({ label: `${x.name}${x.term ? ` · ${x.term}` : ''}`, value: x._id }))}
        />

        <SegTabs active={tab} onChange={setTab} tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'teachers', label: 'Teachers' },
          { key: 'departments', label: 'Departments' },
          { key: 'campaigns', label: 'Campaigns' },
        ]} />
        <View style={{ height: Spacing.md }} />

        {tab === 'overview' && (
          <Card>
            <Text style={s.h}>Category performance</Text>
            {(dash.categories || []).length === 0
              ? <Empty icon="stats-chart-outline" text="No scored responses yet." />
              : dash.categories.map((cat: any) => (
                <View key={cat._id} style={{ marginBottom: 12 }}>
                  <View style={s.barHead}>
                    <Text style={s.barLabel}>{cat.name}</Text>
                    <Text style={[s.barValue, { color: toneFor(cat.average) }]}>
                      {cat.average == null ? '—' : cat.average.toFixed(1)}
                    </Text>
                  </View>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, { width: `${((cat.average || 0) / 5) * 100}%`, backgroundColor: toneFor(cat.average) }]} />
                  </View>
                </View>
              ))}
            <Text style={s.note}>
              <Ionicons name="lock-closed" size={10} color={Colors.textLight} /> Per-teacher figures stay hidden below {min} responses.
            </Text>
          </Card>
        )}

        {tab === 'teachers' && (
          (dash.teachers || []).length === 0
            ? <Empty icon="people-outline" text="No teachers evaluated yet." />
            : dash.teachers.map((t: any) => (
              <RowItem
                key={t._id}
                icon="person"
                iconBg={Colors.modules.section.bg}
                iconColor={Colors.modules.section.icon}
                title={t.name}
                sub={`${[t.department, t.subjects?.slice(0, 2).join(', ')].filter(Boolean).join(' · ') || 'Teacher'}\n${t.responses}/${t.assigned} responses · ${t.responseRate}%`}
                right={t.locked
                  ? <Badge label="Hidden" tone="neutral" />
                  : <Badge label={t.rating?.toFixed(1) ?? '—'} tone={badgeTone(t.rating)} />}
                onPress={() => router.push({ pathname: '/modules/feedback-teacher-detail', params: { id: t._id } } as any)}
              />
            ))
        )}

        {tab === 'departments' && (
          (dash.departments || []).length === 0
            ? <Empty icon="business-outline" text="No department data. Set departments on teacher profiles." />
            : dash.departments.map((d: any) => (
              <RowItem
                key={d.name}
                icon="business"
                iconBg={Colors.modules.analytics.bg}
                iconColor={Colors.modules.analytics.icon}
                title={d.name}
                sub={`${d.teachers} teacher(s) · ${d.responses} responses · ${d.responseRate}%`}
                right={<Badge label={d.rating?.toFixed(1) ?? '—'} tone={badgeTone(d.rating)} />}
              />
            ))
        )}

        {tab === 'campaigns' && campaigns.map((cp: any) => (
          <Card key={cp._id}>
            <View style={s.cpTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.cpName}>{cp.name}</Text>
                <Text style={s.cpMeta}>
                  {[cp.term, `${fmtDate(cp.startDate)} – ${fmtDate(cp.endDate)}`].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Badge label={cp.status} />
            </View>

            <View style={s.cpStats}>
              <Text style={s.cpStat}>{cp.submitted}/{cp.assigned} responses</Text>
              <Text style={s.cpStat}>{cp.responseRate}% rate</Text>
              <Text style={[s.cpStat, { color: toneFor(cp.avgRating), fontWeight: '700' }]}>
                {cp.avgRating == null ? '—' : `${cp.avgRating.toFixed(1)} / 5`}
              </Text>
            </View>

            <View style={s.cpActions}>
              {cp.status === 'draft' && <ActionBtn small label="Activate" tone="success" onPress={() => act(cp, 'activate')} />}
              {cp.status === 'active' && <>
                <ActionBtn small label="Remind" tone="info" onPress={() => act(cp, 'remind')} />
                <ActionBtn small label="Sync" tone="neutral" onPress={() => act(cp, 'sync')} />
                <ActionBtn small label="Close" tone="warning" onPress={() => act(cp, 'close')} />
              </>}
              {busy === cp._id && <Text style={s.cpStat}>Working…</Text>}
            </View>
          </Card>
        ))}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background, padding: Spacing.md },
  h: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  note: { fontSize: 10, color: Colors.textLight, marginTop: 6 },

  heroRow: { flexDirection: 'row', alignItems: 'baseline' },
  heroValue: { fontSize: 36, fontWeight: '700' },
  heroUnit: { fontSize: 14, color: Colors.textSecondary, marginLeft: 6 },
  heroLabel: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, gap: 10 },
  barLabel: { fontSize: 12, color: Colors.text, flex: 1 },
  barValue: { fontSize: 12, fontWeight: '700', color: Colors.text },
  barTrack: { height: 7, borderRadius: 99, backgroundColor: Colors.divider, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 99 },

  cpTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cpName: { ...Typography.label, color: Colors.text },
  cpMeta: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  cpStats: { flexDirection: 'row', gap: 12, marginTop: 10, flexWrap: 'wrap' },
  cpStat: { fontSize: 11, color: Colors.textSecondary },
  cpActions: {
    flexDirection: 'row', gap: 6, marginTop: 12, paddingTop: 10, flexWrap: 'wrap',
    borderTopWidth: 1, borderTopColor: Colors.divider, alignItems: 'center',
  },
});
