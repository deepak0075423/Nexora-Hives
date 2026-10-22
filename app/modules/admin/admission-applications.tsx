/**
 * Every application of the school, on the phone (Oct 2026): a view, a search
 * (name, application number, phone or email), class and fee filters, and an
 * Excel export. Filtering, sorting and paging happen on the server; the
 * screen holds the pages it has fetched.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { admin } from '@/api/admission.api';
import { SearchBar } from '@/components/ui/kit';
import { openAdmissionFile } from '@/components/admission/files';
import { useOffice, Blocked, BLOCKED } from '@/components/admission/office/office';
import {
  Page, Tabs, Panel, Line, Tag, Pill, Btn, Row, Muted, Blank, Pick, DOC_STATUS, fmtDate, errMsg, say, unwrapList,
} from '@/components/admission/parts';

const VIEWS = [
  { key: 'all', label: 'All' }, { key: 'active', label: 'In progress' }, { key: 'submitted', label: 'Submitted' },
  { key: 'pending', label: 'Awaiting approval' }, { key: 'duplicates', label: 'Duplicates?' }, { key: 'closed', label: 'Closed' },
];
const FEES = [{ value: '', label: 'Any fees' }, { value: 'application_due', label: 'Application fee due' }, { value: 'admission_due', label: 'Admission fee due' }];
const DOCS = [{ value: '', label: 'Any documents' }, { value: 'missing', label: 'Documents missing' }, { value: 'under_review', label: 'Documents to review' }, { value: 'rejected', label: 'Documents rejected' }, { value: 'verified', label: 'Documents verified' }];

export default function AdmissionApplicationsScreen() {
  const router = useRouter();
  const p = useLocalSearchParams<{ view?: string; status?: string; fee?: string; class?: string; round?: string; docStatus?: string }>();
  const { adm, className } = useOffice();
  const [view, setView] = useState(String(p.view || 'all'));
  const [status, setStatus] = useState(String(p.status || ''));
  const [fee, setFee] = useState(String(p.fee || ''));
  const [docStatus, setDocStatus] = useState(String(p.docStatus || ''));
  const [klass, setKlass] = useState(String(p.class || ''));
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 350); return () => clearTimeout(t); }, [search]);
  const params = (pg: number) => ({
    q: term, status, fee, docStatus, class: klass, round: p.round, sort: 'submitted', page: pg, limit: 25,
    ...(view === 'pending' ? { pending: '1' } : view === 'duplicates' ? { duplicates: '1' } : ['active', 'submitted', 'closed'].includes(view) ? { view } : {}),
  });
  const load = async (pg = 1) => {
    setLoading(true); setError('');
    try {
      const r: any = await admin.applications(params(pg));
      const list = unwrapList(r?.data);
      setRows((x) => (pg === 1 ? list : [...x, ...list])); setMeta(r); setPage(pg);
    } catch (e: any) { setError(errMsg(e)); setCode(e?.data?.code || ''); } finally { setLoading(false); }
  };
  useEffect(() => { load(1); }, [view, status, fee, docStatus, klass, term]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportXlsx = () => {
    const { page: _p, limit: _l, ...rest } = params(1) as any;
    openAdmissionFile(admin.exportUrl({ ...rest, format: 'xlsx' }), `applications-${new Date().toISOString().slice(0, 10)}.xlsx`).catch((e) => say('Could not export', errMsg(e)));
  };
  if (BLOCKED.includes(code)) return <Page title="Applications"><Blocked message={error} /></Page>;
  const filtered = !!(status || fee || docStatus || klass || term);
  const classes = unwrapList(adm?.classes);

  return (
    <Page title="Applications" onRefresh={() => load(1)}>
      <Tabs value={view} onChange={(v) => setView(v)} items={VIEWS} />
      <View style={{ height: 10 }} />
      <SearchBar value={search} onChange={setSearch} placeholder="Name, application no., phone or email" />
      <Row>
        <View style={{ flex: 1, minWidth: 140 }}><Pick label="Class" value={klass} onChange={setKlass} options={[{ value: '', label: 'All classes' }, ...classes.map((c: any) => ({ value: String(c._id), label: c.className }))]} /></View>
        <View style={{ flex: 1, minWidth: 140 }}><Pick label="Fees" value={fee} onChange={setFee} options={FEES} /></View>
      </Row>
      <View style={{ height: 8 }} />
      <Row>
        <View style={{ flex: 1, minWidth: 140 }}><Pick label="Documents" value={docStatus} onChange={setDocStatus} options={DOCS} /></View>
        {status ? <Btn icon="close" onPress={() => setStatus('')}>{`Status: ${status.split(',').length > 1 ? `${status.split(',').length} statuses` : status.replace(/_/g, ' ')}`}</Btn> : null}
      </Row>
      <View style={{ height: 10 }} />
      <Row>
        <Muted>{meta ? `${Number(meta.total || 0).toLocaleString('en-IN')} application${meta.total === 1 ? '' : 's'}` : ' '}</Muted>
        {filtered ? <Btn onPress={() => { setStatus(''); setFee(''); setDocStatus(''); setKlass(''); setSearch(''); }}>Clear</Btn> : null}
        <Btn icon="download-outline" onPress={exportXlsx}>Excel</Btn>
      </Row>
      <View style={{ height: 10 }} />
      {error && !rows.length ? <Blank icon="cloud-offline-outline" title="Could not load the applications" body={error} action={<Btn onPress={() => load(1)}>Try again</Btn>} />
        : !loading && !rows.length ? <Blank icon="documents-outline" title={filtered || view !== 'all' ? 'No application matches' : 'No applications yet'} body={filtered ? 'Try clearing a filter.' : 'Applications appear here as families start them on the portal.'} />
          : (
            <Panel icon="documents-outline" title="Applications" flush>
              <View style={{ paddingHorizontal: 13 }}>
                {rows.map((r, i) => (
                  <Line key={r._id} last={i === rows.length - 1} onPress={() => router.push({ pathname: '/modules/admin/admission-application' as any, params: { id: r._id } })}
                    title={r.studentName || 'Not named yet'}
                    sub={[
                      [r.applicationNumber || 'Draft', r.className || className(r.class), r.roundName].filter(Boolean).join(' · '),
                      [r.guardianName || r.applicantName, r.guardianPhone || r.applicantEmail].filter(Boolean).join(' · '),
                      r.submittedAt ? `Submitted ${fmtDate(r.submittedAt)}` : 'Not submitted',
                    ].filter(Boolean).join('\n')}
                    right={(
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Tag value={r.status} />
                        {r.pendingTransition ? <Pill tone="amber">Approval</Pill> : null}
                        {r.duplicates ? <Pill tone="red">Duplicate?</Pill> : null}
                        {r.docStatus && r.docStatus !== 'verified' && r.docStatus !== 'none' ? <Pill tone={(DOC_STATUS[r.docStatus] || { tone: 'slate' }).tone}>{`Docs: ${(DOC_STATUS[r.docStatus]?.label || r.docStatus).toLowerCase()}`}</Pill> : null}
                      </View>
                    )} />
                ))}
              </View>
            </Panel>
          )}
      {meta && page < Number(meta.pages || 1) ? <Btn block onPress={() => load(page + 1)} disabled={loading}>{loading ? 'Loading…' : 'Show more'}</Btn> : null}
    </Page>
  );
}
