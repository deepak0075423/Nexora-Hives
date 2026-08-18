import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import * as fb from '@/api/feedback.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import {
  unwrap, LoaderView, Empty, Badge, Card, StatRow, StatTile, SegTabs, Select, RowItem,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

// A teacher's own aggregated results (spec §14/§15). The server withholds the
// numbers below the campaign's minimum-response threshold — this screen renders
// the locked state it sends back rather than deciding anything itself.
const toneFor = (v?: number | null) => (v == null ? Colors.textSecondary : v >= 4 ? Colors.success : v >= 3 ? Colors.warning : Colors.danger);

export default function TeacherFeedbackScreen() {
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [campaignId, setCampaignId] = useState('');
  const [dash, setDash] = useState<any>(undefined);
  const [trends, setTrends] = useState<any>(null);
  const [breakdown, setBreakdown] = useState<any>(null);
  const [disabled, setDisabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = campaignId ? { campaignId } : {};
      const [d, t, b] = await Promise.all([
        fb.getTeacherDashboard(params),
        fb.getTeacherTrends({}),
        fb.getTeacherBreakdown(params),
      ]);
      setDash(unwrap(d));
      setTrends(unwrap(t));
      setBreakdown(unwrap(b));
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true); else setDash(null);
    } finally { setRefreshing(false); }
  }, [campaignId]);

  useEffect(() => { if (user?.role) load(); }, [user?.role, campaignId]); // eslint-disable-line

  if (disabled) return <><Stack.Screen options={{ title: 'My Feedback' }} /><ModuleDisabled /></>;
  if (dash === undefined) return <><Stack.Screen options={{ title: 'My Feedback' }} /><LoaderView /></>;

  if (!dash?.campaign) {
    return (
      <>
        <Stack.Screen options={{ title: 'My Feedback' }} />
        <View style={s.root}>
          <Empty icon="star-outline" text="No feedback campaigns yet. Your results will appear here." />
        </View>
      </>
    );
  }

  const sum = dash.summary;

  return (
    <>
      <Stack.Screen options={{ title: 'My Feedback' }} />
      <ScrollView
        style={s.root}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <Select
          label="Campaign"
          value={campaignId || dash.campaign._id}
          onChange={setCampaignId}
          options={(dash.campaigns || []).map((c: any) => ({
            label: `${c.name}${c.term ? ` · ${c.term}` : ''}`, value: c._id,
          }))}
        />

        {sum.locked ? (
          <Card>
            <View style={s.lockBox}>
              <Ionicons name="lock-closed" size={30} color={Colors.textLight} />
              <Text style={s.lockTitle}>Results are hidden</Text>
              <Text style={s.lockText}>
                {sum.responses === 0
                  ? 'No responses have been submitted yet.'
                  : `Only ${sum.responses} of ${sum.minimumResponses} responses so far.`}
                {'\n'}Results appear once at least {sum.minimumResponses} students have responded, so no individual can be identified.
              </Text>
            </View>
          </Card>
        ) : (
          <>
            <Card>
              <View style={s.heroRow}>
                <Text style={[s.heroValue, { color: toneFor(sum.averageRating) }]}>
                  {sum.averageRating == null ? '—' : sum.averageRating.toFixed(1)}
                </Text>
                <Text style={s.heroUnit}>/ 5.0</Text>
              </View>
              <Text style={s.heroLabel}>Overall rating · {dash.campaign.name}</Text>
            </Card>

            <StatRow>
              <StatTile label="Responses" value={sum.responses} icon="chatbubbles" tone="info" />
              <StatTile label="Rate" value={`${sum.responseRate}%`} icon="trending-up" tone="success" />
              <StatTile label="Assigned" value={sum.assigned} icon="people" tone="warning" />
            </StatRow>

            <SegTabs active={tab} onChange={setTab} tabs={[
              { key: 'overview', label: 'Categories' },
              { key: 'trends', label: 'Trends' },
              { key: 'where', label: 'Sources' },
              { key: 'comments', label: 'Comments' },
            ]} />
            <View style={{ height: Spacing.md }} />

            {tab === 'overview' && (
              <>
                <Card>
                  <Text style={s.h}>Category performance</Text>
                  {(dash.categories || []).length === 0
                    ? <Empty icon="stats-chart-outline" text="No category scores yet." />
                    : dash.categories.map((c: any) => (
                      <View key={c._id} style={{ marginBottom: 12 }}>
                        <View style={s.barHead}>
                          <Text style={s.barLabel}>{c.name}</Text>
                          <Text style={[s.barValue, { color: toneFor(c.average) }]}>
                            {c.average == null ? '—' : c.average.toFixed(1)}
                          </Text>
                        </View>
                        <View style={s.barTrack}>
                          <View style={[s.barFill, { width: `${((c.average || 0) / 5) * 100}%`, backgroundColor: toneFor(c.average) }]} />
                        </View>
                      </View>
                    ))}
                </Card>

                <Card>
                  <Text style={s.h}>Strengths</Text>
                  {(dash.strengths || []).length
                    ? dash.strengths.map((c: any) => (
                      <RowItem key={c._id} icon="thumbs-up" iconBg={Colors.successLight} iconColor={Colors.success}
                        title={c.name} right={<Badge label={c.average.toFixed(1)} tone="success" />} />
                    ))
                    : <Text style={s.muted}>No category is above 4.0 yet.</Text>}

                  <Text style={[s.h, { marginTop: 12 }]}>Improvement areas</Text>
                  {(dash.improvements || []).length
                    ? dash.improvements.map((c: any) => (
                      <RowItem key={c._id} icon="construct" iconBg={Colors.warningLight} iconColor={Colors.warning}
                        title={c.name} right={<Badge label={c.average.toFixed(1)} tone="warning" />} />
                    ))
                    : <Text style={s.muted}>Every category is at 4.0 or above.</Text>}
                </Card>

                {(dash.options || []).map((block: any) => (
                  <Card key={block.question}>
                    <Text style={s.h}>{block.question}</Text>
                    {block.options.map((o: any) => (
                      <View key={o.label} style={{ marginBottom: 10 }}>
                        <View style={s.barHead}>
                          <Text style={s.barLabel}>{o.label}</Text>
                          <Text style={s.barValue}>{o.count} ({o.percent}%)</Text>
                        </View>
                        <View style={s.barTrack}>
                          <View style={[s.barFill, { width: `${o.percent}%`, backgroundColor: Colors.primaryLight }]} />
                        </View>
                      </View>
                    ))}
                  </Card>
                ))}
              </>
            )}

            {tab === 'trends' && (
              <Card>
                <Text style={s.h}>Rating by campaign</Text>
                {trends?.disabled ? (
                  <Text style={s.muted}>Your school has turned off historical trends for teachers.</Text>
                ) : (trends?.points || []).filter((p: any) => p.rating != null).length === 0 ? (
                  <Empty icon="trending-up-outline" text="Not enough history yet." />
                ) : (
                  trends.points.filter((p: any) => p.rating != null).map((p: any) => (
                    <View key={p.campaignId} style={{ marginBottom: 12 }}>
                      <View style={s.barHead}>
                        <Text style={s.barLabel}>{p.label}</Text>
                        <Text style={[s.barValue, { color: toneFor(p.rating) }]}>{p.rating.toFixed(1)}</Text>
                      </View>
                      <View style={s.barTrack}>
                        <View style={[s.barFill, { width: `${(p.rating / 5) * 100}%`, backgroundColor: toneFor(p.rating) }]} />
                      </View>
                      <Text style={s.subtle}>{p.responses} response{p.responses === 1 ? '' : 's'}</Text>
                    </View>
                  ))
                )}
              </Card>
            )}

            {tab === 'where' && (
              <>
                <Card>
                  <Text style={s.h}>By subject</Text>
                  {(breakdown?.bySubject || []).length === 0
                    ? <Empty icon="book-outline" text="No subject data." />
                    : breakdown.bySubject.map((r: any) => (
                      <RowItem key={r._id} icon="book" title={r.name}
                        sub={`${r.responses}/${r.assigned} responses · ${r.responseRate}%`}
                        right={r.locked
                          ? <Badge label="Hidden" tone="neutral" />
                          : <Badge label={r.rating?.toFixed(1) ?? '—'} tone={r.rating >= 4 ? 'success' : r.rating >= 3 ? 'warning' : 'danger'} />} />
                    ))}
                </Card>
                <Card>
                  <Text style={s.h}>By section</Text>
                  {(breakdown?.bySection || []).length === 0
                    ? <Empty icon="people-outline" text="No section data." />
                    : breakdown.bySection.map((r: any) => (
                      <RowItem key={r._id} icon="people" title={r.name}
                        sub={`${r.responses}/${r.assigned} responses · ${r.responseRate}%`}
                        right={r.locked
                          ? <Badge label="Hidden" tone="neutral" />
                          : <Badge label={r.rating?.toFixed(1) ?? '—'} tone={r.rating >= 4 ? 'success' : r.rating >= 3 ? 'warning' : 'danger'} />} />
                    ))}
                </Card>
              </>
            )}

            {tab === 'comments' && (
              <Card>
                <Text style={s.h}>Student comments</Text>
                {!dash.settings?.canSeeComments ? (
                  <Text style={s.muted}>Your school has turned off comment visibility for teachers.</Text>
                ) : (dash.comments || []).length === 0 ? (
                  <Empty icon="chatbox-outline" text="No written comments in this campaign." />
                ) : (
                  dash.comments.map((c: any, i: number) => (
                    <View key={i} style={s.comment}><Text style={s.commentText}>{c.text}</Text></View>
                  ))
                )}
                <Text style={s.subtle}>Comments are anonymous and shown in no particular order.</Text>
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background, padding: Spacing.md },
  h: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  muted: { fontSize: 12, color: Colors.textSecondary },
  subtle: { fontSize: 10, color: Colors.textLight, marginTop: 6 },

  heroRow: { flexDirection: 'row', alignItems: 'baseline' },
  heroValue: { fontSize: 40, fontWeight: '700' },
  heroUnit: { fontSize: 15, color: Colors.textSecondary, marginLeft: 6 },
  heroLabel: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, gap: 10 },
  barLabel: { fontSize: 12, color: Colors.text, flex: 1 },
  barValue: { fontSize: 12, fontWeight: '700', color: Colors.text },
  barTrack: { height: 7, borderRadius: 99, backgroundColor: Colors.divider, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 99 },

  lockBox: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  lockTitle: { ...Typography.h4, color: Colors.textSecondary },
  lockText: { fontSize: 12, color: Colors.textLight, textAlign: 'center', lineHeight: 18 },

  comment: {
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, padding: 12,
    marginBottom: 8, borderLeftWidth: 3, borderLeftColor: Colors.primary,
  },
  commentText: { fontSize: 13, color: Colors.text, lineHeight: 18 },
});
