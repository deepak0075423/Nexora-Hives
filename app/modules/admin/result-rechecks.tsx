/**
 * Re-check requests, for the office, on the phone (Oct 2026) — a student, or a
 * parent for their child, asks for one paper of a published result to be
 * checked again, within the days the school allows (GET/PUT
 * /admin/results/rechecks). Three answers: the marks stand; they were wrong —
 * corrected in place, the result and ranks worked out again; or the request
 * is declined, with the reason the family reads.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Radius } from '@/constants/theme';
import * as R from '@/api/results.api';
import { Empty, LoaderView, SegTabs, FormModal } from '@/components/ui/kit';
import { Pill, fmtDay, classLine } from '@/components/results/parts';
import { os } from '@/components/results/office';

const TABS = [
  { key: 'open', label: 'Waiting' },
  { key: 'resolved', label: 'Answered' },
  { key: 'declined', label: 'Declined' },
  { key: '', label: 'All' },
];
const now = (p: any) => (!p ? '—' : p.isAbsent ? 'Absent' : p.gradeOnly ? `Grade ${p.grade}` : `${p.marksObtained} / ${p.maxMarks}`);

export default function OfficeRechecksScreen() {
  const [tab, setTab] = useState('open');
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [answering, setAnswering] = useState<any>(null);
  const [flash, setFlash] = useState('');

  const load = useCallback(async () => {
    try { setD(await R.office.rechecks(tab ? { status: tab } : {})); setError(''); }
    catch (err: any) { setError(err?.message || 'Requests could not be loaded'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [tab]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  const rows = d?.data || [];
  const counts = d?.counts || {};
  return (
    <>
      <Stack.Screen options={{ title: 'Re-check Requests' }} />
      <ScrollView style={os.screen} contentContainerStyle={os.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        <SegTabs active={tab} onChange={setTab} tabs={TABS.map((t) => ({ key: t.key, label: t.key === 'open' && counts.open ? `${t.label} (${counts.open})` : t.label }))} />
        {flash ? <TouchableOpacity onPress={() => setFlash('')}><Text style={os.ok}>{flash}</Text></TouchableOpacity> : null}
        {loading && !d ? <LoaderView /> : null}
        {!loading && error && !d ? <Empty icon="cloud-offline-outline" text={error} /> : null}
        {d && !rows.length ? <Empty icon="search-outline" text={tab === 'open' ? 'Every re-check request has been answered.' : 'No requests here. Families ask from their scorecard, within the days set in Result Settings.'} /> : null}
        {rows.map((r: any) => (
          <View key={r._id} style={os.card}>
            <View style={os.rowTop}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={os.title} numberOfLines={1}>{r.student.name}</Text>
                <Text style={os.sub}>{[classLine(r), r.subject.subjectName, r.exam.title].filter(Boolean).join(' · ')}</Text>
              </View>
              {r.status === 'open' ? <Pill label="Waiting" fg={Colors.warning} bg={Colors.warningLight} />
                : r.status === 'declined' ? <Pill label="Declined" fg={Colors.textSecondary} bg={Colors.surfaceAlt} />
                  : <Pill label={r.outcome === 'changed' ? 'Corrected' : 'Marks stand'} fg={r.outcome === 'changed' ? Colors.success : Colors.info} bg={r.outcome === 'changed' ? Colors.successLight : Colors.infoLight} />}
            </View>
            <Text style={[os.lineSub, { marginTop: 6, fontStyle: 'italic' }]}>“{r.reason}”</Text>
            <Text style={os.lineSub}>{[r.requestedBy, r.requestedByRole, fmtDay(r.createdAt)].filter(Boolean).join(' · ')} · paper now {now(r.paper)}</Text>
            {r.status !== 'open' && r.response ? <Text style={os.lineSub}>Answer: {r.response}{r.resolvedBy ? ` — ${r.resolvedBy}` : ''}</Text> : null}
            {r.status === 'open' ? (
              <View style={os.btnRow}>
                <TouchableOpacity style={os.btn} onPress={() => setAnswering(r)}><Text style={os.btnText}>Answer</Text></TouchableOpacity>
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
      {answering ? <Answer rc={answering} onClose={() => setAnswering(null)} onDone={(m) => { setAnswering(null); setFlash(m); load(); }} /> : null}
    </>
  );
}

function Answer({ rc, onClose, onDone }: { rc: any; onClose: () => void; onDone: (m: string) => void }) {
  const p = rc.paper;
  const [action, setAction] = useState('unchanged');
  const [marks, setMarks] = useState(p && !p.isAbsent && !p.gradeOnly && !p.components ? String(p.marksObtained) : '');
  const [parts, setParts] = useState<Record<string, string>>(() => Object.fromEntries((p?.components || []).map((c: any) => [c.key, c.marks == null ? '' : String(c.marks)])));
  const [grade, setGrade] = useState(p?.gradeOnly && p.grade !== 'AB' ? p.grade : '');
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    if (action !== 'unchanged' && !response.trim()) { setError('Say why — the family reads it'); return; }
    setBusy(true); setError('');
    try {
      const body: any = { action, response: response.trim() };
      if (action === 'change') {
        if (p?.gradeOnly) body.grade = grade;
        else if (p?.components) body.parts = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v === '' ? null : Number(v)]));
        else body.marksObtained = marks === '' ? null : Number(marks);
      }
      await R.office.answerRecheck(rc._id, body);
      onDone(action === 'change' ? 'Mark corrected — the result worked out again, the family told' : action === 'unchanged' ? 'Answered — the marks stand' : 'Declined — the family has been told why');
    } catch (e: any) { setError(e?.message || 'That did not work'); setBusy(false); }
  };
  const OPTS: [string, string][] = [['unchanged', 'Marks stand'], ['change', 'Correct'], ['decline', 'Decline']];
  return (
    <FormModal visible title={`Re-check: ${rc.subject.subjectName}`} onClose={onClose} onSubmit={go} submitting={busy}
      submitLabel={action === 'change' ? 'Correct the Mark' : action === 'decline' ? 'Decline' : 'Marks Stand'}>
      <Text style={[os.lineSub, { marginBottom: 6 }]}>{rc.student.name} · {rc.exam.title} · now {now(p)}</Text>
      <Text style={[os.note, { fontStyle: 'italic' }]}>“{rc.reason}”</Text>
      <View style={x.seg}>
        {OPTS.map(([v, label]) => {
          const off = v === 'change' && !rc.exam.published;
          return (
            <TouchableOpacity key={v} style={[x.segBtn, action === v && x.segOn, off && { opacity: 0.4 }]} disabled={off} onPress={() => { setAction(v); setError(''); }}
              accessibilityRole="radio" accessibilityState={{ checked: action === v }}>
              <Text style={[x.segText, action === v && { color: '#fff' }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {action === 'change' ? (
        p?.gradeOnly ? (
          <View style={x.chips}>
            {(rc.grades || []).map((g: string) => (
              <TouchableOpacity key={g} style={[x.chip, grade === g && x.segOn]} onPress={() => setGrade(g)}>
                <Text style={[x.segText, grade === g && { color: '#fff' }]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : p?.components ? p.components.map((c: any) => (
          <View key={c.key}>
            <Text style={x.label}>{c.label} / {c.maxMarks}</Text>
            <TextInput style={x.input} keyboardType="decimal-pad" value={parts[c.key] ?? ''} onChangeText={(v) => setParts((pp) => ({ ...pp, [c.key]: v.replace(',', '.') }))} />
          </View>
        )) : (
          <>
            <Text style={x.label}>Corrected marks / {p?.maxMarks}</Text>
            <TextInput style={x.input} keyboardType="decimal-pad" value={marks} onChangeText={(v) => setMarks(v.replace(',', '.'))} />
          </>
        )
      ) : null}
      <Text style={x.label}>{action === 'unchanged' ? 'Note for the family (optional)' : 'Why *'}</Text>
      <TextInput style={[x.input, { minHeight: 70, textAlignVertical: 'top' }]} multiline value={response} onChangeText={(v) => { setResponse(v.slice(0, 500)); setError(''); }}
        placeholder={action === 'change' ? 'e.g. Question 6 was not added to the total' : action === 'decline' ? 'e.g. Re-totalled at the time of checking' : 'e.g. Re-totalled; every answer was marked'}
        placeholderTextColor={Colors.textLight} />
      {error ? <Text style={[os.bad, { marginTop: 8 }]}>{error}</Text> : null}
    </FormModal>
  );
}

const x = StyleSheet.create({
  seg: { flexDirection: 'row', gap: 6, marginVertical: 8 },
  segBtn: { flex: 1, height: 38, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  segText: { fontSize: 13, fontWeight: '700', color: Colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 },
  chip: { minWidth: 52, paddingVertical: 8, paddingHorizontal: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  label: { fontSize: 12, fontWeight: '700', color: Colors.text, marginTop: 6, marginBottom: 4 },
  input: { minHeight: 42, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt, paddingHorizontal: 10, fontSize: 15, color: Colors.text },
});
