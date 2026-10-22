/**
 * Exams and interviews on a family's application (phone): when and where, the
 * time the family chooses (or changes) where the school lets them, the admit
 * card and calendar entry, and the published result. An online exam runs on
 * the school's portal — its clock, sections and answers live there.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { portal } from '@/api/admission.api';
import { openAdmissionFile } from '../files';
import {
  Panel, Pill, Facts, Fact, Btn, Row, Note, Sheet, TimeGrid, Muted, useApi, EXAM_MODE, fmtDate, fmtDateTime, errMsg, say,
} from '../parts';

export default function ExamsPanel({ appId, exams, onChanged, openPortal }: {
  appId: string; exams: any[]; onChanged: () => void; openPortal: () => void;
}) {
  const [picking, setPicking] = useState<any>(null);
  if (!exams?.length) return null;
  const file = (url: string, name: string) => openAdmissionFile(url, name).catch((e) => say('Could not open it', errMsg(e)));
  return (
    <Panel icon="document-text-outline" tone="indigo" title="Exams and interviews">
      {exams.map((x, i) => {
        const upcoming = x.mode !== 'online' && !x.needsTime && !x.result && new Date(x.startsAt) > new Date();
        return (
          <View key={x.examId} style={[st.exam, i === exams.length - 1 && { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>
            <View style={st.top}>
              <Text style={st.name}>{x.name}</Text>
              <Pill tone="indigo">{EXAM_MODE[x.mode] || x.mode}</Pill>
            </View>
            <Text style={st.when}>
              {x.needsTime ? 'Time not chosen yet' : fmtDateTime(x.startsAt)}{x.mode === 'online' && x.endsAt ? ` – ${fmtDateTime(x.endsAt)}` : ''}{x.rollNumber ? ` · Roll ${x.rollNumber}` : ''}
            </Text>
            {x.mode !== 'online' && (x.venue?.name || x.venue?.address || x.room) ? (
              <Muted>{[x.venue?.name, x.room, x.venue?.address].filter(Boolean).join(', ')}{x.reportingTime ? ` · report by ${x.reportingTime}` : ''}</Muted>
            ) : null}
            {x.requiredItems ? <Muted>Bring: {x.requiredItems}</Muted> : null}

            {x.needsTime && x.booking?.canChoose ? <Note tone="amber" icon="calendar-outline">Choose the time that suits you. The admit card is ready once you have.</Note>
              : x.needsTime ? <Note tone="slate">No time can be booked here just now — please call the admission office.</Note> : null}
            {x.online?.submitted ? <Note tone="green" icon="checkmark-circle-outline">Submitted. The result appears here when the school publishes it.</Note> : null}
            {x.online && !x.online.canStart && !x.online.submitted && !x.online.inProgress ? (
              <Muted>The exam opens on {fmtDateTime(x.online.opensAt)} and must be finished by {fmtDateTime(x.online.closesAt)} ({x.durationMinutes} minutes once started).</Muted>
            ) : null}
            {x.online?.canStart || x.online?.inProgress ? (
              <Note tone="indigo" icon="desktop-outline">The exam runs on the school’s admission portal, with its clock and sections — sign in there with the same email and password.</Note>
            ) : null}

            {x.result ? (
              <Facts>
                <Fact k="Result" v={x.result.absent ? 'Absent' : x.result.passed ? 'Qualified' : x.result.passed === false ? 'Not qualified' : '—'} />
                <Fact k="Score" v={x.result.total == null ? '—' : `${x.result.total} / ${x.result.maxMarks}`} />
                {x.result.percentage != null ? <Fact k="Percentage" v={`${x.result.percentage}%`} /> : null}
                {x.result.grade ? <Fact k="Grade" v={x.result.grade} /> : null}
              </Facts>
            ) : null}

            <Row>
              {x.needsTime && x.booking?.canChoose ? <Btn kind="primary" icon="calendar-outline" onPress={() => setPicking(x)}>Choose a time</Btn> : null}
              {x.booking?.mine && x.booking.canChoose ? <Btn icon="repeat-outline" onPress={() => setPicking(x)}>Change the time</Btn> : null}
              {x.online?.inProgress ? <Btn kind="primary" icon="open-outline" onPress={openPortal}>Carry on, on the portal</Btn>
                : x.online?.canStart ? <Btn kind="primary" icon="open-outline" onPress={openPortal}>Take the exam on the portal</Btn> : null}
              {x.admitCard ? <Btn icon="id-card-outline" onPress={() => file(portal.admitUrl(appId, x.examId), `admit-card-${x.rollNumber || x.examId}.pdf`)}>Admit card</Btn>
                : x.admitCardFrom && !x.result ? <Pill tone="slate">Admit card from {fmtDate(x.admitCardFrom)}</Pill> : null}
              {upcoming ? <Btn icon="calendar-number-outline" onPress={() => file(portal.examCalUrl(appId, x.examId), `${String(x.name).replace(/[^A-Za-z0-9]+/g, '-')}.ics`)}>Add to calendar</Btn> : null}
              {x.result ? <Btn icon="ribbon-outline" onPress={() => file(portal.scoreUrl(appId, x.examId), 'scorecard.pdf')}>Scorecard</Btn> : null}
            </Row>
          </View>
        );
      })}
      {picking ? <SlotSheet appId={appId} exam={picking} onClose={() => setPicking(null)} onDone={() => { setPicking(null); onChanged(); }} /> : null}
    </Panel>
  );
}

/**
 * Choosing (or moving) an exam or interview time from the ones the school
 * published (school-backend services/admission/slots.js). The server holds the
 * rules — room left, how late a time may change, how many changes.
 */
function SlotSheet({ appId, exam, onClose, onDone }: { appId: string; exam: any; onClose: () => void; onDone: () => void }) {
  const { data, loading, error, reload } = useApi<any>(() => portal.examSlots(appId, exam.examId), [appId, exam.examId]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = data?.mine;
  const go = async () => {
    setBusy(true);
    try { await portal.chooseSlot(appId, exam.examId, pick); say('Time booked', 'The admit card and a calendar entry are on the application.'); onDone(); }
    catch (e) { say('Not booked', errMsg(e)); reload(); } finally { setBusy(false); }
  };
  return (
    <Sheet visible icon="calendar-outline" tone="indigo" title={`${mine ? 'Change the time' : 'Choose a time'} — ${exam.name}`} onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind="primary" disabled={busy || !pick || pick === mine?.id || !data?.canChoose} onPress={go}>{mine ? 'Move to this time' : 'Book this time'}</Btn></>}>
      {loading && !data ? <Muted>Loading the times…</Muted> : error && !data ? <Note tone="red" icon="alert-circle-outline">{error}</Note> : data ? (
        <View style={{ gap: 10 }}>
          {mine ? <Note tone="indigo" icon="calendar-outline">{`Booked now: ${fmtDateTime(mine.startsAt)}${mine.room ? `, ${mine.room}` : ''}.${data.changesLeft != null ? ` You can change it ${data.changesLeft} more time${data.changesLeft === 1 ? '' : 's'}.` : ''}`}</Note> : null}
          {!data.canChoose ? <Note tone="amber">The time can no longer be changed here — please call the admission office.</Note> : null}
          {data.changeUntilHours ? <Muted>Times can be booked or changed up to {data.changeUntilHours} hours before they start.</Muted> : null}
          {(data.slots || []).length ? (
            <TimeGrid items={data.slots} keyOf={(x: any) => x.id} picked={pick} onPick={(x: any) => setPick(x.id)} mine={(x: any) => x.id === mine?.id}
              disabled={(x: any) => !data.canChoose || (x.left <= 0 && x.id !== mine?.id)}
              caption={(x: any) => `${x.id === mine?.id ? 'Yours' : x.left <= 0 ? 'Full' : `${x.left} left`}${x.room ? ` · ${x.room}` : ''}`} />
          ) : <Note tone="slate">No times are open just now — the school will add more, or call the admission office.</Note>}
        </View>
      ) : null}
    </Sheet>
  );
}

const st = StyleSheet.create({
  exam: { paddingBottom: 12, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: 6 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.text },
  when: { fontSize: 12.5, color: Colors.text },
});
