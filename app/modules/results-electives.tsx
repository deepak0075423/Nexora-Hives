/**
 * Electives on the phone (Oct 2026): who in a section takes which optional
 * subject — the web's Electives page (school-backend services/resultElectives).
 * A subject with takers is theirs alone: on its marks sheets, class tests,
 * results and exam timetable; a subject with none is the whole section's.
 *
 *   ?office=1   the office: any section of the year
 *   (teacher)   a class or vice class teacher: their own sections
 *
 * Published results keep the figures they were published with; the server
 * says so when the subject is on one.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as R from '@/api/results.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Empty, LoaderView, Select, SearchBar, unwrap, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import { Pill, plural } from '@/components/results/parts';
import { os, say } from '@/components/results/office';

/** Choose a subject's takers — or give it back to the whole section. */
function Takers({ subject, students, onClose, onSave }: { subject: any; students: any[]; onClose: () => void; onSave: (ids: string[] | null) => Promise<void> }) {
  const insets = useSafeAreaInsets();
  const [everyone, setEveryone] = useState(!subject.elective);
  const [picked, setPicked] = useState<Set<string>>(() => new Set((subject.students || []).map(String)));
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const q = search.trim().toLowerCase();
  const shown = q ? students.filter((s) => `${s.name} ${s.rollNumber} ${s.admissionNumber}`.toLowerCase().includes(q)) : students;
  const allShown = shown.length > 0 && shown.every((s) => picked.has(String(s._id)));
  const toggle = (id: string) => setPicked((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const go = async () => {
    if (!everyone && !picked.size) { setError('Tick the students who take it — or let the whole section take it'); return; }
    setBusy(true); setError('');
    try { await onSave(everyone ? null : [...picked]); } catch (e: any) { setError(e?.message || 'That did not work'); setBusy(false); }
  };
  return (
    <Modal visible animationType="slide" onRequestClose={busy ? () => {} : onClose}>
      <View style={[x.modal, { paddingTop: insets.top }]}>
        <View style={x.head}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={x.headTitle} numberOfLines={1}>{subject.subjectName}</Text>
            <Text style={os.sub}>Who takes it</Text>
          </View>
          <TouchableOpacity onPress={onClose} disabled={busy} style={x.close} accessibilityLabel="Close"><Ionicons name="close" size={20} color={Colors.textSecondary} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
          <View style={x.modes}>
            {[[true, 'The whole section', 'Every student is examined in it'], [false, 'Only some students', 'An elective: only its takers sit it']].map(([v, label, sub]) => (
              <TouchableOpacity key={String(v)} style={[x.mode, everyone === v && x.modeOn]} onPress={() => setEveryone(v as boolean)}
                accessibilityRole="radio" accessibilityState={{ checked: everyone === v }}>
                <Ionicons name={everyone === v ? 'radio-button-on' : 'radio-button-off'} size={18} color={everyone === v ? Colors.primary : Colors.textLight} />
                <View style={{ flex: 1 }}><Text style={os.lineName}>{label as string}</Text><Text style={os.lineSub}>{sub as string}</Text></View>
              </TouchableOpacity>
            ))}
          </View>
          {!everyone ? (
            <>
              <SearchBar value={search} onChange={setSearch} placeholder="Search students…" />
              <TouchableOpacity style={x.tickAll} onPress={() => setPicked((s) => { const n = new Set(s); shown.forEach((st) => (allShown ? n.delete(String(st._id)) : n.add(String(st._id)))); return n; })}>
                <Text style={os.ghostText}>{allShown ? 'Untick these' : 'Tick these'}</Text>
              </TouchableOpacity>
              {shown.map((st) => {
                const on = picked.has(String(st._id));
                return (
                  <TouchableOpacity key={st._id} style={[x.pick, on && x.pickOn]} onPress={() => toggle(String(st._id))}
                    accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? Colors.primary : Colors.textLight} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={os.lineName} numberOfLines={1}>{st.name}</Text>
                      <Text style={os.lineSub}>{[st.rollNumber ? `Roll ${st.rollNumber}` : '', st.admissionNumber].filter(Boolean).join(' · ')}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              {!shown.length ? <Text style={os.lineSub}>{students.length ? 'Nobody matches this search.' : 'This section has no students.'}</Text> : null}
              <Text style={[os.lineSub, { marginTop: 8 }]}>{plural(picked.size, 'student')} of {students.length} take {subject.subjectName}.</Text>
            </>
          ) : null}
          {error ? <Text style={[os.bad, { marginTop: 10 }]}>{error}</Text> : null}
        </ScrollView>
        <View style={[x.foot, { paddingBottom: Spacing.sm + insets.bottom }]}>
          <TouchableOpacity style={[os.btn, { height: 46 }]} onPress={go} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={os.btnText}>{everyone ? 'Save — Whole Section' : `Save — ${plural(picked.size, 'Student')}`}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function ResultsElectivesScreen() {
  const { office: officeParam } = useLocalSearchParams<{ office?: string }>();
  const office = officeParam === '1';
  const [q, setQ] = useState<{ academicYear?: string; sectionId?: string }>({});
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<any>(null);

  const load = useCallback(async () => {
    try { setD(unwrap(office ? await R.office.electives(q) : await R.teacherElectives(q))); setError(''); }
    catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else setError(err?.message || 'Electives could not be loaded');
    } finally { setLoading(false); setRefreshing(false); }
  }, [q, office]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  const students = useMemo(() => d?.students || [], [d]);
  const nameOf = useMemo(() => new Map(students.map((s: any) => [String(s._id), s.name])), [students]);
  const save = async (ids: string[] | null) => {
    const body = { sectionId: String(d.section._id), subjectId: String(editing._id), students: ids };
    const out = unwrap(office ? await R.office.saveElective(body) : await R.teacherSaveElective(body));
    setEditing(null);
    setD(out);
    say('Saved', `${editing.subjectName}: ${ids ? `${plural(ids.length, 'student')} take it` : 'the whole section takes it again'}.${out?.note ? `\n\n${out.note}` : ''}`);
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Electives' }} /><ModuleDisabled /></>);
  return (
    <>
      <Stack.Screen options={{ title: 'Electives' }} />
      <ScrollView style={os.screen} contentContainerStyle={os.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        {loading && !d ? <LoaderView /> : null}
        {!d && error ? <Empty icon="cloud-offline-outline" text={error} /> : null}
        {d && !d.section ? <Empty icon="people-outline" text={office ? 'This year has no sections yet.' : 'Electives are set by a section’s class teacher — you are not the class teacher of a section this year.'} /> : null}
        {d?.section ? (
          <View style={loading ? { opacity: 0.55 } : undefined}>
            <Text style={os.note}>Who takes which optional subject. A subject with takers is theirs alone — on its marks sheets, class tests, results and exam timetable.</Text>
            {d.years?.length > 1 ? (
              <Select label="Academic year" value={String(d.year?._id || '')} onChange={(v) => setQ({ academicYear: v })}
                options={d.years.map((y: any) => ({ value: String(y._id), label: `${y.yearName}${y.current ? ' (current)' : ''}` }))} />
            ) : null}
            {d.sections?.length > 1 ? (
              <Select label="Section" value={String(d.section._id)} onChange={(v) => setQ((x2) => ({ ...x2, sectionId: v }))}
                options={d.sections.map((s: any) => ({ value: String(s._id), label: [s.className, s.sectionName].filter(Boolean).join(' – ') }))} />
            ) : null}
            {(d.subjects || []).map((s: any) => (
              <TouchableOpacity key={s._id} style={os.card} activeOpacity={0.75} onPress={() => setEditing(s)}>
                <View style={os.rowTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={os.lineName}>{s.subjectName}{s.subjectCode ? <Text style={os.lineSub}>  {s.subjectCode}</Text> : null}</Text>
                    <Text style={os.lineSub} numberOfLines={2}>
                      {s.elective ? `${(s.students || []).slice(0, 4).map((id: string) => nameOf.get(String(id))).filter(Boolean).join(', ')}${s.students.length > 4 ? ` and ${s.students.length - 4} more` : ''}`
                        : `The whole section (${students.length})`}
                    </Text>
                  </View>
                  {s.elective ? <Pill label={plural(s.students.length, 'student')} fg="#6D28D9" bg="#EDE9FE" /> : <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />}
                </View>
              </TouchableOpacity>
            ))}
            {!d.subjects?.length ? <Empty icon="book-outline" text="This section's class has no subjects yet." /> : null}
          </View>
        ) : null}
      </ScrollView>
      {editing && d?.section ? <Takers subject={editing} students={students} onClose={() => setEditing(null)} onSave={save} /> : null}
    </>
  );
}

const x = StyleSheet.create({
  modal: { flex: 1, backgroundColor: Colors.background },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: Spacing.md, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headTitle: { ...Typography.h4, color: Colors.text },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  modes: { gap: 8, marginBottom: 12 },
  mode: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  modeOn: { borderColor: Colors.primary, backgroundColor: '#F5F3FF' },
  tickAll: { alignSelf: 'flex-start', paddingVertical: 8 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, marginBottom: 6, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  pickOn: { borderColor: Colors.primary, backgroundColor: '#F5F3FF' },
  foot: { backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
});
