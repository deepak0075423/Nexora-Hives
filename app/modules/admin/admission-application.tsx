/**
 * One application, for the admission office on the phone (Oct 2026): where it
 * stands (the school's own workflow stages), a move waiting for approval,
 * possible duplicates, and the application's parts — overview (next step,
 * applicant, assignment, quota, legal hold, branches, checks), the answers,
 * documents, exams and lists, the offer, fees, and the history.
 *
 * Every move is the server's to allow (school-backend services/admission/
 * applications.js and workflow.js); this screen asks and shows the answer.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { admin } from '@/api/admission.api';
import { openAdmissionFile } from '@/components/admission/files';
import { useOffice, MoveSheet, AskSheet, Blocked, BLOCKED } from '@/components/admission/office/office';
import Overview from '@/components/admission/office/app/Overview';
import Fees from '@/components/admission/office/app/Fees';
import { Answers, Documents, Assessment, Offer, History } from '@/components/admission/office/app/Parts';
import {
  Page, Hero, Tabs, Tag, Btn, Row, Note, TINT, STATUS, defOf, useApi, fmtDate, fmtDateTime, errMsg, say, unwrapList,
} from '@/components/admission/parts';

export default function AdmissionApplicationOffice() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { adm, statusOf } = useOffice();
  const { data: d, loading, error, errorCode, reload } = useApi<any>(() => admin.application(String(id)), [id]);
  const [tab, setTab] = useState('overview');
  const [moving, setMoving] = useState(false);
  const [deciding, setDeciding] = useState<'' | 'approve' | 'decline'>('');
  if (!d && BLOCKED.includes(errorCode)) return <Page title="Application"><Blocked message={error} /></Page>;
  const app = d?.application;
  const closed = app ? !!statusOf(app.status)?.closed : false;
  const pending = d?.workflow?.pending;
  const stages = unwrapList(d?.workflow?.stages);
  const at = app ? stages.findIndex((s) => s.key === app.stage) : -1;
  const tone = app ? defOf(STATUS, app.status).tone : 'indigo';
  const staff = unwrapList(adm?.staff);

  return (
    <Page title={app?.studentName || 'Application'} loading={loading && !d} error={!d ? error : ''} onRetry={reload} onRefresh={reload}>
      {d && app ? (
        <>
          <Hero tone={tone} eyebrow={app.applicationNumber ? `Application ${app.applicationNumber}` : 'Draft application'} title={app.studentName || 'Student not named yet'}
            sub={[app.className, app.yearName, app.roundName].filter(Boolean).join(' · ')} right={<Tag value={app.status} />}>
            {stages.length ? (
              <View>
                <View style={st.bar}>
                  {stages.map((s, i) => <View key={s.key} style={[st.seg, { backgroundColor: app.status === 'enrolled' || i < at ? TINT[tone].fg : i === at ? TINT[tone].soft : '#E2E8F0' }]} />)}
                </View>
                <Text style={st.stage}>{at >= 0 ? `Stage ${at + 1} of ${stages.length}: ${stages[at].label}` : ''}</Text>
              </View>
            ) : null}
            <Row>
              <Btn kind="primary" icon="repeat-outline" disabled={app.status === 'draft' || app.status === 'enrolled'} onPress={() => setMoving(true)}>Change status</Btn>
              {app.applicationNumber ? <Btn icon="document-outline" onPress={() => openAdmissionFile(admin.applicationPdfUrl(app._id), `application-${app.applicationNumber}.pdf`).catch((e) => say('Could not open it', errMsg(e)))}>PDF</Btn> : null}
            </Row>
          </Hero>

          {pending ? (
            <Note tone="amber" icon="shield-checkmark-outline" title="Waiting for approval">
              <Text style={st.note}>{`${pending.byName || 'A colleague'} asked to move this application to ${statusOf(pending.to).label} on ${fmtDateTime(pending.at)}.${pending.note ? ` Note: “${pending.note}”.` : ''}${pending.remarks ? ` Message to the family: “${pending.remarks}”.` : ''}`}</Text>
              {d.permissions?.isAdmin ? <Row><Btn kind="primary" onPress={() => setDeciding('approve')}>Approve</Btn><Btn onPress={() => setDeciding('decline')}>Decline</Btn></Row> : null}
            </Note>
          ) : null}
          {unwrapList(d.duplicates).length ? (
            <Note tone="red" icon="copy-outline" title="Possible duplicate">
              {unwrapList(d.duplicates).map((x) => (
                <Text key={x._id} style={st.link} onPress={() => router.push({ pathname: '/modules/admin/admission-application' as any, params: { id: x._id } })}>{`${x.applicationNumber || 'Draft'} — ${x.studentName} (${String(x.status).replace(/_/g, ' ')})`}</Text>
              ))}
              <Row><Btn onPress={async () => { try { await admin.clearDuplicate(app._id); reload(); } catch (e) { say('Not saved', errMsg(e)); } }}>Not a duplicate</Btn></Row>
            </Note>
          ) : null}
          {closed && app.closedReason ? <Note tone="slate">{`Closed — ${app.closedReason}`}</Note> : null}
          {app.erasedAt ? <Note tone="slate" icon="trash-outline">{`The family's personal data was erased on ${fmtDateTime(app.erasedAt)} (${app.erasureReason || 'retention'}). Numbers, dates and the outcome are kept.`}</Note> : null}
          {app.legalHold?.on ? <Note tone="amber" icon="lock-closed-outline">{`On legal hold since ${fmtDate(app.legalHold.at)}${app.legalHold.byName ? ` (${app.legalHold.byName})` : ''} — ${app.legalHold.reason}.`}</Note> : null}

          <Tabs value={tab} onChange={setTab} items={[
            { key: 'overview', label: 'Overview' }, { key: 'answers', label: 'Application' },
            { key: 'documents', label: 'Documents', count: d.documents?.summary?.underReview || undefined },
            { key: 'assessment', label: 'Exams & lists' }, { key: 'offer', label: 'Offer' }, { key: 'fees', label: 'Fees' }, { key: 'history', label: 'History' },
          ]} />
          <View style={{ height: 12 }} />
          {tab === 'overview' ? <Overview d={{ ...d, closed }} staff={staff} reload={reload} /> : null}
          {tab === 'answers' ? <Answers d={d} /> : null}
          {tab === 'documents' ? <Documents d={d} reload={reload} /> : null}
          {tab === 'assessment' ? <Assessment d={d} /> : null}
          {tab === 'offer' ? <Offer d={d} reload={reload} /> : null}
          {tab === 'fees' ? <Fees d={d} closed={app.status !== 'enrolled' && closed} reload={reload} /> : null}
          {tab === 'history' ? <History d={d} reload={reload} /> : null}

          {moving ? <MoveSheet app={app} moves={unwrapList(d.workflow?.moves)} canReopen={!!d.permissions?.isAdmin} closed={closed} onClose={() => setMoving(false)} onDone={reload} /> : null}
          {deciding === 'approve' ? (
            <AskSheet title={`Approve the move to ${pending ? statusOf(pending.to).label : ''}?`} message="The application moves now and the family is told." label="Note" required={false} confirm="Approve"
              onClose={() => setDeciding('')} onConfirm={async (note) => { await admin.approval(app._id, true, note); reload(); }} />
          ) : null}
          {deciding === 'decline' ? (
            <AskSheet title="Decline this request?" message="The application stays where it is; the request is closed." label="Why not" confirm="Decline" danger
              onClose={() => setDeciding('')} onConfirm={async (note) => { await admin.approval(app._id, false, note); reload(); }} />
          ) : null}
        </>
      ) : null}
    </Page>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', gap: 3, marginTop: 2 },
  seg: { flex: 1, height: 5, borderRadius: 3 },
  stage: { fontSize: 11.5, fontWeight: '700', color: Colors.textSecondary, marginTop: 5 },
  note: { fontSize: 12, color: Colors.text, lineHeight: 17, marginBottom: 6 },
  link: { fontSize: 12.5, fontWeight: '600', color: '#4F46E5', paddingVertical: 3 },
});
