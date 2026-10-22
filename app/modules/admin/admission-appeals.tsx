/**
 * Appeals and re-checks, for the office on the phone (Oct 2026): whether
 * families may appeal and within what windows, the appeals waiting (and late),
 * and answering one in writing — an upheld re-check corrects the marks (and
 * the result is published again); an upheld appeal against a decision reopens
 * the application at a stage the office picks (school-backend services/admission/appeals.js).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { admin } from '@/api/admission.api';
import { useOffice, forgetOffice, Blocked, BLOCKED } from '@/components/admission/office/office';
import {
  Page, Tabs, Tiles, Tile, Panel, Line, Tag, Btn, Row, Note, Muted, Sheet, Field, Box, Pick, Tick, Facts, Fact, Blank, BRAND,
  useApi, APPEAL_STATUS, APPEAL_KIND, fmtDate, fmtDateTime, errMsg, say, unwrapList,
} from '@/components/admission/parts';

export default function AdmissionAppealsScreen() {
  const { adm, reload: reloadOffice } = useOffice();
  const [status, setStatus] = useState('waiting');
  const [kind, setKind] = useState('');
  const { data, meta, loading, error, errorCode, reload } = useApi<any[]>(() => admin.appeals({ status: status === 'all' ? '' : status, kind }), [status, kind]);
  const [open, setOpen] = useState('');
  if (BLOCKED.includes(errorCode)) return <Page title="Appeals"><Blocked message={error} /></Page>;
  const t = (meta as any)?.totals || {};
  const list = unwrapList(data);
  return (
    <Page title="Appeals" onRefresh={reload}>
      {adm ? <AppealSettings a={adm.settings?.appeals || {}} onSaved={() => { forgetOffice(); reloadOffice(); }} /> : null}
      <Tiles>
        <Tile icon="time-outline" tone="amber" label="Waiting for an answer" value={t.waiting ?? '—'} on={status === 'waiting'} onPress={() => setStatus('waiting')} />
        <Tile icon="alert-circle-outline" tone="red" label="Past the answer date" value={t.overdue ?? '—'} />
        <Tile icon="checkmark-circle-outline" tone="green" label="Upheld" value={t.upheld ?? '—'} on={status === 'upheld'} onPress={() => setStatus('upheld')} />
        <Tile icon="close-circle-outline" tone="slate" label="Not upheld" value={t.notUpheld ?? '—'} on={status === 'not_upheld'} onPress={() => setStatus('not_upheld')} />
      </Tiles>
      <Tabs value={status} onChange={setStatus} items={[{ key: 'waiting', label: 'Waiting' }, { key: 'upheld', label: 'Upheld' }, { key: 'not_upheld', label: 'Not upheld' }, { key: 'withdrawn', label: 'Withdrawn' }, { key: 'all', label: 'All' }]} />
      <View style={{ height: 8 }} />
      <Pick label="Kind" value={kind} onChange={setKind} options={[{ value: '', label: 'Both kinds' }, { value: 'recheck', label: 'Re-checks' }, { value: 'decision', label: 'Decisions' }]} />
      <View style={{ height: 10 }} />
      {loading && !data ? <Muted>Loading…</Muted> : list.length ? (
        <Panel icon="shield-half-outline" tone="orange" title={`${list.length} appeal${list.length === 1 ? '' : 's'}`}>
          {list.map((r, i) => (
            <Line key={r._id} last={i === list.length - 1} onPress={() => setOpen(r._id)}
              title={`${r.number} · ${r.studentName}`}
              sub={`${APPEAL_KIND[r.kind]}${r.examName ? ` — ${r.examName}` : ''}\n${['open', 'in_review'].includes(r.status) ? `Answer by ${fmtDate(r.dueAt)}${r.overdue ? ' — late' : ''}` : `Answered ${fmtDate(r.decidedAt)}`}${r.assigneeName ? ` · with ${r.assigneeName}` : ''}`}
              right={<Tag map={APPEAL_STATUS} value={r.status} />} />
          ))}
        </Panel>
      ) : <Blank icon="shield-half-outline" title="No appeals here" body="Families can appeal once appeals are switched on above." />}
      {open ? <AppealSheet id={open} onClose={() => setOpen('')} onDone={() => { setOpen(''); reload(); }} /> : null}
    </Page>
  );
}

function AppealSettings({ a, onSaved }: { a: any; onSaved: () => void }) {
  const [f, setF] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const cur = f || { ...a, recheckDays: String(a.recheckDays ?? 7), decisionDays: String(a.decisionDays ?? 15), answerDays: String(a.answerDays ?? 10), maxPerApplication: String(a.maxPerApplication ?? 3) };
  const set = (patch: any) => setF({ ...cur, ...patch });
  const save = async () => {
    setBusy(true);
    try {
      await admin.saveSettings({ appeals: { enabled: !!cur.enabled, recheckDays: Number(cur.recheckDays) || 0, decisionDays: Number(cur.decisionDays) || 0, answerDays: Number(cur.answerDays) || 1, maxPerApplication: Number(cur.maxPerApplication) || 1, note: String(cur.note || '').trim() } });
      setF(null); say('Saved'); onSaved();
    } catch (e) { say('Not saved', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Panel icon="settings-outline" tone="slate" title="Appeals on the portal" right={f ? <Btn kind="primary" disabled={busy} onPress={save}>Save</Btn> : undefined}>
      <Tick on={!!cur.enabled} onChange={(v) => set({ enabled: v })} label="Families can appeal from their application page — a re-check of a published result, or an appeal against a rejection or an ineligible decision" />
      <Row>
        <View style={st.half}><Field label="Re-check: days after results" hint="0: not offered"><Box value={cur.recheckDays} onChange={(v) => set({ recheckDays: v })} text="digits" keyboardType="number-pad" /></Field></View>
        <View style={st.half}><Field label="Decision: days after it" hint="0: not offered"><Box value={cur.decisionDays} onChange={(v) => set({ decisionDays: v })} text="digits" keyboardType="number-pad" /></Field></View>
      </Row>
      <Row>
        <View style={st.half}><Field label="Answer within (days)"><Box value={cur.answerDays} onChange={(v) => set({ answerDays: v })} text="digits" keyboardType="number-pad" /></Field></View>
        <View style={st.half}><Field label="Appeals per application, at most"><Box value={cur.maxPerApplication} onChange={(v) => set({ maxPerApplication: v })} text="digits" keyboardType="number-pad" /></Field></View>
      </Row>
      <Field label="A note families read before appealing"><Box value={cur.note || ''} onChange={(v) => set({ note: v })} multiline maxLength={600} text="sentence" /></Field>
    </Panel>
  );
}

function AppealSheet({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const { adm } = useOffice();
  const { data: d, error, reload } = useApi<any>(() => admin.appeal(id), [id]);
  const [f, setF] = useState<any>({ outcome: '', decision: '', internalNote: '', reopenTo: '', marks: {} });
  const [busy, setBusy] = useState('');
  useEffect(() => { if (d?.result) setF((x: any) => ({ ...x, marks: Object.fromEntries(Object.entries(d.result.marks || {}).map(([k, v]) => [k, v == null ? '' : String(v)])) })); }, [d]);
  const a = d?.appeal;
  const waiting = a && ['open', 'in_review'].includes(a.status);
  const assign = async (userId: string) => {
    setBusy('assign');
    try { await admin.assignAppeal(a._id, userId || (null as any)); reload(); } catch (e) { say('Not assigned', errMsg(e)); } finally { setBusy(''); }
  };
  const decide = async () => {
    setBusy('decide');
    try {
      await admin.decideAppeal(a._id, {
        outcome: f.outcome, decision: f.decision.trim(), internalNote: f.internalNote.trim(),
        ...(f.outcome === 'upheld' && a.kind === 'recheck' ? { marks: Object.fromEntries(Object.entries(f.marks).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])) } : {}),
        ...(f.outcome === 'upheld' && a.kind === 'decision' ? { reopenTo: f.reopenTo } : {}),
      });
      say('Answered', 'The family is told.'); onDone();
    } catch (e) { say('Not answered', errMsg(e)); } finally { setBusy(''); }
  };
  const ready = f.outcome && f.decision.trim().length >= 10 && !(f.outcome === 'upheld' && a?.kind === 'decision' && !f.reopenTo);
  const staff = unwrapList(adm?.staff);
  return (
    <Sheet visible icon="shield-half-outline" tone="orange" title={a ? `${a.number} — ${APPEAL_KIND[a.kind]}` : 'Appeal'} onClose={onClose} busy={!!busy}
      footer={waiting ? <><Btn block onPress={onClose}>Close</Btn><Btn block kind="primary" disabled={!!busy || !ready} onPress={decide}>Send the answer</Btn></> : <Btn block onPress={onClose}>Close</Btn>}>
      {error && !d ? <Note tone="red" icon="alert-circle-outline">{error}</Note> : !d ? <Muted>Loading…</Muted> : (
        <>
          <Facts>
            <Fact k="Application" v={<Text style={st.link} onPress={() => { onClose(); router.push({ pathname: '/modules/admin/admission-application' as any, params: { id: d.application._id } }); }}>{`${d.application.studentName} · ${d.application.applicationNumber}`}</Text>} />
            <Fact k="Filed" v={fmtDateTime(a.createdAt)} />
            <Fact k={waiting ? 'Answer by' : 'Answered'} v={fmtDate(waiting ? a.dueAt : a.decidedAt)} />
          </Facts>
          <Note tone="indigo" icon="person-circle-outline">{`The family wrote: “${a.reason}”`}</Note>
          {d.exam && d.result ? (
            <Panel icon="clipboard-outline" tone="violet" title={`${d.exam.name} — the result as it stands`}>
              {unwrapList(d.exam.subjects).map((x: any) => (
                <View key={x.key} style={st.mark}>
                  <Text style={st.markName}>{x.name}</Text>
                  <Text style={st.markV}>{`${d.result.marks?.[x.key] ?? '—'} / ${x.maxMarks}`}</Text>
                  {waiting && f.outcome === 'upheld' ? <View style={{ width: 86 }}><Box value={f.marks[x.key] ?? ''} onChange={(v) => setF({ ...f, marks: { ...f.marks, [x.key]: v } })} text="decimal" keyboardType="decimal-pad" placeholder="New" /></View> : null}
                </View>
              ))}
              <Muted>{`Total ${d.result.total}${d.result.grade ? ` · grade ${d.result.grade}` : ''} · ${d.result.passed ? 'qualified' : 'not qualified'}`}</Muted>
            </Panel>
          ) : null}
          {waiting ? (
            <>
              <Field label="Looked at by" hint="Optional — moves the appeal to “being looked at”">
                <Pick label="Looked at by" value={String(a.assignedTo || '')} onChange={assign} options={[{ value: '', label: 'Nobody yet' }, ...staff.map((s: any) => ({ value: String(s._id), label: s.name }))]} />
              </Field>
              <Field label="The answer" required>
                {[['upheld', a.kind === 'recheck' ? 'Upheld — the marks change' : 'Upheld — reopen the application'], ['not_upheld', 'Not upheld — it stands']].map(([k, l]) => (
                  <TouchableOpacity key={k} onPress={() => setF({ ...f, outcome: k })} style={[st.choice, f.outcome === k && st.choiceOn]} accessibilityRole="radio" accessibilityState={{ checked: f.outcome === k }}>
                    <Text style={[st.choiceText, f.outcome === k && { color: '#fff' }]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </Field>
              {f.outcome === 'upheld' && a.kind === 'decision' ? (
                <Field label="Reopen the application at" required>
                  <Pick label="Reopen at" value={f.reopenTo} placeholder="Choose a stage…" onChange={(v) => setF({ ...f, reopenTo: v })} options={unwrapList(d.reopenTo).map((x: any) => ({ value: x.key, label: x.label }))} />
                </Field>
              ) : null}
              {f.outcome === 'upheld' && a.kind === 'recheck' ? <Note tone="amber">The corrected marks are recorded on the result with this appeal’s number, and published again to the family.</Note> : null}
              <Field label="What the family reads" required hint="Be specific — this is the school's written answer (at least a sentence)"><Box value={f.decision} onChange={(v) => setF({ ...f, decision: v })} multiline maxLength={2000} /></Field>
              <Field label="Staff note" hint="Kept in the application's history, staff only"><Box value={f.internalNote} onChange={(v) => setF({ ...f, internalNote: v })} multiline maxLength={2000} /></Field>
            </>
          ) : (
            <>
              <Note tone={a.status === 'upheld' ? 'green' : 'slate'} title={APPEAL_STATUS[a.status]?.label}>{a.decision}</Note>
              {a.internalNote ? <Note tone="slate" icon="lock-closed-outline">{`Staff note: ${a.internalNote}`}</Note> : null}
              {a.outcome?.after ? <Muted>{`Total ${a.outcome.before?.total} → ${a.outcome.after?.total}.`}</Muted> : null}
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

const st = StyleSheet.create({
  half: { flex: 1, minWidth: 140 },
  link: { fontSize: 12.5, fontWeight: '700', color: BRAND, textAlign: 'right' },
  mark: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  markName: { flex: 1, fontSize: 13, color: Colors.text },
  markV: { fontSize: 13, fontWeight: '700', color: Colors.text },
  choice: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 8, backgroundColor: '#fff' },
  choiceOn: { backgroundColor: BRAND, borderColor: BRAND },
  choiceText: { fontSize: 13, fontWeight: '700', color: Colors.text },
});
