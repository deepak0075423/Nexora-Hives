/**
 * Admission settings on the phone (Oct 2026) — the switches an office changes
 * on the move: the portal open, closed or in maintenance; how applications
 * behave; DigiLocker; the "not a robot" check; and the RTE Act's bar on
 * screening (switching it off is recorded with the admin's name). Visits,
 * appeals and the retention rules are set on their own screens.
 *
 * Each block is sent whole, as the web sends it, and checked by the server
 * (school-backend services/admission/settings.js) — the server's answer is
 * what is saved. The portal's look, the workflow, numbering, fees, enrolment,
 * emails and the form are set on the web.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '@/constants/theme';
import { admin } from '@/api/admission.api';
import { useOffice, forgetOffice, Blocked, BLOCKED } from '@/components/admission/office/office';
import { Page, Panel, Btn, Row, Note, Field, Box, Pick, Tick, BRAND, errMsg, say, unwrapList } from '@/components/admission/parts';

const EXEMPT: Record<string, string> = { minority: 'A recognised minority institution', not_applicable: 'The school has no elementary classes', other: 'Another reason (say which)' };
const clone = (x: any) => JSON.parse(JSON.stringify(x ?? {}));

export default function AdmissionSettingsScreen() {
  const { adm, error, errorCode, reload } = useOffice();
  if (BLOCKED.includes(errorCode)) return <Page title="Settings"><Blocked message={error} /></Page>;
  const saved = () => { forgetOffice(); reload(); };
  const s = adm?.settings;
  return (
    <Page title="Admission settings" loading={!adm && !error} error={!adm ? error : ''} onRetry={reload} onRefresh={reload}>
      {s ? (
        <>
          <Block key={`p-${JSON.stringify(s.portal?.status)}`} name="portal" initial={s.portal} onSaved={saved} render={(v, set) => <PortalBlock v={v} set={set} />} title="Open or closed" icon="power-outline" />
          <Block key={`a-${JSON.stringify(s.applications)}`} name="applications" initial={s.applications} onSaved={saved} render={(v, set) => <ApplicationsBlock v={v} set={set} />} title="Applications" icon="documents-outline" />
          <Block key={`d-${JSON.stringify(s.digilocker)}`} name="digilocker" initial={s.digilocker} onSaved={saved} render={(v, set) => <DigilockerBlock v={v} set={set} />} title="DigiLocker" icon="shield-checkmark-outline"
            subtitle="Families fetch documents issued to them straight from the issuer — where the platform is a DigiLocker partner" />
          <Block key={`s-${JSON.stringify(s.security)}`} name="security" initial={s.security} onSaved={saved} render={(v, set) => (
            <Tick on={v.captcha !== false} onChange={(x) => set({ captcha: x })} label="Ask for the “not a robot” check on this school's portal — on creating an account, resetting a password and sending an enquiry, when the platform has a check set up" />
          )} title="“Not a robot” check" icon="hand-left-outline" />
          <Block key={`c-${JSON.stringify(s.compliance)}`} name="compliance" initial={s.compliance} onSaved={saved} render={(v, set) => <ComplianceBlock v={v} set={set} adm={adm} />} title="Choosing between applicants — the RTE Act" icon="ribbon-outline"
            subtitle="Section 13 of the RTE Act, 2009 bars any screening when admitting a child to elementary education; only a random choice is allowed" />
          <Note tone="slate" icon="desktop-outline">Campus visits, appeals and how long data is kept are set on their own screens. The portal’s look, the workflow, numbering, fees, enrolment, emails and the application form are set on the web.</Note>
        </>
      ) : null}
    </Page>
  );
}

/** One settings block: edited here, saved whole. */
function Block({ name, initial, render, title, subtitle, icon, onSaved }: {
  name: string; initial: any; render: (v: any, set: (patch: any) => void) => React.ReactNode; title: string; subtitle?: string; icon: any; onSaved: () => void;
}) {
  const [v, setV] = useState<any>(() => clone(initial));
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial ?? {});
  const set = (patch: any) => setV((x: any) => ({ ...x, ...patch }));
  const save = async () => {
    setBusy(true);
    try { await admin.saveSettings({ [name]: v }); say('Saved'); onSaved(); } catch (e) { say('Not saved', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Panel icon={icon} tone="slate" title={title} subtitle={subtitle}>
      {render(v, set)}
      {dirty ? <Row><Btn onPress={() => setV(clone(initial))}>Undo</Btn><Btn kind="primary" disabled={busy} onPress={save}>Save</Btn></Row> : null}
    </Panel>
  );
}

function PortalBlock({ v, set }: { v: any; set: (p: any) => void }) {
  const opts: [string, string, string][] = [['open', 'Open', 'Families can register, apply and pay'], ['closed', 'Closed', 'Families sign in and follow their applications; nobody new can apply'], ['maintenance', 'Maintenance', 'Signed-in families see a notice; nothing can be submitted']];
  return (
    <>
      {opts.map(([k, l, sub]) => (
        <TouchableOpacity key={k} onPress={() => set({ status: k })} style={[st.choice, v.status === k && st.choiceOn]} accessibilityRole="radio" accessibilityState={{ checked: v.status === k }}>
          <Text style={[st.choiceTitle, v.status === k && { color: '#fff' }]}>{l}</Text>
          <Text style={[st.choiceSub, v.status === k && { color: 'rgba(255,255,255,0.85)' }]}>{sub}</Text>
        </TouchableOpacity>
      ))}
      {v.status === 'closed' ? <Field label="Message while closed"><Box value={v.closedMessage || ''} onChange={(x) => set({ closedMessage: x })} multiline maxLength={500} /></Field> : null}
      {v.status === 'maintenance' ? <Field label="Message during maintenance"><Box value={v.maintenanceMessage || ''} onChange={(x) => set({ maintenanceMessage: x })} multiline maxLength={500} /></Field> : null}
    </>
  );
}

function ApplicationsBlock({ v, set }: { v: any; set: (p: any) => void }) {
  return (
    <>
      <Field label="Applications per family in a round" hint="A round can set its own"><Box value={String(v.maxPerApplicant ?? '')} onChange={(x) => set({ maxPerApplicant: Number(x) || 1 })} text="digits" keyboardType="number-pad" /></Field>
      <Field label="Application fee is paid">
        <Pick label="Application fee is paid" value={v.applicationFeeTiming} onChange={(x) => set({ applicationFeeTiming: x })} options={[{ value: 'before_submit', label: 'Before the application can be submitted' }, { value: 'after_submit', label: 'After submitting' }]} />
      </Field>
      <Tick on={!!v.requireDocumentsAtSubmit} onChange={(x) => set({ requireDocumentsAtSubmit: x })} label="Required documents must be uploaded to submit" />
      <Tick on={!!v.duplicateCheck} onChange={(x) => set({ duplicateCheck: x })} label="Warn about possible duplicates (same student and date of birth, or the same contact, this year)" />
      <Tick on={!!v.allowWithdraw} onChange={(x) => set({ allowWithdraw: x })} label="Families can withdraw an application" />
      <Tick on={!!v.allowReapplyAfterRejection} onChange={(x) => set({ allowReapplyAfterRejection: x })} label="A family may apply again after a rejection" />
    </>
  );
}

function DigilockerBlock({ v, set }: { v: any; set: (p: any) => void }) {
  return (
    <>
      <Tick on={v.enabled !== false} onChange={(x) => set({ enabled: x })} label="Offer “Fetch from DigiLocker” on applications (the portal and the app)" />
      <Tick on={!!v.autoVerify} onChange={(x) => set({ autoVerify: x })} label="Count documents fetched from DigiLocker as verified — they come signed by the issuer. Off: the office checks them like any upload, with the issuer shown" />
    </>
  );
}

function ComplianceBlock({ v, set, adm }: { v: any; set: (p: any) => void; adm: any }) {
  const rte = v.rte || {};
  const setR = (patch: any) => set({ rte: { ...rte, ...patch } });
  const nums: number[] = unwrapList(rte.classNumbers);
  const covered = unwrapList(adm?.classes).filter((c: any) => adm?.screening?.[c._id]?.banned);
  return (
    <>
      <Tick on={!!rte.enabled} onChange={(x) => setR({ enabled: x })} label="Keep to the rule — for the classes below: no entrance test, no interview and no merit list; families are chosen by a lottery list" />
      {rte.enabled ? (
        <>
          <Field label="Classes it covers, by class number">
            <View style={st.nums}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => {
                const on = nums.includes(n);
                return (
                  <TouchableOpacity key={n} onPress={() => setR({ classNumbers: on ? nums.filter((x) => x !== n) : [...nums, n].sort((a, b) => a - b) })} style={[st.num, on && st.numOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                    <Text style={[st.numText, on && { color: '#fff' }]}>{`Class ${n}`}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Field>
          <Tick on={!!rte.prePrimary} onChange={(x) => setR({ prePrimary: x })} label="Pre-primary classes too (Nursery, LKG, UKG, KG, Balvatika) — where the state's rules extend the bar to them" />
          <Note tone={covered.length ? 'indigo' : 'slate'}>{covered.length ? `As saved, it covers ${covered.map((c: any) => c.className).join(', ')}.` : "As saved, it covers none of the school's classes."}</Note>
        </>
      ) : (
        <>
          <Field label="Why it does not apply" required><Pick label="Why it does not apply" value={rte.exemptReason || ''} placeholder="Choose…" onChange={(x) => setR({ exemptReason: x })} options={Object.entries(EXEMPT).map(([k, l]) => ({ value: k, label: l }))} /></Field>
          <Field label="Note" required hint="The order, letter or reason — kept with the change"><Box value={rte.exemptNote || ''} onChange={(x) => setR({ exemptNote: x })} multiline maxLength={500} /></Field>
          <Note tone="amber" icon="alert-circle-outline">Switching the rule off is recorded with your name. Do it only on advice — the fine for screening is up to ₹25,000, and ₹50,000 for each time after.</Note>
        </>
      )}
    </>
  );
}

const st = StyleSheet.create({
  choice: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 8, backgroundColor: '#fff' },
  choiceOn: { backgroundColor: BRAND, borderColor: BRAND },
  choiceTitle: { fontSize: 14, fontWeight: '800', color: Colors.text },
  choiceSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  nums: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  num: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#fff' },
  numOn: { backgroundColor: BRAND, borderColor: BRAND },
  numText: { fontSize: 12.5, fontWeight: '700', color: Colors.text },
});
