/**
 * The admission office on the phone (Oct 2026) — for a school admin, or a
 * teacher whose designation makes them the module's administrator.
 *
 * The day's numbers (every figure the server's own count — /admin/analytics),
 * the way into each part of the office, the admission funnel, seats held, and
 * how the module is running (its background jobs, email, optional services).
 *
 * Setting up admissions — the form builder, email wording, document types,
 * rounds and exams with their questions — is done on the web; the rest of the
 * office's daily work is here.
 */
import React from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { admin } from '@/api/admission.api';
import { useOffice, Blocked, Bar, BLOCKED } from '@/components/admission/office/office';
import {
  Page, Head, Tiles, Tile, Panel, Line, Note, Btn, Row, Pill, Muted, useApi, money, fmtDateTime, unwrapList,
} from '@/components/admission/parts';

const n = (v: any) => (v == null ? '—' : Number(v).toLocaleString('en-IN'));

export default function AdmissionOfficeScreen() {
  const router = useRouter();
  const { adm, error, errorCode, reload } = useOffice();
  const stats = useApi<any>(() => admin.analytics(), []);
  const health = useApi<any>(() => admin.health(), []);
  const go = (path: string, params?: Record<string, string>) => router.push({ pathname: `/modules/admin/${path}` as any, params });
  const refresh = async () => { await Promise.all([reload(), stats.reload(), health.reload()]); };

  if (BLOCKED.includes(errorCode)) return <Page title="Admissions"><Blocked message={error} /></Page>;
  const k = stats.data?.kpis || {};
  const status = adm?.settings?.portal?.status;
  const funnel = unwrapList(stats.data?.funnel);
  const funnelMax = Math.max(1, ...funnel.map((f) => Number(f.n) || 0));
  const seats = unwrapList(stats.data?.seats);
  const backlog = stats.data?.docBacklog || {};
  const waiting = Number(backlog.fresh || 0) + Number(backlog.week || 0) + Number(backlog.old || 0);

  return (
    <Page title="Admissions" loading={!adm && !error} error={!adm ? error : ''} onRetry={reload} onRefresh={refresh}>
      {adm ? (
        <>
          <Head title="Admission office" subtitle={adm.portalUrl ? `The portal is ${status}.` : 'The admission portal has no address yet — set it on the web.'}
            right={adm.portalUrl ? <Btn icon="open-outline" onPress={() => Linking.openURL(adm.portalUrl).catch(() => {})}>Portal</Btn> : undefined} />
          {adm.catalogs?.mailDriver === 'log' ? <Note tone="amber" icon="mail-outline">Admission emails are being recorded, not sent (the server’s mail is in test mode).</Note> : null}

          <Tiles>
            <Tile icon="documents-outline" tone="indigo" label="Applications" value={n(k.total)} caption={`${n(k.drafts)} drafts`} onPress={() => go('admission-applications')} />
            <Tile icon="shield-checkmark-outline" tone="amber" label="Under verification" value={n(k.underVerification)} caption={`${n(k.incomplete)} incomplete`} onPress={() => go('admission-applications', { status: 'submitted,under_review,documents_pending,documents_rejected' })} />
            <Tile icon="mail-unread-outline" tone="teal" label="Offers open" value={n(k.offersOpen)} onPress={() => go('admission-applications', { status: 'offer_issued' })} />
            <Tile icon="checkmark-done-outline" tone="green" label="Confirmed" value={n(k.confirmed)} caption={`${n(k.enrolled)} enrolled`} onPress={() => go('admission-applications', { status: 'confirmed,enrolled' })} />
            <Tile icon="wallet-outline" tone="green" label="Fees collected" value={money((k.applicationFees || 0) + (k.admissionFees || 0))} caption={`${n(k.payments)} payments`} onPress={() => go('admission-payments')} />
            <Tile icon="alert-circle-outline" tone="orange" label="Fees outstanding" value={money(k.outstanding)} caption={`${n(k.outstandingFamilies)} fees due`} onPress={() => go('admission-applications', { fee: 'admission_due' })} />
            <Tile icon="hourglass-outline" tone="red" label="Awaiting approval" value={n(k.awaitingApproval)} caption={`${n(k.duplicates)} possible duplicates`} onPress={() => go('admission-applications', { view: 'pending' })} />
            <Tile icon="chatbubbles-outline" tone="violet" label="Enquiries" value={n(k.enquiries)} caption={`${n(k.openEnquiries)} new`} onPress={() => go('admission-enquiries')} />
          </Tiles>

          <Panel icon="grid-outline" title="The office">
            <Line icon="documents-outline" title="Applications" sub="Every application — status, documents, fees, offers" onPress={() => go('admission-applications')} />
            <Line icon="document-text-outline" tone="teal" title="Documents to check" sub={waiting ? `${n(waiting)} waiting${backlog.old ? ` · ${n(backlog.old)} over a week` : ''}` : 'Nothing waiting'} onPress={() => go('admission-documents')} />
            <Line icon="school-outline" tone="violet" title="Exams and interviews" sub={`${n(k.upcomingExams)} upcoming · ${n(k.resultsPending)} with results pending`} onPress={() => go('admission-exams')} />
            <Line icon="trophy-outline" tone="amber" title="Selection lists" sub="Merit lists, lotteries, waiting lists" onPress={() => go('admission-lists')} />
            <Line icon="calendar-outline" tone="green" title="Campus visits" sub="Times families book, and who came" onPress={() => go('admission-visits')} />
            <Line icon="shield-half-outline" tone="orange" title="Appeals and re-checks" onPress={() => go('admission-appeals')} />
            <Line icon="person-add-outline" tone="indigo" title="Enrolment" sub="Enrol confirmed students together, and the forecast" onPress={() => go('admission-enrolment')} />
            <Line icon="card-outline" tone="green" title="Payments" sub="Receipts and refunds" onPress={() => go('admission-payments')} />
            <Line icon="chatbubbles-outline" tone="violet" title="Enquiries" sub="Follow-ups, walk-ins, sources" onPress={() => go('admission-enquiries')} />
            <Line icon="ribbon-outline" tone="blue" title="RTE seats" sub="State allotments and the reimbursement register" onPress={() => go('admission-rte')} />
            <Line icon="git-branch-outline" tone="slate" title="Branches" sub="Other schools of the group, moves between them" onPress={() => go('admission-branches')} />
            <Line icon="lock-closed-outline" tone="red" title="Privacy" sub="Families' data requests, retention, who saw what" onPress={() => go('admission-privacy')} />
            <Line icon="settings-outline" tone="slate" title="Settings" sub="Portal open or closed, RTE rule, visits, appeals, DigiLocker" onPress={() => go('admission-settings')} last />
          </Panel>

          {funnel.length ? (
            <Panel icon="funnel-outline" tone="indigo" title="Admission funnel" subtitle="From the first enquiry to enrolment">
              {funnel.map((f) => <Bar key={f.key} label={f.label} n={f.n} max={funnelMax} />)}
              <Row>
                {k.selectionToConfirmation != null ? <Pill tone="green">{`${k.selectionToConfirmation}% of selections confirmed`}</Pill> : null}
                <Pill tone="slate">{`${n(k.rejected)} not admitted`}</Pill>
                <Pill tone="slate">{`${n(k.dropped)} withdrawn or declined`}</Pill>
              </Row>
            </Panel>
          ) : null}

          {seats.length ? (
            <Panel icon="layers-outline" tone="blue" title="Seats" subtitle="Held by live offers and confirmed admissions">
              {seats.map((r) => (
                <Line key={String(r.class)} title={r.className || '—'}
                  sub={r.unlimited && !r.capacity ? `${n(r.taken)} held · no limit` : `${n(r.taken)} of ${n(r.capacity)} held · ${n(Math.max(0, r.capacity - r.taken))} left`}
                  right={r.capacity ? <Pill tone={r.taken >= r.capacity ? 'red' : 'green'}>{`${Math.round((r.taken / Math.max(1, r.capacity)) * 100)}%`}</Pill> : undefined} />
              ))}
            </Panel>
          ) : null}

          {health.data ? <HealthPanel h={health.data} /> : null}
        </>
      ) : null}
    </Page>
  );
}

/** How the module is running for this school (school-backend services/admission/jobRuns.js). */
function HealthPanel({ h }: { h: any }) {
  const jobs = unwrapList(h.jobs);
  const on = (v: any, label: string) => <Pill key={label} tone={v ? 'green' : 'slate'}>{`${label}: ${v ? 'on' : 'off'}`}</Pill>;
  return (
    <Panel icon="pulse-outline" tone="teal" title="How it is running" subtitle={`Checked ${fmtDateTime(h.checkedAt)}`}>
      {jobs.map((j) => (
        <Line key={j.job} title={j.label} right={<Pill tone={j.late ? 'red' : j.failures24h ? 'amber' : 'green'}>{j.late ? (j.lastOkAt ? 'Late' : 'Has not run') : j.failures24h ? `${j.failures24h} failed today` : 'Working'}</Pill>}
          sub={j.lastOkAt ? `Last worked ${fmtDateTime(j.lastOkAt)}` : 'Not yet'} />
      ))}
      {jobs.some((j) => j.failedRecently) ? <Muted>A job failed today — the details are in the server log. Aksharum support can look into it.</Muted> : null}
      <View style={{ height: 8 }} />
      <Text style={st.k}>Last 24 hours</Text>
      <Muted>{`Emails accepted by the mail server: ${h.email?.sent ?? 0}${h.email?.failed ? ` · ${h.email.failed} failed` : ''}${h.email?.suppressed ? ` · ${h.email.suppressed} held back` : ''}`}</Muted>
      <Muted>{`Exports: ${h.exports?.queued ?? 0} waiting · ${h.exports?.running ?? 0} being prepared${h.exports?.failed ? ` · ${h.exports.failed} failed` : ''}`}</Muted>
      <Muted>{`Documents kept on: ${h.storage?.driver === 's3' ? 'cloud storage (S3)' : "this server's disk"}`}</Muted>
      <View style={{ height: 8 }} />
      <Row>
        {h.email?.driver === 'log' ? <Pill tone="amber">Email: recorded, not sent</Pill> : <Pill tone="green">Email: sent</Pill>}
        {on(h.payments?.online, 'Online payments')}
        {on(h.captcha?.on, 'Robot check')}
        {h.scanning?.on ? <Pill tone={h.scanning.reachable ? 'green' : 'red'}>{`Virus scanning: ${h.scanning.reachable ? 'on' : 'not reachable'}`}</Pill> : on(false, 'Virus scanning')}
      </Row>
    </Panel>
  );
}

const st = StyleSheet.create({
  k: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 4 },
});
