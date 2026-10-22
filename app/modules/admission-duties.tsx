/**
 * A teacher's admission duties on the phone (Oct 2026): the exams and
 * interviews they mark or sit on the panel of, the applications the office
 * assigned to them, and the documents of the types they review. Nothing else
 * of the admission office is visible from here; every list is the server's
 * (school-backend controllers/admissionStaff).
 */
import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { staff } from '@/api/admission.api';
import { openAdmissionFile } from '@/components/admission/files';
import { ReviewSheet, Blocked, BLOCKED } from '@/components/admission/office/office';
import { Page, Tiles, Tile, Panel, Line, Tag, Btn, Row, Note, Muted, useApi, EXAM_MODE, RESULTS_STATUS, ago, fmtDateTime, size, errMsg, say, unwrapList } from '@/components/admission/parts';

export default function AdmissionDutiesScreen() {
  const router = useRouter();
  const { data, loading, error, errorCode, reload } = useApi<any>(() => staff.duties(), []);
  const docs = useApi<any[]>(() => staff.documents(), []);
  const [review, setReview] = useState<any>(null);
  if (BLOCKED.includes(errorCode)) return <Page title="Admission duties"><Blocked message={error} /></Page>;
  const exams = unwrapList(data?.exams);
  const apps = unwrapList(data?.applications);
  const queue = unwrapList(docs.data);
  const toMark = exams.reduce((s, e) => s + (Number(e.notMarked) || 0) + (Number(e.toEvaluate) || 0), 0);
  return (
    <Page title="Admission duties" loading={loading && !data} error={!data ? error : ''} onRetry={reload} onRefresh={async () => { await reload(); await docs.reload(); }}>
      {data ? (
        <>
          {data.isAdmin ? (
            <Note icon="shield-checkmark-outline" title="You administer admissions">
              <Btn kind="primary" onPress={() => router.push('/modules/admin/admission' as any)}>Open the admission office</Btn>
            </Note>
          ) : null}
          <Tiles>
            <Tile icon="clipboard-outline" tone="indigo" label="Exams and interviews" value={String(exams.length)} caption={toMark ? `${toMark} to mark` : 'nothing waiting'} />
            <Tile icon="documents-outline" tone="blue" label="Applications assigned" value={String(apps.length)} />
            <Tile icon="document-text-outline" tone="amber" label="Documents to check" value={String(data.documentQueue ?? 0)} caption={unwrapList(data.reviewTypes).map((t: any) => t.name).join(', ') || 'no document types assigned'} />
          </Tiles>
          <Panel icon="clipboard-outline" tone="indigo" title="Exams and interviews">
            {exams.length ? exams.map((e, i) => (
              <Line key={e._id} last={i === exams.length - 1} onPress={() => router.push({ pathname: '/modules/admission-duty-exam' as any, params: { id: e._id } })}
                title={e.name} sub={`${e.roundName} · ${EXAM_MODE[e.mode] || e.mode} · ${fmtDateTime(e.startsAt)}\n${e.candidates} candidate(s)${e.mode === 'online' ? (e.toEvaluate ? ` · ${e.toEvaluate} answers to mark (on the web)` : '') : e.notMarked ? ` · ${e.notMarked} to mark` : ''}`}
                right={<Tag map={RESULTS_STATUS} value={e.resultsStatus} />} />
            )) : <Muted>No exams assigned to you.</Muted>}
          </Panel>
          <Panel icon="documents-outline" tone="blue" title="Applications assigned to me">
            {apps.length ? apps.map((a, i) => (
              <Line key={a._id} last={i === apps.length - 1} onPress={() => router.push({ pathname: '/modules/admission-duty-application' as any, params: { id: a._id } })}
                title={a.studentName || 'Not named'} sub={`${a.applicationNumber || 'Draft'} · ${a.className || ''} · in this status ${ago(a.statusChangedAt)}`} right={<Tag value={a.status} />} />
            )) : <Muted>No applications assigned to you.</Muted>}
          </Panel>
          {unwrapList(data.reviewTypes).length || data.isAdmin ? (
            <Panel icon="document-text-outline" tone="amber" title="Documents to check">
              {queue.length ? queue.map((r, i) => (
                <Line key={r._id} last={i === queue.length - 1} title={`${r.typeName} · ${r.studentName}`} sub={`${r.applicationNumber} · ${r.className} · ${r.originalName} · ${size(r.size || 0)} · ${ago(r.createdAt)}`}
                  right={(
                    <Row>
                      <Btn icon="eye-outline" onPress={() => openAdmissionFile(staff.docUrl(r._id), r.originalName || 'document').catch((e) => say('Could not open it', errMsg(e)))}>Open</Btn>
                      <Btn kind="primary" onPress={() => setReview({ doc: r, decision: 'verify' })}>Review</Btn>
                    </Row>
                  )} />
              )) : <Muted>Nothing waiting.</Muted>}
            </Panel>
          ) : null}
          <Muted>Sensitive documents and answers are seen only by the admission administrators.</Muted>
        </>
      ) : null}
      {review ? <ReviewSheet doc={review.doc} initial={review.decision} reasons={unwrapList(review.doc.rejectionReasons)} review={staff.reviewDoc} fileUrl={staff.docUrl(review.doc._id)} onClose={() => setReview(null)} onDone={() => { docs.reload(); reload(); }} /> : null}
    </Page>
  );
}
