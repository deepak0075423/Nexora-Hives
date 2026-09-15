/**
 * Parent → Teacher Feedback.
 *
 * Whether each child has given feedback to their teachers — which campaigns are
 * open, which teachers are still to do, and when the window closes — so a
 * parent can remind them in time. Never what the child said: the endpoint does
 * not read answers at all, and this screen has nothing to render one with.
 *
 * One child at a time; a parent with a single child never sees a switch.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as parentApi from '@/api/parent.api';
import { Colors } from '@/constants/theme';
import {
  Avatar, Blank, Countdown, Hero, Loading, NoteBar, Page, ProgressSplit, StatePill, Tag, Tile, Tiles,
  BRAND, closesIn, fmtDay, plural, toneAt, useLoad,
} from './parts';

export default function ParentFeedback({ onBlocked }: { onBlocked: () => void }) {
  const q = useLoad<any>(() => parentApi.getChildrenFeedback(), [], { onBlocked });
  const children: any[] = useMemo(() => q.data?.children ?? [], [q.data]);
  const [childId, setChildId] = useState('');

  // Start on the first child — the server sorts the one with most still to do first.
  useEffect(() => {
    if (children.length && !children.some((c) => c._id === childId)) setChildId(children[0]._id);
  }, [children, childId]);

  if (q.loading && !q.data) return <Loading />;
  const child = children.find((c) => c._id === childId) ?? children[0];
  const next = child ? closesIn(child.summary.nextDeadline) : null;

  return (
    <Page refreshing={q.refreshing} onRefresh={q.reload}>
      <Hero icon="chatbubbles-outline" title="Teacher Feedback"
        subtitle="Whether your child has shared feedback with their teachers. You see their progress — never their answers." />

      {q.error ? <NoteBar tone="red" icon="alert-circle">{q.error}</NoteBar> : null}

      {!q.error && !children.length ? (
        <View style={st.card}>
          <Blank icon="people-outline" title="No children linked to your account"
            body="Feedback progress appears here for each child linked to you. If a child is missing, please contact the school office." />
        </View>
      ) : null}

      {children.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {children.map((c, i) => {
            const on = c._id === child?._id;
            return (
              <TouchableOpacity key={c._id} style={[st.kid, on && st.kidOn]} onPress={() => setChildId(c._id)}
                accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={c.name}>
                <Avatar name={c.name} src={c.photo} size={36} tone={toneAt(i)} />
                <View style={{ minWidth: 0 }}>
                  <Text style={st.kidName} numberOfLines={1}>{c.name}</Text>
                  <Text style={st.kidSub} numberOfLines={1}>{c.className || 'Class not recorded'}</Text>
                </View>
                {c.summary.todo > 0
                  ? <View style={st.kidBadge}><Text style={st.kidBadgeText}>{c.summary.todo}</Text></View>
                  : <Ionicons name="checkmark-circle" size={16} color="#16A34A" />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {child ? (
        <>
          {children.length === 1 ? (
            <View style={st.kidLine}>
              <Avatar name={child.name} src={child.photo} size={42} />
              <View style={{ flex: 1 }}>
                <Text style={st.kidName}>{child.name}</Text>
                <Text style={st.kidSub}>{child.className || 'Class not recorded'}</Text>
              </View>
            </View>
          ) : null}

          <Tiles>
            <Tile icon="megaphone-outline" tone="purple" value={child.summary.openCampaigns} label="Open Now"
              caption={child.summary.openCampaigns === 1 ? 'Campaign collecting feedback' : 'Campaigns collecting feedback'} />
            <Tile icon="clipboard-outline" tone="amber" value={child.summary.todo} label="Still To Do"
              caption={child.summary.todo ? 'Teachers waiting for feedback' : 'Nothing waiting'} />
            <Tile icon="checkmark-circle-outline" tone="green" value={child.summary.done} label="Done" caption="Feedback already given" />
            <Tile icon="time-outline" tone="blue"
              value={child.summary.nextDeadline ? ((next!.left ?? 0) <= 0 ? 'Today' : `${next!.left}d`) : '—'}
              label="Next Deadline" caption={child.summary.nextDeadline ? fmtDay(child.summary.nextDeadline) : 'Nothing open'} />
          </Tiles>

          {child.summary.todo > 0 && (next?.left ?? 9) <= 3 ? (
            <NoteBar tone="amber" icon="notifications-outline">
              {child.name} has {plural(child.summary.todo, 'teacher feedback')} to give, and the window {next!.text.toLowerCase()}. Once it closes it cannot be done.
            </NoteBar>
          ) : null}

          {!child.campaigns.length ? (
            <View style={st.card}>
              <Blank icon="mail-open-outline" title={`No feedback has been asked of ${child.name} yet`}
                body="When the school opens a teacher feedback campaign for their class, it appears here." />
            </View>
          ) : child.campaigns.map((c: any) => (
            <View key={c._id} style={st.camp}>
              <View style={st.campHead}>
                <View style={[st.campIcon, { backgroundColor: c.phase === 'open' ? '#D1FAE5' : c.phase === 'upcoming' ? '#DBEAFE' : '#F1F5F9' }]}>
                  <Ionicons name="megaphone-outline" size={18} color={c.phase === 'open' ? '#059669' : c.phase === 'upcoming' ? '#2563EB' : '#64748B'} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.campName}>{c.name}</Text>
                  <Text style={st.campMeta}>{[c.term, `${fmtDay(c.startDate)} – ${fmtDay(c.endDate)}`].filter(Boolean).join(' · ')}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', marginTop: -4 }}>
                {c.phase === 'open' ? <Countdown endDate={c.endDate} />
                  : c.phase === 'upcoming' ? <Tag label={`Opens ${fmtDay(c.startDate)}`} tone="blue" />
                  : <Tag label="Finished" tone="slate" />}
              </View>
              <Text style={st.summary}>
                <Text style={{ fontWeight: '800', color: Colors.text }}>{c.done} of {c.total}</Text> teacher{c.total === 1 ? '' : 's'} given feedback
                {c.phase === 'finished' && c.missed === 0 ? <Text style={{ color: '#15803D', fontWeight: '700' }}>  ✓ all done</Text> : null}
              </Text>
              <ProgressSplit done={c.done} missed={c.missed} todo={c.todo} upcoming={c.upcoming} />
              <View>
                {c.items.map((it: any, i: number) => (
                  <View key={it._id} style={[st.item, i > 0 && st.itemSep]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.itemName} numberOfLines={1}>{it.subject || 'General'}</Text>
                      <Text style={st.itemSub} numberOfLines={1}>
                        {it.teacher}{it.state === 'done' && it.submittedAt ? ` · on ${fmtDay(it.submittedAt)}` : ''}
                      </Text>
                    </View>
                    <StatePill state={it.state} />
                  </View>
                ))}
              </View>
            </View>
          ))}
        </>
      ) : null}

      <NoteBar tone="purple" icon="key-outline" title="Answers stay private — even from parents.">
        Children give feedback anonymously so they can be honest. You can see whether each teacher has been given feedback, but never what was said. To help, simply remind your child before the closing date.
      </NoteBar>
    </Page>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border },
  kid: {
    flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: Colors.border, borderRadius: 14,
    paddingVertical: 8, paddingLeft: 8, paddingRight: 12, backgroundColor: Colors.surface, maxWidth: 260,
  },
  kidOn: { borderColor: BRAND, backgroundColor: '#EEF2FF' },
  kidName: { fontSize: 13.5, fontWeight: '800', color: Colors.text },
  kidSub: { fontSize: 11, color: Colors.textSecondary },
  kidBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  kidBadgeText: { fontSize: 11, fontWeight: '800', color: '#B45309' },
  kidLine: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 2 },
  camp: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 11 },
  campHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  campIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  campName: { fontSize: 15, fontWeight: '800', color: Colors.text },
  campMeta: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 1 },
  summary: { fontSize: 12.5, color: Colors.textSecondary },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  itemSep: { borderTopWidth: 1, borderTopColor: Colors.divider },
  itemName: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  itemSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 1 },
});
