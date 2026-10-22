/**
 * Entrance exams and interviews (phone, Oct 2026): every exam of the school's
 * rounds with its candidates, marks and where its results stand. Setting an
 * exam up — subjects, sections, questions, draws — is done on the web; the day
 * itself (who is scheduled, times, attendance, marks, publishing) is here.
 */
import React from 'react';
import { useRouter } from 'expo-router';
import { admin } from '@/api/admission.api';
import { useOffice, Blocked, BLOCKED } from '@/components/admission/office/office';
import { Page, Panel, Line, Tag, Pill, Note, Blank, Row, useApi, EXAM_MODE, RESULTS_STATUS, fmtDateTime, unwrapList } from '@/components/admission/parts';

export const EXAM_STATUS: Record<string, { label: string; tone: any }> = {
  draft: { label: 'Draft', tone: 'slate' }, scheduled: { label: 'Scheduled', tone: 'indigo' }, completed: { label: 'Completed', tone: 'green' }, cancelled: { label: 'Cancelled', tone: 'red' },
};

export default function AdmissionExamsScreen() {
  const router = useRouter();
  const { adm } = useOffice();
  const { data, loading, error, errorCode, reload } = useApi<any[]>(() => admin.exams(), []);
  if (BLOCKED.includes(errorCode)) return <Page title="Exams"><Blocked message={error} /></Page>;
  const list = unwrapList(data);
  const barred = unwrapList(adm?.classes).filter((c: any) => adm?.screening?.[c._id]?.banned);
  return (
    <Page title="Exams and interviews" loading={loading && !data} error={!data ? error : ''} onRetry={reload} onRefresh={reload}>
      {barred.length ? <Note tone="indigo" icon="shield-checkmark-outline">{`No entrance test or interview may choose children for ${barred.map((c: any) => c.className).join(', ')} — the RTE Act allows only a random draw there. Use a lottery list.`}</Note> : null}
      {list.length ? (
        <Panel icon="school-outline" tone="violet" title={`${list.length} exam${list.length === 1 ? '' : 's'} and interviews`}>
          {list.map((r, i) => (
            <Line key={r._id} last={i === list.length - 1} onPress={() => router.push({ pathname: '/modules/admin/admission-exam' as any, params: { id: r._id } })}
              title={r.name} sub={`${EXAM_MODE[r.mode] || r.mode} · ${fmtDateTime(r.startsAt)}\n${r.roundName || ''} · ${r.candidates} candidate${r.candidates === 1 ? '' : 's'}${r.maxMarks ? ` · ${r.maxMarks} marks` : ''}`}
              right={<Row><Pill tone={EXAM_STATUS[r.status]?.tone || 'slate'}>{EXAM_STATUS[r.status]?.label || r.status}</Pill><Tag map={RESULTS_STATUS} value={r.resultsStatus} /></Row>} />
          ))}
        </Panel>
      ) : <Blank icon="school-outline" title="No exams yet" body="Exams and interviews are set up on the web, under Admissions → Exams; they appear here to run on the day." />}
    </Page>
  );
}
