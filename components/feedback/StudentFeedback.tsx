/**
 * Student → Teacher Feedback.
 *
 * What is still owed, what has been given, and what was missed — grouped by
 * campaign, because "3 of 8 done, closes in 4 days" is the sentence a student
 * acts on, and a flat list of teacher cards never says it.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as fb from '@/api/feedback.api';
import { Colors } from '@/constants/theme';
import {
  Avatar, Blank, Btn, Countdown, Hero, Loading, NoteBar, Page, ProgressSplit, Seg, Tag, Tile, Tiles,
  closesIn, fmtDay, toneAt, useLoad,
} from './parts';

type Row = any & { state: 'todo' | 'done' | 'missed' };

export default function StudentFeedback({ onBlocked }: { onBlocked: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<'todo' | 'done' | 'missed'>('todo');
  const pending = useLoad<any[]>(() => fb.getPending(), [], { onBlocked });
  const completed = useLoad<any[]>(() => fb.getCompleted(), [], { onBlocked });
  const missed = useLoad<any[]>(() => fb.getMissed(), [], { onBlocked });

  const todo = useMemo(() => pending.data ?? [], [pending.data]);
  const done = useMemo(() => completed.data ?? [], [completed.data]);
  const lost = useMemo(() => missed.data ?? [], [missed.data]);

  // One entry per campaign carrying every card of the student's in it, so its
  // progress bar counts all three states whichever tab is showing.
  const campaigns = useMemo(() => {
    const m = new Map<string, any>();
    const add = (row: any, state: Row['state']) => {
      const c = row.campaign || {};
      const key = c._id || 'none';
      if (!m.has(key)) m.set(key, { ...c, _id: key, deadline: row.deadline, rows: [] as Row[] });
      m.get(key).rows.push({ ...row, state });
    };
    todo.forEach((r) => add(r, 'todo'));
    done.forEach((r) => add(r, 'done'));
    lost.forEach((r) => add(r, 'missed'));
    return [...m.values()].map((c) => ({
      ...c,
      todo: c.rows.filter((r: Row) => r.state === 'todo').length,
      done: c.rows.filter((r: Row) => r.state === 'done').length,
      missed: c.rows.filter((r: Row) => r.state === 'missed').length,
    }));
  }, [todo, done, lost]);

  if (pending.loading && !pending.data) return <Loading />;

  const error = pending.error || completed.error || missed.error;
  const soonest = todo.map((r) => r.deadline).filter(Boolean).sort((a, b) => +new Date(a) - +new Date(b))[0];
  const soon = closesIn(soonest);
  const visible = campaigns
    .filter((c) => c[tab] > 0)
    .sort((a, b) => (tab === 'todo'
      ? +new Date(a.deadline || 0) - +new Date(b.deadline || 0)
      : +new Date(b.deadline || 0) - +new Date(a.deadline || 0)));
  const reload = () => { pending.reload(); completed.reload(); missed.reload(); };

  return (
    <Page refreshing={pending.refreshing} onRefresh={reload}>
      <Hero icon="chatbubbles-outline" title="Teacher Feedback"
        subtitle="Tell your teachers what is working and what could be better. Your answers are anonymous." />

      {error ? <NoteBar tone="red" icon="alert-circle">{error}</NoteBar> : null}

      <Tiles>
        <Tile icon="clipboard-outline" tone="amber" value={todo.length} label="To Do"
          caption={todo.length ? 'Teachers waiting for you' : 'Nothing waiting'} onPress={() => setTab('todo')} on={tab === 'todo' && todo.length > 0} />
        <Tile icon="checkmark-circle-outline" tone="green" value={done.length} label="Done"
          caption="Thank you for sharing" onPress={() => setTab('done')} on={tab === 'done'} />
        <Tile icon="time-outline" tone="blue" value={soonest ? (soon.left! <= 0 ? 'Today' : `${soon.left}d`) : '—'}
          label="Next Deadline" caption={soonest ? fmtDay(soonest) : 'No open feedback'} />
        <Tile icon="alert-circle-outline" tone="pink" value={lost.length} label="Missed"
          caption="Closed before you answered" onPress={() => setTab('missed')} on={tab === 'missed'} />
      </Tiles>

      {tab === 'todo' && todo.some((r) => (closesIn(r.deadline).left ?? 9) <= 2) ? (
        <NoteBar tone="amber" icon="notifications-outline">
          Some feedback closes within two days — once a campaign closes, it cannot be answered any more.
        </NoteBar>
      ) : null}

      <Seg value={tab} onChange={(v) => setTab(v as any)} options={[
        { value: 'todo', label: `To do (${todo.length})` },
        { value: 'done', label: `Done (${done.length})` },
        { value: 'missed', label: `Missed (${lost.length})` },
      ]} />

      {!visible.length ? (
        <View style={st.card}>
          {tab === 'todo'
            ? <Blank icon="happy-outline" title="You are all caught up" body="There is no teacher feedback waiting for you. When your school opens a new campaign, it will appear here." />
            : tab === 'done'
              ? <Blank icon="document-text-outline" title="Nothing submitted yet" body="Feedback you give appears here, and you can re-read it any time." />
              : <Blank icon="checkmark-done-outline" title="Nothing missed" body="You have answered every campaign before it closed." />}
        </View>
      ) : visible.map((c) => (
        <View key={c._id} style={st.camp}>
          <View style={st.campHead}>
            <View style={st.campIcon}><Ionicons name="megaphone-outline" size={18} color="#7C3AED" /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.campName}>{c.name || 'Feedback'}</Text>
              <Text style={st.campMeta}>{[c.term, c.deadline ? `Closes ${fmtDay(c.deadline)}` : ''].filter(Boolean).join(' · ')}</Text>
            </View>
          </View>
          <View style={st.tags}>
            {c.isAnonymous ? <Tag label="Anonymous" tone="purple" icon="key-outline" /> : null}
            {tab === 'todo' ? <Countdown endDate={c.deadline} /> : null}
          </View>
          <ProgressSplit done={c.done} missed={c.missed} todo={c.todo} />
          <View style={{ gap: 8 }}>
            {c.rows.filter((r: Row) => r.state === tab).map((r: Row, i: number) => (
              <TeacherCard key={r._id} row={r} index={i}
                onStart={() => router.push({ pathname: '/modules/feedback-form', params: { id: r._id } } as any)}
                onView={() => router.push({ pathname: '/modules/feedback-view', params: { id: r._id } } as any)} />
            ))}
          </View>
        </View>
      ))}

      <NoteBar tone="purple" icon="key-outline" title="Your answers are anonymous.">
        Teachers only ever see results combined across many students, and only once enough have answered. Nobody can see which answers are yours.
      </NoteBar>
    </Page>
  );
}

function TeacherCard({ row, index, onStart, onView }: { row: Row; index: number; onStart: () => void; onView: () => void }) {
  const place = [row.className, row.sectionName].filter(Boolean).join(' ');
  const edge = row.state === 'todo' ? '#F59E0B' : row.state === 'done' ? '#22C55E' : '#F472B6';
  const Wrap: any = row.state === 'missed' ? View : TouchableOpacity;
  return (
    <Wrap style={[st.tc, { borderLeftColor: edge }]} onPress={row.state === 'todo' ? onStart : onView} activeOpacity={0.8}>
      <Avatar name={row.teacher?.name} src={row.teacher?.photo} size={42} tone={toneAt(index)} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.tcName} numberOfLines={1}>{row.teacher?.name}</Text>
        <Text style={st.tcSub} numberOfLines={1}>{[row.subject || 'General', place].filter(Boolean).join(' · ')}</Text>
        {row.state === 'done' ? (
          <Text style={st.tcDone} numberOfLines={1}>
            Sent {fmtDay(row.submittedAt)}{row.overallRating != null ? <Text style={st.tcGave}> · you gave ★ {Number(row.overallRating).toFixed(1)}</Text> : null}
          </Text>
        ) : row.state === 'missed' ? <Text style={st.tcMissed}>Closed before it was answered</Text> : null}
      </View>
      {row.state === 'todo' ? <Btn small kind="primary" label="Start" icon="arrow-forward" onPress={onStart} /> : null}
      {row.state === 'done' ? <Btn small label="View" icon="eye-outline" onPress={onView} /> : null}
    </Wrap>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border },
  camp: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 12 },
  campHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  campIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  campName: { fontSize: 15, fontWeight: '800', color: Colors.text },
  campMeta: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -4 },
  tc: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3,
    borderRadius: 12, padding: 10, backgroundColor: Colors.surface,
  },
  tcName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  tcSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 1 },
  tcDone: { fontSize: 11, color: '#15803D', fontWeight: '700', marginTop: 3 },
  tcGave: { color: Colors.textSecondary, fontWeight: '500' },
  tcMissed: { fontSize: 11, color: '#BE185D', fontWeight: '700', marginTop: 3 },
});

