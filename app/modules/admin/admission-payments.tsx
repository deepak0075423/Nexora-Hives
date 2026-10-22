/**
 * Admission payments, for the office on the phone (Oct 2026): application and
 * admission fees, online and at the counter, with what was refunded on each,
 * and each receipt. Payments are recorded (and refunded) on each application.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { admin } from '@/api/admission.api';
import { openAdmissionFile } from '@/components/admission/files';
import { Blocked, BLOCKED } from '@/components/admission/office/office';
import { Page, Tiles, Tile, Panel, Line, Pill, Btn, Row, Muted, Pick, Blank, PAY_MODES, money, fmtDate, errMsg, say, unwrapList } from '@/components/admission/parts';

const KIND: Record<string, string> = { application_fee: 'Application fee', admission_fee: 'Admission fee' };

export default function AdmissionPaymentsScreen() {
  const router = useRouter();
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const load = async (pg = 1) => {
    setLoading(true); setError('');
    try {
      const r: any = await admin.payments({ kind, status, page: pg, limit: 30 });
      setRows((x) => (pg === 1 ? unwrapList(r?.data) : [...x, ...unwrapList(r?.data)])); setMeta(r); setPage(pg);
    } catch (e: any) { setError(errMsg(e)); setCode(e?.data?.code || ''); } finally { setLoading(false); }
  };
  useEffect(() => { load(1); }, [kind, status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (BLOCKED.includes(code)) return <Page title="Payments"><Blocked message={error} /></Page>;
  return (
    <Page title="Payments" onRefresh={() => load(1)}>
      <Tiles>
        <Tile icon="wallet-outline" tone="green" label={status === 'void' ? 'Cancelled receipts' : 'Collected (these filters)'} value={money(meta?.amount || 0)} caption={`${Number(meta?.total || 0).toLocaleString('en-IN')} receipts`} />
        {meta?.refunded > 0 ? <Tile icon="return-down-back-outline" tone="amber" label="Refunded on these" value={money(meta.refunded)} caption={`${money((meta.amount || 0) - meta.refunded)} kept`} /> : null}
      </Tiles>
      <Row>
        <View style={{ flex: 1, minWidth: 140 }}><Pick label="Fee" value={kind} onChange={setKind} options={[{ value: '', label: 'Both fees' }, { value: 'application_fee', label: 'Application fee' }, { value: 'admission_fee', label: 'Admission fee' }]} /></View>
        <View style={{ flex: 1, minWidth: 140 }}><Pick label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'Paid' }, { value: 'void', label: 'Cancelled' }, { value: 'failed', label: 'Failed' }]} /></View>
      </Row>
      <View style={{ height: 10 }} />
      {error && !rows.length ? <Blank icon="cloud-offline-outline" title="Could not load the payments" body={error} action={<Btn onPress={() => load(1)}>Try again</Btn>} />
        : !loading && !rows.length ? <Blank icon="card-outline" title="No payments here" />
          : (
            <Panel icon="receipt-outline" tone="green" title="Receipts">
              {rows.map((p, i) => (
                <Line key={p._id} last={i === rows.length - 1}
                  onPress={['paid', 'void'].includes(p.status) ? () => openAdmissionFile(admin.receiptUrl(p.applicationId, p._id), `receipt-${p.receiptNumber || p._id}.pdf`).catch((e) => say('Could not open it', errMsg(e))) : undefined}
                  title={`${p.receiptNumber || '—'} · ${money(p.amount)}`}
                  sub={`${p.studentName} · ${p.applicationNumber}\n${KIND[p.kind]} · ${p.mode === 'online' ? 'Online' : PAY_MODES.find((m) => m.value === p.mode)?.label || p.mode}${p.reference ? ` · ${p.reference}` : ''} · ${fmtDate(p.paidAt)}${p.refunded > 0 ? ` · ${money(p.refunded)} refunded` : ''}`}
                  right={<Pill tone={p.status === 'paid' ? 'green' : p.status === 'void' ? 'slate' : 'red'}>{p.status === 'void' ? 'Cancelled' : p.status}</Pill>} />
              ))}
            </Panel>
          )}
      {meta && rows.length < Number(meta.total || 0) ? <Btn block disabled={loading} onPress={() => load(page + 1)}>{loading ? 'Loading…' : 'Show more'}</Btn> : null}
      <Muted>Tap a receipt to open it. To refund or cancel one, open its application → Fees.</Muted>
      <View style={{ height: 6 }} />
      {rows.length ? <Btn onPress={() => router.push('/modules/admin/admission-applications' as any)}>Applications</Btn> : null}
    </Page>
  );
}
