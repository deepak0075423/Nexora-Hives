/**
 * RTE seats, for the office on the phone (Oct 2026): the 25% the RTE Act
 * (s.12(1)(c)) sets aside in private unaided schools — allotted by the state,
 * admitted free, reimbursed by the state.
 *
 *   Allotment  load the state's list (a CSV file from the phone) into a class's
 *              RTE quota: each child becomes an application already selected,
 *              with the state's reference. A list loaded twice adds nothing.
 *   Register   what the state owes for each RTE child admitted, year by year.
 */
import React, { useState } from 'react';
import { View, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { admin } from '@/api/admission.api';
import { openAdmissionFile } from '@/components/admission/files';
import { useOffice, Blocked, BLOCKED } from '@/components/admission/office/office';
import {
  Page, Tabs, Tiles, Tile, Panel, Line, Pill, Btn, Row, Note, Muted, Sheet, Field, Box, Pick, Blank,
  useApi, money, fmtDate, errMsg, say, unwrapList,
} from '@/components/admission/parts';

const COLUMNS = ['externalRef', 'studentName', 'studentDob', 'studentGender', 'parentName', 'parentPhone', 'parentEmail', 'relation', 'category'];
const CLAIM: Record<string, [string, any]> = { pending: ['Not claimed yet', 'slate'], claimed: ['Claimed', 'amber'], received: ['Received', 'green'], rejected: ['Rejected', 'red'] };

/** A small CSV reader (the web's): commas, quoted fields with "" inside, a header row naming the columns. */
function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let quoted = false;
  const t = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell.trim()); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i += 1;
      row.push(cell.trim()); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.replace(/\s+/g, '').toLowerCase());
  const at = (name: string) => head.indexOf(name.toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(COLUMNS.map((c) => [c, at(c) >= 0 ? r[at(c)] || '' : ''])));
}

export default function AdmissionRteScreen() {
  const [tab, setTab] = useState('allotment');
  return (
    <Page title="RTE seats">
      <Tabs value={tab} onChange={setTab} items={[{ key: 'allotment', label: "The state's allotment" }, { key: 'register', label: 'Reimbursement register' }]} />
      <View style={{ height: 12 }} />
      {tab === 'register' ? <Register /> : <Allotment />}
    </Page>
  );
}

function Allotment() {
  const { adm, className } = useOffice();
  const [round, setRound] = useState('');
  const [cls, setCls] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const r = unwrapList(adm?.rounds).find((x: any) => String(x._id) === round);
  const rteClasses = unwrapList(r?.classes).filter((c: any) => unwrapList(c.quotas).some((x: any) => x.kind === 'rte'));
  const quota = rteClasses.find((c: any) => String(c.class) === cls)?.quotas?.find((x: any) => x.kind === 'rte');
  const pick = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const a: any = res.assets[0];
      const text = Platform.OS === 'web' && a.file ? await a.file.text() : await FileSystem.readAsStringAsync(a.uri);
      const parsed = parseCsv(text);
      if (!parsed.length) { say('Nothing to load', 'The file has no rows under a header row.'); return; }
      setRows(parsed); setName(a.name || 'list.csv');
    } catch (e) { say('Could not read the file', errMsg(e)); }
  };
  const go = async () => {
    setBusy(true);
    try {
      const res: any = await admin.importRte(round, { class: cls, quota: quota.key, rows });
      say(`${res?.data?.imported ?? 0} child(ren) added`, res?.data?.skipped ? `${res.data.skipped} were already in.` : '');
      setRows([]); setName('');
    } catch (e) { say('Not loaded', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <Note tone="indigo">The state runs the lottery for these seats and sends the school its list. Each child loaded becomes an application already selected under the class’s RTE quota, with the state’s reference. Then check documents, make each an offer (it is free) and confirm as usual.</Note>
      <Panel icon="cloud-upload-outline" tone="blue" title="Load an allotment">
        <Field label="Round" required><Pick label="Round" value={round} placeholder="Choose a round" onChange={(v) => { setRound(v); setCls(''); }} options={unwrapList(adm?.rounds).map((x: any) => ({ value: String(x._id), label: x.name }))} /></Field>
        <Field label="Class" required hint={round && !rteClasses.length ? 'No class of this round has an RTE quota yet — set it on the round, on the web' : ''}>
          <Pick label="Class" value={cls} placeholder="Choose a class" onChange={setCls} options={rteClasses.map((c: any) => ({ value: String(c.class), label: className(c.class) }))} />
        </Field>
        {quota ? <Row><Pill tone="indigo">{`${quota.name} — ${quota.seats} seats`}</Pill></Row> : null}
        <View style={{ height: 8 }} />
        <Btn icon="document-attach-outline" onPress={pick}>{name ? `Chosen: ${name}` : 'Choose the CSV file'}</Btn>
        <Muted>{`Columns: ${COLUMNS.join(', ')}. Dates as YYYY-MM-DD; mobile numbers of 10 digits.`}</Muted>
      </Panel>
      {rows.length ? (
        <Panel icon="list-outline" tone="slate" title={`Preview — ${rows.length} child${rows.length === 1 ? '' : 'ren'}`}>
          {rows.slice(0, 30).map((x, i) => <Line key={i} last={i === Math.min(rows.length, 30) - 1} title={`${x.studentName || '—'} · ${x.externalRef || 'no reference'}`} sub={`${x.studentDob || '—'} · ${x.studentGender || '—'} · ${x.parentName || '—'} ${x.parentPhone || ''} · ${x.category || ''}`} />)}
          {rows.length > 30 ? <Muted>{`…and ${rows.length - 30} more`}</Muted> : null}
          <View style={{ height: 8 }} />
          <Btn kind="primary" block disabled={busy || !quota} onPress={go}>{busy ? 'Loading…' : `Load ${rows.length} ${rows.length === 1 ? 'child' : 'children'}`}</Btn>
        </Panel>
      ) : null}
    </>
  );
}

function Register() {
  const { adm } = useOffice();
  const years = unwrapList(adm?.academicYears);
  const [year, setYear] = useState('');
  const y = year || String((years.find((x: any) => x.status === 'active') || years[0] || {})._id || '');
  const { data, loading, error, errorCode, reload } = useApi<any>(() => (y ? admin.rteRegister(y) : Promise.resolve({ data: null })), [y]);
  const [row, setRow] = useState<any>(null);
  if (BLOCKED.includes(errorCode)) return <Blocked message={error} />;
  const rows = unwrapList(data?.rows);
  return (
    <>
      <Row>
        <View style={{ flex: 1, minWidth: 160 }}><Pick label="Year" value={y} onChange={setYear} options={years.map((x: any) => ({ value: String(x._id), label: x.yearName }))} /></View>
        <Btn icon="download-outline" disabled={!y} onPress={() => openAdmissionFile(admin.rteRegisterCsvUrl(y), 'rte-reimbursement-register.csv').catch((e) => say('Could not export', errMsg(e)))}>CSV</Btn>
      </Row>
      <View style={{ height: 10 }} />
      {loading && !data ? <Muted>Loading…</Muted> : data ? (
        <>
          <Tiles>
            <Tile icon="people-outline" tone="indigo" label="RTE children admitted" value={String(data.totals?.children ?? 0)} />
            <Tile icon="send-outline" tone="amber" label="Claimed" value={money(data.totals?.claimed)} />
            <Tile icon="checkmark-circle-outline" tone="green" label="Received" value={money(data.totals?.received)} />
            <Tile icon="time-outline" tone="red" label="Still owed" value={money(data.totals?.outstanding)} />
          </Tiles>
          {rows.length ? (
            <Panel icon="ribbon-outline" tone="blue" title="Children">
              {rows.map((r, i) => (
                <Line key={r._id} last={i === rows.length - 1} onPress={() => setRow(r)} title={`${r.studentName} · ${r.admissionNumber}`}
                  sub={`${r.className}${r.perChildAmount != null ? ` · ${money(r.perChildAmount)} per child` : ''}${r.claimedAmount != null ? ` · claimed ${money(r.claimedAmount)} on ${fmtDate(r.claimedAt)}` : ''}${r.receivedAmount != null ? ` · received ${money(r.receivedAmount)}` : ''}${r.reference ? ` · ${r.reference}` : ''}`}
                  right={<Pill tone={CLAIM[r.status]?.[1] || 'slate'}>{CLAIM[r.status]?.[0] || r.status}</Pill>} />
              ))}
            </Panel>
          ) : <Blank icon="ribbon-outline" title="No RTE children enrolled for this year" body="A line appears for each child admitted under an RTE quota once they are enrolled." />}
        </>
      ) : null}
      {row ? <ClaimSheet row={row} onClose={() => setRow(null)} onDone={() => { setRow(null); reload(); }} /> : null}
    </>
  );
}

function ClaimSheet({ row, onClose, onDone }: { row: any; onClose: () => void; onDone: () => void }) {
  const s = (v: any) => (v == null ? '' : String(v));
  const [f, setF] = useState({ perChildAmount: s(row.perChildAmount), claimedAmount: s(row.claimedAmount), receivedAmount: s(row.receivedAmount), status: row.status, reference: row.reference || '', notes: row.notes || '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await admin.updateRteClaim(row._id, f); onDone(); } catch (e) { say('Not saved', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible icon="ribbon-outline" tone="blue" title={`${row.studentName} — ${row.admissionNumber}`} onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind="primary" disabled={busy} onPress={save}>Save</Btn></>}>
      <Field label="Per-child amount (₹)" hint="As the state notified it"><Box value={f.perChildAmount} onChange={(v) => setF({ ...f, perChildAmount: v })} text="digits" keyboardType="number-pad" /></Field>
      <Field label="Status"><Pick label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={Object.entries(CLAIM).map(([k, [l]]) => ({ value: k, label: l }))} /></Field>
      <Field label="Claimed (₹)"><Box value={f.claimedAmount} onChange={(v) => setF({ ...f, claimedAmount: v })} text="digits" keyboardType="number-pad" /></Field>
      <Field label="Received (₹)"><Box value={f.receivedAmount} onChange={(v) => setF({ ...f, receivedAmount: v })} text="digits" keyboardType="number-pad" /></Field>
      <Field label="Reference" hint="The claim or payment number"><Box value={f.reference} onChange={(v) => setF({ ...f, reference: v })} maxLength={80} text="code" /></Field>
      <Field label="Notes"><Box value={f.notes} onChange={(v) => setF({ ...f, notes: v })} maxLength={500} /></Field>
    </Sheet>
  );
}
