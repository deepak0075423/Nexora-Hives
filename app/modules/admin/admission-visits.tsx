/**
 * Campus visits, for the office on the phone (Oct 2026): whether families
 * book on the portal (and the rules), opening times — several days and times
 * at once — changing or cancelling a time (every family booked is emailed the
 * reason), who booked, and who came (school-backend services/admission/visits.js).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '@/constants/theme';
import { admin } from '@/api/admission.api';
import { useOffice, forgetOffice, AskSheet, Blocked, BLOCKED } from '@/components/admission/office/office';
import {
  Page, Tiles, Tile, Panel, Line, Pill, Btn, Row, Note, Muted, Sheet, Field, Box, Tick, Blank, BRAND,
  useApi, dayKey, fmtTime, fmtDateTime, fmtWeekday, errMsg, say, unwrapList,
} from '@/components/admission/parts';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BOOKING: Record<string, [string, any]> = { booked: ['Booked', 'green'], cancelled: ['Cancelled', 'slate'], attended: ['Came', 'indigo'], no_show: ['Did not come', 'amber'] };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function AdmissionVisitsOffice() {
  const { adm, reload: reloadOffice } = useOffice();
  const { data, loading, error, errorCode, reload } = useApi<any[]>(() => admin.visits({}), []);
  const [opening, setOpening] = useState(false);
  const [viewing, setViewing] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [cancelling, setCancelling] = useState<any>(null);
  const slots = unwrapList(data);
  const days = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const s of slots) { const k = dayKey(s.startsAt); if (!m.has(k)) m.set(k, []); m.get(k)!.push(s); }
    return [...m.values()];
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (BLOCKED.includes(errorCode)) return <Page title="Visits"><Blocked message={error} /></Page>;
  const upcoming = slots.filter((s) => new Date(s.startsAt) > new Date() && s.status === 'open');
  return (
    <Page title="Campus visits" loading={loading && !data} error={!data ? error : ''} onRetry={reload} onRefresh={reload}>
      {adm ? <VisitSettings v={adm.settings?.visits || {}} onSaved={() => { forgetOffice(); reloadOffice(); }} /> : null}
      <Tiles>
        <Tile icon="calendar-outline" tone="indigo" label="Upcoming times" value={String(upcoming.length)} />
        <Tile icon="people-outline" tone="green" label="People booked" value={String(upcoming.reduce((n, s) => n + Number(s.booked || 0), 0))} caption={`of ${upcoming.reduce((n, s) => n + Number(s.capacity || 0), 0)} places`} />
      </Tiles>
      <Btn kind="primary" block icon="add" onPress={() => setOpening(true)}>Open times</Btn>
      <View style={{ height: 12 }} />
      {days.length ? days.map((list) => (
        <Panel key={dayKey(list[0].startsAt)} icon="calendar-outline" tone="green" title={fmtWeekday(list[0].startsAt)}>
          {list.map((s, i) => {
            const past = new Date(s.startsAt) < new Date();
            return (
              <View key={s._id} style={[st.slot, i === list.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={st.slotTop}>
                  <Text style={st.time}>{fmtTime(s.startsAt)}</Text>
                  <View style={{ flex: 1 }}><Text style={st.title}>{s.title}</Text><Muted>{`${s.durationMinutes} min${s.location ? ` · ${s.location}` : ''}`}</Muted></View>
                  {s.status === 'cancelled' ? <Pill tone="slate">Cancelled</Pill> : past ? <Pill tone="slate">Past</Pill> : <Pill tone={s.booked >= s.capacity ? 'red' : 'green'}>{`${s.booked} / ${s.capacity}`}</Pill>}
                </View>
                <Row>
                  <Btn icon="people-outline" onPress={() => setViewing(s)}>Who booked</Btn>
                  {s.status === 'open' ? <Btn icon="create-outline" onPress={() => setEditing(s)}>Change</Btn> : null}
                  {s.status === 'open' && !past ? <Btn kind="danger" onPress={() => setCancelling(s)}>Cancel</Btn> : null}
                </Row>
              </View>
            );
          })}
        </Panel>
      )) : <Blank icon="calendar-outline" title="No visit times yet" body="Open a few times and switch bookings on — families see them on the portal under “Visit us”, and in the app." />}
      {opening ? <OpenSheet onClose={() => setOpening(false)} onDone={() => { setOpening(false); reload(); }} /> : null}
      {viewing ? <BookingsSheet slot={viewing} onClose={() => { setViewing(null); reload(); }} /> : null}
      {editing ? <EditSheet slot={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} /> : null}
      {cancelling ? (
        <AskSheet title={`Cancel the visit on ${fmtDateTime(cancelling.startsAt)}?`} message={`${cancelling.bookings || 0} booking(s) are cancelled and each family is emailed the reason.`}
          label="Reason (families are told)" confirm="Cancel the visit" danger onClose={() => setCancelling(null)}
          onConfirm={async (why) => { const r: any = await admin.cancelVisit(cancelling._id, why); say('Cancelled', `${r?.data?.cancelled ?? 0} family(ies) told.`); reload(); }} />
      ) : null}
    </Page>
  );
}

function VisitSettings({ v, onSaved }: { v: any; onSaved: () => void }) {
  const [f, setF] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const cur = f || { ...v, maxPeople: String(v.maxPeople ?? 4), cancelUntilHours: String(v.cancelUntilHours ?? 2), reminderHours: String(v.reminderHours ?? 24) };
  const set = (patch: any) => setF({ ...cur, ...patch });
  const save = async () => {
    setBusy(true);
    try {
      await admin.saveSettings({ visits: { enabled: !!cur.enabled, maxPeople: Number(cur.maxPeople) || 1, cancelUntilHours: Number(cur.cancelUntilHours) || 0, reminderHours: Number(cur.reminderHours) || 0, intro: String(cur.intro || '').trim() } });
      setF(null); say('Saved'); onSaved();
    } catch (e) { say('Not saved', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Panel icon="settings-outline" tone="slate" title="Booking on the portal" right={f ? <Btn kind="primary" disabled={busy} onPress={save}>Save</Btn> : undefined}>
      <Tick on={!!cur.enabled} onChange={(x) => set({ enabled: x })} label="Families can book visits — a “Visit us” page on the portal and in the app; booking needs a signed-in account" />
      <Row>
        <View style={st.third}><Field label="People per booking"><Box value={cur.maxPeople} onChange={(x) => set({ maxPeople: x })} text="digits" keyboardType="number-pad" /></Field></View>
        <View style={st.third}><Field label="Cancel until (hours before)"><Box value={cur.cancelUntilHours} onChange={(x) => set({ cancelUntilHours: x })} text="digits" keyboardType="number-pad" /></Field></View>
        <View style={st.third}><Field label="Reminder (hours before)" hint="0: none"><Box value={cur.reminderHours} onChange={(x) => set({ reminderHours: x })} text="digits" keyboardType="number-pad" /></Field></View>
      </Row>
      <Field label="A note on the visits page" hint="What a visit covers, what to bring"><Box value={cur.intro || ''} onChange={(x) => set({ intro: x })} multiline maxLength={600} text="sentence" /></Field>
    </Panel>
  );
}

/** Several days and times at once: each chosen day × each time. */
function OpenSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const today = iso(new Date());
  const [f, setF] = useState({ from: today, to: today, weekdays: [1, 2, 3, 4, 5, 6], times: '10:00, 14:00', title: 'Campus tour', durationMinutes: '60', capacity: '10', location: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (patch: any) => setF({ ...f, ...patch });
  const starts = useMemo(() => {
    const out: Date[] = [];
    const ok = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x);
    if (!ok(f.from) || !ok(f.to)) return out;
    const times = String(f.times).split(/[,\s]+/).filter((t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t));
    for (let d = new Date(`${f.from}T00:00:00`); d <= new Date(`${f.to}T00:00:00`) && out.length <= 200; d.setDate(d.getDate() + 1)) {
      if (!f.weekdays.includes(d.getDay())) continue;
      for (const t of times) { const [h, m] = t.split(':').map(Number); const at = new Date(d); at.setHours(h, m, 0, 0); if (at > new Date()) out.push(at); }
    }
    return out;
  }, [f]);
  const go = async () => {
    setBusy(true);
    try {
      const r: any = await admin.openVisits({ starts: starts.map((x) => x.toISOString()), title: f.title.trim(), durationMinutes: Number(f.durationMinutes), capacity: Number(f.capacity), location: f.location.trim(), notes: f.notes.trim() });
      say(`${unwrapList(r?.data).length} time(s) opened`); onDone();
    } catch (e) { say('Not opened', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible icon="calendar-outline" tone="green" title="Open visit times" onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind="primary" disabled={busy || !starts.length || starts.length > 200} onPress={go}>{`Open ${starts.length} time${starts.length === 1 ? '' : 's'}`}</Btn></>}>
      <Row>
        <View style={st.half}><Field label="From" hint="YYYY-MM-DD" required><Box value={f.from} onChange={(x) => set({ from: x })} text="date" /></Field></View>
        <View style={st.half}><Field label="To" hint="YYYY-MM-DD" required><Box value={f.to} onChange={(x) => set({ to: x })} text="date" /></Field></View>
      </Row>
      <Field label="On">
        <View style={st.days}>
          {WEEKDAYS.map((w, i) => {
            const on = f.weekdays.includes(i);
            return (
              <TouchableOpacity key={w} onPress={() => set({ weekdays: on ? f.weekdays.filter((x) => x !== i) : [...f.weekdays, i] })} style={[st.day, on && st.dayOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                <Text style={[st.dayText, on && { color: '#fff' }]}>{w}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Field>
      <Field label="Times" hint="24-hour, separated by commas — for example 10:00, 14:30"><Box value={f.times} onChange={(x) => set({ times: x })} text="any" /></Field>
      <Field label="Title"><Box value={f.title} onChange={(x) => set({ title: x })} maxLength={80} text="title" /></Field>
      <Row>
        <View style={st.half}><Field label="Minutes"><Box value={f.durationMinutes} onChange={(x) => set({ durationMinutes: x })} text="digits" keyboardType="number-pad" /></Field></View>
        <View style={st.half}><Field label="Places (people)"><Box value={f.capacity} onChange={(x) => set({ capacity: x })} text="digits" keyboardType="number-pad" /></Field></View>
      </Row>
      <Field label="Where to come"><Box value={f.location} onChange={(x) => set({ location: x })} maxLength={160} text="title" placeholder="Main gate, reception" /></Field>
      <Field label="Notes for families"><Box value={f.notes} onChange={(x) => set({ notes: x })} multiline maxLength={600} text="sentence" /></Field>
      <Note tone={starts.length > 200 ? 'red' : 'indigo'} icon="calendar-outline">
        {starts.length ? `${starts.length} time${starts.length === 1 ? '' : 's'}: ${starts.slice(0, 3).map((x) => fmtDateTime(x)).join('; ')}${starts.length > 3 ? '…' : ''}${starts.length > 200 ? ' — at most 200 at once.' : ''}` : 'No times — check the dates, days and times.'}
      </Note>
    </Sheet>
  );
}

function EditSheet({ slot, onClose, onDone }: { slot: any; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ title: slot.title, capacity: String(slot.capacity), durationMinutes: String(slot.durationMinutes), location: slot.location || '', notes: slot.notes || '' });
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await admin.updateVisit(slot._id, { ...f, capacity: Number(f.capacity), durationMinutes: Number(f.durationMinutes) }); onDone(); } catch (e) { say('Not saved', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible icon="create-outline" tone="green" title={`Visit on ${fmtDateTime(slot.startsAt)}`} onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind="primary" disabled={busy} onPress={go}>Save</Btn></>}>
      <Field label="Title"><Box value={f.title} onChange={(x) => setF({ ...f, title: x })} maxLength={80} text="title" /></Field>
      <Row>
        <View style={st.half}><Field label="Places (people)" hint={`${slot.booked} booked`}><Box value={f.capacity} onChange={(x) => setF({ ...f, capacity: x })} text="digits" keyboardType="number-pad" /></Field></View>
        <View style={st.half}><Field label="Minutes"><Box value={f.durationMinutes} onChange={(x) => setF({ ...f, durationMinutes: x })} text="digits" keyboardType="number-pad" /></Field></View>
      </Row>
      <Field label="Where to come"><Box value={f.location} onChange={(x) => setF({ ...f, location: x })} maxLength={160} text="title" /></Field>
      <Field label="Notes for families"><Box value={f.notes} onChange={(x) => setF({ ...f, notes: x })} multiline maxLength={600} text="sentence" /></Field>
    </Sheet>
  );
}

function BookingsSheet({ slot, onClose }: { slot: any; onClose: () => void }) {
  const { data, error, reload } = useApi<any>(() => admin.visitBookings(slot._id), [slot._id]);
  const mark = async (b: any, status: string) => {
    try { await admin.markVisit(b._id, status); reload(); } catch (e) { say('Not saved', errMsg(e)); }
  };
  const list = unwrapList(data?.bookings);
  return (
    <Sheet visible icon="people-outline" tone="green" title={`${slot.title} — ${fmtDateTime(slot.startsAt)}`} onClose={onClose} footer={<Btn block onPress={onClose}>Close</Btn>}>
      {error && !data ? <Note tone="red" icon="alert-circle-outline">{error}</Note> : !data ? <Muted>Loading…</Muted> : list.length ? list.map((b, i) => (
        <View key={b._id} style={[st.slot, i === list.length - 1 && { borderBottomWidth: 0 }]}>
          <Line last title={`${b.name || '—'} · ${b.people} ${b.people === 1 ? 'person' : 'people'}`} sub={`${b.email}${b.phone ? ` · ${b.phone}` : ''}${b.note ? `\n“${b.note}”` : ''}`}
            right={<Pill tone={BOOKING[b.status]?.[1] || 'slate'}>{`${BOOKING[b.status]?.[0] || b.status}${b.status === 'cancelled' && b.cancelledBy ? ` (${b.cancelledBy === 'school' ? 'school' : 'family'})` : ''}`}</Pill>} />
          {b.status !== 'cancelled' ? (
            <Row>
              <Btn kind={b.status === 'attended' ? 'primary' : 'ghost'} onPress={() => mark(b, b.status === 'attended' ? 'booked' : 'attended')}>Came</Btn>
              <Btn kind={b.status === 'no_show' ? 'stop' : 'ghost'} onPress={() => mark(b, b.status === 'no_show' ? 'booked' : 'no_show')}>Did not come</Btn>
            </Row>
          ) : null}
        </View>
      )) : <Muted>Nobody has booked yet.</Muted>}
    </Sheet>
  );
}

const st = StyleSheet.create({
  half: { flex: 1, minWidth: 130 },
  third: { flex: 1, minWidth: 96 },
  slot: { gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  slotTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  time: { width: 70, fontSize: 14, fontWeight: '800', color: Colors.text },
  title: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  day: { paddingVertical: 8, paddingHorizontal: 11, borderRadius: 9, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#fff' },
  dayOn: { backgroundColor: BRAND, borderColor: BRAND },
  dayText: { fontSize: 12.5, fontWeight: '700', color: Colors.text },
});
