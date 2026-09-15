import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as teacherApi from '@/api/teacher.api';
import {
  unwrap, LoaderView, Empty, Card, SearchBar, SegTabs, FAB, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import { ExamRow, Figures, Figure, plural } from './parts';
import ExamForm from './ExamForm';

/**
 * Teacher → Aptitude Exams.
 *
 * The same board as the web: figures over the exams this teacher wrote or
 * class-teaches, what is waiting on them, and the list. Creating an exam obeys
 * the same rules the server enforces (services/examPermissions.js) — any
 * subject in a section you are class teacher or vice class teacher of, and
 * only the subjects you teach elsewhere; the form offers nothing else.
 */

const err = (e: any) => e?.data?.message ?? e?.message ?? 'Something went wrong';

const FILTERS: Record<string, (e: any) => boolean> = {
  all: () => true,
  draft: (e) => e.stage === 'draft',
  upcoming: (e) => ['scheduled', 'live'].includes(e.stage),
  completed: (e) => e.stage === 'completed',
};

export default function TeacherExams({ onBlocked }: { onBlocked: () => void }) {
  const router = useRouter();
  const [board, setBoard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setBoard(unwrap(await teacherApi.getExamBoard()));
    } catch (e: any) {
      if (MODULE_BLOCKED_CODES.includes(e?.data?.code)) onBlocked();
      else Alert.alert('Could not load exams', err(e));
    } finally { setLoading(false); setRefreshing(false); }
  }, [onBlocked]);

  useEffect(() => { load(); }, [load]);

  const exams: any[] = board?.exams ?? [];
  const t = board?.tiles ?? {};
  const open = (e: any, path = '') => router.push({ pathname: '/modules/exam-workspace', params: { id: e._id, tab: path } } as any);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exams.filter(FILTERS[tab]).filter((e) => !q
      || e.title.toLowerCase().includes(q)
      || (e.subjectName ?? '').toLowerCase().includes(q)
      || (e.audience?.label ?? '').toLowerCase().includes(q));
  }, [exams, tab, search]);

  const attention = useMemo(() => [
    ...exams.filter(e => e.task).map(e => ({ e, icon: 'checkmark-done', tone: '#6D28D9', bg: '#EDE9FE', tab: 'results',
      text: e.task === 'subject' ? 'Confirm the scores for the class teacher' : 'Approve and publish the results' })),
    ...exams.filter(e => e.stage === 'live').map(e => ({ e, icon: 'radio', tone: Colors.success, bg: Colors.successLight, tab: 'submissions',
      text: `Live now — ${e.submitted} of ${plural(e.eligible, 'student')} submitted` })),
    ...exams.filter(e => e.stage === 'draft' && e.isAuthor && !e.readiness?.ready).map(e => ({ e, icon: 'alert-circle', tone: Colors.warning, bg: Colors.warningLight, tab: 'questions',
      text: e.readiness?.checks?.find((c: any) => !c.ok)?.detail ?? 'Not ready to publish' })),
  ].slice(0, 4), [exams]);

  if (loading) return <LoaderView />;

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <Figures>
          <Figure label="My exams" value={t.total ?? 0} icon="documents" tone="info" />
          <Figure label="Drafts" value={t.drafts ?? 0} icon="create" tone={t.notReady ? 'warning' : 'neutral'} />
          <Figure label="Scheduled" value={t.scheduled ?? 0} icon="calendar" tone={t.live ? 'success' : 'neutral'} />
          <Figure label="Awaiting you" value={t.tasks ?? 0} icon="checkmark-done" tone={t.tasks ? 'warning' : 'neutral'} />
        </Figures>

        <TouchableOpacity style={s.analyticsBtn} onPress={() => router.push('/modules/exam-analytics' as any)} activeOpacity={0.8}>
          <Ionicons name="stats-chart" size={16} color={Colors.primary} />
          <Text style={s.analyticsText}>Exam analytics{t.average != null ? ` · ${t.average}% average` : ''}</Text>
          <Ionicons name="chevron-forward" size={15} color={Colors.textLight} />
        </TouchableOpacity>

        {attention.length > 0 && (
          <Card style={{ padding: 0 }}>
            <Text style={s.cardHead}>Needs your attention</Text>
            {attention.map(({ e, icon, tone, bg, text, tab: to }) => (
              <TouchableOpacity key={`${e._id}-${to}`} style={s.todo} onPress={() => open(e, to)} activeOpacity={0.75}>
                <View style={[s.todoIcon, { backgroundColor: bg }]}><Ionicons name={icon as any} size={15} color={tone} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.todoTitle} numberOfLines={1}>{e.title}</Text>
                  <Text style={s.todoText} numberOfLines={2}>{text}</Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={Colors.textLight} />
              </TouchableOpacity>
            ))}
          </Card>
        )}

        <View style={{ marginTop: Spacing.md }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search exams…" />
        </View>
        <SegTabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'all', label: `All ${exams.length}` },
            { key: 'draft', label: `Drafts ${exams.filter(FILTERS.draft).length}` },
            { key: 'upcoming', label: `Upcoming ${exams.filter(FILTERS.upcoming).length}` },
            { key: 'completed', label: `Completed ${exams.filter(FILTERS.completed).length}` },
          ]}
        />

        {shown.length === 0 ? (
          <Empty icon="bulb-outline" text={exams.length ? 'No exams match' : 'No exams yet — create one for your class'} />
        ) : shown.map((e) => (
          <ExamRow
            key={e._id}
            exam={e}
            onPress={() => open(e)}
            footer={
              <View style={s.rowFoot}>
                {!e.isAuthor && <Text style={s.rowTag}>Your class · {e.createdBy?.name ?? 'another teacher'}</Text>}
                {e.stage === 'draft' && e.isAuthor && !e.readiness?.ready && (
                  <Text style={s.rowWarn} numberOfLines={1}>{e.readiness?.checks?.find((c: any) => !c.ok)?.detail}</Text>
                )}
                {e.stage === 'completed' && e.averageScore != null && (
                  <Text style={s.rowTag}>Average {e.averageScore}%{e.results?.state === 'released' ? ' · results out' : ''}</Text>
                )}
              </View>
            }
          />
        ))}
      </ScrollView>

      <FAB icon="add" onPress={() => setFormOpen(true)} />
      <ExamForm visible={formOpen} side="teacher" onClose={() => setFormOpen(false)} onSaved={(id) => {
        setFormOpen(false);
        load();
        router.push({ pathname: '/modules/exam-workspace', params: { id, tab: 'questions' } } as any);
      }} />
    </>
  );
}

const s = StyleSheet.create({
  analyticsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surface,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 12, marginBottom: Spacing.md,
  },
  analyticsText: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.text },

  cardHead: { fontSize: 13, fontWeight: '700', color: Colors.text, padding: Spacing.md, paddingBottom: 6 },
  todo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.divider },
  todoIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  todoTitle: { fontSize: 13, fontWeight: '600', color: Colors.text },
  todoText: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },

  rowFoot: { marginTop: 8, gap: 3 },
  rowTag: { fontSize: 11, color: Colors.textSecondary },
  rowWarn: { fontSize: 11, color: Colors.warning, fontWeight: '600' },
});
