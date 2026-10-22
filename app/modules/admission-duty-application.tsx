/**
 * An application assigned to a teacher, on the phone (Oct 2026): what their
 * part of the work needs — the answers (sensitive ones hidden), the documents
 * (open, review), the history with a note for the office, and moving it along
 * the workflow (or asking for approval where the stage needs it). The server
 * refuses anything beyond that (school-backend controllers/admissionStaff).
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { staff } from '@/api/admission.api';
import { openAdmissionFile } from '@/components/admission/files';
import { MoveSheet, ReviewSheet, Blocked, BLOCKED } from '@/components/admission/office/office';
import {
  Page, Hero, Panel, Line, Tag, Pill, Btn, Note, Muted, Field, Box, Facts, Fact, DOC_STATUS, STATUS, defOf, useApi, fmtDateTime, size, errMsg, say, unwrapList,
} from '@/components/admission/parts';

export default function AdmissionDutyApplication() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: d, loading, error, errorCode, reload } = useApi<any>(() => staff.application(String(id)), [id]);
  const [moving, setMoving] = useState(false);
  const [review, setReview] = useState<any>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!d && BLOCKED.includes(errorCode)) return <Page title="Application"><Blocked message={error} /></Page>;
  const app = d?.application;
  const files = new Map(unwrapList(d?.documents?.files).map((f) => [f.docKey, f]));
  const addNote = async () => {
    setBusy(true);
    try { await staff.note(app._id, note.trim()); setNote(''); reload(); } catch (e) { say('Not added', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Page title={app?.studentName || 'Application'} loading={loading && !d} error={!d ? error : ''} onRetry={reload} onRefresh={reload}>
      {d && app ? (
        <>
          <Hero tone={defOf(STATUS, app.status).tone} eyebrow={`Application ${app.applicationNumber || ''}`} title={app.studentName || 'Student'}
            sub={[app.className, app.yearName, app.roundName].filter(Boolean).join(' · ')} right={<Tag value={app.status} />}>
            <Btn kind="primary" icon="repeat-outline" disabled={!unwrapList(d.workflow?.moves).some((m) => m.ok)} onPress={() => setMoving(true)}>Change status</Btn>
          </Hero>
          {d.workflow?.pending ? <Note tone="amber" icon="shield-checkmark-outline">{`A move to ${String(d.workflow.pending.to).replace(/_/g, ' ')} is waiting for an administrator's approval.`}</Note> : null}
          {unwrapList(d.answers).map((sec) => (
            <Panel key={sec.section} icon="list-outline" tone="slate" title={sec.title}>
              <Facts>{unwrapList(sec.fields).map((f) => <Fact key={f.key} k={f.label} v={f.hidden ? 'Hidden' : (String(f.value ?? '') || '—')} />)}</Facts>
            </Panel>
          ))}
          {!unwrapList(d.answers).length ? <Muted>No answers to show.</Muted> : null}
          <Panel icon="document-text-outline" tone="teal" title="Documents">
            {unwrapList(d.documents?.requirements).map((r, i, list) => {
              const doc: any = files.get(r.key);
              return (
                <Line key={r.key} last={i === list.length - 1} title={r.name} sub={doc ? `${doc.originalName} · ${size(doc.size || 0)}` : r.required ? 'Missing' : 'Optional'}
                  onPress={doc ? () => openAdmissionFile(staff.docUrl(doc._id), doc.originalName || 'document').catch((e) => say('Could not open it', errMsg(e))) : undefined}
                  right={doc ? (
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Tag map={DOC_STATUS} value={doc.status} />
                      {doc.status !== 'verified' ? <Btn onPress={() => setReview({ ...doc, name: r.name, rejectionReasons: r.rejectionReasons })}>Review</Btn> : null}
                    </View>
                  ) : <Pill tone={r.required ? 'amber' : 'slate'}>{r.required ? 'Missing' : 'Optional'}</Pill>} />
              );
            })}
            {!unwrapList(d.documents?.requirements).length ? <Muted>No documents asked for.</Muted> : null}
          </Panel>
          <Panel icon="time-outline" tone="slate" title="History">
            <Field label="A note for the admission office"><Box value={note} onChange={setNote} multiline maxLength={2000} /></Field>
            <Btn kind="primary" disabled={busy || !note.trim()} onPress={addNote}>Add note</Btn>
            <View style={{ height: 8 }} />
            {unwrapList(d.timeline).map((t, i, list) => <Line key={t._id || i} last={i === list.length - 1} title={t.message} sub={fmtDateTime(t.createdAt)} />)}
          </Panel>
          {moving ? <MoveSheet app={app} moves={unwrapList(d.workflow?.moves)} transition={staff.transition} onClose={() => setMoving(false)} onDone={reload} /> : null}
          {review ? <ReviewSheet doc={review} initial="verify" reasons={unwrapList(review.rejectionReasons)} review={staff.reviewDoc} fileUrl={staff.docUrl(review._id)} onClose={() => setReview(null)} onDone={reload} /> : null}
        </>
      ) : null}
    </Page>
  );
}
