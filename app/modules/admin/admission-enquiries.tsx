/**
 * Enquiries, for the office on the phone (Oct 2026): every enquiry followed up
 * — who has it, when they call next (overdue ones first), what was said — a
 * walk-in or phone call written down, and what each source of families costs
 * per application and per admission (school-backend services/admission/crm.js).
 * Also the applicant accounts, switched off or on.
 *
 * "Text message" and "WhatsApp" in the contact log record what staff did from
 * their own phones; the school sends no text messages or WhatsApp.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Colors } from '@/constants/theme';
import { admin } from '@/api/admission.api';
import { SearchBar } from '@/components/ui/kit';
import { useOffice, Blocked, BLOCKED } from '@/components/admission/office/office';
import {
  Page, Tabs, Tiles, Tile, Panel, Line, Pill, Btn, Row, Note, Muted, Sheet, Field, Box, Pick, Facts, Fact, Blank, Tick,
  useApi, money, ago, fmtDate, fmtDateTime, errMsg, say, unwrapList,
} from '@/components/admission/parts';

const STATUS: Record<string, [string, any]> = { new: ['New', 'blue'], contacted: ['Contacted', 'amber'], registered: ['Registered', 'green'], closed: ['Closed', 'slate'] };
const PRIORITY: Record<string, [string, any]> = { hot: ['Hot', 'red'], warm: ['Warm', 'amber'], cold: ['Cold', 'slate'] };
const pad = (n: number) => String(n).padStart(2, '0');
const split = (v?: string | null) => { if (!v) return { day: '', time: '' }; const x = new Date(v); return { day: `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`, time: `${pad(x.getHours())}:${pad(x.getMinutes())}` }; };
const join = (day: string, time: string) => (/^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T${/^\d{2}:\d{2}$/.test(time) ? time : '10:00'}:00`).toISOString() : null);

export default function AdmissionEnquiriesScreen() {
  const [tab, setTab] = useState('enquiries');
  const [adding, setAdding] = useState(false);
  const [bump, setBump] = useState(0);
  return (
    <Page title="Enquiries">
      <Tabs value={tab} onChange={setTab} items={[{ key: 'enquiries', label: 'Enquiries' }, { key: 'sources', label: 'Sources and spend' }, { key: 'applicants', label: 'Applicant accounts' }]} />
      <View style={{ height: 12 }} />
      {tab === 'enquiries' ? <>
        <Btn kind="primary" block icon="add" onPress={() => setAdding(true)}>Write down an enquiry</Btn>
        <View style={{ height: 12 }} />
        <List key={bump} />
      </> : tab === 'sources' ? <Sources /> : <Applicants />}
      {adding ? <NewEnquiry onClose={() => setAdding(false)} onDone={() => { setAdding(false); setBump((b) => b + 1); }} /> : null}
    </Page>
  );
}

function List() {
  const [status, setStatus] = useState('');
  const [who, setWho] = useState('');
  const [due, setDue] = useState('');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 350); return () => clearTimeout(t); }, [search]);
  const { data, meta, loading, error, errorCode, reload } = useApi<any[]>(() => admin.enquiries({ status, q: term, assignedTo: who, due, limit: 50 }), [status, term, who, due]);
  const [open, setOpen] = useState<any>(null);
  if (BLOCKED.includes(errorCode)) return <Blocked message={error} />;
  const m: any = meta || {};
  const counts = m.counts || {};
  const d = m.due || {};
  const rows = unwrapList(data);
  return (
    <>
      <Tiles>
        <Tile icon="alert-circle-outline" tone="red" label="Follow-ups overdue" value={d.overdue ?? '—'} on={due === 'overdue'} onPress={() => { setDue(due === 'overdue' ? '' : 'overdue'); setWho(''); }} />
        <Tile icon="calendar-outline" tone="amber" label="Due today" value={d.today ?? '—'} on={due === 'today'} onPress={() => setDue(due === 'today' ? '' : 'today')} />
        <Tile icon="person-circle-outline" tone="indigo" label="Mine, open" value={d.mine ?? '—'} on={who === 'me'} onPress={() => { setWho(who === 'me' ? '' : 'me'); setDue(''); }} />
        <Tile icon="chatbubbles-outline" tone="green" label="New, not contacted" value={counts.new ?? 0} on={status === 'new'} onPress={() => setStatus(status === 'new' ? '' : 'new')} />
      </Tiles>
      <SearchBar value={search} onChange={setSearch} placeholder="Name, email or phone" />
      <Tabs value={status} onChange={setStatus} items={[{ key: '', label: 'All' }, ...Object.entries(STATUS).map(([k, [l]]) => ({ key: k, label: l, count: counts[k] || undefined }))]} />
      <View style={{ height: 8 }} />
      <Pick label="Owner" value={who} onChange={setWho} options={[{ value: '', label: "Anyone's" }, { value: 'me', label: 'Mine' }, { value: 'none', label: "Nobody's yet" }]} />
      <View style={{ height: 10 }} />
      {loading && !data ? <Muted>Loading…</Muted> : rows.length ? (
        <Panel icon="chatbubbles-outline" tone="violet" title={`${Number(m.total ?? rows.length)} enquir${Number(m.total ?? rows.length) === 1 ? 'y' : 'ies'}`}>
          {rows.map((e, i) => {
            const late = e.nextFollowUpAt && ['new', 'contacted'].includes(e.status) && new Date(e.nextFollowUpAt) < new Date();
            return (
              <Line key={e._id} last={i === rows.length - 1} onPress={() => setOpen(e)}
                title={e.name}
                sub={`${[e.className, e.source].filter(Boolean).join(' · ') || 'Class not said'}\n${e.assigneeName || 'Nobody yet'} · ${e.nextFollowUpAt && ['new', 'contacted'].includes(e.status) ? `${late ? 'OVERDUE ' : 'next '}${fmtDateTime(e.nextFollowUpAt)}` : `received ${ago(e.createdAt)}`}`}
                right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Pill tone={STATUS[e.status]?.[1] || 'slate'}>{STATUS[e.status]?.[0] || e.status}</Pill>{e.priority && e.priority !== 'warm' ? <Pill tone={PRIORITY[e.priority][1]}>{PRIORITY[e.priority][0]}</Pill> : null}</View>} />
            );
          })}
        </Panel>
      ) : <Blank icon="chatbubbles-outline" title="No enquiries here" body="Families ask from the portal's home page, or write one down with the button above." />}
      {open ? <EnquirySheet row={open} kinds={m.kinds || {}} outcomes={m.outcomes || {}} onClose={() => setOpen(null)} onChanged={(fresh) => { reload(); if (fresh) setOpen((x: any) => ({ ...x, ...fresh })); }} /> : null}
    </>
  );
}

function EnquirySheet({ row, kinds, outcomes, onClose, onChanged }: { row: any; kinds: Record<string, string>; outcomes: Record<string, string>; onClose: () => void; onChanged: (fresh?: any) => void }) {
  const { adm } = useOffice();
  const [c, setC] = useState({ kind: 'call', outcome: 'reached', text: '', day: '', time: '' });
  const [busy, setBusy] = useState('');
  const [closing, setClosing] = useState(false);
  const [lost, setLost] = useState('');
  const next = split(row.nextFollowUpAt);
  const [nf, setNf] = useState(next);
  const open = ['new', 'contacted'].includes(row.status);
  const log = useMemo(() => [
    ...unwrapList(row.interactions).map((x: any) => ({ ...x, type: 'contact' })),
    ...unwrapList(row.notes).map((n: any) => ({ kind: 'note', text: n.text, byName: n.byName, at: n.at, type: 'note' })),
  ].sort((a: any, b: any) => +new Date(b.at) - +new Date(a.at)), [row]);
  const save = async (patch: any) => {
    setBusy('save');
    try { const r: any = await admin.updateEnquiry(row._id, patch); onChanged(r?.data); } catch (e) { say('Not saved', errMsg(e)); } finally { setBusy(''); }
  };
  const contact = async () => {
    setBusy('contact');
    try {
      const r: any = await admin.enquiryContact(row._id, { kind: c.kind, outcome: c.outcome, text: c.text.trim(), nextFollowUpAt: join(c.day, c.time) });
      setC({ kind: 'call', outcome: 'reached', text: '', day: '', time: '' }); onChanged(r?.data); say('Logged');
    } catch (e) { say('Not logged', errMsg(e)); } finally { setBusy(''); }
  };
  const staff = unwrapList(adm?.staff);
  return (
    <Sheet visible icon="chatbubbles-outline" tone="violet" title={`Enquiry from ${row.name}`} subtitle={`Received ${fmtDateTime(row.createdAt)}`} onClose={onClose} busy={!!busy} footer={<Btn block onPress={onClose}>Close</Btn>}>
      <Facts>
        {row.email ? <Fact k="Email" v={<Text style={st.link} onPress={() => Linking.openURL(`mailto:${row.email}`).catch(() => {})}>{row.email}</Text>} /> : null}
        {row.phone ? <Fact k="Phone" v={<Text style={st.link} onPress={() => Linking.openURL(`tel:${row.phone}`).catch(() => {})}>{row.phone}</Text>} /> : null}
        <Fact k="Class" v={row.className} />
        <Fact k="Source" v={row.source} />
        <Fact k="Status" v={<Pill tone={STATUS[row.status]?.[1] || 'slate'}>{STATUS[row.status]?.[0] || row.status}</Pill>} />
      </Facts>
      {row.message ? <Note tone="slate" icon="chatbox-outline">{row.message}</Note> : null}
      {row.status === 'closed' && row.lostReason ? <Muted>{`Closed: ${row.lostReason}`}</Muted> : null}
      <Field label="Owner"><Pick label="Owner" value={String(row.assignedTo || '')} onChange={(v) => save({ assignedTo: v || null })} options={[{ value: '', label: 'Nobody yet' }, ...staff.map((s: any) => ({ value: String(s._id), label: s.name }))]} /></Field>
      <Field label="Priority"><Pick label="Priority" value={row.priority || 'warm'} onChange={(v) => save({ priority: v })} options={Object.entries(PRIORITY).map(([k, [l]]) => ({ value: k, label: l }))} /></Field>
      {open ? (
        <Field label="Next follow-up" hint="YYYY-MM-DD and HH:MM">
          <Row>
            <View style={{ flex: 1, minWidth: 120 }}><Box value={nf.day} onChange={(v) => setNf({ ...nf, day: v })} text="date" /></View>
            <View style={{ width: 90 }}><Box value={nf.time} onChange={(v) => setNf({ ...nf, time: v })} text="time" /></View>
            {nf.day !== next.day || nf.time !== next.time ? <Btn kind="primary" disabled={!!busy} onPress={() => save({ nextFollowUpAt: join(nf.day, nf.time) })}>Set</Btn> : null}
          </Row>
        </Field>
      ) : null}
      {open ? (
        <Panel icon="call-outline" tone="indigo" title="Log a contact">
          <Field label="How"><Pick label="How" value={c.kind} onChange={(v) => setC({ ...c, kind: v })} options={Object.entries(kinds).map(([k, l]) => ({ value: k, label: l }))} /></Field>
          <Field label="What happened"><Pick label="What happened" value={c.outcome} onChange={(v) => setC({ ...c, outcome: v })} options={[...Object.entries(outcomes).filter(([, l]) => l).map(([k, l]) => ({ value: k, label: l })), { value: 'other', label: 'Something else' }]} /></Field>
          <Field label="Notes"><Box value={c.text} onChange={(v) => setC({ ...c, text: v })} multiline maxLength={1000} /></Field>
          <Field label="Follow up next on" hint="Optional — YYYY-MM-DD and HH:MM">
            <Row>
              <View style={{ flex: 1, minWidth: 120 }}><Box value={c.day} onChange={(v) => setC({ ...c, day: v })} text="date" /></View>
              <View style={{ width: 90 }}><Box value={c.time} onChange={(v) => setC({ ...c, time: v })} text="time" /></View>
            </Row>
          </Field>
          <Row>
            <Btn kind="primary" disabled={!!busy || (c.outcome === 'other' && !c.text.trim())} onPress={contact}>Log it</Btn>
            <Btn onPress={() => setClosing(!closing)}>Close the enquiry…</Btn>
          </Row>
          {closing ? (
            <>
              <Field label="Why it is closed" hint="Took a seat elsewhere, moved city, fees…"><Box value={lost} onChange={setLost} maxLength={300} /></Field>
              <Btn kind="stop" disabled={!!busy} onPress={() => save({ status: 'closed', lostReason: lost.trim() })}>Close it</Btn>
            </>
          ) : null}
        </Panel>
      ) : row.status === 'closed' ? <Btn onPress={() => save({ status: 'contacted' })}>Reopen</Btn> : null}
      <Text style={st.h}>History</Text>
      {log.length ? log.map((x: any, i: number) => (
        <Line key={i} last={i === log.length - 1} title={`${kinds[x.kind] || (x.kind === 'note' ? 'Note' : x.kind)}${x.outcome && outcomes[x.outcome] ? ` — ${outcomes[x.outcome]}` : ''}`}
          sub={`${x.byName || 'Staff'} · ${fmtDateTime(x.at)}${x.text ? `\n${x.text}` : ''}`} />
      )) : <Muted>Nothing logged yet.</Muted>}
    </Sheet>
  );
}

function NewEnquiry({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { adm } = useOffice();
  const [f, setF] = useState({ name: '', phone: '', email: '', class: '', message: '', source: 'walk_in', kind: 'visit', day: '', time: '' });
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const { day, time, ...rest } = f;
      await admin.createEnquiry({ ...rest, name: f.name.trim(), message: f.message.trim(), nextFollowUpAt: join(day, time) });
      say('Enquiry written down', 'It is yours to follow up.'); onDone();
    } catch (e) { say('Not saved', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible icon="create-outline" tone="violet" title="Write down an enquiry" onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind="primary" disabled={busy || !f.name.trim() || (!f.phone && !f.email)} onPress={go}>Save</Btn></>}>
      <Field label="Name" required><Box value={f.name} onChange={(v) => setF({ ...f, name: v })} maxLength={80} text="name" /></Field>
      <Field label="Mobile"><Box value={f.phone} onChange={(v) => setF({ ...f, phone: v })} phone /></Field>
      <Field label="Email"><Box value={f.email} onChange={(v) => setF({ ...f, email: v })} maxLength={200} text="email" keyboardType="email-address" /></Field>
      <Field label="Class"><Pick label="Class" value={f.class} onChange={(v) => setF({ ...f, class: v })} options={[{ value: '', label: 'Not said' }, ...unwrapList(adm?.classes).map((c: any) => ({ value: String(c._id), label: c.className }))]} /></Field>
      <Field label="How they came"><Pick label="How they came" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: 'visit', label: 'Walked in' }, { value: 'call', label: 'Phoned' }, { value: 'email', label: 'Emailed' }, { value: 'whatsapp', label: 'WhatsApp (from their phone)' }]} /></Field>
      <Field label="Source" hint="How they heard of the school — for example newspaper, referral"><Box value={f.source} onChange={(v) => setF({ ...f, source: v })} maxLength={40} text="code" /></Field>
      <Field label="Follow up on" hint="Optional — YYYY-MM-DD and HH:MM">
        <Row>
          <View style={{ flex: 1, minWidth: 120 }}><Box value={f.day} onChange={(v) => setF({ ...f, day: v })} text="date" /></View>
          <View style={{ width: 90 }}><Box value={f.time} onChange={(v) => setF({ ...f, time: v })} text="time" /></View>
        </Row>
      </Field>
      <Field label="What they asked"><Box value={f.message} onChange={(v) => setF({ ...f, message: v })} multiline maxLength={1000} /></Field>
    </Sheet>
  );
}

/** Each source of families against what the school spent on it. */
function Sources() {
  const { data, loading, error, reload } = useApi<any>(() => admin.sources({}), []);
  const [edit, setEdit] = useState<any>(null);
  const [adding, setAdding] = useState({ source: '', label: '', amount: '' });
  const save = async () => {
    try { await admin.setSpend({ source: edit.source, label: edit.label, amount: Number(edit.amount) || 0 }); setEdit(null); reload(); } catch (e) { say('Not saved', errMsg(e)); }
  };
  const add = async () => {
    try { await admin.setSpend({ ...adding, amount: Number(adding.amount) || 0 }); setAdding({ source: '', label: '', amount: '' }); reload(); } catch (e) { say('Not added', errMsg(e)); }
  };
  if (loading && !data) return <Muted>Loading…</Muted>;
  if (error && !data) return <Note tone="red" icon="alert-circle-outline">{error}</Note>;
  const rows = unwrapList(data?.rows);
  const t = data?.total;
  return (
    <>
      <Panel icon="compass-outline" tone="teal" title="Sources and spend" subtitle="Where families came from — the ?src= on the portal link they used, or what the office wrote down — against what each cost">
        {rows.length ? rows.map((r, i) => (
          <Line key={r.source} last={i === rows.length - 1} onPress={r.source === 'unknown' ? undefined : () => setEdit({ source: r.source, label: r.label || '', amount: String(r.spend || '') })}
            title={r.label || r.source}
            sub={`${r.enquiries} enquiries · ${r.applications} applications · ${r.admissions} admissions${r.conversion == null ? '' : ` · ${r.conversion}% converted`}\n${r.spend ? `${money(r.spend)} spent` : 'Nothing spent'}${r.costPerApplication == null ? '' : ` · ${money(r.costPerApplication)} per application`}${r.costPerAdmission == null ? '' : ` · ${money(r.costPerAdmission)} per admission`}`} />
        )) : <Muted>No sources yet.</Muted>}
        {t ? <Muted>{`All sources: ${t.enquiries} enquiries · ${t.applications} applications · ${t.admissions} admissions · ${money(t.spend)} spent${t.costPerAdmission != null ? ` · ${money(t.costPerAdmission)} per admission` : ''}`}</Muted> : null}
      </Panel>
      <Panel icon="add-circle-outline" tone="slate" title="Add a source">
        <Field label="Source code"><Box value={adding.source} onChange={(v) => setAdding({ ...adding, source: v })} maxLength={40} text="code" placeholder="newspaper" /></Field>
        <Field label="Name"><Box value={adding.label} onChange={(v) => setAdding({ ...adding, label: v })} maxLength={80} placeholder="Times of India ad" /></Field>
        <Field label="Spent (₹)"><Box value={adding.amount} onChange={(v) => setAdding({ ...adding, amount: v })} text="digits" keyboardType="number-pad" /></Field>
        <Btn icon="add" disabled={!adding.source.trim()} onPress={add}>Add the source</Btn>
        <Muted>Give each advertisement its own portal link — for example /your-portal?src=newspaper — and families who arrive through it are counted here.</Muted>
      </Panel>
      {edit ? (
        <Sheet visible icon="cash-outline" tone="teal" title={`Spend on ${edit.label || edit.source}`} onClose={() => setEdit(null)}
          footer={<><Btn block onPress={() => setEdit(null)}>Cancel</Btn><Btn block kind="primary" onPress={save}>Save</Btn></>}>
          <Field label="Name"><Box value={edit.label} onChange={(v) => setEdit({ ...edit, label: v })} maxLength={80} /></Field>
          <Field label="Spent (₹)"><Box value={edit.amount} onChange={(v) => setEdit({ ...edit, amount: v })} text="digits" keyboardType="number-pad" /></Field>
        </Sheet>
      ) : null}
    </>
  );
}

/** Applicant accounts: switching one off signs them out. */
function Applicants() {
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 350); return () => clearTimeout(t); }, [search]);
  const { data, loading, reload, setData } = useApi<any[]>(() => admin.applicants({ q: term, limit: 50 }), [term]);
  const toggle = async (u: any, on: boolean) => {
    setData(unwrapList(data).map((r) => (r._id === u._id ? { ...r, isActive: on } : r)));
    try { await admin.setApplicant(u._id, on); } catch (e) { say('Not changed', errMsg(e)); reload(); }
  };
  const rows = unwrapList(data);
  return (
    <>
      <SearchBar value={search} onChange={setSearch} placeholder="Name, email or phone" />
      {loading && !data ? <Muted>Loading…</Muted> : rows.length ? (
        <Panel icon="person-add-outline" tone="slate" title="Applicant accounts">
          {rows.map((u, i) => (
            <View key={u._id} style={[st.acc, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
              <Line last title={u.name} sub={`${u.email}${u.phone ? ` · ${u.phone}` : ''}\n${u.applications} application(s) · registered ${fmtDate(u.createdAt)}${u.lastLoginAt ? ` · signed in ${ago(u.lastLoginAt)}` : ''}${u.source ? ` · ${u.source}` : ''}`}
                right={u.linkedExisting ? <Pill tone="violet">Existing address</Pill> : undefined} />
              <Tick on={u.isActive !== false} onChange={(v) => toggle(u, v)} label={u.isActive !== false ? 'Account on' : 'Account off — signed out'} />
            </View>
          ))}
        </Panel>
      ) : <Blank icon="person-add-outline" title="No applicant accounts yet" />}
    </>
  );
}

const st = StyleSheet.create({
  link: { fontSize: 12.5, fontWeight: '600', color: '#4F46E5', textAlign: 'right' },
  h: { fontSize: 13.5, fontWeight: '800', color: Colors.text, marginTop: 10, marginBottom: 4 },
  acc: { paddingBottom: 8, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: Colors.divider },
});
