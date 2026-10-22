/**
 * Branches, for the office on the phone (Oct 2026): the schools of the group
 * this school belongs to (one admission page for families at /g/<group>),
 * whether this school is listed there, and applications moved between
 * branches at a family's request — answering one coming in, taking back one
 * going out (school-backend services/admission/groups.js). Groups are set up
 * by the platform.
 */
import React, { useState } from 'react';
import { View, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { admin } from '@/api/admission.api';
import { useOffice, Blocked, BLOCKED } from '@/components/admission/office/office';
import { Page, Panel, Line, Pill, Btn, Row, Note, Muted, Sheet, Field, Box, Pick, Tick, useApi, fmtDateTime, errMsg, say, unwrapList } from '@/components/admission/parts';

const STATUS: Record<string, [string, any]> = { pending: ['Waiting for an answer', 'amber'], accepted: ['Accepted — the family finishes it', 'indigo'], completed: ['Moved', 'green'], declined: ['Declined', 'slate'], cancelled: ['Taken back', 'slate'] };

export default function AdmissionBranchesScreen() {
  const router = useRouter();
  const { adm } = useOffice();
  const { data: g, loading, error, errorCode, reload } = useApi<any>(() => admin.myGroup(), []);
  const t = useApi<any[]>(() => admin.transfers(), []);
  const [deciding, setDeciding] = useState<any>(null);
  if (BLOCKED.includes(errorCode)) return <Page title="Branches"><Blocked message={error} /></Page>;
  const setListed = async (v: boolean) => {
    try { await admin.groupListing(v); reload(); } catch (e) { say('Not changed', errMsg(e)); }
  };
  const cancel = async (x: any) => {
    try { await admin.cancelTransfer(x._id); t.reload(); } catch (e) { say('Not taken back', errMsg(e)); }
  };
  const origin = String(adm?.portalUrl || '').replace(/\/[^/]+$/, '');
  const moves = unwrapList(t.data);
  return (
    <Page title="Branches" loading={loading && !g} error={!g && error ? error : ''} onRetry={reload} onRefresh={async () => { await reload(); await t.reload(); }}>
      {!g?.name ? (
        <Note tone="slate">This school is not part of a group. Groups — schools of one trust or chain on one page for families — are set up by the platform; ask Aksharum support.</Note>
      ) : (
        <>
          <Panel icon="git-branch-outline" tone="violet" title={g.name} subtitle={`/g/${g.slug}`} right={origin ? <Btn icon="open-outline" onPress={() => Linking.openURL(`${origin}/g/${g.slug}`).catch(() => {})}>Page</Btn> : undefined}>
            <Tick on={!!g.listed} onChange={setListed} label="List this school on the group page — only while its admission portal is open or closed, never in maintenance" />
            <Row>{unwrapList(g.branches).map((b: any) => <Pill key={b._id} tone="indigo">{b.name}</Pill>)}</Row>
            {g.shareStatus ? <Note tone="amber" icon="shield-checkmark-outline">Branches of this group see the status of the same family’s applications at each other — say so in the privacy notice.</Note> : null}
          </Panel>
          <Panel icon="repeat-outline" tone="slate" title="Moves between branches" subtitle="Offer a move from an application's page, at the family's request">
            {moves.length ? moves.map((x, i) => (
              <View key={x._id} style={{ paddingBottom: 8 }}>
                <Line last={i === moves.length - 1} title={`${x.studentName} · ${x.direction === 'in' ? `from ${x.fromSchoolName}` : `to ${x.toSchoolName}`}`}
                  sub={`${x.applicationNumber} · ${x.className}\n${x.reason}${x.answer ? `\nAnswer: ${x.answer}` : ''}\n${fmtDateTime(x.decidedAt || x.createdAt)}`}
                  right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Pill tone={x.direction === 'in' ? 'indigo' : 'slate'}>{x.direction === 'in' ? 'Coming in' : 'Going out'}</Pill><Pill tone={STATUS[x.status]?.[1] || 'slate'}>{STATUS[x.status]?.[0] || x.status}</Pill></View>} />
                <Row>
                  {x.status === 'pending' && x.direction === 'in' ? <Btn kind="primary" onPress={() => setDeciding(x)}>Answer</Btn> : null}
                  {x.status === 'pending' && x.direction !== 'in' ? <Btn onPress={() => cancel(x)}>Take back</Btn> : null}
                  {x.toApplication && x.direction === 'in' && x.status !== 'pending' ? <Btn onPress={() => router.push({ pathname: '/modules/admin/admission-application' as any, params: { id: x.toApplication } })}>Open</Btn> : null}
                </Row>
              </View>
            )) : <Muted>No moves yet.</Muted>}
          </Panel>
        </>
      )}
      {deciding ? <Decide t={deciding} onClose={() => setDeciding(null)} onDone={() => { setDeciding(null); t.reload(); }} /> : null}
    </Page>
  );
}

function Decide({ t, onClose, onDone }: { t: any; onClose: () => void; onDone: () => void }) {
  const { adm, className } = useOffice();
  const [f, setF] = useState({ round: '', class: '', answer: '' });
  const [busy, setBusy] = useState('');
  const rounds = unwrapList(adm?.rounds).filter((r: any) => r.status === 'open');
  const round = rounds.find((r: any) => String(r._id) === f.round);
  const go = async (accept: boolean) => {
    setBusy(accept ? 'yes' : 'no');
    try {
      await admin.decideTransfer(t._id, { accept, round: f.round, class: f.class, answer: f.answer.trim() });
      say(accept ? 'Accepted' : 'Declined', accept ? 'The family is asked to check and submit it here.' : 'The other branch is told.'); onDone();
    } catch (e) { say('Not answered', errMsg(e)); } finally { setBusy(''); }
  };
  return (
    <Sheet visible icon="repeat-outline" tone="violet" title={`Move from ${t.fromSchoolName}: ${t.studentName}`} onClose={onClose} busy={!!busy}
      footer={<><Btn block disabled={!!busy || !f.answer.trim()} onPress={() => go(false)}>Decline</Btn><Btn block kind="primary" disabled={!!busy || !f.round || !f.class} onPress={() => go(true)}>Accept</Btn></>}>
      <Note>{`Why: ${t.reason}. Accepting copies the answers your form also asks and the documents into a draft for the family; they check it and submit it here, and their application at ${t.fromSchoolName} is withdrawn then.`}</Note>
      <Field label="Round" required><Pick label="Round" value={f.round} placeholder="Choose…" onChange={(v) => setF({ ...f, round: v, class: '' })} options={rounds.map((r: any) => ({ value: String(r._id), label: r.name }))} /></Field>
      <Field label="Class" required>
        <Pick label="Class" value={f.class} placeholder="Choose…" onChange={(v) => setF({ ...f, class: v })}
          options={unwrapList(round?.classes).filter((c: any) => c.isOpen !== false).map((c: any) => ({ value: String(c.class), label: `${className(c.class)}${t.className && className(c.class) === t.className ? ' (same class)' : ''}` }))} />
      </Field>
      <Field label="Your answer" hint="Required to decline — the other branch reads it"><Box value={f.answer} onChange={(v) => setF({ ...f, answer: v })} multiline maxLength={500} /></Field>
    </Sheet>
  );
}
