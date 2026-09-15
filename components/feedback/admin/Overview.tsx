/**
 * Teacher Feedback → Overview.
 *
 * Five figures, three pictures, two lists — the web dashboard's shape. The
 * tiles are about the campaign in the picker, and each delta compares it with
 * the campaign before it. Shared by the school admin and a principal; the
 * server decides what either may see, and `canManage` only hides the buttons.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import * as fb from '@/api/feedback.api';
import { Colors } from '@/constants/theme';
import {
  Avatar, Bars, Blank, Btn, Card, CampaignPill, Columns, Hero, Loading, Muted, NoteBar, Page, Panel, Pick, Rating,
  Seg, Spread, Tile, Tiles, fmtDay, plural, toneAt, useLoad,
} from '../parts';

const BANDS = [
  { band: 5, label: '5 Stars', color: '#22C55E' }, { band: 4, label: '4 Stars', color: '#4ADE80' },
  { band: 3, label: '3 Stars', color: '#FACC15' }, { band: 2, label: '2 Stars', color: '#FB923C' },
  { band: 1, label: '1 Star', color: '#EF4444' },
];

const delta = (now?: number | null, then?: number | null, pct = false, digits = 1) => {
  if (now == null || then == null) return {};
  const d = now - then;
  if (Math.abs(d) < (pct ? 0.5 : 0.05)) return { delta: '0', deltaDir: 'flat' as const };
  return { delta: pct ? `${Math.abs(Math.round(d))}%` : Math.abs(d).toFixed(digits), deltaDir: d > 0 ? 'up' as const : 'down' as const };
};

export default function Overview({ onBlocked, go }: { onBlocked: () => void; go?: (tab: string, opts?: any) => void }) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState('');
  const [range, setRange] = useState('6');
  const q = useLoad<any>(() => fb.getDashboard(campaignId ? { campaignId } : {}), [campaignId], { onBlocked });
  const d = q.data;

  const teachers: any[] = useMemo(() => d?.teachers ?? [], [d]);
  const focus = d?.campaign;
  const min = focus?.minimumResponses || 5;
  const [now, prev] = useMemo(() => {
    const list = d?.campaigns ?? [];
    const i = list.findIndex((c: any) => c._id === focus?._id);
    return i < 0 ? [null, null] : [list[i], list[i + 1] ?? null];
  }, [d, focus]);
  const rated = useMemo(() => teachers.filter((t) => t.rating != null).sort((a, b) => b.rating - a.rating), [teachers]);
  const trend = useMemo(() => {
    const all = d?.trend ?? [];
    return range === 'all' ? all : all.slice(-Number(range));
  }, [d, range]);

  if (q.loading && !d) return <Loading />;
  if (q.error && !d) return <Page><NoteBar tone="red" icon="alert-circle">{q.error}</NoteBar></Page>;

  const canManage = !!d.access?.canManage;
  const openTeacher = (id: string) => router.push({ pathname: '/modules/feedback-teacher-detail', params: { id } } as any);

  if (!d.campaigns?.length) {
    return (
      <Page refreshing={q.refreshing} onRefresh={q.reload}>
        <Hero icon="chatbubbles-outline" title="Teacher Feedback" subtitle="Understand, appreciate and support our teachers through constructive feedback." />
        <Card>
          <Blank icon="megaphone-outline" title="No feedback campaign has run yet"
            body={canManage
              ? 'A campaign is one evaluation drive — a set of questions, a window of dates, and the classes it goes to. Create one and this page fills in as students respond.'
              : 'Nothing has been collected yet. Results appear here once the school runs a campaign.'}
            action={canManage && go ? <Btn kind="primary" label="Create Campaign" icon="add" onPress={() => go('campaigns', { create: true })} /> : null} />
        </Card>
      </Page>
    );
  }

  return (
    <Page refreshing={q.refreshing} onRefresh={q.reload}>
      <Hero icon="chatbubbles-outline" title={d.access?.isPrincipal ? 'School Feedback Overview' : 'Feedback Dashboard'}
        subtitle="Campaign performance and teacher evaluation across the school.">
        <Pick label="Campaign" value={campaignId || focus?._id || ''} onChange={setCampaignId}
          options={d.campaigns.map((c: any) => ({ value: c._id, label: `${c.name}${c.term ? ` · ${c.term}` : ''}` }))} />
        {canManage && go ? <Btn kind="primary" label="Create Campaign" icon="add" onPress={() => go('campaigns', { create: true })} /> : null}
      </Hero>

      <Tiles>
        <Tile icon="megaphone-outline" tone="purple" value={d.cards.totalCampaigns} label="Total Campaigns" caption={`${plural(d.cards.activeCampaigns, 'active campaign')}`} />
        <Tile icon="people-outline" tone="green" value={d.cards.teachersEvaluated} label="Teachers Evaluated" caption={`out of ${plural(teachers.length, 'teacher')}`} />
        <Tile icon="chatbubbles-outline" tone="blue" value={now?.submitted ?? 0} label="Total Responses"
          caption={teachers.length ? `Average ${Math.round((now?.submitted || 0) / teachers.length)} per teacher` : 'Nothing collected yet'}
          {...delta(now?.submitted, prev?.submitted, false, 0)} />
        <Tile icon="star-outline" tone="amber" value={now?.avgRating == null ? '—' : now.avgRating.toFixed(1)} unit={now?.avgRating == null ? '' : '/ 5'}
          label="Overall Rating" caption={now?.avgRating == null ? 'Nothing scored yet' : `Based on ${plural(now.submitted, 'response')}`}
          {...delta(now?.avgRating, prev?.avgRating)} />
        <Tile icon="trending-up-outline" tone="pink" value={`${now?.responseRate ?? 0}%`} label="Response Rate"
          caption={`${now?.submitted ?? 0} of ${now?.assigned ?? 0} students asked`} {...delta(now?.responseRate, prev?.responseRate, true)} />
      </Tiles>

      <Panel icon="trending-up-outline" tone="purple" title="Rating Trend" subtitle="Average rating across all campaigns">
        <Seg value={range} onChange={setRange} options={[{ value: '6', label: 'Last 6' }, { value: '4', label: 'Last 4' }, { value: 'all', label: 'All' }]} />
        {trend.length > 1
          ? <Columns min={1} max={5} data={trend.map((p: any) => ({ label: p.label, value: p.rating }))} />
          : <Muted>A trend needs at least two campaigns with responses — there {trend.length === 1 ? 'is one' : 'are none'} so far.</Muted>}
      </Panel>

      <Panel icon="layers-outline" tone="blue" title="Category Performance" subtitle="Average rating per feedback category"
        right={go ? <Btn small kind="soft" label="View all" onPress={() => go('insights')} /> : undefined}>
        {d.categories?.some((c: any) => c.average != null)
          ? <Bars colored data={d.categories.filter((c: any) => c.average != null).map((c: any) => ({ label: c.name, value: Number(c.average.toFixed(1)) }))} />
          : <Muted>No scored answers in this campaign yet.</Muted>}
      </Panel>

      <Panel icon="pie-chart-outline" tone="pink" title="Response Distribution" subtitle="How the submitted ratings spread across the five bands">
        <Spread noun="responses" data={BANDS.map((b) => ({ label: b.label, value: d.ratingDistribution?.[b.band] || 0, color: b.color }))} />
      </Panel>

      <Panel icon="megaphone-outline" tone="indigo" title="Recent Campaigns" subtitle="Every drive the school has run"
        right={canManage && go ? <Btn small kind="soft" label="View all" onPress={() => go('campaigns')} /> : undefined} flush>
        {d.campaigns.slice(0, 5).map((c: any, i: number) => {
          const Wrap: any = canManage ? TouchableOpacity : View;
          return (
            <Wrap key={c._id} style={[st.row, i > 0 && st.sep]} activeOpacity={0.7}
              onPress={canManage ? () => router.push({ pathname: '/modules/feedback-campaign', params: { id: c._id } } as any) : undefined}>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text style={st.name} numberOfLines={2}>{c.name}</Text>
                <Text style={st.sub}>{c.term || 'General feedback'} · {fmtDay(c.startDate)} · {c.submitted} responses</Text>
                <CampaignPill status={c.status} />
              </View>
              <Rating value={c.avgRating} />
            </Wrap>
          );
        })}
      </Panel>

      <Panel icon="trophy-outline" tone="amber" title="Top Rated Teachers" subtitle={`Teachers past the ${min}-response floor`}
        right={go ? <Btn small kind="soft" label="View all" onPress={() => go('insights')} /> : undefined} flush>
        {rated.length ? rated.slice(0, 5).map((t, i) => (
          <TouchableOpacity key={t._id} style={[st.row, i > 0 && st.sep]} onPress={() => openTeacher(t._id)} activeOpacity={0.7}>
            <Text style={[st.rank, i < 3 && { backgroundColor: ['#FEF3C7', '#E2E8F0', '#FFEDD5'][i], color: ['#B45309', '#475569', '#C2410C'][i] }]}>{i + 1}</Text>
            <Avatar name={t.name} size={34} tone={toneAt(i)} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.name} numberOfLines={1}>{t.name}</Text>
              <Text style={st.sub} numberOfLines={1}>{t.subjects?.[0] || t.department || 'Teacher'}</Text>
            </View>
            <Rating value={t.rating} sub={plural(t.responses, 'response')} />
          </TouchableOpacity>
        )) : (
          <View style={{ padding: 14 }}>
            <Muted>No teacher has reached {min} responses yet, so no rating can be shown. That is the privacy floor doing its job, not a gap in the data.</Muted>
          </View>
        )}
      </Panel>
    </Page>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  sep: { borderTopWidth: 1, borderTopColor: Colors.divider },
  name: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 11.5, color: Colors.textSecondary },
  rank: { width: 24, height: 24, borderRadius: 12, textAlign: 'center', lineHeight: 24, fontSize: 11.5, fontWeight: '800', color: Colors.textSecondary, backgroundColor: '#F1F5F9', overflow: 'hidden' },
});
