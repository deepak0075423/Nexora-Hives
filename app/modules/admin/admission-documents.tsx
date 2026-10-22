/**
 * The document check queue, on the phone (Oct 2026): uploads waiting for the
 * office, oldest first so nothing waits forever — open each, verify it, or ask
 * for it again with a reason the family sees. Other tabs show what was asked
 * for again, rejected or verified. Document types are set up on the web.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { admin } from '@/api/admission.api';
import { openAdmissionFile } from '@/components/admission/files';
import { useOffice, ReviewSheet, Blocked, BLOCKED } from '@/components/admission/office/office';
import { Page, Tabs, Panel, Tag, Pill, Btn, Row, Muted, Blank, Pick, DOC_STATUS, ago, size, errMsg, say, unwrapList } from '@/components/admission/parts';

const VIEWS = [{ key: '', label: 'Waiting' }, { key: 'resubmission_required', label: 'Asked again' }, { key: 'rejected', label: 'Rejected' }, { key: 'verified', label: 'Verified' }];

export default function AdmissionDocumentsScreen() {
  const router = useRouter();
  const { adm } = useOffice();
  const [status, setStatus] = useState('');
  const [docKey, setDocKey] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [review, setReview] = useState<any>(null);
  const load = async (pg = 1) => {
    setLoading(true); setError('');
    try {
      const r: any = await admin.documents({ status, docKey, page: pg, limit: 30 });
      const list = unwrapList(r?.data);
      setRows((x) => (pg === 1 ? list : [...x, ...list])); setTotal(Number(r?.total) || 0); setPage(pg);
    } catch (e: any) { setError(errMsg(e)); setCode(e?.data?.code || ''); } finally { setLoading(false); }
  };
  useEffect(() => { load(1); }, [status, docKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (BLOCKED.includes(code)) return <Page title="Documents"><Blocked message={error} /></Page>;
  const types = unwrapList(adm?.documentTypes);
  return (
    <Page title="Documents" onRefresh={() => load(1)}>
      <Tabs value={status} onChange={setStatus} items={VIEWS} />
      <View style={{ height: 10 }} />
      <Pick label="Document" value={docKey} onChange={setDocKey} options={[{ value: '', label: 'All documents' }, ...types.map((t: any) => ({ value: t.key, label: t.name }))]} />
      <View style={{ height: 10 }} />
      <Muted>{`${total.toLocaleString('en-IN')} document${total === 1 ? '' : 's'}`}</Muted>
      <View style={{ height: 8 }} />
      {error && !rows.length ? <Blank icon="cloud-offline-outline" title="Could not load the documents" body={error} action={<Btn onPress={() => load(1)}>Try again</Btn>} />
        : !loading && !rows.length ? <Blank icon="checkmark-done-outline" title={status ? 'Nothing here' : 'Nothing waiting'} body={status ? '' : 'Every uploaded document has been reviewed.'} />
          : rows.map((r) => (
            <Panel key={r._id} icon="document-text-outline" tone="teal" title={r.typeName || r.docKey} subtitle={`${r.originalName || ''} · ${size(r.size || 0)}${r.version > 1 ? ` · version ${r.version}` : ''} · ${ago(r.createdAt)}`}
              right={<Tag map={DOC_STATUS} value={r.status} />}>
              <Text style={st.who} onPress={() => router.push({ pathname: '/modules/admin/admission-application' as any, params: { id: r.applicationId } })}>
                {`${r.studentName} · ${r.applicationNumber || ''} · ${r.className || ''}`}
              </Text>
              {r.rejectionReason ? <Muted>{r.rejectionReason}</Muted> : null}
              <Row>
                {r.sensitive ? <Pill tone="amber">Sensitive</Pill> : null}
                <Btn icon="eye-outline" onPress={() => openAdmissionFile(admin.docUrl(r._id), r.originalName || 'document').catch((e) => say('Could not open it', errMsg(e)))}>Open</Btn>
                {r.status !== 'verified' ? <Btn kind="primary" onPress={() => setReview({ doc: r, decision: 'verify' })}>Verify</Btn> : null}
                <Btn onPress={() => setReview({ doc: r, decision: 'resubmit' })}>Problem</Btn>
              </Row>
            </Panel>
          ))}
      {rows.length < total ? <Btn block disabled={loading} onPress={() => load(page + 1)}>{loading ? 'Loading…' : 'Show more'}</Btn> : null}
      {review ? <ReviewSheet doc={review.doc} initial={review.decision} reasons={unwrapList(review.doc.rejectionReasons)} fileUrl={admin.docUrl(review.doc._id)} onClose={() => setReview(null)} onDone={() => load(1)} /> : null}
    </Page>
  );
}

const st = StyleSheet.create({
  who: { fontSize: 13, fontWeight: '700', color: '#4F46E5', marginBottom: 6 },
});
