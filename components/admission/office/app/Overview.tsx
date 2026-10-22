/**
 * An application's overview for the office (phone): the next step (confirm the
 * admission, create the student, activate accounts), who applied, who it is
 * assigned to, its quota, a legal hold, the family's applications at the other
 * branches of a group (and moving it to one), and the checks that gate it.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { admin } from '@/api/admission.api';
import { AskSheet } from '../office';
import {
  Panel, Facts, Fact, Btn, Note, Tag, Pill, Muted, Sheet, Field, Box, Pick, Tick, Line, DOC_STATUS, FEE_STATUS,
  useApi, fmtDate, fmtDateTime, money, errMsg, say, unwrapList,
} from '../../parts';

export default function Overview({ d, staff, reload }: { d: any; staff: any[]; reload: () => void }) {
  const app = d.application;
  const isAdmin = !!d.permissions?.isAdmin;
  return (
    <>
      <NextStep d={d} reload={reload} />
      <Panel icon="person-outline" title="Applicant">
        <Facts>
          <Fact k="Account" v={app.applicantName ? `${app.applicantName} · ${app.applicantEmail}` : app.applicantEmail} />
          <Fact k="Parent / guardian" v={app.guardianName} />
          <Fact k="Mobile" v={app.guardianPhone || app.applicantPhone} />
          <Fact k="Email" v={app.guardianEmail} />
          <Fact k="Date of birth" v={app.studentDob ? fmtDate(app.studentDob) : ''} />
          <Fact k="Started" v={fmtDateTime(app.createdAt)} />
          <Fact k="Submitted" v={app.submittedAt ? fmtDateTime(app.submittedAt) : 'Not yet'} />
          <Fact k="Source" v={app.source} />
          {app.admissionNumber ? <Fact k="Admission number" v={app.admissionNumber} /> : null}
        </Facts>
      </Panel>
      <Assign app={app} staff={staff} reload={reload} />
      {(d.quotas || []).length || app.quota ? <Quota app={app} quotas={unwrapList(d.quotas)} isAdmin={isAdmin} reload={reload} /> : null}
      {isAdmin && !app.erasedAt ? <Hold app={app} reload={reload} /> : null}
      <Branches app={app} closed={!!d.closed} />
      <Panel icon="checkbox-outline" tone="slate" title="Checks">
        <Facts>
          <Fact k="Documents" v={<Tag map={DOC_STATUS} value={app.docStatus || 'missing'} />} />
          <Fact k="Required" v={`${d.documents?.summary?.uploaded ?? 0} of ${d.documents?.summary?.required ?? 0} uploaded`} />
          <Fact k="Verified" v={String(d.documents?.summary?.verified ?? 0)} />
          <Fact k="To fix" v={String((d.documents?.summary?.rejected ?? 0) + (d.documents?.summary?.missing ?? 0))} />
          <Fact k="Application fee" v={<Tag map={FEE_STATUS} value={d.fees?.application?.status} />} />
          <Fact k="Admission fee" v={<Tag map={FEE_STATUS} value={d.fees?.admission?.status} />} />
          <Fact k="Exams" v={d.workflow?.facts?.exams ? `${d.workflow.facts.exams.scheduled} scheduled, ${d.workflow.facts.exams.pending} to sit` : '—'} />
          <Fact k="Results" v={d.workflow?.facts?.results?.unapproved ? `${d.workflow.facts.results.unapproved} not approved` : 'All approved'} />
        </Facts>
      </Panel>
    </>
  );
}

// ── Next step ─────────────────────────────────────────────────────────────────

function NextStep({ d, reload }: { d: any; reload: () => void }) {
  const app = d.application;
  const [busy, setBusy] = useState(false);
  const [converting, setConverting] = useState(false);
  const blockers: string[] = unwrapList(d.confirmation?.blockers);
  const conv = app.conversion;
  if (['selected', 'accepted', 'payment_pending'].includes(app.status)) {
    const confirm = async () => {
      setBusy(true);
      try { await admin.confirm(app._id); say('Admission confirmed'); reload(); } catch (e) { say('Not confirmed', errMsg(e)); } finally { setBusy(false); }
    };
    return (
      <Panel icon="shield-checkmark-outline" tone="green" title="Confirm the admission">
        {blockers.length ? <Note tone="amber" icon="alert-circle-outline" title="Not yet">{blockers.map((b) => `• ${b}`).join('\n')}</Note>
          : <Muted>Everything the school requires is in place. Confirming holds the seat for this student.</Muted>}
        <View style={{ height: 8 }} />
        <Btn kind="primary" block disabled={busy || !!blockers.length} onPress={confirm}>Confirm admission</Btn>
      </Panel>
    );
  }
  if (app.status === 'confirmed') {
    return (
      <Panel icon="school-outline" tone="green" title="Create the student">
        <Muted>The admission is confirmed. Create the student’s account and record — the parent is created or linked, the student is placed in a section, and fees, transport, hostel and medical records follow where the school uses them.</Muted>
        <View style={{ height: 8 }} />
        <Btn kind="primary" block icon="person-add-outline" onPress={() => setConverting(true)}>Create the student account</Btn>
        {converting ? <ConvertSheet app={app} onClose={() => setConverting(false)} onDone={reload} /> : null}
      </Panel>
    );
  }
  if (app.status === 'enrolled' && conv) {
    const activate = async () => {
      setBusy(true);
      try { const r: any = await admin.activate(app._id); say('Accounts activated', unwrapList(r?.data?.sent).join('\n')); reload(); } catch (e) { say('Not activated', errMsg(e)); } finally { setBusy(false); }
    };
    const steps = Object.entries(conv.steps || {}) as [string, any][];
    return (
      <Panel icon="checkmark-circle-outline" tone="green" title="Enrolled">
        <Facts>
          <Fact k="Admission number" v={app.admissionNumber} />
          <Fact k="Section" v={conv.section?.name || 'Not placed yet'} />
          <Fact k="Student sign-in" v={conv.studentEmail} />
          <Fact k="Parent sign-in" v={`${conv.parentEmail || '—'}${conv.parentMode === 'linked_existing' ? ' (existing parent)' : ''}`} />
          {conv.feeStructure?.name ? <Fact k="Fee structure" v={conv.feeStructure.name} /> : null}
          {conv.byName ? <Fact k="Enrolled by" v={`${conv.byName}, ${fmtDateTime(conv.at)}`} /> : null}
        </Facts>
        {steps.map(([k, s]) => <Muted key={k}>{`${s.ok ? '✓' : '!'} ${k}${s.ok ? '' : ` — ${s.error}`}`}</Muted>)}
        {conv.activation === 'manual' && !conv.activatedAt ? (
          <>
            <Note tone="amber" icon="lock-closed-outline">The accounts were created switched off, as the enrolment settings ask.</Note>
            <Btn kind="primary" block disabled={busy} onPress={activate}>Activate accounts</Btn>
          </>
        ) : null}
      </Panel>
    );
  }
  return null;
}

/** Creating the student from a confirmed admission (school-backend services/admission/conversion.js — safe to repeat). */
function ConvertSheet({ app, onClose, onDone }: { app: any; onClose: () => void; onDone: () => void }) {
  const { data: p, error } = useApi<any>(() => admin.conversion(app._id), [app._id]);
  const [f, setF] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!p || p.done || f) return;
    setF({
      section: (unwrapList(p.placement?.sections).find((s: any) => s.free == null || s.free > 0) || {})._id || '',
      studentAccount: p.student?.canUseApplicantAccount && !p.student?.email ? 'applicant' : 'new',
      studentEmail: p.student?.email || '', admissionNumber: '',
      parentMode: 'new', parentId: p.parent?.existing?.[0]?._id || '',
      relation: p.parent?.relation || 'Father', parentName: p.parent?.name || '', parentEmail: p.parent?.email || '', parentPhone: p.parent?.phone || '',
      activation: p.options?.activation || 'immediate',
      fees: !!p.options?.fees?.available, transport: !!(p.options?.transport?.available && p.options?.transport?.requested),
      hostelId: '', medical: !!(p.options?.medical?.available && p.options?.medical?.has),
    });
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const go = async () => {
    setBusy(true);
    try {
      const body = {
        section: f.section || null, studentAccount: f.studentAccount, studentEmail: f.studentAccount === 'new' ? f.studentEmail.trim() : '',
        admissionNumber: f.admissionNumber.trim(),
        parent: f.parentMode === 'existing' ? { mode: 'existing', userId: f.parentId } : { mode: 'new', relation: f.relation, name: f.parentName.trim(), email: f.parentEmail.trim(), phone: f.parentPhone.trim() },
        activation: f.activation,
        options: { fees: f.fees, transport: f.transport, medical: f.medical, ...(f.hostelId ? { hostel: { hostelId: f.hostelId } } : {}) },
      };
      const r: any = await admin.convert(app._id, body);
      say('Enrolled', r?.message || '');
      onClose(); onDone();
    } catch (e) { say('Not enrolled', errMsg(e)); } finally { setBusy(false); }
  };
  const o = p?.options || {};
  return (
    <Sheet visible icon="person-add-outline" tone="green" title="Create the student account" subtitle={app.studentName} onClose={onClose} busy={busy}
      footer={p && !p.done ? <><Btn block onPress={onClose}>Cancel</Btn><Btn block kind="primary" disabled={busy || !p.ready || !f} onPress={go}>Enrol student</Btn></> : <Btn block onPress={onClose}>Close</Btn>}>
      {error ? <Note tone="red" icon="alert-circle-outline">{error}</Note> : !p ? <Muted>Loading…</Muted> : p.done ? (
        <Note tone="green" icon="checkmark-circle-outline">{`Already enrolled — admission number ${p.admissionNumber}. Nothing will be created twice.`}</Note>
      ) : f ? (
        <>
          {unwrapList(p.blockers).length ? <Note tone="red" icon="alert-circle-outline">{unwrapList(p.blockers).join('; ')}</Note> : null}
          {unwrapList(p.warnings).map((w: string) => <Note key={w} tone="amber" icon="alert-circle-outline">{w}</Note>)}
          <Text style={st.h}>Student</Text>
          <Field label="Admission number" hint={p.placement?.admissionNumberPreview ? `Leave empty for the next number (${p.placement.admissionNumberPreview})` : 'Leave empty for the next number'}>
            <Box value={f.admissionNumber} onChange={(v) => set('admissionNumber', v)} maxLength={40} text="code" />
          </Field>
          <Field label={`Section — ${p.placement?.class?.className || ''} · ${p.placement?.academicYear?.yearName || ''}`} hint={unwrapList(p.placement?.sections).length ? '' : 'No section exists yet for this class and year'}>
            <Pick label="Section" value={f.section} onChange={(v) => set('section', v)}
              options={[{ value: '', label: 'Place in a section later' }, ...unwrapList(p.placement?.sections).map((s: any) => ({ value: String(s._id), label: `${s.sectionName}${s.capacity ? ` — ${s.free} of ${s.capacity} free` : ''}` }))]} />
          </Field>
          {p.student?.canUseApplicantAccount ? <Tick on={f.studentAccount === 'applicant'} onChange={(v) => set('studentAccount', v ? 'applicant' : 'new')} label={`Turn the applicant's account (${p.student.applicantEmail}) into the student's`} /> : null}
          {f.studentAccount === 'new' ? (
            <Field label="Student's sign-in email" required><Box value={f.studentEmail} onChange={(v) => set('studentEmail', v)} maxLength={200} text="email" keyboardType="email-address" /></Field>
          ) : null}
          <Text style={st.h}>Parent</Text>
          {unwrapList(p.parent?.existing).length ? <Tick on={f.parentMode === 'existing'} onChange={(v) => set('parentMode', v ? 'existing' : 'new')} label="Link an existing parent at the school" /> : null}
          {f.parentMode === 'existing' ? (
            <Field label="Parent account">
              <Pick label="Parent account" value={f.parentId} onChange={(v) => set('parentId', v)}
                options={unwrapList(p.parent?.existing).map((x: any) => ({ value: String(x._id), label: x.name, sub: `${x.email}${x.phone ? `, ${x.phone}` : ''} (${x.childCount} child${x.childCount === 1 ? '' : 'ren'})` }))} />
            </Field>
          ) : (
            <>
              <Field label="Relation"><Pick label="Relation" value={f.relation} onChange={(v) => set('relation', v)} options={['Father', 'Mother', 'Guardian'].map((r) => ({ value: r, label: r }))} /></Field>
              <Field label="Name" required><Box value={f.parentName} onChange={(v) => set('parentName', v)} maxLength={100} text="name" /></Field>
              <Field label="Sign-in email" required><Box value={f.parentEmail} onChange={(v) => set('parentEmail', v)} maxLength={200} text="email" keyboardType="email-address" /></Field>
              <Field label="Mobile"><Box value={f.parentPhone} onChange={(v) => set('parentPhone', v)} phone /></Field>
            </>
          )}
          <Text style={st.h}>Along with the account</Text>
          {o.fees?.available ? <Tick on={f.fees} onChange={(v) => set('fees', v)} label={`Assign fees${o.fees.structure ? ` — ${o.fees.structure.name} (${money(o.fees.structure.totalAmount)})` : ' (no fee structure found for this class yet)'}`} /> : null}
          {o.transport?.available && o.transport?.requested ? <Tick on={f.transport} onChange={(v) => set('transport', v)} label={`Send a transport request${o.transport.address ? ` — pickup at ${o.transport.address}` : ''}`} /> : null}
          {o.hostel?.available && o.hostel?.requested ? (
            <Field label="Hostel admission" hint="The family asked for a hostel place.">
              <Pick label="Hostel" value={f.hostelId} onChange={(v) => set('hostelId', v)} options={[{ value: '', label: 'Do not create a hostel admission' }, ...unwrapList(o.hostel.hostels).map((h: any) => ({ value: String(h._id), label: h.name }))]} />
            </Field>
          ) : null}
          {o.medical?.available && o.medical?.has ? <Tick on={f.medical} onChange={(v) => set('medical', v)} label="Copy the health information to the Medical Room" /> : null}
          <Field label="Accounts">
            <Pick label="Accounts" value={f.activation} onChange={(v) => set('activation', v)} options={[{ value: 'immediate', label: 'Switch on now and send sign-in details' }, { value: 'manual', label: 'Create switched off — activate later' }]} />
          </Field>
        </>
      ) : null}
    </Sheet>
  );
}

// ── Assignment, quota, legal hold ─────────────────────────────────────────────

function Assign({ app, staff, reload }: { app: any; staff: any[]; reload: () => void }) {
  const [who, setWho] = useState(String(app.assignedTo || ''));
  const [busy, setBusy] = useState(false);
  useEffect(() => setWho(String(app.assignedTo || '')), [app.assignedTo]);
  const save = async () => {
    setBusy(true);
    try { await admin.assign(app._id, who || (null as any)); reload(); } catch (e) { say('Not saved', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Panel icon="person-add-outline" tone="indigo" title="Assigned to" subtitle="Sees it under their admission duties">
      <Pick label="Assigned to" value={who} onChange={setWho} options={[{ value: '', label: 'Nobody' }, ...staff.map((s) => ({ value: String(s._id), label: s.name, sub: s.designation || s.role }))]} />
      {who !== String(app.assignedTo || '') ? <View style={{ marginTop: 8 }}><Btn kind="primary" disabled={busy} onPress={save}>Save</Btn></View> : null}
    </Panel>
  );
}

const QUOTA_STATUS: Record<string, [string, any]> = { claimed: ['Claimed — to check', 'amber'], verified: ['Verified', 'green'], rejected: ['Not accepted', 'red'], allotted: ['Allotted by the state', 'indigo'] };

function Quota({ app, quotas, isAdmin, reload }: { app: any; quotas: any[]; isAdmin: boolean; reload: () => void }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ quota: app.quota || '', status: app.quotaStatus === 'claimed' ? 'verified' : (app.quotaStatus || 'verified'), note: '' });
  const [busy, setBusy] = useState(false);
  const def = quotas.find((q) => q.key === app.quota);
  const fee = (q: any) => (q?.feeRule?.type === 'free' ? 'no admission fee' : q?.feeRule?.type === 'percent' ? `${q.feeRule.percent}% off the admission fee` : 'the full admission fee');
  const save = async () => {
    setBusy(true);
    try { await admin.setQuota(app._id, f); setEdit(false); reload(); } catch (e) { say('Not saved', errMsg(e)); } finally { setBusy(false); }
  };
  const canEdit = isAdmin && app.quotaStatus !== 'allotted' && !['confirmed', 'enrolled'].includes(app.status);
  return (
    <Panel icon="layers-outline" tone="violet" title="Quota" subtitle={def ? `${def.name} — ${fee(def)}` : 'General seats'}
      right={canEdit ? <Btn icon="create-outline" onPress={() => setEdit(true)}>Change</Btn> : undefined}>
      {app.quota ? (
        <Facts>
          <Fact k="Quota" v={def?.name || app.quota} />
          <Fact k="Claim" v={<Pill tone={QUOTA_STATUS[app.quotaStatus]?.[1] || 'slate'}>{QUOTA_STATUS[app.quotaStatus]?.[0] || 'Placed by the office'}</Pill>} />
          {app.externalRef ? <Fact k="State reference" v={app.externalRef} /> : null}
          {app.quotaNote ? <Fact k="Note" v={app.quotaNote} /> : null}
        </Facts>
      ) : <Muted>Not in any quota — it competes for the general seats.</Muted>}
      <Sheet visible={edit} icon="layers-outline" tone="violet" title="Quota" onClose={() => setEdit(false)} busy={busy}
        footer={<><Btn block onPress={() => setEdit(false)}>Cancel</Btn><Btn block kind="primary" disabled={busy || (f.quota && f.status === 'rejected' && !f.note.trim())} onPress={save}>Save</Btn></>}>
        <Field label="Considered under">
          <Pick label="Considered under" value={f.quota} onChange={(v) => setF({ ...f, quota: v })}
            options={[{ value: '', label: 'General seats only' }, ...quotas.filter((q) => q.kind !== 'rte').map((q) => ({ value: q.key, label: q.name }))]} />
        </Field>
        {f.quota ? (
          <Field label="The claim">
            <Pick label="The claim" value={f.status} onChange={(v) => setF({ ...f, status: v })}
              options={[{ value: 'verified', label: 'Verified — eligible for these seats' }, { value: 'rejected', label: 'Not accepted' }, { value: 'claimed', label: 'Still to check' }]} />
          </Field>
        ) : null}
        <Field label={f.status === 'rejected' && f.quota ? 'Why (the family is told)' : 'Note'} required={f.status === 'rejected' && !!f.quota}>
          <Box value={f.note} onChange={(v) => setF({ ...f, note: v })} multiline maxLength={300} />
        </Field>
      </Sheet>
    </Panel>
  );
}

function Hold({ app, reload }: { app: any; reload: () => void }) {
  const [ask, setAsk] = useState(false);
  const on = !!app.legalHold?.on;
  return (
    <Panel icon="lock-closed-outline" tone="red" title="Data protection" subtitle={on ? 'On legal hold: never erased while it lasts' : 'Erased by the retention rules once no longer needed'}>
      <Btn icon={on ? 'lock-open-outline' : 'lock-closed-outline'} onPress={() => setAsk(true)}>{on ? 'Release the legal hold' : 'Put on legal hold'}</Btn>
      {ask ? (
        <AskSheet title={on ? 'Release the legal hold?' : 'Put this application on legal hold?'} message={on ? 'The retention rules apply to it again.' : 'It is kept, whatever the retention rules say, until the hold is released.'}
          label={on ? 'Why it can go' : 'Why it must be kept'} confirm={on ? 'Release' : 'Hold'} danger={!on} onClose={() => setAsk(false)}
          onConfirm={async (why) => { await admin.legalHold(app._id, !on, why); reload(); }} />
      ) : null}
    </Panel>
  );
}

// ── Branches of a group ───────────────────────────────────────────────────────

function Branches({ app, closed }: { app: any; closed: boolean }) {
  const group = useApi<any>(() => admin.myGroup(), []);
  const sib = useApi<any>(() => admin.siblings(app._id), [app._id]);
  const [moving, setMoving] = useState(false);
  const [to, setTo] = useState('');
  if (!group.data?.name) return null;
  const s = Array.isArray(sib.data?.others) ? sib.data : null;
  const branches = unwrapList(group.data.branches);
  return (
    <Panel icon="git-branch-outline" tone="slate" title={`Branches of ${group.data.name}`}>
      {s ? (s.others.length ? (
        <>
          {s.rank ? <Muted>{`The family put this branch ${s.rank} in their order of preference.`}</Muted> : null}
          {s.others.map((o: any, i: number) => <Line key={i} last={i === s.others.length - 1} title={`${o.groupRank ? `${o.groupRank}. ` : ''}${o.schoolName}`} sub={o.className} right={<Pill tone="slate">{o.statusLabel}</Pill>} />)}
        </>
      ) : <Muted>No application at the other branches.</Muted>) : <Muted>The group does not share families’ status between branches.</Muted>}
      {!closed && app.status !== 'draft' && branches.length ? <View style={{ marginTop: 8 }}><Btn icon="repeat-outline" onPress={() => { setTo(String(branches[0]?._id || '')); setMoving(true); }}>Move to another branch…</Btn></View> : null}
      {moving ? (
        <AskSheet title="Move to another branch" message="Only at the family's request. The other branch accepts or declines; if it accepts, the family checks the copied application there and submits it, and this one is withdrawn then."
          label="Why (what the family asked for)" confirm="Offer the move" onClose={() => setMoving(false)}
          onConfirm={async (why) => { await admin.offerTransfer(app._id, { toSchool: to, reason: why }); say('Offered', 'The other branch answers under Admissions → Branches.'); }}>
          <Field label="To" required><Pick label="To" value={to} onChange={setTo} options={branches.map((b: any) => ({ value: String(b._id), label: b.name }))} /></Field>
        </AskSheet>
      ) : null}
    </Panel>
  );
}

const st = StyleSheet.create({
  h: { fontSize: 13.5, fontWeight: '800', color: Colors.text, marginTop: 6, marginBottom: 8 },
});
