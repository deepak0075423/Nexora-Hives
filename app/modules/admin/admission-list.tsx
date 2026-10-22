/**
 * One selection list, for the office on the phone (Oct 2026): its next step
 * (rebuild, the lottery draw — once — send for approval, approve, publish now
 * or at a set time, close, cancel), the seats, the criteria or the draw's
 * record (with a check that anyone can repeat: every draw number follows from
 * the fingerprint shown before the draw, the phrase and who was in it), and
 * the lines — changed by hand in draft, with a reason kept on the line.
 *
 * Editing a list's criteria is done on the web.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { admin } from '@/api/admission.api';
import { confirmAsync } from '@/components/ui/kit';
import { useOffice, AskSheet, Blocked, BLOCKED } from '@/components/admission/office/office';
import {
  Page, Hero, Panel, Line, Tag, Pill, Btn, Row, Note, Muted, Sheet, Field, Box, Pick, Facts, Fact,
  useApi, LIST_STATUS, LIST_METHOD, DECISION, OFFER_STATUS, fmtDateTime, errMsg, say, unwrapList,
} from '@/components/admission/parts';

export default function AdmissionListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { adm, statusOf } = useOffice();
  const { data: d, loading, error, errorCode, reload } = useApi<any>(() => admin.list(String(id)), [id]);
  const [ask, setAsk] = useState('');
  const [line, setLine] = useState<any>(null);
  const [check, setCheck] = useState<any>(null);
  const [busy, setBusy] = useState('');
  if (!d && BLOCKED.includes(errorCode)) return <Page title="List"><Blocked message={error} /></Page>;
  const list = d?.list;
  const draft = list?.status === 'draft';
  const lottery = list && ['lottery', 'points_lottery'].includes(list.method);
  const drawn = !!list?.draw;
  const lines = unwrapList(d?.lines);
  const counts = lines.reduce((m: any, l: any) => ({ ...m, [l.decision]: (m[l.decision] || 0) + 1 }), {});
  const run = async (key: string, fn: () => Promise<any>, ok: string, confirm?: [string, string, string]) => {
    if (confirm && !(await confirmAsync(confirm[0], confirm[1], confirm[2]))) return;
    setBusy(key);
    try { await fn(); say(ok); reload(); } catch (e) { say('Not done', errMsg(e)); } finally { setBusy(''); }
  };
  const verify = async () => {
    setBusy('verify');
    try { const r: any = await admin.verifyDraw(list._id); setCheck(r?.data); } catch (e) { say('Not checked', errMsg(e)); } finally { setBusy(''); }
  };
  const publicDraw = lottery && drawn && ['published', 'closed'].includes(list.status) && adm?.settings?.slug && adm?.portalUrl ? `${adm.portalUrl}/lottery/${list._id}` : '';
  const examName = (eid: string) => unwrapList(d?.exams).find((e) => String(e._id) === String(eid))?.name || 'An exam';
  const c = list?.criteria || {};

  return (
    <Page title={list?.name || 'List'} loading={loading && !d} error={!d ? error : ''} onRetry={reload} onRefresh={reload}>
      {d && list ? (
        <>
          <Hero tone="amber" eyebrow={`${d.roundName} · list ${list.listNo} · ${LIST_METHOD[list.method || 'merit']}`} title={`${list.name} — ${d.className}`}
            sub={list.publishedAt ? `Published ${fmtDateTime(list.publishedAt)}` : drawn ? `Drawn ${fmtDateTime(list.draw.at)}` : lottery ? 'Not drawn yet' : list.generatedAt ? `Ranked ${fmtDateTime(list.generatedAt)}` : ''}
            right={<Tag map={LIST_STATUS} value={list.status} />}>
            {publicDraw ? <Btn icon="open-outline" onPress={() => Linking.openURL(publicDraw).catch(() => {})}>Public draw record</Btn> : null}
          </Hero>
          {d.screening?.banned ? <Note tone="indigo" icon="shield-checkmark-outline">{`${d.screening.why} — so applicants are chosen by a random draw.`}</Note> : null}
          {list.status === 'approved' && list.publishAt ? <Note icon="calendar-outline">{`Publishes automatically on ${fmtDateTime(list.publishAt)}.`}</Note> : null}

          <Panel icon="flag-outline" tone="indigo" title="Next step">
            <Muted>
              {draft && lottery && !drawn ? 'Check who is in the pool, then make the draw — once. It cannot be made again.'
                : draft && lottery ? 'The draw is final. A line can be taken out (with a reason); the seats go down the draw order.'
                  : draft ? 'Change any line by hand (with a reason), then send the list for approval.'
                    : list.status === 'pending_approval' ? 'Check the lines, then approve — or send it back.'
                      : list.status === 'approved' ? 'Publishing makes the offers and tells every family on the list.'
                        : list.status === 'published' ? 'Offers are out. When a family declines or lets an offer lapse, the waiting list moves up if the school allows it.' : ''}
            </Muted>
            <View style={{ height: 8 }} />
            <Row>
              {draft && !lottery ? <>
                <Btn icon="refresh-outline" disabled={!!busy} onPress={() => run('rebuild', () => admin.rebuildList(list._id), 'Rebuilt — changes made by hand were kept')}>Rebuild</Btn>
                <Btn kind="primary" icon="send-outline" disabled={!!busy} onPress={() => run('submit', () => admin.submitList(list._id), 'Sent for approval', ['Send for approval?', 'The lines are frozen while the list waits; it can be sent back to draft.', 'Send'])}>Send for approval</Btn>
              </> : null}
              {draft && lottery && !drawn ? <>
                <Btn kind="primary" icon="shuffle-outline" onPress={() => setAsk('draw')}>Make the draw</Btn>
                <Btn icon="refresh-outline" disabled={!!busy} onPress={() => run('rebuild', () => admin.rebuildList(list._id), 'The pool is up to date')}>Refresh the pool</Btn>
              </> : null}
              {draft && lottery && drawn ? <>
                <Btn kind="primary" icon="send-outline" disabled={!!busy} onPress={() => run('submit', () => admin.submitList(list._id), 'Sent for approval', ['Send for approval?', 'The lines are frozen while the list waits.', 'Send'])}>Send for approval</Btn>
                <Btn icon="shield-checkmark-outline" disabled={!!busy} onPress={verify}>Verify the draw</Btn>
                <Btn kind="danger" onPress={() => setAsk('cancel')}>Cancel list</Btn>
              </> : null}
              {list.status === 'pending_approval' ? <>
                <Btn kind="primary" icon="checkmark-circle-outline" disabled={!!busy} onPress={() => run('approve', () => admin.approveList(list._id), 'Approved', ['Approve this list?', 'Approved lists can be published at once or at a set time.', 'Approve'])}>Approve</Btn>
                <Btn onPress={() => setAsk('return')}>Send back to draft</Btn>
                {lottery ? <Btn icon="shield-checkmark-outline" disabled={!!busy} onPress={verify}>Verify the draw</Btn> : null}
              </> : null}
              {list.status === 'approved' ? <>
                <Btn kind="primary" icon="megaphone-outline" onPress={() => setAsk('publish')}>Publish</Btn>
                <Btn onPress={() => setAsk('return')}>Send back to draft</Btn>
                {lottery ? <Btn kind="danger" onPress={() => setAsk('cancel')}>Cancel list</Btn> : null}
              </> : null}
              {['published', 'closed'].includes(list.status) && lottery ? <Btn icon="shield-checkmark-outline" disabled={!!busy} onPress={verify}>Verify the draw</Btn> : null}
              {list.status === 'published' ? <Btn icon="lock-closed-outline" disabled={!!busy} onPress={() => run('close', () => admin.closeList(list._id), 'List closed', ['Close this list?', 'Offers already made stand. A closed list makes no further promotions.', 'Close list'])}>Close the list</Btn> : null}
            </Row>
            {draft ? <Muted>Editing the list’s criteria, name or dates is done on the web.</Muted> : null}
          </Panel>

          <Panel icon="layers-outline" tone="blue" title="Seats">
            <Facts>
              <Fact k="In the class" v={d.seats?.capacity ? String(d.seats.capacity) : 'No limit'} />
              <Fact k="Held now" v={String(d.seats?.taken ?? 0)} />
              <Fact k="Free" v={d.seats?.available == null ? 'No limit' : String(d.seats.available)} />
              <Fact k="This list fills" v={list.seats ? String(list.seats) : 'Every free seat'} />
              <Fact k="Waiting places" v={String(list.waitlistSize || 0)} />
              <Fact k="Respond by" v={list.acceptanceDeadline ? fmtDateTime(list.acceptanceDeadline) : 'School default'} />
            </Facts>
          </Panel>

          {lottery ? (
            <Panel icon="shuffle-outline" tone="violet" title="The draw">
              {!drawn ? (
                <Facts>
                  {list.method === 'points_lottery' ? <Fact k="Priority points" v={unwrapList(c.points).map((p: any) => `${p.label} +${p.points}`).join(' · ') || '—'} /> : null}
                  <Fact k="Fingerprint of the secret" v={<Text selectable style={st.mono}>{list.lotteryCommitment}</Text>} />
                </Facts>
              ) : (
                <Facts>
                  <Fact k="Drawn" v={`${fmtDateTime(list.draw.at)}${list.draw.byName ? ` by ${list.draw.byName}` : ''}`} />
                  <Fact k="Phrase" v={`“${list.draw.phrase}”`} />
                  {unwrapList(list.draw.witnesses).length ? <Fact k="Witnesses" v={list.draw.witnesses.join(', ')} /> : null}
                  <Fact k="In the draw" v={`${list.draw.poolSize} · ${list.draw.selected ?? '—'} selected · ${list.draw.waitlisted ?? '—'} waiting`} />
                  <Fact k="Secret, now revealed" v={<Text selectable style={st.mono}>{list.draw.nonce}</Text>} />
                  <Fact k="Seed" v={<Text selectable style={st.mono}>{list.draw.seed}</Text>} />
                </Facts>
              )}
              {check ? <Note tone={check.ok ? 'green' : 'red'} icon={check.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'}>{check.ok ? `Verified: all ${check.checked} draw numbers follow from the fingerprint, the phrase and who was in the draw.` : `Not verified — ${unwrapList(check.problems).join('; ')}`}</Note> : null}
            </Panel>
          ) : (
            <Panel icon="options-outline" tone="slate" title="Criteria">
              <Facts>
                <Fact k="Score" v={unwrapList(c.weights).length ? c.weights.map((w: any) => `${w.label || examName(String(w.source).split(':')[1])} × ${w.weight}`).join(' + ') : 'Ranked by the tie-breakers'} />
                <Fact k="Ranked" v={`${unwrapList(c.filters?.statuses).map((s: string) => statusOf(s).label).join(', ') || '—'}${c.filters?.requirePass ? ' · qualified only' : ''}${c.filters?.requireDocsVerified ? ' · documents verified' : ''}`} />
              </Facts>
            </Panel>
          )}

          <Panel icon="trophy-outline" tone="amber" title={lottery ? (drawn ? 'The draw, in order' : 'In the draw') : 'Ranked applications'}
            subtitle={lottery && !drawn ? `${lines.filter((l: any) => l.decision !== 'excluded').length} in the pool · ${counts.excluded || 0} taken out` : `${counts.selected || 0} selected · ${counts.waitlisted || 0} waiting · ${counts.not_selected || 0} not on this list · ${counts.excluded || 0} excluded`}>
            {lines.length ? lines.map((l: any, i: number) => (
              <Line key={l._id} last={i === lines.length - 1}
                onPress={draft ? () => setLine(l) : () => router.push({ pathname: '/modules/admin/admission-application' as any, params: { id: l.applicationId } })}
                title={`${l.rank ? `${l.rank}. ` : ''}${l.studentName}`}
                sub={`${l.applicationNumber}${lottery ? (list.method === 'points_lottery' ? ` · ${l.score ?? 0} points` : '') : ` · score ${l.score ?? '—'}`}${l.manual ? ` · by hand${l.reason ? ` (${l.reason})` : ''}` : ''}${l.offerStatus ? ` · offer ${(OFFER_STATUS[l.offerStatus]?.label || l.offerStatus).toLowerCase()}` : ''}${draft ? '\nTap to change' : ''}`}
                right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Tag map={DECISION} value={l.decision} />{l.waitPosition ? <Pill tone="amber">{`#${l.waitPosition}`}</Pill> : null}</View>} />
            )) : <Muted>No application of the class matches the list’s filters yet.</Muted>}
          </Panel>

          {ask === 'draw' ? <DrawSheet list={list} pool={lines.filter((l: any) => l.decision !== 'excluded').length} onClose={() => setAsk('')} onDone={reload} /> : null}
          {ask === 'publish' ? <PublishSheet list={list} counts={counts} onClose={() => setAsk('')} onDone={reload} /> : null}
          {ask === 'cancel' ? (
            <AskSheet title="Cancel this list?" message={drawn ? 'The draw stays on record with your reason. A new list of the class makes a new draw.' : 'The list stays on record with your reason.'}
              label="Why — kept on record beside the next list" confirm="Cancel list" danger onClose={() => setAsk('')} onConfirm={async (why) => { await admin.cancelList(list._id, why); reload(); }} />
          ) : null}
          {ask === 'return' ? (
            <AskSheet title="Send the list back to draft?" label="What needs changing" confirm="Send back" onClose={() => setAsk('')} onConfirm={async (note) => { await admin.returnList(list._id, note); reload(); }} />
          ) : null}
          {line ? <LineSheet line={line} list={list} lottery={!!lottery} onClose={() => setLine(null)} onDone={reload} /> : null}
        </>
      ) : null}
    </Page>
  );
}

/** Changing one line by hand (merit), or taking it out of / back into the draw (lottery). */
function LineSheet({ line, list, lottery, onClose, onDone }: { line: any; list: any; lottery: boolean; onClose: () => void; onDone: () => void }) {
  const [decision, setDecision] = useState(lottery ? (line.decision === 'excluded' ? 'restore' : 'excluded') : line.decision);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await admin.decision(list._id, line._id, { decision, reason: reason.trim() }); onClose(); onDone(); } catch (e) { say('Not changed', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible icon="create-outline" tone="amber" title={`${line.rank ? `${line.rank}. ` : ''}${line.studentName}`} subtitle={line.applicationNumber} onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind="primary" disabled={busy || !reason.trim() || (!lottery && decision === line.decision)} onPress={go}>{lottery ? (decision === 'excluded' ? 'Take out of the draw' : 'Put back into the draw') : 'Change'}</Btn></>}>
      {!lottery ? (
        <Field label="Decision">
          <Pick label="Decision" value={decision} onChange={setDecision} options={Object.entries(DECISION).map(([k, v]) => ({ value: k, label: v.label }))} />
        </Field>
      ) : null}
      <Field label="Reason" required hint="Kept on the line and in the application's history."><Box value={reason} onChange={setReason} multiline maxLength={300} /></Field>
      {!lottery ? <Muted>Changes made by hand survive a rebuild.</Muted> : null}
    </Sheet>
  );
}

/** The draw: once, with a phrase given out at the draw, in front of witnesses if the school likes. */
function DrawSheet({ list, pool, onClose, onDone }: { list: any; pool: number; onClose: () => void; onDone: () => void }) {
  const [phrase, setPhrase] = useState('');
  const [witnesses, setWitnesses] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r: any = await admin.drawList(list._id, { phrase: phrase.trim(), witnesses: witnesses.split(',').map((w) => w.trim()).filter(Boolean) });
      say('The draw is made', `${r?.data?.selected ?? ''} selected${r?.data?.waitlisted != null ? `, ${r.data.waitlisted} waiting` : ''}.`);
      onClose(); onDone();
    } catch (e) { say('No draw made', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible icon="shuffle-outline" tone="violet" title="Make the draw" subtitle={`${pool} in the pool. The order comes from a secret fixed when the list was made — its fingerprint is on the record — together with the phrase below. The draw is made once.`}
      onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind="primary" disabled={busy || phrase.trim().length < 4} onPress={go}>Make the draw</Btn></>}>
      <Field label="Draw phrase" required hint="Words or numbers given out loud at the draw — by the witnesses, say. Written on the public record.">
        <Box value={phrase} onChange={setPhrase} maxLength={120} placeholder="For example, Seventeen blue kites 4721" />
      </Field>
      <Field label="Witnesses" hint="Names, separated by commas — parents, a member of the managing committee">
        <Box value={witnesses} onChange={setWitnesses} maxLength={500} />
      </Field>
    </Sheet>
  );
}

function PublishSheet({ list, counts, onClose, onDone }: { list: any; counts: any; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const at = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time) ? new Date(`${date}T${time}:00`).toISOString() : undefined;
  const go = async () => {
    setBusy(true);
    try {
      const r: any = await admin.publishList(list._id, at);
      say(r?.data?.scheduled ? 'Will be published at the time set' : 'Published', r?.data?.scheduled ? '' : `${r?.data?.offered ?? 0} offer(s) made, ${r?.data?.waitlisted ?? 0} on the waiting list${r?.data?.noSeat ? `, ${r.data.noSeat} moved to waiting for want of seats` : ''}.`);
      onClose(); onDone();
    } catch (e) { say('Not published', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible icon="megaphone-outline" tone="green" title="Publish the list" subtitle={`${counts.selected || 0} selected get offers; ${counts.waitlisted || 0} go on the waiting list. Every family on the list is told.`}
      onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind="primary" disabled={busy || ((!!date || !!time) && !at)} onPress={go}>{at ? 'Publish then' : 'Publish now'}</Btn></>}>
      <Field label="Publish on (date)" hint="YYYY-MM-DD — leave both empty to publish now"><Box value={date} onChange={setDate} text="date" /></Field>
      <Field label="At (time)" hint="HH:MM, 24-hour"><Box value={time} onChange={setTime} text="time" /></Field>
    </Sheet>
  );
}

const st = StyleSheet.create({
  mono: { fontSize: 11, color: Colors.text, fontFamily: 'Courier', textAlign: 'right' },
});
