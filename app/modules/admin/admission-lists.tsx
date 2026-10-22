/**
 * Selection lists and offers, on the phone (Oct 2026). A list ranks a class's
 * applications by merit, or chooses them by a lottery anyone can check;
 * nothing reaches families until it is approved and published. Drafting a new
 * list (its criteria) is done on the web; running one — the draw, approving,
 * publishing, changing a line — is here, on the list's own screen.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { admin } from '@/api/admission.api';
import { Blocked, BLOCKED } from '@/components/admission/office/office';
import {
  Page, Tabs, Panel, Line, Tag, Pill, Blank, Pick, Muted, Row, useApi, LIST_STATUS, LIST_METHOD, OFFER_STATUS, FEE_STATUS, money, fmtDate, fmtDateTime, unwrapList,
} from '@/components/admission/parts';

export default function AdmissionListsScreen() {
  const [tab, setTab] = useState('lists');
  return (
    <Page title="Selection">
      <Tabs value={tab} onChange={setTab} items={[{ key: 'lists', label: 'Lists' }, { key: 'offers', label: 'Offers' }]} />
      <View style={{ height: 12 }} />
      {tab === 'lists' ? <Lists /> : <Offers />}
    </Page>
  );
}

function Lists() {
  const router = useRouter();
  const { data, loading, error, errorCode } = useApi<any[]>(() => admin.lists(), []);
  if (BLOCKED.includes(errorCode)) return <Blocked message={error} />;
  const list = unwrapList(data);
  if (loading && !data) return <Muted>Loading…</Muted>;
  if (!list.length) return <Blank icon="trophy-outline" title="No lists yet" body="A list is drafted on the web, under Admissions → Selection. It appears here to draw, approve and publish." />;
  return (
    <Panel icon="trophy-outline" tone="amber" title={`${list.length} list${list.length === 1 ? '' : 's'}`}>
      {list.map((r, i) => (
        <Line key={r._id} last={i === list.length - 1} onPress={() => router.push({ pathname: '/modules/admin/admission-list' as any, params: { id: r._id } })}
          title={`${r.name} — ${r.className}`}
          sub={`${r.roundName} · list ${r.listNo} · ${LIST_METHOD[r.method || 'merit']}${r.draw ? ' · drawn' : ''}\n${r.lines} ranked · ${r.selected} selected · ${r.waitlisted} waiting${r.publishedAt ? ` · published ${fmtDate(r.publishedAt)}` : r.publishAt && r.status === 'approved' ? ` · publishes ${fmtDateTime(r.publishAt)}` : ''}`}
          right={<Tag map={LIST_STATUS} value={r.status} />} />
      ))}
    </Panel>
  );
}

function Offers() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const { data, loading } = useApi<any[]>(() => admin.offers({ status }), [status]);
  const list = unwrapList(data);
  return (
    <>
      <Pick label="Offers" value={status} onChange={setStatus} options={[{ value: '', label: 'Every offer' }, ...Object.entries(OFFER_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]} />
      <View style={{ height: 10 }} />
      {loading && !data ? <Muted>Loading…</Muted> : list.length ? (
        <Panel icon="mail-outline" tone="teal" title={`${list.length} offer${list.length === 1 ? '' : 's'}`}>
          {list.map((o, i) => (
            <Line key={o._id} last={i === list.length - 1} onPress={() => router.push({ pathname: '/modules/admin/admission-application' as any, params: { id: o.application } })}
              title={`${o.studentName} · ${o.offerNumber}`}
              sub={`${o.applicationNumber} · ${o.className || ''} · ${o.listName || 'made by hand'}\n${o.status === 'issued' ? `Answer by ${fmtDateTime(o.respondBy)}` : o.respondedAt ? `Answered ${fmtDate(o.respondedAt)}` : ''} · fee ${money(o.feeAmount)}`}
              right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Tag map={OFFER_STATUS} value={o.status} />{o.feeAmount > 0 ? <Tag map={FEE_STATUS} value={o.admissionFeeStatus} /> : null}</View>} />
          ))}
        </Panel>
      ) : <Blank icon="mail-outline" title="No offers" body="Offers are made when a list is published, or by hand from an application." />}
      {list.length >= 500 ? <Row><Pill tone="slate">The newest 500 offers are shown</Pill></Row> : null}
    </>
  );
}
