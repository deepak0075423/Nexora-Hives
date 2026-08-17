import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as fb from '@/api/feedback.api';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { unwrap, LoaderView, Empty, Badge, Card, StatRow, StatTile, RowItem } from '@/components/ui/kit';

// Drill-down on one teacher, opened from the admin console or the principal
// overview. Obeys the same privacy floor as everywhere else: below the
// threshold the server sends a locked summary and this screen shows it.
const toneFor = (v?: number | null) => (v == null ? Colors.textSecondary : v >= 4 ? Colors.success : v >= 3 ? Colors.warning : Colors.danger);

export default function FeedbackTeacherDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<any>(undefined);

  useEffect(() => {
    if (!id) return;
    fb.getTeacherAnalytics(String(id)).then((r) => setData(unwrap(r))).catch(() => setData(null));
  }, [id]);

  if (data === undefined) return <><Stack.Screen options={{ title: 'Teacher' }} /><LoaderView /></>;
  if (!data) {
    return (
      <>
        <Stack.Screen options={{ title: 'Teacher' }} />
        <View style={s.root}><Empty icon="alert-circle-outline" text="Could not load this teacher's feedback." /></View>
      </>
    );
  }

  const sum = data.summary;

  return (
    <>
      <Stack.Screen options={{ title: data.teacher?.name || 'Teacher' }} />
      <ScrollView style={s.root} contentContainerStyle={{ padding: Spacing.md, paddingBottom: 60 }}>
        <Card>
          <Text style={s.name}>{data.teacher?.name}</Text>
          <Text style={s.meta}>
            {[data.profile?.designation || 'Teacher', data.profile?.department, data.profile?.employeeId].filter(Boolean).join(' · ')}
          </Text>
          {!!data.campaign && <Text style={s.meta}>{data.campaign.name}{data.campaign.term ? ` · ${data.campaign.term}` : ''}</Text>}
        </Card>

        {!sum ? (
          <Empty icon="megaphone-outline" text="No feedback campaigns have run yet." />
        ) : sum.locked ? (
          <Card>
            <View style={s.lockBox}>
              <Ionicons name="lock-closed" size={30} color={Colors.textLight} />
              <Text style={s.lockTitle}>Results are hidden</Text>
              <Text style={s.lockText}>
                {sum.responses === 0
                  ? 'No responses submitted yet.'
                  : `Only ${sum.responses} of ${sum.minimumResponses} responses so far.`}
                {'\n'}Aggregated results appear once the minimum-response threshold is met.
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
              <Text style={s.heroLabel}>Average rating</Text>
            </Card>

            <StatRow>
              <StatTile label="Responses" value={sum.responses} icon="chatbubbles" tone="info" />
              <StatTile label="Rate" value={`${sum.responseRate}%`} icon="trending-up" tone="success" />
              <StatTile label="Assigned" value={sum.assigned} icon="people" tone="warning" />
            </StatRow>

            <Card>
              <Text style={s.h}>Category performance</Text>
              {(data.categories || []).map((c: any) => (
                <View key={c._id} style={{ marginBottom: 12 }}>
                  <View style={s.barHead}>
                    <Text style={s.barLabel}>{c.name}</Text>
                    <Text style={[s.barValue, { color: toneFor(c.average) }]}>{c.average?.toFixed(1) ?? '—'}</Text>
                  </View>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, { width: `${((c.average || 0) / 5) * 100}%`, backgroundColor: toneFor(c.average) }]} />
                  </View>
                </View>
              ))}
            </Card>

            {(data.trend || []).filter((p: any) => p.rating != null).length > 1 && (
              <Card>
                <Text style={s.h}>Trend</Text>
                {data.trend.filter((p: any) => p.rating != null).map((p: any, i: number) => (
                  <RowItem key={i} icon="trending-up" title={p.label} sub={`${p.responses} responses`}
                    right={<Badge label={p.rating.toFixed(1)} tone={p.rating >= 4 ? 'success' : p.rating >= 3 ? 'warning' : 'danger'} />} />
                ))}
              </Card>
            )}

            <Card>
              <Text style={s.h}>Strengths</Text>
              {(data.strengths || []).length
                ? data.strengths.map((c: any) => (
                  <RowItem key={c._id} icon="thumbs-up" iconBg={Colors.successLight} iconColor={Colors.success}
                    title={c.name} right={<Badge label={c.average.toFixed(1)} tone="success" />} />
                ))
                : <Text style={s.muted}>No category is above 4.0.</Text>}
              <Text style={[s.h, { marginTop: 12 }]}>Improvement areas</Text>
              {(data.improvements || []).length
                ? data.improvements.map((c: any) => (
                  <RowItem key={c._id} icon="construct" iconBg={Colors.warningLight} iconColor={Colors.warning}
                    title={c.name} right={<Badge label={c.average.toFixed(1)} tone="warning" />} />
                ))
                : <Text style={s.muted}>Every category is at 4.0 or above.</Text>}
            </Card>

            {(data.comments || []).length > 0 && (
              <Card>
                <Text style={s.h}>Student comments</Text>
                {data.comments.map((c: any, i: number) => (
                  <View key={i} style={s.comment}><Text style={s.commentText}>{c.text}</Text></View>
                ))}
                <Text style={s.note}>Anonymous and unordered — never linked back to a student.</Text>
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
  note: { fontSize: 10, color: Colors.textLight, marginTop: 6 },
  name: { ...Typography.h4, color: Colors.text },
  meta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  heroRow: { flexDirection: 'row', alignItems: 'baseline' },
  heroValue: { fontSize: 36, fontWeight: '700' },
  heroUnit: { fontSize: 14, color: Colors.textSecondary, marginLeft: 6 },
  heroLabel: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, gap: 10 },
  barLabel: { fontSize: 12, color: Colors.text, flex: 1 },
  barValue: { fontSize: 12, fontWeight: '700' },
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
