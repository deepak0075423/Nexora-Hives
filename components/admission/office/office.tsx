/**
 * The admission office on the phone — what its screens share (Oct 2026).
 *
 *   useOffice    the school's admission setup (/admin/bootstrap: settings,
 *                classes, rounds, staff, the status catalogue), loaded once and
 *                kept for a minute so moving between office screens is quick.
 *   MoveSheet    changing an application's status (the server lists the moves
 *                it allows, which need approval, and why the rest are barred).
 *   ReviewSheet  verifying a document, or asking for it again / rejecting it.
 *   AskSheet     a confirmation that needs a written reason.
 *   Blocked      the module-disabled / not-allowed answer, as the other modules.
 *
 * Everything is the server's to decide; these only ask and show its answer.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { admin } from '@/api/admission.api';
import { openAdmissionFile } from '../files';
import { Sheet, Field, Box, Pick, Btn, Note, Muted, Tick, BRAND, TINT, errMsg, say, unwrapList, STATUS } from '../parts';

// ── The school's setup ────────────────────────────────────────────────────────

let cache: { at: number; data: any } | null = null;

export function useOffice() {
  const [adm, setAdm] = useState<any>(cache?.data || null);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const load = useCallback(async (force = false) => {
    if (!force && cache && Date.now() - cache.at < 60000) { setAdm(cache.data); return; }
    try {
      const r: any = await admin.bootstrap();
      cache = { at: Date.now(), data: r?.data ?? r };
      setAdm(cache.data); setError('');
    } catch (e: any) { setError(errMsg(e)); setErrorCode(e?.data?.code || ''); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const statuses: any[] = unwrapList(adm?.catalogs?.statuses);
  const statusOf = (key?: string) => statuses.find((s) => s.key === key) || { key, label: STATUS[String(key)]?.label || key, closed: false };
  const className = (id?: string) => unwrapList(adm?.classes).find((c) => String(c._id) === String(id))?.className || '';
  return { adm, error, errorCode, reload: () => load(true), statusOf, className };
}

/** Forget the cached setup (after changing settings, so the next screen reads them fresh). */
export const forgetOffice = () => { cache = null; };

export const BLOCKED = ['MODULE_DISABLED', 'MODULE_ACCESS_DENIED', 'MODULE_ADMIN_REQUIRED'];

// ── Changing an application's status ──────────────────────────────────────────

const REASON_STATUSES = ['rejected', 'ineligible', 'cancelled', 'withdrawn', 'incomplete', 'documents_pending'];

export function MoveSheet({ app, moves, canReopen, closed, transition = admin.transition, onClose, onDone }: {
  app: any; moves: any[]; canReopen?: boolean; closed?: boolean; transition?: (id: string, data: any) => Promise<any>; onClose: () => void; onDone: () => void;
}) {
  const ok = moves.filter((m) => m.ok);
  const [to, setTo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [note, setNote] = useState('');
  const [reopen, setReopen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState(false);
  const pick = ok.find((m) => m.status === to);
  const needReason = REASON_STATUSES.includes(to);
  const blocked = moves.filter((m) => !m.ok && m.reason);
  const go = async () => {
    setBusy(true);
    try {
      const r: any = await transition(String(app._id), { to, remarks: remarks.trim(), note: note.trim(), reopen });
      say(pick?.needsApproval ? 'Sent for approval' : 'Done', r?.message || '');
      onDone(); onClose();
    } catch (e) { say('Not changed', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible icon="repeat-outline" tone="indigo" title="Change the status" subtitle={app.studentName || app.applicationNumber} onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind="primary" disabled={busy || !to || (needReason && !remarks.trim())} onPress={go}>{pick?.needsApproval ? 'Send for approval' : 'Move'}</Btn></>}>
      {closed && canReopen ? (
        <Note tone="amber" icon="alert-circle-outline" title="This application is closed">
          <Tick on={reopen} onChange={(v) => { setReopen(v); setTo(''); }} label="Reopen it (back to review) — administrators only" />
        </Note>
      ) : null}
      <Field label="Move to" required>
        <Pick label="Move to" value={to} placeholder="Choose a status" onChange={setTo}
          options={(reopen ? moves.filter((m) => m.status === 'under_review') : ok).map((m) => ({ value: m.status, label: `${m.label}${m.needsApproval ? ' — needs approval' : ''}` }))} />
      </Field>
      {pick?.needsApproval ? <Note tone="indigo" icon="shield-checkmark-outline">This move needs an administrator’s approval. It waits on the application until someone approves it.</Note> : null}
      <Field label="Message to the family" required={needReason} hint={needReason ? 'Required — the family is told why.' : 'Optional. Added to the update and the email the family gets.'}>
        <Box value={remarks} onChange={setRemarks} multiline maxLength={1000} />
      </Field>
      <Field label="Internal note" hint="Seen by staff only.">
        <Box value={note} onChange={setNote} multiline maxLength={500} />
      </Field>
      {blocked.length ? (
        <>
          <TouchableOpacity onPress={() => setWhy(!why)}><Text style={st.link}>{why ? 'Hide' : `Why some statuses are not offered (${blocked.length})`}</Text></TouchableOpacity>
          {why ? blocked.slice(0, 20).map((m) => <Muted key={m.status}>{`${m.label}: ${m.reason}`}</Muted>) : null}
        </>
      ) : null}
    </Sheet>
  );
}

// ── Reviewing a document ──────────────────────────────────────────────────────

const DECISIONS = [{ key: 'verify', label: 'Verify' }, { key: 'resubmit', label: 'Ask to upload again' }, { key: 'reject', label: 'Reject' }];

export function ReviewSheet({ doc, initial = 'verify', reasons = [], review = admin.reviewDoc, fileUrl, onClose, onDone }: {
  doc: any; initial?: string; reasons?: string[]; review?: (id: string, data: any) => Promise<any>; fileUrl: string; onClose: () => void; onDone: () => void;
}) {
  const [decision, setDecision] = useState(initial);
  const [reason, setReason] = useState('');
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const why = reason === '__other' || !reasons.length ? custom.trim() : reason;
  const go = async () => {
    setBusy(true);
    try {
      await review(String(doc._id), { decision, reason: decision === 'verify' ? '' : why, note: note.trim() });
      say(decision === 'verify' ? 'Document verified' : 'The family has been told');
      onDone(); onClose();
    } catch (e) { say('Not saved', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible icon="document-text-outline" tone="teal" title={`Review — ${doc.typeName || doc.name || String(doc.docKey || 'document').replace(/_/g, ' ')}`}
      subtitle={[doc.studentName, doc.originalName].filter(Boolean).join(' · ')} onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind={decision === 'verify' ? 'primary' : decision === 'reject' ? 'stop' : 'primary'} disabled={busy || (decision !== 'verify' && !why)} onPress={go}>{DECISIONS.find((x) => x.key === decision)?.label}</Btn></>}>
      <View style={st.choices} accessibilityRole="radiogroup">
        {DECISIONS.map((x) => {
          const on = decision === x.key;
          return (
            <TouchableOpacity key={x.key} onPress={() => setDecision(x.key)} style={[st.choice, on && st.choiceOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
              <Text style={[st.choiceText, on && { color: '#fff' }]}>{x.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Btn icon="eye-outline" onPress={() => openAdmissionFile(fileUrl, doc.originalName || 'document').catch((e) => say('Could not open it', errMsg(e)))}>Open the file</Btn>
      <View style={{ height: 12 }} />
      {decision !== 'verify' ? (
        <>
          {reasons.length ? (
            <Field label="Reason" required>
              <Pick label="Reason" value={reason} placeholder="Choose a reason" onChange={setReason}
                options={[...reasons.map((r) => ({ value: r, label: r })), { value: '__other', label: 'Another reason…' }]} />
            </Field>
          ) : null}
          {!reasons.length || reason === '__other' ? (
            <Field label={reasons.length ? 'Write the reason' : 'Reason'} required hint="The family sees this.">
              <Box value={custom} onChange={setCustom} multiline maxLength={300} />
            </Field>
          ) : null}
        </>
      ) : null}
      <Field label="Internal note" hint="Optional — kept in the document's history.">
        <Box value={note} onChange={setNote} multiline maxLength={300} />
      </Field>
    </Sheet>
  );
}

// ── A confirmation with a reason ──────────────────────────────────────────────

export function AskSheet({ title, message, label = 'Reason', confirm, tone = 'indigo', danger, required = true, onClose, onConfirm, children }: {
  title: string; message?: string; label?: string; confirm: string; tone?: any; danger?: boolean; required?: boolean;
  onClose: () => void; onConfirm: (reason: string) => Promise<any>; children?: React.ReactNode;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await onConfirm(text.trim()); onClose(); } catch (e) { say('Not done', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible icon={danger ? 'alert-circle-outline' : 'chatbox-ellipses-outline'} tone={danger ? 'red' : tone} title={title} subtitle={message} onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind={danger ? 'stop' : 'primary'} disabled={busy || (required && !text.trim())} onPress={go}>{confirm}</Btn></>}>
      {children}
      <Field label={label} required={required}>
        <Box value={text} onChange={setText} multiline maxLength={500} />
      </Field>
    </Sheet>
  );
}

/** "Not your module" — the same words as the app's other modules. */
export function Blocked({ message }: { message: string }) {
  return (
    <View style={st.blocked}>
      <Text style={st.blockedTitle}>Admissions are not open to you here</Text>
      <Text style={st.blockedBody}>{message}</Text>
    </View>
  );
}

/** A small bar: label, bar, number (the funnel and backlogs). */
export function Bar({ label, n, max, tone = 'indigo' }: { label: string; n: number; max: number; tone?: keyof typeof TINT }) {
  const pct = max > 0 ? Math.max(2, Math.round((Number(n || 0) / max) * 100)) : 0;
  return (
    <View style={st.bar}>
      <Text style={st.barLabel} numberOfLines={1}>{label}</Text>
      <View style={st.barTrack}><View style={[st.barFill, { width: `${pct}%`, backgroundColor: TINT[tone].fg }]} /></View>
      <Text style={st.barN}>{Number(n || 0).toLocaleString('en-IN')}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  link: { fontSize: 12.5, fontWeight: '700', color: BRAND, paddingVertical: 6 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  choice: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#fff' },
  choiceOn: { backgroundColor: BRAND, borderColor: BRAND },
  choiceText: { fontSize: 13, fontWeight: '700', color: Colors.text },
  blocked: { padding: 24, alignItems: 'center' },
  blockedTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  blockedBody: { fontSize: 12.5, color: Colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  barLabel: { width: 118, fontSize: 12, color: Colors.text },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#F1F5F9', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  barN: { width: 44, textAlign: 'right', fontSize: 12, fontWeight: '700', color: Colors.text },
});
