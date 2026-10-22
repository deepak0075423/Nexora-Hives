/**
 * Privacy, for the admission office on the phone (Oct 2026) — India's DPDP Act:
 *
 *   Requests   families' requests about their information (a copy, a
 *              correction, erasure, withdrawing consent, a grievance), each
 *              with the date it must be answered by; answering one, and
 *              erasing what may be erased.
 *   Retention  how long things are kept (applied every night), who answers
 *              privacy questions, and what the next run would erase.
 *   Access log every reveal of an Aadhaar number and every export.
 * (school-backend services/admission/privacy.js)
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { admin } from '@/api/admission.api';
import { confirmAsync } from '@/components/ui/kit';
import { useOffice, forgetOffice, Blocked, BLOCKED } from '@/components/admission/office/office';
import {
  Page, Tabs, Tiles, Tile, Panel, Line, Pill, Btn, Row, Note, Muted, Sheet, Field, Box, Pick, Tick, Facts, Fact, Blank,
  useApi, fmtDate, fmtDateTime, errMsg, say, unwrapList,
} from '@/components/admission/parts';

const STATUS: Record<string, [string, any]> = { open: ['Open', 'amber'], in_progress: ['In progress', 'indigo'], done: ['Done', 'green'], declined: ['Declined', 'slate'] };

export default function AdmissionPrivacyScreen() {
  const [tab, setTab] = useState('requests');
  return (
    <Page title="Privacy">
      <Tabs value={tab} onChange={setTab} items={[{ key: 'requests', label: 'Requests' }, { key: 'retention', label: 'Retention and contact' }, { key: 'log', label: 'Access log' }]} />
      <View style={{ height: 12 }} />
      {tab === 'retention' ? <Retention /> : tab === 'log' ? <AccessLog /> : <Requests />}
    </Page>
  );
}

function Requests() {
  const [status, setStatus] = useState('waiting');
  const { data, loading, error, errorCode, reload } = useApi<any>(() => admin.privacyRequests(status), [status]);
  const [open, setOpen] = useState<any>(null);
  if (BLOCKED.includes(errorCode)) return <Blocked message={error} />;
  const rows = unwrapList(data?.rows);
  return (
    <>
      {data ? (
        <Tiles>
          <Tile icon="time-outline" tone="amber" label="Waiting for an answer" value={String(data.counts?.waiting ?? 0)} on={status === 'waiting'} onPress={() => setStatus('waiting')} />
          <Tile icon="alert-circle-outline" tone="red" label="Past their due date" value={String(data.counts?.overdue ?? 0)} onPress={() => setStatus('waiting')} />
        </Tiles>
      ) : null}
      <Pick label="Status" value={status} onChange={setStatus} options={[{ value: 'waiting', label: 'Waiting for an answer' }, { value: '', label: 'Every request' }, ...Object.entries(STATUS).map(([k, [l]]) => ({ value: k, label: l }))]} />
      <View style={{ height: 10 }} />
      {loading && !data ? <Muted>Loading…</Muted> : rows.length ? (
        <Panel icon="shield-checkmark-outline" tone="red" title="Requests">
          {rows.map((r, i) => (
            <Line key={r._id} last={i === rows.length - 1} onPress={() => setOpen(r)} title={`${r.number} · ${r.kindLabel}`}
              sub={`${r.applicantName || '—'} · ${r.applicantEmail || ''}${r.applicationNumber ? ` · ${r.applicationNumber}` : ''}\nAnswer by ${fmtDate(r.dueAt)}${r.overdue ? ' — OVERDUE' : ''}`}
              right={<Pill tone={STATUS[r.status]?.[1] || 'slate'}>{STATUS[r.status]?.[0] || r.status}</Pill>} />
          ))}
        </Panel>
      ) : <Blank icon="shield-checkmark-outline" title="No requests here" body="When a family asks about its information — on the portal or in the app — the request lands here with the date it must be answered by." />}
      {open ? <RequestSheet r={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload(); }} /> : null}
    </>
  );
}

function RequestSheet({ r, onClose, onDone }: { r: any; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ status: r.status === 'open' ? 'in_progress' : r.status, response: r.response || '', internalNote: r.internalNote || '' });
  const [busy, setBusy] = useState('');
  const closed = ['done', 'declined'].includes(r.status);
  const save = async () => {
    setBusy('save');
    try { await admin.answerRequest(r._id, f); onDone(); } catch (e) { say('Not saved', errMsg(e)); } finally { setBusy(''); }
  };
  const erase = async () => {
    if (!(await confirmAsync("Erase this family's information?", 'This cannot be undone. Their applications keep only numbers, dates and outcomes for the school\'s statistics.', 'Erase'))) return;
    setBusy('erase');
    try {
      const res: any = await admin.eraseRequest(r._id);
      const kept = unwrapList(res?.data?.kept);
      say(`${res?.data?.erased ?? 0} application(s) erased`, kept.length ? `${kept.length} kept.` : '');
      setF((x) => ({ ...x, status: 'done', response: x.response || `Your information has been erased.${kept.length ? ` We have had to keep: ${kept.map((k: any) => `${k.applicationNumber} (${k.why})`).join('; ')}.` : ''} Payment records are kept as the law requires, without your details.` }));
    } catch (e) { say('Not erased', errMsg(e)); } finally { setBusy(''); }
  };
  return (
    <Sheet visible icon="shield-checkmark-outline" tone="red" title={`${r.number} — ${r.kindLabel}`} onClose={onClose} busy={!!busy}
      footer={closed ? <Btn block onPress={onClose}>Close</Btn> : <><Btn block onPress={onClose}>Close</Btn><Btn block kind="primary" disabled={!!busy || (['done', 'declined'].includes(f.status) && !f.response.trim())} onPress={save}>Save</Btn></>}>
      <Facts>
        <Fact k="From" v={`${r.applicantName || '—'} · ${r.applicantEmail || ''}`} />
        <Fact k="Received" v={fmtDateTime(r.createdAt)} />
        <Fact k="Answer by" v={fmtDate(r.dueAt)} />
        <Fact k="Application" v={r.applicationNumber || 'All of theirs'} />
      </Facts>
      {r.application ? <Btn onPress={() => { onClose(); router.push({ pathname: '/modules/admin/admission-application' as any, params: { id: r.application } }); }}>Open the application</Btn> : null}
      {r.details ? <Note tone="slate" icon="chatbox-outline">{r.details}</Note> : null}
      {r.kind === 'access' ? <Note>The family can download everything held about them from “Your data” on the portal or in the app at any time. Answer to say so, or with anything else they asked.</Note> : null}
      {['erasure', 'withdraw_consent'].includes(r.kind) && !closed ? (
        <Note tone="amber" icon="trash-outline" title="Erasing">
          {"Erases every application of this family that may be erased: answers, documents and history. An admitted student's application, one on legal hold, and payment amounts are kept."}
          <View style={{ height: 6 }} />
          <Btn kind="stop" icon="trash-outline" disabled={!!busy} onPress={erase}>Erase now</Btn>
        </Note>
      ) : null}
      {closed ? (
        <Note tone="green" icon="checkmark-circle-outline">{`${STATUS[r.status]?.[0]} ${r.handledAt ? `on ${fmtDate(r.handledAt)}` : ''}${r.handledByName ? ` by ${r.handledByName}` : ''}. Told the family: “${r.response}”`}</Note>
      ) : (
        <>
          <Field label="Status"><Pick label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={Object.entries(STATUS).map(([k, [l]]) => ({ value: k, label: l }))} /></Field>
          <Field label="Answer to the family" required={['done', 'declined'].includes(f.status)} hint={['done', 'declined'].includes(f.status) ? 'Emailed to them and shown on the portal and in the app' : 'Shown to the family'}>
            <Box value={f.response} onChange={(v) => setF({ ...f, response: v })} multiline maxLength={2000} />
          </Field>
          <Field label="Note for the office" hint="Never shown to the family"><Box value={f.internalNote} onChange={(v) => setF({ ...f, internalNote: v })} multiline maxLength={2000} /></Field>
        </>
      )}
    </Sheet>
  );
}

function Retention() {
  const { adm, reload: reloadOffice } = useOffice();
  const pre = useApi<any>(() => admin.retention(), []);
  const pv = adm?.settings?.privacy || {};
  const [v, setV] = useState<any>(null);
  const [busy, setBusy] = useState('');
  if (!adm) return <Muted>Loading…</Muted>;
  const cur = v || JSON.parse(JSON.stringify(pv));
  const r = cur.retention || {};
  const setR = (patch: any) => setV({ ...cur, retention: { ...r, ...patch } });
  const setO = (patch: any) => setV({ ...cur, officer: { ...(cur.officer || {}), ...patch } });
  const num = (x: any, d: number) => (x === '' || x == null ? d : Number(x) || d);
  const save = async () => {
    setBusy('save');
    try {
      const body = { ...cur, requestDays: num(cur.requestDays, 30), retention: { ...r, unsuccessfulMonths: num(r.unsuccessfulMonths, 12), abandonedDraftDays: num(r.abandonedDraftDays, 180), enquiryMonths: num(r.enquiryMonths, 12), deliveryLogMonths: num(r.deliveryLogMonths, 6) } };
      await admin.saveSettings({ privacy: body }); setV(null); forgetOffice(); reloadOffice(); pre.reload(); say('Saved');
    } catch (e) { say('Not saved', errMsg(e)); } finally { setBusy(''); }
  };
  const run = async () => {
    if (!(await confirmAsync('Run the retention rules now?', 'What the next run would erase (below) is erased now.', 'Run now'))) return;
    setBusy('run');
    try {
      const res: any = await admin.runRetention();
      const d = res?.data || {};
      say(d.skipped || `${d.erased} erased, ${d.drafts} old draft(s), ${d.enquiries} enquiry(ies) and ${d.deliveryLogs} delivery log(s) deleted`);
      pre.reload();
    } catch (e) { say('Not run', errMsg(e)); } finally { setBusy(''); }
  };
  const s = (x: any) => (x == null ? '' : String(x));
  return (
    <>
      <Panel icon="time-outline" tone="slate" title="How long things are kept" subtitle="Applied every night. An application on legal hold, an admitted student's application and payment amounts are never erased.">
        <Tick on={!!r.enabled} onChange={(x) => setR({ enabled: x })} label="Apply these periods automatically (off: nothing is erased until it is turned back on)" />
        <Field label="An application that did not lead to admission is erased after (months closed)"><Box value={s(r.unsuccessfulMonths)} onChange={(x) => setR({ unsuccessfulMonths: x })} text="digits" keyboardType="number-pad" /></Field>
        <Field label="A draft nobody has touched is deleted after (days)" hint="Drafts with a payment on them are kept"><Box value={s(r.abandonedDraftDays)} onChange={(x) => setR({ abandonedDraftDays: x })} text="digits" keyboardType="number-pad" /></Field>
        <Field label="Enquiries are deleted after (months)"><Box value={s(r.enquiryMonths)} onChange={(x) => setR({ enquiryMonths: x })} text="digits" keyboardType="number-pad" /></Field>
        <Field label="Email logs are deleted after (months)"><Box value={s(r.deliveryLogMonths)} onChange={(x) => setR({ deliveryLogMonths: x })} text="digits" keyboardType="number-pad" /></Field>
      </Panel>
      <Panel icon="person-circle-outline" tone="indigo" title="Who answers privacy questions" subtitle="Shown to families beside the privacy notice and under “Your data”">
        <Field label="Name"><Box value={cur.officer?.name || ''} onChange={(x) => setO({ name: x })} maxLength={80} text="name" /></Field>
        <Field label="Email"><Box value={cur.officer?.email || ''} onChange={(x) => setO({ email: x })} maxLength={200} text="email" keyboardType="email-address" /></Field>
        <Field label="Phone"><Box value={cur.officer?.phone || ''} onChange={(x) => setO({ phone: x })} phone /></Field>
        <Field label="Answer a family's request within (days)" hint="At most 90 — the DPDP Rules' limit for a grievance"><Box value={s(cur.requestDays)} onChange={(x) => setV({ ...cur, requestDays: x })} text="digits" keyboardType="number-pad" /></Field>
      </Panel>
      <Row>
        {v ? <Btn onPress={() => setV(null)}>Undo changes</Btn> : null}
        <Btn kind="primary" icon="save-outline" disabled={!v || !!busy} onPress={save}>Save</Btn>
      </Row>
      <View style={{ height: 12 }} />
      <Panel icon="trash-outline" tone="red" title="The next run would" right={<Btn icon="refresh-outline" disabled={!!v || !pre.data?.enabled || !!busy} onPress={run}>Run now</Btn>}>
        {!pre.data ? <Muted>Loading…</Muted> : (
          <Facts>
            <Fact k="Erase applications" v={String(pre.data.unsuccessful ?? 0)} />
            <Fact k="Delete old drafts" v={String(pre.data.drafts ?? 0)} />
            <Fact k="Delete enquiries" v={String(pre.data.enquiries ?? 0)} />
            <Fact k="Delete delivery logs" v={String(pre.data.deliveryLogs ?? 0)} />
            <Fact k="On legal hold (kept)" v={String(pre.data.onHold ?? 0)} />
            <Fact k="Erased so far" v={String(pre.data.erasedSoFar ?? 0)} />
          </Facts>
        )}
      </Panel>
    </>
  );
}

function AccessLog() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, loading, error } = useApi<any>(() => admin.accessLog({ page }), [page]);
  if (loading && !data) return <Muted>Loading…</Muted>;
  if (error && !data) return <Note tone="red" icon="alert-circle-outline">{error}</Note>;
  const rows = unwrapList(data?.rows);
  return (
    <>
      <Panel icon="eye-outline" tone="amber" title="Who looked at what" subtitle="Every reveal of an Aadhaar number and every export of applications">
        {rows.length ? rows.map((r, i) => (
          <Line key={r._id || i} last={i === rows.length - 1}
            onPress={r.application ? () => router.push({ pathname: '/modules/admin/admission-application' as any, params: { id: r.application } }) : undefined}
            title={r.action === 'reveal' ? `Revealed ${r.detail || r.field}` : r.detail || 'Export'}
            sub={`${r.userName || '—'} (${String(r.role || '').replace('_', ' ')}) · ${fmtDateTime(r.createdAt)}${r.applicationNumber ? `\n${r.applicationNumber} · ${r.studentName}` : ''}`}
            right={<Pill tone={r.action === 'reveal' ? 'amber' : 'indigo'} icon={r.action === 'reveal' ? 'eye-outline' : 'download-outline'}>{r.action === 'reveal' ? 'Reveal' : 'Export'}</Pill>} />
        )) : <Muted>Nothing yet. Reveals and exports are recorded here.</Muted>}
      </Panel>
      {data && Number(data.pages || 1) > 1 ? (
        <Row>
          <Btn disabled={page <= 1} onPress={() => setPage(page - 1)}>Newer</Btn>
          <Muted>{`Page ${page} of ${data.pages}`}</Muted>
          <Btn disabled={page >= Number(data.pages)} onPress={() => setPage(page + 1)}>Older</Btn>
        </Row>
      ) : null}
    </>
  );
}
