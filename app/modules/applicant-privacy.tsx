/**
 * "Your data", for an applicant family on the phone (Oct 2026) — what the
 * school holds about them for admissions and what they can ask for (India's
 * DPDP Act): a copy of everything (a file the server builds), and requests to
 * correct or erase it, withdraw consent, or raise a grievance — with the
 * school's answers. The answer time is the school's, at most what the rules
 * allow (school-backend services/admission/privacy.js).
 */
import React, { useState } from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import { TextInput } from '@/components/ui/TextInput';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/theme';
import { portal } from '@/api/admission.api';
import { openAdmissionFile } from '@/components/admission/files';
import {
  Page, Head, Panel, Note, Btn, Row, Tag, Muted, Sheet, Field, Box, Pick, Line, REQUEST_STATUS, useApi, fmtDate, fmtDateTime, errMsg, say, unwrapList,
} from '@/components/admission/parts';

const HINT: Record<string, string> = {
  access: 'You can also download everything right away with the button above.',
  correction: 'Say what is wrong and what it should be.',
  erasure: 'Your applications are withdrawn and erased. An admitted student\'s record and payment amounts are kept, as the law requires.',
  withdraw_consent: 'Your open applications are withdrawn at once, and the school stops using your information except where the law requires it to be kept.',
  grievance: 'Tell the school what went wrong. If you are not satisfied with its answer, you may take it to the Data Protection Board of India.',
};

export default function ApplicantPrivacyScreen() {
  const { data, loading, error, reload } = useApi<any>(() => portal.privacy(), []);
  const me = useApi<any>(() => portal.me(), []);
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState(false);
  const download = () => openAdmissionFile(portal.privacyExportUrl(), `my-admission-data-${new Date().toISOString().slice(0, 10)}.json`).catch((e) => say('Could not download it', errMsg(e)));
  const requests = unwrapList(data?.requests);

  return (
    <Page title="Your data" loading={loading && !data} error={!data ? error : ''} onRetry={reload} onRefresh={reload}>
      {data ? (
        <>
          <Head title="Your data" subtitle={`What ${me.data?.portal?.schoolName || 'the school'} holds about you for admissions, and what you can ask for.`} />
          <Panel icon="folder-open-outline" tone="indigo" title="Your information"
            subtitle={`You agreed to version ${data.consent?.agreedVersion || '—'} of the privacy notice${data.consent?.agreedAt ? ` on ${fmtDate(data.consent.agreedAt)}` : ''}.`}>
            <Row>
              <Btn kind="primary" icon="download-outline" onPress={download}>Download a copy of everything</Btn>
              <Btn icon="send-outline" onPress={() => setAsking(true)}>Ask the school…</Btn>
            </Row>
            <Muted>{`The school answers within ${data.requestDays} days. Each document can be opened from its application.`}</Muted>
          </Panel>
          <AccountPanel />
          <Panel icon="list-outline" tone="slate" title="Your requests">
            {requests.length ? requests.map((r, i) => (
              <Line key={r._id} last={i === requests.length - 1} title={`${r.number} · ${r.kindLabel}`}
                sub={r.response ? `${fmtDateTime(r.createdAt)}\nAnswer: ${r.response}` : `${fmtDateTime(r.createdAt)} · answered by ${fmtDate(r.dueAt)}`}
                right={<Tag map={REQUEST_STATUS} value={r.status} />} />
            )) : <Muted>You have not asked for anything yet.</Muted>}
          </Panel>
          <Panel icon="shield-checkmark-outline" tone="teal" title="The privacy notice" subtitle={`Version ${data.consent?.currentVersion || 1}`}
            right={<Btn onPress={() => setNotice(!notice)}>{notice ? 'Hide' : 'Read'}</Btn>}>
            {notice ? (
              <ScrollView style={{ maxHeight: 420 }} nestedScrollEnabled>
                <Text style={{ fontSize: 13, color: Colors.text, lineHeight: 19 }}>{data.consent?.notice}</Text>
              </ScrollView>
            ) : <Muted>How the school uses what you give it, who sees it and how long it is kept.</Muted>}
          </Panel>
          {asking ? <AskSheet kinds={unwrapList(data.kinds)} onClose={() => setAsking(false)} onDone={() => { setAsking(false); reload(); }} /> : null}
        </>
      ) : null}
    </Page>
  );
}

function AskSheet({ kinds, onClose, onDone }: { kinds: any[]; onClose: () => void; onDone: () => void }) {
  const apps = useApi<any[]>(() => portal.list(), []);
  const [kind, setKind] = useState('');
  const [details, setDetails] = useState('');
  const [application, setApplication] = useState('');
  const [busy, setBusy] = useState(false);
  const strong = ['erasure', 'withdraw_consent'].includes(kind);
  const needsText = ['correction', 'grievance'].includes(kind);
  const list = unwrapList(apps.data);
  const go = async () => {
    setBusy(true);
    try {
      const r: any = await portal.privacyRequest({ kind, details: details.trim(), application: application || undefined });
      say('Sent', `Your request number is ${r?.data?.number}.`);
      onDone();
    } catch (e) { say('Not sent', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible icon="send-outline" tone="indigo" title="Ask the school about your information" onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind={strong ? 'stop' : 'primary'} disabled={busy || !kind || (needsText && !details.trim())} onPress={go}>{strong ? 'Send — I understand' : 'Send'}</Btn></>}>
      <Field label="What are you asking for" required>
        <Pick label="What are you asking for" value={kind} placeholder="Choose…" onChange={setKind} options={kinds.map((k) => ({ value: k.key, label: k.label }))} />
      </Field>
      {kind ? <Note tone={strong ? 'amber' : 'indigo'} icon={strong ? 'alert-circle-outline' : 'information-circle-outline'}>{HINT[kind]}</Note> : null}
      {list.length > 1 ? (
        <Field label="About which application" hint="Leave as it is for all of them">
          <Pick label="About which application" value={application} onChange={setApplication}
            options={[{ value: '', label: 'All my applications' }, ...list.map((a) => ({ value: String(a._id), label: `${a.studentName || 'Draft'}${a.applicationNumber ? ` — ${a.applicationNumber}` : ''}` }))]} />
        </Field>
      ) : null}
      <Field label="Your message" required={needsText}>
        <Box value={details} onChange={setDetails} multiline maxLength={2000} />
      </Field>
    </Sheet>
  );
}

/**
 * The applicant's own name, mobile and password (Nov 2026 — none of them could
 * be changed while signed in). The email is the sign-in and stays.
 */
function AccountPanel() {
  const { user, reload } = useAuth() as any;
  const [f, setF] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [pw, setPw] = useState({ currentPassword: '', password: '', confirm: '' });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const changed = f.name.trim() !== (user?.name || '') || f.phone !== (user?.phone || '');
  const save = async () => {
    setBusy('profile');
    try { await portal.updateProfile({ name: f.name.trim(), phone: f.phone }); await reload?.(); say('Saved', 'Your details are updated.'); }
    catch (e) { say('Not saved', errMsg(e)); } finally { setBusy(''); }
  };
  const change = async () => {
    setBusy('password');
    try { await portal.changePassword({ currentPassword: pw.currentPassword, password: pw.password }); setPw({ currentPassword: '', password: '', confirm: '' }); setOpen(false); say('Password changed', 'Use the new password from now on.'); }
    catch (e) { say('Not changed', errMsg(e)); } finally { setBusy(''); }
  };
  const secret = (value: string, onChange: (v: string) => void, label: string) => (
    <TextInput style={pwSt.box} value={value} onChangeText={onChange} secureTextEntry autoCapitalize="none" autoCorrect={false} text="off" accessibilityLabel={label} />
  );
  return (
    <Panel icon="person-circle-outline" tone="indigo" title="Your account" subtitle={`You sign in with ${user?.email || 'your email'}.`}>
      <Field label="Your name" required><Box value={f.name} onChange={(v) => setF({ ...f, name: v })} maxLength={100} text="name" /></Field>
      <Field label="Mobile"><Box value={f.phone} onChange={(v) => setF({ ...f, phone: v })} phone /></Field>
      <Row>
        <Btn kind="primary" disabled={!changed || f.name.trim().length < 2 || !!busy} onPress={save}>{busy === 'profile' ? 'Saving…' : 'Save'}</Btn>
        <Btn icon="key-outline" onPress={() => setOpen(true)}>Change password</Btn>
      </Row>
      <Sheet visible={open} icon="key-outline" tone="indigo" title="Change your password" busy={busy === 'password'} onClose={() => setOpen(false)}
        subtitle="This is your email's password: if the same email signs in elsewhere in Aksharum, it changes there too."
        footer={<><Btn block onPress={() => setOpen(false)}>Cancel</Btn><Btn block kind="primary" disabled={!!busy || !pw.currentPassword || pw.password.length < 8 || pw.password !== pw.confirm} onPress={change}>Change</Btn></>}>
        <Field label="Present password" required>{secret(pw.currentPassword, (v) => setPw({ ...pw, currentPassword: v }), 'Present password')}</Field>
        <Field label="New password" required hint="At least 8 characters, with a letter and a number">{secret(pw.password, (v) => setPw({ ...pw, password: v }), 'New password')}</Field>
        <Field label="New password again" required error={pw.confirm && pw.confirm !== pw.password ? 'The two do not match' : undefined}>{secret(pw.confirm, (v) => setPw({ ...pw, confirm: v }), 'New password again')}</Field>
      </Sheet>
    </Panel>
  );
}

const pwSt = StyleSheet.create({
  box: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.border, borderRadius: 10, fontSize: 13.5, color: Colors.text },
});
