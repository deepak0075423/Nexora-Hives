/**
 * Enrolment, for the office on the phone (Oct 2026).
 *
 *   Enrol a class   every confirmed admission of a round and class not yet
 *                   enrolled — each with a suggested section that keeps the
 *                   sections balanced, the student's sign-in, and the parent
 *                   (new, or an existing parent at the school); enrolled
 *                   together, each one safe to repeat.
 *   Offers forecast how many admissions the offers out are likely to bring,
 *                   from the school's own last three years — an estimate to
 *                   read; nothing is offered by itself.
 * (school-backend services/admission/enrolment.js)
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { admin } from '@/api/admission.api';
import { useOffice, Blocked, BLOCKED } from '@/components/admission/office/office';
import { Page, Tabs, Panel, Pill, Btn, Row, Note, Muted, Field, Box, Pick, Blank, Facts, Fact, BRAND, useApi, errMsg, say, unwrapList } from '@/components/admission/parts';

const pct = (v: any) => (v == null ? '—' : `${Math.round(Number(v) * 100)}%`);

export default function AdmissionEnrolmentScreen() {
  const { adm } = useOffice();
  const rounds = unwrapList(adm?.rounds);
  const first = rounds.find((r: any) => r.status === 'open') || rounds[0];
  const [tab, setTab] = useState('bulk');
  const [round, setRound] = useState('');
  const [klass, setKlass] = useState('');
  const r = round || String(first?._id || '');
  const roundDef = rounds.find((x: any) => String(x._id) === r);
  const classIds = new Set(unwrapList(roundDef?.classes).map((c: any) => String(c.class)));
  const classes = unwrapList(adm?.classes).filter((c: any) => classIds.has(String(c._id)));
  return (
    <Page title="Enrolment">
      <Tabs value={tab} onChange={setTab} items={[{ key: 'bulk', label: 'Enrol a class' }, { key: 'forecast', label: 'Offers forecast' }]} />
      <View style={{ height: 10 }} />
      <Pick label="Round" value={r} onChange={(v) => { setRound(v); setKlass(''); }} options={rounds.map((x: any) => ({ value: String(x._id), label: x.name, sub: x.status }))} />
      <View style={{ height: 8 }} />
      {tab === 'bulk' ? <Pick label="Class" value={klass} placeholder="Choose a class" onChange={setKlass} options={classes.map((c: any) => ({ value: String(c._id), label: c.className }))} /> : null}
      <View style={{ height: 12 }} />
      {tab === 'forecast' ? (r ? <Forecast round={r} /> : <Note>Choose a round.</Note>) : r && klass ? <Bulk key={`${r}-${klass}`} round={r} cls={klass} /> : <Note>Choose the round and the class to enrol.</Note>}
    </Page>
  );
}

function Bulk({ round, cls }: { round: string; cls: string }) {
  const router = useRouter();
  const { data, loading, error, errorCode, reload } = useApi<any>(() => admin.enrolPlan({ round, class: cls }), [round, cls]);
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, any>>({});
  useEffect(() => {
    if (!data) return;
    setRows(unwrapList(data.rows).map((r: any) => ({
      ...r, pick: !unwrapList(r.blockers).length, parentMode: 'new', parentId: r.parent?.existing?.[0]?._id || '',
      parentName: r.parent?.name || '', parentEmail: r.parent?.email || '', parentPhone: r.parent?.phone || '', relation: r.parent?.relation || 'Father', studentEmail: r.studentEmail || '',
    })));
  }, [data]);
  const set = (i: number, patch: any) => setRows((x) => x.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const sections = unwrapList(data?.sections);
  const chosen = rows.filter((r) => r.pick);
  const fill = useMemo(() => {
    const m = new Map(sections.map((s: any) => [String(s._id), { ...s, adding: 0 }]));
    for (const r of rows) if (r.pick && r.section && m.has(String(r.section))) (m.get(String(r.section)) as any).adding += 1;
    return [...m.values()] as any[];
  }, [rows, data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (BLOCKED.includes(errorCode)) return <Blocked message={error} />;
  const go = async () => {
    setBusy(true);
    try {
      const body = chosen.map((r) => ({
        applicationId: r.applicationId, section: r.section || undefined, studentEmail: String(r.studentEmail || '').trim(),
        parent: r.parentMode === 'existing' && r.parentId ? { mode: 'existing', userId: r.parentId } : { mode: 'new', relation: r.relation, name: r.parentName.trim(), email: r.parentEmail.trim(), phone: r.parentPhone.trim() },
      }));
      const res: any = await admin.enrolBulk(body);
      setResults(Object.fromEntries(unwrapList(res?.data?.results).map((x: any) => [x.applicationId, x])));
      say(`${res?.data?.enrolled ?? 0} enrolled`, res?.data?.failed ? `${res.data.failed} could not be — see each one.` : '');
      reload();
    } catch (e) { say('Not enrolled', errMsg(e)); } finally { setBusy(false); }
  };
  if (loading && !data) return <Muted>Loading…</Muted>;
  if (error && !data) return <Note tone="red" icon="alert-circle-outline">{error}</Note>;
  const done = Object.values(results).filter((x: any) => x.ok);
  return (
    <>
      {fill.length ? (
        <Panel icon="layers-outline" tone="indigo" title="Sections after this">
          <Row>{fill.map((s: any) => <Pill key={s._id} tone={s.capacity && s.occupied + s.adding > s.capacity ? 'red' : 'indigo'}>{`${s.sectionName}: ${s.occupied} + ${s.adding}${s.capacity ? ` / ${s.capacity}` : ''}`}</Pill>)}</Row>
        </Panel>
      ) : <Note tone="amber" icon="alert-circle-outline">This class has no sections for the year yet — students are placed in the class and given a section later.</Note>}
      {done.length ? <Note tone="green" icon="checkmark-circle-outline">{`${done.length} enrolled${done.some((x: any) => x.admissionNumber) ? `: ${done.map((x: any) => x.admissionNumber).filter(Boolean).join(', ')}` : ''}.`}</Note> : null}
      {rows.length ? rows.map((r, i) => {
        const blockers = unwrapList(r.blockers);
        const res = results[r.applicationId];
        return (
          <Panel key={r.applicationId} icon="school-outline" tone={res?.ok ? 'green' : 'slate'} title={r.studentName} subtitle={`${r.applicationNumber}${r.gender ? ` · ${r.gender}` : ''}`}
            right={res?.ok ? <Pill tone="green">Enrolled</Pill> : (
              <TouchableOpacity onPress={() => !blockers.length && set(i, { pick: !r.pick })} disabled={!!blockers.length} accessibilityRole="checkbox" accessibilityState={{ checked: r.pick, disabled: !!blockers.length }}>
                <Ionicons name={r.pick ? 'checkbox' : 'square-outline'} size={22} color={blockers.length ? Colors.textLight : r.pick ? BRAND : Colors.textSecondary} />
              </TouchableOpacity>
            )}>
            {blockers.map((b: string) => <Text key={b} style={st.err}>{b}</Text>)}
            {res && !res.ok ? <Text style={st.err}>{res.message}</Text> : null}
            {r.hostelRequested ? <Muted>Asked for the hostel — arrange it from the application.</Muted> : null}
            {!res?.ok ? (
              <>
                <Field label="Section"><Pick label="Section" value={String(r.section || '')} onChange={(v) => set(i, { section: v })} options={[{ value: '', label: 'Later' }, ...sections.map((s: any) => ({ value: String(s._id), label: s.sectionName }))]} /></Field>
                <Field label="Student sign-in email" required><Box value={r.studentEmail} onChange={(v) => set(i, { studentEmail: v })} text="email" keyboardType="email-address" placeholder="Needed" /></Field>
                {unwrapList(r.parent?.existing).length ? (
                  <Field label="Parent account">
                    <Pick label="Parent account" value={r.parentMode === 'existing' ? String(r.parentId) : 'new'} onChange={(v) => set(i, v === 'new' ? { parentMode: 'new' } : { parentMode: 'existing', parentId: v })}
                      options={[{ value: 'new', label: 'A new parent account' }, ...r.parent.existing.map((p: any) => ({ value: String(p._id), label: `Link ${p.name}`, sub: p.email }))]} />
                  </Field>
                ) : null}
                {r.parentMode === 'new' ? (
                  <>
                    <Field label="Parent's name"><Box value={r.parentName} onChange={(v) => set(i, { parentName: v })} text="name" /></Field>
                    <Field label="Parent's email"><Box value={r.parentEmail} onChange={(v) => set(i, { parentEmail: v })} text="email" keyboardType="email-address" /></Field>
                  </>
                ) : null}
              </>
            ) : null}
            <Btn onPress={() => router.push({ pathname: '/modules/admin/admission-application' as any, params: { id: r.applicationId } })}>Open the application</Btn>
          </Panel>
        );
      }) : <Blank icon="school-outline" title="Nobody to enrol here" body="Applications appear once their admission is confirmed." />}
      {rows.length ? <Btn kind="primary" block icon="person-add-outline" disabled={busy || !chosen.length} onPress={go}>{busy ? 'Enrolling…' : `Enrol ${chosen.length}`}</Btn> : null}
    </>
  );
}

function Forecast({ round }: { round: string }) {
  const { data, loading, error } = useApi<any>(() => admin.forecast(round), [round]);
  if (loading && !data) return <Muted>Loading…</Muted>;
  if (error && !data) return <Note tone="red" icon="alert-circle-outline">{error}</Note>;
  if (!data) return null;
  const classes = unwrapList(data.classes);
  return (
    <>
      <Note>{`Rates come from this school's own offers of the last three years: how many were accepted, and how many acceptances became admissions — shown only with at least ${data.minHistory} answered offers behind them. An estimate to plan with; no offer is made by itself.`}</Note>
      {classes.length ? classes.map((c: any) => (
        <Panel key={String(c.class)} icon="trending-up-outline" tone="indigo" title={c.className} right={c.moreOffers ? <Pill tone="amber">{`${c.moreOffers} more offers`}</Pill> : undefined}>
          <Facts>
            <Fact k="Seats" v={c.seats ? String(c.seats) : 'Open'} />
            <Fact k="Confirmed" v={String(c.confirmed)} />
            <Fact k="Accepted, to confirm" v={String(c.accepted)} />
            <Fact k="Offers out" v={String(c.issued)} />
            <Fact k="Waiting list" v={String(c.waitlisted)} />
            <Fact k="Accepted / confirmed" v={c.basis === 'not_enough' ? `Not enough history (${c.history} answered)` : `${pct(c.acceptRate)} / ${pct(c.confirmRate)} · ${c.basis === 'class' ? 'this class' : 'the whole school'} · ${c.history} offers`} />
            <Fact k="Expected admissions" v={c.expected == null ? '—' : Number(c.expected).toFixed(1)} />
            <Fact k="Seats left (estimate)" v={c.gap == null ? '—' : Math.max(0, Number(c.gap)).toFixed(1)} />
          </Facts>
        </Panel>
      )) : <Blank icon="trending-up-outline" title="No classes in this round" />}
      {classes.some((c: any) => c.moreOffers > c.waitlisted) ? <Note tone="amber" icon="alert-circle-outline">Some classes would need more offers than their waiting list holds.</Note> : null}
    </>
  );
}

const st = StyleSheet.create({
  err: { fontSize: 12, color: Colors.danger, marginBottom: 4 },
});
