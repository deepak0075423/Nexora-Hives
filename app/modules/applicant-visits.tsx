/**
 * Campus visits, for a signed-in applicant family on the phone (Oct 2026):
 * the school's open times with the places left, booking one for so many
 * people, cancelling up to the school's limit, and a calendar entry. Room is
 * counted by the server (school-backend services/admission/visits.js) — a full
 * time is refused there, whatever this screen showed a moment ago.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { portal } from '@/api/admission.api';
import { confirmAsync } from '@/components/ui/kit';
import { openAdmissionFile } from '@/components/admission/files';
import {
  Page, Head, Panel, Note, Btn, Row, Tag, Muted, Sheet, Field, Box, Pick, Line, Blank, TimeGrid, VISIT_STATUS,
  useApi, fmtDateTime, errMsg, say, unwrapList,
} from '@/components/admission/parts';
import ConsentRequired from '@/components/admission/family/ConsentGate';

function ApplicantVisitsScreenBody() {
  const { data, loading, error, reload } = useApi<any>(() => portal.visits(), []);
  const [booking, setBooking] = useState<any>(null);
  const mine = unwrapList(data?.mine);
  const booked = new Set(mine.filter((b) => b.status === 'booked').map((b) => String(b.slotId)));
  const slots = unwrapList(data?.slots);

  const cancel = async (b: any) => {
    if (!(await confirmAsync('Cancel this visit?', fmtDateTime(b.startsAt), 'Cancel the visit'))) return;
    try { await portal.cancelVisit(b._id); reload(); } catch (e) { say('Not cancelled', errMsg(e)); }
  };
  const calendar = (b: any) => openAdmissionFile(portal.visitCalUrl(b._id), 'school-visit.ics').catch((e) => say('Could not open it', errMsg(e)));

  return (
    <Page title="Visit the school" loading={loading && !data} error={!data ? error : ''} onRetry={reload} onRefresh={reload}>
      {data ? (
        <>
          <Head title="Visit the school" subtitle={data.intro || 'See the school for yourself — book a time that suits you.'} />
          {!data.enabled ? <Note tone="slate">The school is not taking visit bookings online just now. Please contact the admission office.</Note> : null}
          {mine.length ? (
            <Panel icon="calendar-outline" tone="green" title="Your visits">
              {mine.map((b, i) => (
                <View key={b._id} style={{ gap: 6, paddingBottom: 10, marginBottom: i === mine.length - 1 ? 0 : 10, borderBottomWidth: i === mine.length - 1 ? 0 : 1, borderBottomColor: '#F0EBF8' }}>
                  <Line last title={b.title} right={<Tag map={VISIT_STATUS} value={b.status} />}
                    sub={`${fmtDateTime(b.startsAt)} · ${b.people} ${b.people === 1 ? 'person' : 'people'}${b.location ? ` · ${b.location}` : ''}${b.status === 'cancelled' && b.cancelledBy === 'school' ? ` — cancelled by the school${b.cancelReason ? `: ${b.cancelReason}` : ''}` : ''}`} />
                  {b.status === 'booked' ? (
                    <Row>
                      <Btn icon="calendar-number-outline" onPress={() => calendar(b)}>Add to calendar</Btn>
                      {b.canCancel ? <Btn kind="danger" onPress={() => cancel(b)}>Cancel</Btn> : <Muted>Call the office to cancel</Muted>}
                    </Row>
                  ) : null}
                </View>
              ))}
            </Panel>
          ) : null}
          {data.enabled ? (
            <Panel icon="time-outline" title="Open times" subtitle={`Up to ${data.maxPeople} people per booking. Cancel up to ${data.cancelUntilHours} hours before.`}>
              {slots.length ? (
                <TimeGrid items={slots} keyOf={(s: any) => String(s._id)} onPick={(s: any) => setBooking(s)} mine={(s: any) => booked.has(String(s._id))}
                  disabled={(s: any) => s.left <= 0 || booked.has(String(s._id))}
                  caption={(s: any) => `${booked.has(String(s._id)) ? 'Booked' : s.left <= 0 ? 'Full' : `${s.left} place${s.left === 1 ? '' : 's'}`} · ${s.title}`} />
              ) : <Blank icon="calendar-outline" title="No visit times are open just now" body="Please check again soon, or contact the admission office." />}
            </Panel>
          ) : null}
          {booking ? <BookSheet slot={booking} max={data.maxPeople} onClose={() => setBooking(null)} onDone={() => { setBooking(null); reload(); }} /> : null}
        </>
      ) : null}
    </Page>
  );
}

function BookSheet({ slot, max, onClose, onDone }: { slot: any; max: number; onClose: () => void; onDone: () => void }) {
  const [people, setPeople] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const most = Math.max(1, Math.min(Number(max) || 1, Number(slot.left) || 1));
  const go = async () => {
    setBusy(true);
    try { await portal.bookVisit(String(slot._id), { people: Number(people), note: note.trim() }); say('Visit booked', 'We have emailed you the details.'); onDone(); }
    catch (e) { say('Not booked', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible icon="calendar-outline" tone="green" title={`Book: ${slot.title}`} subtitle={`${fmtDateTime(slot.startsAt)} · ${slot.durationMinutes} minutes${slot.location ? ` · ${slot.location}` : ''}`}
      onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind="primary" disabled={busy} onPress={go}>Book the visit</Btn></>}>
      {slot.notes ? <Note tone="slate">{slot.notes}</Note> : null}
      <Field label="How many people are coming" required>
        <Pick label="How many people" value={people} onChange={setPeople} options={Array.from({ length: most }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
      </Field>
      <Field label="Anything the school should know" hint="Optional — a question, or help you need on the day">
        <Box value={note} onChange={setNote} multiline maxLength={300} />
      </Field>
    </Sheet>
  );
}

export default function ApplicantVisitsScreen() {
  return <ConsentRequired><ApplicantVisitsScreenBody /></ConsentRequired>;
}
