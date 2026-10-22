/**
 * One admission application, on the phone (Oct 2026): where it stands, what
 * the school needs now, and everything the family does with it —
 *
 *   the offer (accepted or declined here; accepting can withdraw the family's
 *   applications at the other branches of a group of schools), documents
 *   (uploaded from the phone's files or camera, or fetched from DigiLocker),
 *   exam and interview times (chosen or changed here, with a calendar entry),
 *   the published lists (with the lottery's number and a way to check the
 *   draw), appeals and re-checks, fees (instalments, paying in the in-app
 *   browser, refunds, receipts), the history, and withdrawing.
 *
 * Filling in the form and sitting an online exam stay on the school's
 * admission portal; the screen opens it at this application.
 *
 * Every answer is the server's (school-backend controllers/admissionPortal).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { portal } from '@/api/admission.api';
import { openAdmissionFile } from '@/components/admission/files';
import {
  Page, Hero, Panel, Note, Btn, Row, Tag, Muted, Sheet, Field, Box, BRAND, TINT, STATUS, defOf, useApi, fmtDateTime, errMsg, say, unwrapList, money,
} from '@/components/admission/parts';
import ConsentRequired from '@/components/admission/family/ConsentGate';
import OfferPanel from '@/components/admission/family/OfferPanel';
import ExamsPanel from '@/components/admission/family/ExamsPanel';
import FeesPanel from '@/components/admission/family/FeesPanel';
import DocumentsPanel from '@/components/admission/family/DocumentsPanel';
import AppealsPanel from '@/components/admission/family/AppealsPanel';
import ListsPanel from '@/components/admission/family/ListsPanel';

// The family's view of the road: a handful of milestones, not the office's stages (as the web tracker).
const MILESTONES: { label: string; reached: (s: string) => boolean }[] = [
  { label: 'Submitted', reached: (s) => s !== 'draft' },
  { label: 'Review', reached: (s) => !['draft', 'submitted', 'incomplete'].includes(s) },
  { label: 'Assessment', reached: (s) => ['exam_completed', 'interview_completed', 'evaluated', 'selected', 'waitlisted', 'offer_issued', 'accepted', 'payment_pending', 'confirmed', 'enrolled'].includes(s) },
  { label: 'Decision', reached: (s) => ['selected', 'waitlisted', 'offer_issued', 'accepted', 'payment_pending', 'confirmed', 'enrolled', 'rejected'].includes(s) },
  { label: 'Confirmed', reached: (s) => ['confirmed', 'enrolled'].includes(s) },
  { label: 'Enrolled', reached: (s) => s === 'enrolled' },
];
const CLOSED = ['withdrawn', 'cancelled', 'rejected', 'ineligible', 'declined'];

/** The one thing the application needs from the family now, if anything. */
function nextStep(d: any): { text: string; tone: 'amber' | 'red' | 'indigo' | 'green'; web?: boolean } | null {
  const a = d.application;
  if (a.status === 'draft') return { text: 'Finish and submit the application form on the admission portal.', tone: 'indigo', web: true };
  if (a.status === 'incomplete') return { text: 'The school needs more information — update the form on the admission portal.', tone: 'amber', web: true };
  const files = unwrapList(d.documents?.files);
  const toFix = files.filter((f) => ['rejected', 'resubmission_required'].includes(f.status));
  if (toFix.length) return { text: `${toFix.length} document${toFix.length === 1 ? '' : 's'} to upload again — below.`, tone: 'red' };
  if (d.fees?.application?.due > 0) return { text: `Application fee of ${money(d.fees.application.due)} due — see Fees below.`, tone: 'amber' };
  if (d.offer?.canRespond) return { text: 'A seat is offered — answer below.', tone: 'indigo' };
  if (d.fees?.admission?.due > 0 && ['accepted', 'payment_pending', 'confirmed', 'enrolled'].includes(a.status)) return { text: `Admission fee of ${money(d.fees.admission.due)} due — see Fees below.`, tone: 'amber' };
  if (unwrapList(d.exams).some((x) => x.needsTime && x.booking?.canChoose)) return { text: 'Choose your exam or interview time — below.', tone: 'indigo' };
  if (a.status === 'enrolled') return { text: `Enrolled${a.admissionNumber ? ` — admission number ${a.admissionNumber}` : ''}.`, tone: 'green' };
  return null;
}

function ApplicantApplicationScreenBody() {
  const { id, digilocker } = useLocalSearchParams<{ id: string; digilocker?: string }>();
  const { data: d, loading, error, reload } = useApi<any>(() => portal.detail(String(id)), [id]);
  const me = useApi<any>(() => portal.me(), []);
  const [withdrawing, setWithdrawing] = useState(false);
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const portalUrl: string = me.data?.portal?.url || '';
  const slug: string = me.data?.portal?.slug || '';
  const origin = portalUrl && slug && portalUrl.endsWith(`/${slug}`) ? portalUrl.slice(0, -(slug.length + 1)) : '';
  const openPortal = () => { if (portalUrl) Linking.openURL(`${portalUrl}/applications/${id}`).catch(() => {}); };

  const a = d?.application;
  const step = d ? nextStep(d) : null;
  const closed = a ? CLOSED.includes(a.status) : false;
  const tone = a ? defOf(STATUS, a.status).tone : 'indigo';
  const reached = a ? MILESTONES.filter((m) => m.reached(a.status)).length : 0;

  const withdraw = async () => {
    setBusy(true);
    try { await portal.withdraw(String(id), why.trim()); setWithdrawing(false); setWhy(''); say('Application withdrawn', 'The school has been told.'); reload(); }
    catch (e) { say('Not withdrawn', errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Page title={a?.studentName || 'Application'} loading={loading && !d} error={!d ? error : ''} onRetry={reload} onRefresh={reload}>
      {d && a ? (
        <>
          {digilocker === 'connected' ? <Note tone="green" icon="shield-checkmark-outline">DigiLocker is connected — choose the documents to use below.</Note>
            : digilocker === 'failed' ? <Note tone="red" icon="alert-circle-outline">DigiLocker could not be connected — try again.</Note> : null}
          <Hero tone={tone} eyebrow={[d.className, d.round?.name, d.yearName].filter(Boolean).join(' · ')} title={a.statusText || defOf(STATUS, a.status).label}
            sub={a.applicationNumber ? `Application ${a.applicationNumber}` : 'Not submitted yet'} right={<Tag value={a.status} />}>
            {!closed ? (
              <View>
                <View style={st.bar} accessibilityLabel={`Step ${Math.min(reached + 1, MILESTONES.length)} of ${MILESTONES.length}`}>
                  {MILESTONES.map((m, i) => <View key={m.label} style={[st.seg, { backgroundColor: i < reached ? TINT[tone].fg : i === reached ? TINT[tone].soft : '#E2E8F0' }]} />)}
                </View>
                <Text style={st.barText}>{reached >= MILESTONES.length ? 'All steps done' : `Next: ${MILESTONES[reached].label}`}</Text>
              </View>
            ) : a.reason ? <Text style={st.reason}>{a.reason}</Text> : null}
            {a.quota ? (
              <Text style={st.reason}>
                {a.quota.status === 'allotted' ? `Allotted a seat under the RTE Act by the state${a.quota.externalRef ? ` (reference ${a.quota.externalRef})` : ''}.`
                  : a.quota.status === 'verified' ? `Considered under the ${a.quota.name} quota.`
                    : a.quota.status === 'rejected' ? `The ${a.quota.name} quota claim was not accepted${a.quota.note ? ` — ${a.quota.note}` : ''}. The application is considered for the general seats.`
                      : `Applied under the ${a.quota.name} quota — the school will check it.`}
              </Text>
            ) : null}
            {a.admissionNumber ? <Text style={[st.reason, { color: Colors.text, fontWeight: '700' }]}>{`Enrolled with admission number ${a.admissionNumber}.${a.signInNote ? ` ${a.signInNote}` : ''}`}</Text> : null}
          </Hero>

          {step ? (
            <Note tone={step.tone} icon={step.tone === 'green' ? 'checkmark-circle-outline' : 'flag-outline'} title="What is needed now">
              <Text style={st.stepText}>{step.text}</Text>
              {step.web ? <TouchableOpacity onPress={openPortal} accessibilityRole="link"><Text style={st.link}>Open the admission portal</Text></TouchableOpacity> : null}
            </Note>
          ) : null}

          <OfferPanel appId={String(id)} offer={d.offer} onChanged={reload} />
          <DocumentsPanel appId={String(id)} documents={d.documents} status={a.status} onChanged={reload} />
          <ExamsPanel appId={String(id)} exams={unwrapList(d.exams)} onChanged={reload} openPortal={openPortal} />
          <ListsPanel appId={String(id)} origin={origin} />
          <AppealsPanel appId={String(id)} onChanged={reload} />
          <FeesPanel appId={String(id)} status={a.status} fees={d.fees} onChanged={reload} />

          {unwrapList(d.timeline).length ? (
            <Panel icon="time-outline" tone="slate" title="History">
              {unwrapList(d.timeline).slice(0, 25).map((t) => (
                <View key={t._id} style={st.tl}>
                  <Ionicons name="ellipse" size={7} color={Colors.textLight} style={{ marginTop: 6 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.tlText}>{t.message}</Text>
                    <Muted>{fmtDateTime(t.createdAt)}</Muted>
                  </View>
                </View>
              ))}
            </Panel>
          ) : null}

          <Row>
            {a.applicationNumber ? <Btn icon="document-outline" onPress={() => openAdmissionFile(portal.ackUrl(String(id)), `acknowledgement-${a.applicationNumber}.pdf`).catch((e) => say('Could not open it', errMsg(e)))}>Acknowledgement</Btn> : null}
            <Btn icon="open-outline" onPress={openPortal}>The form, on the portal</Btn>
            {d.canWithdraw ? <Btn kind="danger" icon="close-circle-outline" onPress={() => setWithdrawing(true)}>Withdraw</Btn> : null}
          </Row>

          <Sheet visible={withdrawing} icon="close-circle-outline" tone="red" title="Withdraw the application?" busy={busy} onClose={() => setWithdrawing(false)}
            subtitle="It closes, and any seat it holds goes to the next applicant. This cannot be undone here."
            footer={<><Btn block onPress={() => setWithdrawing(false)}>Keep it</Btn><Btn block kind="stop" disabled={busy || !why.trim()} onPress={withdraw}>Withdraw</Btn></>}>
            <Field label="Why are you withdrawing? (the school is told)" required>
              <Box value={why} onChange={setWhy} multiline maxLength={300} />
            </Field>
          </Sheet>
        </>
      ) : null}
    </Page>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', gap: 4, marginTop: 4 },
  seg: { flex: 1, height: 6, borderRadius: 3 },
  barText: { fontSize: 11.5, fontWeight: '700', color: Colors.textSecondary, marginTop: 6 },
  reason: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
  stepText: { fontSize: 12.5, color: Colors.text, lineHeight: 18 },
  link: { fontSize: 12.5, fontWeight: '700', color: BRAND, marginTop: 6 },
  tl: { flexDirection: 'row', gap: 9, paddingVertical: 5 },
  tlText: { fontSize: 12.5, color: Colors.text, lineHeight: 18 },
});

export default function ApplicantApplicationScreen() {
  return <ConsentRequired><ApplicantApplicationScreenBody /></ConsentRequired>;
}
