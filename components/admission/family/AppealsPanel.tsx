/**
 * Asking the school to look again (phone): a re-check of a published result,
 * or an appeal against a decision — and the school's answers. The windows,
 * the number allowed and the answer time are the school's, checked by the
 * server (school-backend services/admission/appeals.js).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { portal } from '@/api/admission.api';
import { confirmAsync } from '@/components/ui/kit';
import { Panel, Btn, Row, Note, Tag, Muted, Sheet, Field, Box, Pick, useApi, APPEAL_STATUS, APPEAL_KIND, fmtDate, errMsg, say, unwrapList } from '../parts';

export default function AppealsPanel({ appId, onChanged }: { appId: string; onChanged: () => void }) {
  const { data, reload } = useApi<any>(() => portal.appeals(appId), [appId]);
  const [asking, setAsking] = useState<'' | 'recheck' | 'decision'>('');
  if (!data?.options) return null;
  const o = data.options;
  const list = unwrapList(data.appeals);
  const can = o.enabled && o.left > 0 && (unwrapList(o.recheck).length || o.decision);
  if (!can && !list.length) return null;
  const withdraw = async (a: any) => {
    if (!(await confirmAsync(`Withdraw ${a.number}?`, 'The school stops looking at it.', 'Withdraw'))) return;
    try { await portal.withdrawAppeal(appId, a._id); reload(); onChanged(); } catch (e) { say('Not withdrawn', errMsg(e)); }
  };
  return (
    <Panel icon="shield-half-outline" tone="amber" title="Ask the school to look again">
      {o.note ? <Muted>{o.note}</Muted> : null}
      {can ? (
        <Row>
          {unwrapList(o.recheck).length ? <Btn icon="repeat-outline" onPress={() => setAsking('recheck')}>Ask for a re-check</Btn> : null}
          {o.decision ? <Btn icon="send-outline" onPress={() => setAsking('decision')}>{`Appeal: ${String(o.decision.label).toLowerCase()}`}</Btn> : null}
        </Row>
      ) : null}
      {list.map((a, i) => (
        <View key={a._id} style={[st.appeal, i === 0 && !o.note && !can && { borderTopWidth: 0, marginTop: 0, paddingTop: 0 }]}>
          <View style={st.top}>
            <Text style={st.num}>{a.number}</Text>
            <Tag map={APPEAL_STATUS} value={a.status} />
          </View>
          <Text style={st.kind}>{APPEAL_KIND[a.kind] || a.kind}{a.examName ? ` — ${a.examName}` : ''}</Text>
          <Muted>{`You wrote: “${a.reason}”`}</Muted>
          {a.decision ? <Note tone={a.status === 'upheld' ? 'green' : 'slate'} title={`The school's answer (${fmtDate(a.decidedAt)})`}>{a.decision}</Note>
            : ['open', 'in_review'].includes(a.status) ? (
              <Row>
                <Muted>The school answers by {fmtDate(a.dueAt)}.</Muted>
                {a.status === 'open' ? <Btn onPress={() => withdraw(a)}>Withdraw</Btn> : null}
              </Row>
            ) : null}
        </View>
      ))}
      {asking ? <AskSheet kind={asking} options={o} appId={appId} onClose={() => setAsking('')} onDone={() => { setAsking(''); reload(); onChanged(); }} /> : null}
    </Panel>
  );
}

function AskSheet({ kind, options, appId, onClose, onDone }: { kind: 'recheck' | 'decision'; options: any; appId: string; onClose: () => void; onDone: () => void }) {
  const exams = unwrapList(options.recheck);
  const [examId, setExamId] = useState(exams[0]?.examId || '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const until = kind === 'recheck' ? exams.find((x) => x.examId === examId)?.until : options.decision?.until;
  const go = async () => {
    setBusy(true);
    try {
      const r: any = await portal.fileAppeal(appId, { kind, examId: kind === 'recheck' ? examId : undefined, reason: reason.trim() });
      say('Sent', `Your number is ${r?.data?.number}. The school answers in writing.`);
      onDone();
    } catch (e) { say('Not sent', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible icon={kind === 'recheck' ? 'repeat-outline' : 'send-outline'} tone="amber" title={kind === 'recheck' ? 'Ask for a re-check' : 'Appeal the decision'} onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind="primary" disabled={busy || reason.trim().length < 10 || (kind === 'recheck' && !examId)} onPress={go}>Send</Btn></>}>
      {kind === 'recheck' ? (
        <Field label="Which result" required>
          <Pick label="Which result" value={examId} onChange={setExamId} options={exams.map((x) => ({ value: x.examId, label: x.name }))} />
        </Field>
      ) : <Note tone="indigo">{`You are asking the school to look again at its decision: ${options.decision.label}.`}</Note>}
      <Field label="Why" required hint={`Say what you think is wrong (at least a sentence). The school answers in writing within ${options.answerDays} days.`}>
        <Box value={reason} onChange={setReason} multiline maxLength={2000} />
      </Field>
      {until ? <Muted>This can be asked until {fmtDate(until)}.</Muted> : null}
    </Sheet>
  );
}

const st = StyleSheet.create({
  appeal: { gap: 5, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.divider, marginTop: 10 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  num: { fontSize: 13, fontWeight: '800', color: Colors.text },
  kind: { fontSize: 12.5, color: Colors.text },
});
