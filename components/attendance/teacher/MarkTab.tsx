/**
 * Teacher → Attendance → Mark Students, on the phone.
 *
 * One register at a time: a section on a day — and, in a subject-wise school,
 * one subject. Marks are edited in place and saved together, and only the rows
 * that changed are sent: the old phone screen sent every student, with anyone
 * left unmarked as "absent", which told those families their child was absent.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as teacherApi from '@/api/teacher.api';
import {
  BRAND, MUTE, TEXT, LINE, MARKS, statusOf, Card, Tiles, Tile, Chips, Btn, Callout, Blank, Loading, Avatar,
  MonthGrid, MonthNav, Legend, StatusPill, addDays, addMonths, fmtDay, longDay, monthLabel, todayKey, plural, errText, fmtStamp,
} from '../parts';

const unwrap = (res: any) => res?.data ?? res;
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '0%');
const SHORT: Record<string, string> = { present: 'Present', absent: 'Absent', late: 'Late', 'half-day': 'Half-Day' };

export default function MarkTab({ initialSection = '', refreshKey, onBlocked, flash }: {
  initialSection?: string; refreshKey: number; onBlocked: (e: any) => boolean;
  flash: { good: (t: string) => void; bad: (t: string) => void };
}) {
  const today = todayKey();
  const [section, setSection] = useState(initialSection);
  const [subject, setSubject] = useState('');
  const [date, setDate] = useState(today);
  const [reg, setReg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);
  const [showCal, setShowCal] = useState(false);
  const [calMonth, setCalMonth] = useState(today.slice(0, 7));
  const [cal, setCal] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    teacherApi.getAttendance({ section: section || undefined, subject: subject || undefined, date })
      .then((res: any) => {
        if (!live) return;
        const d = unwrap(res);
        setReg(d);
        if (d?.refused) flash.bad(d.refused);
        if (d?.section?._id && String(d.section._id) !== section) setSection(String(d.section._id));
        if (d?.subject?._id && String(d.subject._id) !== subject) setSubject(String(d.subject._id));
      })
      .catch((e) => { if (live && !onBlocked(e)) flash.bad(errText(e)); })
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [section, subject, date, version, refreshKey]);

  // A different register starts clean.
  useEffect(() => { setMarks({}); setNotes({}); setNoteOpen(null); }, [section, subject, date]);
  useEffect(() => { setCalMonth(date.slice(0, 7)); }, [date]);

  useEffect(() => {
    if (!section || !showCal) return undefined;
    let live = true;
    teacherApi.getAttendanceCalendar({ section, subject: subject || undefined, month: calMonth })
      .then((res: any) => live && setCal(unwrap(res))).catch(() => live && setCal(null));
    return () => { live = false; };
  }, [section, subject, calMonth, showCal, version, refreshKey]);

  useEffect(() => {
    teacherApi.getRecentRegisters({ limit: 3 }).then((res: any) => {
      const d = unwrap(res); setRecent(Array.isArray(d) ? d : []);
    }).catch(() => setRecent([]));
  }, [version, refreshKey]);

  const mode = reg?.mode || 'day';
  const students: any[] = reg?.students || [];
  const sections: any[] = reg?.sections || [];
  const saved = useMemo(() => Object.fromEntries((reg?.records || []).map((r: any) => [String(r.student), r])), [reg]);
  const current = (s: any) => marks[s._id] ?? saved[s._id]?.status ?? null;
  const remarkOf = (s: any) => notes[s._id] ?? saved[s._id]?.remarks ?? '';

  const counts = useMemo(() => {
    const c: Record<string, number> = { present: 0, absent: 0, late: 0, 'half-day': 0, unmarked: 0 };
    students.forEach((s) => { c[current(s) || 'unmarked'] += 1; });
    return c;
  }, [students, marks, saved]);

  const changes = students.filter((s) => {
    const was = saved[s._id]; const now = current(s);
    if (!now) return false;
    return now !== was?.status || (notes[s._id] !== undefined && notes[s._id] !== (was?.remarks || ''));
  });

  const locked = !!reg?.future || !reg?.section || (mode === 'subject' && !reg?.subject);
  const q = query.trim().toLowerCase();
  const rows = q ? students.filter((s) => s.name.toLowerCase().includes(q) || String(s.rollNumber).toLowerCase().includes(q)) : students;

  const setMark = (id: string, st: string) => { if (!locked) setMarks((m) => ({ ...m, [id]: st })); };
  const markAll = (st: string, onlyUnmarked = false) => {
    if (locked) return;
    setMarks((m) => {
      const n = { ...m };
      students.forEach((s) => { if (!onlyUnmarked || !current(s)) n[s._id] = st; });
      return n;
    });
  };

  const save = async () => {
    if (!changes.length) { flash.bad('Nothing new to save'); return; }
    setSaving(true);
    try {
      await teacherApi.markAttendance({
        date, section, subject: subject || undefined,
        records: changes.map((s) => ({ studentId: s._id, status: current(s), remarks: remarkOf(s) })),
      });
      const left = students.filter((s) => !current(s)).length;
      flash.good(`${plural(changes.length, 'mark')} saved${left ? ` · ${plural(left, 'student')} still not marked` : ''}`);
      setVersion((x) => x + 1);
    } catch (e) { flash.bad(errText(e)); }
    finally { setSaving(false); }
  };

  /** Fill the students nobody has marked from the last register before this day. */
  const copyLast = async () => {
    try {
      let from = '';
      for (let i = 0; i < 2 && !from; i++) {
        const res: any = await teacherApi.getAttendanceCalendar({ section, subject: subject || undefined, month: addMonths(date.slice(0, 7), -i) });
        from = (unwrap(res)?.days || []).filter((d: any) => d.key < date && d.total).map((d: any) => d.key).sort().pop() || '';
      }
      if (!from) { flash.bad('No earlier register to copy from'); return; }
      const prev = unwrap(await teacherApi.getAttendance({ section, subject: subject || undefined, date: from }));
      const by = Object.fromEntries((prev?.records || []).map((r: any) => [String(r.student), r.status]));
      const fill = students.filter((s) => !current(s) && by[s._id]);
      if (!fill.length) { flash.bad(`Everyone is already marked — nothing to copy from ${fmtDay(from)}`); return; }
      setMarks((m) => { const n = { ...m }; fill.forEach((s) => { n[s._id] = by[s._id]; }); return n; });
      flash.good(`${plural(fill.length, 'mark')} copied from ${fmtDay(from)} — review and save`);
    } catch (e) { flash.bad(errText(e)); }
  };

  if (loading && !reg) return <Loading />;

  if (!sections.length) {
    return (
      <Card>
        <Blank icon="people-outline" title="No register to mark"
          body={mode === 'subject'
            ? 'You are not the class teacher, vice class teacher or a subject teacher of any section this year.'
            : 'You are not the class teacher or vice class teacher of any section, so there is no register to mark.'} />
      </Card>
    );
  }

  const calDays = (cal?.days || []).map((d: any) => ({
    key: d.key, state: d.state,
    tag: d.total ? `${d.percentage}%` : undefined,
  }));

  return (
    <View style={loading ? { opacity: 0.6 } : null}>
      {sections.length > 1 ? (
        <View style={{ marginBottom: 10 }}>
          <Chips label="Section" value={section} onChange={(id) => { setSection(id); setSubject(''); }}
            options={sections.map((x) => ({ value: String(x._id), label: `${x.label}${x.roleLabel ? ` · ${x.roleLabel}` : ''}` }))} />
        </View>
      ) : null}
      {mode === 'subject' && (reg?.subjects || []).length ? (
        <View style={{ marginBottom: 10 }}>
          <Chips label="Subject" value={subject} onChange={setSubject}
            options={reg.subjects.map((x: any) => ({ value: String(x._id), label: x.name }))} />
        </View>
      ) : null}

      <Card>
        <View style={m.dateBar}>
          <TouchableOpacity style={m.iconBtn} onPress={() => setDate(addDays(date, -1))} accessibilityLabel="Previous day">
            <Ionicons name="chevron-back" size={18} color={TEXT} />
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, alignItems: 'center' }} onPress={() => setShowCal((x) => !x)} accessibilityLabel="Pick a day">
            <Text style={m.dateText}>{longDay(date)}</Text>
            <Text style={m.dateSub}>{reg?.section?.label || ''}{reg?.subject ? ` · ${reg.subject.name}` : mode === 'day' ? ' · Day register' : ''}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[m.iconBtn, date >= today && { opacity: 0.35 }]} disabled={date >= today}
            onPress={() => setDate(addDays(date, 1))} accessibilityLabel="Next day">
            <Ionicons name="chevron-forward" size={18} color={TEXT} />
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Btn small flex label={showCal ? 'Hide calendar' : 'Calendar'} icon="calendar-outline" onPress={() => setShowCal((x) => !x)} />
          <Btn small flex label="Today" icon="today-outline" disabled={date === today} onPress={() => setDate(today)} />
        </View>
        {showCal ? (
          <View style={{ marginTop: 12 }}>
            <MonthNav label={monthLabel(calMonth)} onPrev={() => setCalMonth(addMonths(calMonth, -1))}
              onNext={() => setCalMonth(addMonths(calMonth, 1))} nextDisabled={calMonth >= today.slice(0, 7)} />
            <MonthGrid days={calDays} selected={date} onSelect={(k) => { setDate(k); setShowCal(false); }} />
            <Legend codes={false} keys={['present', 'absent', 'late', 'half-day', 'unmarked']}
              labels={{ present: 'All present', absent: 'Some absent', late: 'Some late', 'half-day': 'Some half day', unmarked: 'Not taken' }} />
          </View>
        ) : null}
        {reg?.session ? (
          <Text style={[m.muted, { marginTop: 10 }]}>Taken{reg.session.createdBy ? ` by ${reg.session.createdBy}` : ''}{reg.session.createdAt ? ` · ${fmtStamp(reg.session.createdAt)}` : ''}</Text>
        ) : null}
      </Card>

      {reg?.dayOff ? <Callout tone="warn" title={reg.dayOff.status === 'holiday' ? `Holiday — ${reg.dayOff.label || 'no school'}` : 'A weekly off'} body="A register can still be taken if the school was open." /> : null}
      {reg?.future ? <Callout tone="info" body="Attendance cannot be marked for a future day." /> : null}
      {mode === 'subject' && !reg?.subject ? <Callout tone="warn" body="No subject is linked to this section yet, so there is no register to take." /> : null}

      <Tiles>
        <Tile icon="people-outline" tone="indigo" value={students.length} label="Students" note={!students.length ? undefined : counts.unmarked ? `${counts.unmarked} left` : 'All marked'} noteTone={counts.unmarked ? 'amber' : 'green'} />
        <Tile icon="shield-checkmark" solid tone="green" value={counts.present} label="Present" note={pct(counts.present, students.length)} />
        <Tile icon="person-remove-outline" tone="red" value={counts.absent} label="Absent" note={pct(counts.absent, students.length)} />
        <Tile icon="speedometer-outline" tone="amber" value={counts.late + counts['half-day']} label="Late / Half-Day" note={`${counts.late} / ${counts['half-day']}`} />
      </Tiles>

      {students.length === 0 ? (
        <Card><Blank icon="people-outline" title="No students in this section" /></Card>
      ) : (
        <Card title="Students" sub={changes.length ? `${plural(changes.length, 'unsaved change')}` : 'Tap a mark for each student'} icon="list" flush>
          <View style={{ paddingHorizontal: 14, gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn small flex label="All Present" icon="checkmark-done" disabled={locked} onPress={() => markAll('present')} />
              <Btn small flex label="Rest Present" icon="checkmark" disabled={locked || !counts.unmarked} onPress={() => markAll('present', true)} />
            </View>
            <Btn small label="Copy last register to unmarked" icon="copy-outline" disabled={locked || !counts.unmarked} onPress={copyLast} />
            <View style={m.search}>
              <Ionicons name="search" size={16} color={MUTE} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Search by name or roll number" placeholderTextColor="#94A3B8"
                style={m.searchInput} accessibilityLabel="Search students" />
            </View>
          </View>
          {rows.map((s, i) => {
            const now = current(s);
            const dirty = changes.includes(s);
            return (
              <View key={s._id} style={[m.row, i === 0 && { marginTop: 10 }, i > 0 && m.rowLine]}>
                <View style={m.who}>
                  <Avatar name={s.name} size={34} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={m.name} numberOfLines={1}>{s.name}</Text>
                    <Text style={m.muted}>Roll {s.rollNumber || '—'}{dirty ? ' · unsaved' : saved[s._id] ? ` · saved ${statusOf(saved[s._id].status).label.toLowerCase()}` : ' · not marked'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setNoteOpen(noteOpen === s._id ? null : s._id)} hitSlop={8} accessibilityLabel={`Remark for ${s.name}`}>
                    <Ionicons name={remarkOf(s) ? 'chatbubble-ellipses' : 'chatbubble-outline'} size={18} color={remarkOf(s) ? BRAND : MUTE} />
                  </TouchableOpacity>
                </View>
                <View style={m.marks}>
                  {MARKS.map((opt) => {
                    const st = statusOf(opt); const on = now === opt;
                    return (
                      <TouchableOpacity key={opt} disabled={locked} onPress={() => setMark(s._id, opt)}
                        accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${s.name} ${SHORT[opt]}`}
                        style={[m.mark, on && { backgroundColor: st.bg, borderColor: st.dot }]}>
                        <View style={[m.ring, { borderColor: st.dot }, on && { backgroundColor: st.dot }]} />
                        <Text style={[m.markText, on && { color: st.fg, fontWeight: '700' }]} numberOfLines={1}>{SHORT[opt]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {noteOpen === s._id ? (
                  <TextInput value={remarkOf(s)} onChangeText={(t) => setNotes((n) => ({ ...n, [s._id]: t }))} maxLength={300}
                    placeholder="Remark (optional) — e.g. came at 9:20" placeholderTextColor="#94A3B8" style={m.note} accessibilityLabel={`Remark for ${s.name}`} />
                ) : null}
              </View>
            );
          })}
          <View style={m.saveBar}>
            <Btn label={changes.length ? `Save ${plural(changes.length, 'change')}` : 'Saved'} icon="save-outline" kind="primary"
              busy={saving} disabled={locked || !changes.length} onPress={save} />
          </View>
        </Card>
      )}

      <Card title="Recent Registers" icon="time-outline">
        {recent.length === 0 ? <Text style={m.muted}>No registers taken yet.</Text> : recent.map((r, i) => (
          <TouchableOpacity key={r._id} style={[m.recent, i > 0 && m.rowLine]}
            onPress={() => { setSection(String(r.section._id)); setSubject(r.subject?._id ? String(r.subject._id) : ''); setDate(r.date); }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={m.name} numberOfLines={1}>{r.section.label}</Text>
              <Text style={m.muted}>{fmtDay(r.date)} · {r.caption}</Text>
            </View>
            <StatusPill status={r.percentage >= 80 ? 'present' : r.percentage >= 60 ? 'late' : 'absent'} label={`${r.percentage ?? 0}%`} small />
          </TouchableOpacity>
        ))}
      </Card>
    </View>
  );
}

const m = StyleSheet.create({
  muted: { fontSize: 12, color: MUTE },
  dateBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 9, borderWidth: 1, borderColor: LINE, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  dateText: { fontSize: 14.5, fontWeight: '700', color: TEXT },
  dateSub: { fontSize: 11.5, color: MUTE, marginTop: 1 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 11, borderRadius: 9, borderWidth: 1, borderColor: LINE },
  searchInput: { flex: 1, fontSize: 13.5, color: TEXT },
  row: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  rowLine: { borderTopWidth: 1, borderTopColor: '#F1F3F7' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 13.5, fontWeight: '600', color: TEXT },
  marks: { flexDirection: 'row', gap: 6 },
  mark: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 32, borderRadius: 7, borderWidth: 1, borderColor: '#E2E5EC', backgroundColor: '#fff', paddingHorizontal: 2 },
  ring: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  markText: { fontSize: 11, color: '#334155' },
  note: { borderWidth: 1, borderColor: '#DDE1EA', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: TEXT },
  saveBar: { padding: 14, borderTopWidth: 1, borderTopColor: '#F1F3F7' },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
});
