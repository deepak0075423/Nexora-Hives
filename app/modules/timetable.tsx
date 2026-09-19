/**
 * Timetable — the screen students, parents and teachers open.
 *
 * One screen, three roles, because it is one object: a week of periods. What
 * differs is which endpoint fills it and what belongs in a cell —
 *   student  the subject and who teaches it
 *   parent   the same, for ONE chosen child
 *   teacher  the subject and which class they take it with
 *
 * The parent case did not exist here at all: this screen used to send anyone who
 * was not a teacher to /student/timetable, so a parent got an empty week or a
 * 403. There is now a per-child endpoint and a child switch.
 *
 * A phone leads with the day, not the week: "what have I got now" is the
 * question, and the week is a strip you swipe when you want to plan.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as studentApi from '@/api/student.api';
import * as teacherApi from '@/api/teacher.api';
import * as parentApi from '@/api/parent.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  Card, SectionTitle, StatTile, StatRow, SegTabs, LoaderView, Empty,
  MODULE_BLOCKED_CODES, unwrap,
} from '@/components/ui/kit';
import {
  NowNext, DayStrip, DayList, WeekStrip, SubjectList, CoverList, ChildSwitch,
  DAYS, coverIndex, isTeachingPeriod, todayName, weekShape, plural, type Cell,
} from '@/components/timetable/viewKit';

export default function TimetableScreen() {
  const { user } = useAuth();
  const role = user?.role;

  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [view, setView]         = useState<'day' | 'week'>('day');
  const [day, setDay]           = useState<string>(() => todayName());
  const [childId, setChildId]   = useState<string>('');

  const load = useCallback(async () => {
    try {
      const res: any = role === 'teacher'
        ? await teacherApi.getTimetable()
        : role === 'parent'
          ? await parentApi.getTimetable(childId ? { child: childId } : {})
          : await studentApi.getTimetable();
      const d = unwrap(res) ?? null;
      setData(d);
      // The server picks a child when we name none; keep its answer so every
      // later read asks for the same one.
      if (role === 'parent' && d?.child?._id && !childId) setChildId(String(d.child._id));
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefresh(false); }
  }, [role, childId]);

  // Wait for the user record — firing before the role is known would hit the
  // wrong role's endpoint entirely.
  useEffect(() => { if (role) load(); }, [role, load]);

  const onRefresh = () => { setRefresh(true); load(); };
  const pickChild = (id: string) => { setChildId(id); setLoading(true); };

  /* ── What the payload gives us, whichever role asked ─────────────────── */
  const entries: any[] = useMemo(() => (Array.isArray(data?.entries) ? data.entries : []), [data]);
  const days: string[] = Array.isArray(data?.days) && data.days.length ? data.days : DAYS.slice(0, 5);
  // On a day the school is shut (a weekend) `day` names a day the strip has no
  // chip for, and the list drew every slot as a free period. Open on the next
  // school day instead — Saturday evening is when people check Monday.
  const shownDay = days.includes(day) ? day
    : [1, 2, 3, 4, 5, 6, 7].map((k) => DAYS[(DAYS.indexOf(day) + k) % 7]).find((d) => days.includes(d)) || days[0];
  const periods: any[] = useMemo(() => (data?.periodsStructure?.length
    ? data.periodsStructure
    : (data?.timetable?.periodsStructure ?? [])), [data]);

  const covers   = useMemo(() => coverIndex(data?.covers), [data]);
  const duties   = useMemo(() => coverIndex(data?.coverDuties), [data]);
  const handed   = useMemo(() => coverIndex(data?.handedOver), [data]);

  const bySlot = useMemo(() => {
    const map = new Map<string, any>();
    for (const e of entries) map.set(`${e.dayOfWeek}#${e.periodNumber}`, e);
    return map;
  }, [entries]);

  /* A cell means something different per role — this is the only place that
     knows which, and the kit draws whatever it returns. */
  const cellFor = useCallback((d: string, periodNumber: number): Cell | null => {
    const key = `${d}#${periodNumber}`;
    const e = bySlot.get(key);

    if (role === 'teacher') {
      const duty = duties.get(key);
      const gone = handed.get(key);
      if (!e && duty) {
        // Not normally their period at all: the cover IS the lesson. The class
        // keeps its own line — deleting it left a lesson attached to no room.
        return {
          title: duty.subject || 'Cover',
          toneKey: 'cover',
          sub: duty.sectionLabel,
          keepSub: true,
          cover: { from: duty.originalTeacher, to: 'You' },
        };
      }
      if (!e) return null;
      const name = e.subject?.subjectName || e.subject?.name || 'Subject';
      return {
        title: name,
        toneKey: e.subject?._id || name,
        sub: [e.className, e.sectionName].filter(Boolean).join(' – ')
          || [e.timetable?.section?.class?.className, e.timetable?.section?.sectionName].filter(Boolean).join(' – ')
          || 'Class',
        keepSub: true,
        cover: gone ? { from: 'You', to: gone.substituteTeacher } : null,
      };
    }

    if (!e) return null;
    const name = e.subject?.subjectName || e.subject?.name || 'Subject';
    const c = covers.get(key);
    return {
      title: name,
      toneKey: e.subject?._id || name,
      // For a learner the line under the title IS the teacher, so a cover
      // replaces it rather than stacking a second name beneath.
      sub: e.teacher?.name || 'No teacher assigned',
      cover: c ? { from: c.originalTeacher || e.teacher?.name || '', to: c.substituteTeacher } : null,
      extras: [
        ...(e.additionalSubjects || []).filter((a: any) => a.subject).map((a: any) =>
          `${a.subject?.subjectName || a.subject?.name}${a.teacher?.name ? ` · ${a.teacher.name}` : ''}`),
        ...((e.mergedSections || []).length
          ? [`with ${(e.mergedSections || []).map((m: any) => m.sectionName || m).join(', ')}`] : []),
      ],
    };
  }, [bySlot, covers, duties, handed, role]);

  const shape = useMemo(() => weekShape(periods, days, entries.length), [periods, days, entries.length]);

  const subjects = useMemo(() => {
    const map = new Map<string, any>();
    for (const e of entries) {
      const id = String(e.subject?._id || e.subject?.subjectName || 'x');
      const name = e.subject?.subjectName || e.subject?.name || 'Subject';
      if (!map.has(id)) {
        map.set(id, {
          key: id,
          name,
          sub: role === 'teacher' ? '' : (e.teacher?.name || 'No teacher'),
          periods: 0,
          where: new Set<string>(),
        });
      }
      const row = map.get(id);
      row.periods += 1;
      if (role === 'teacher') {
        const label = [e.className, e.sectionName].filter(Boolean).join(' – ');
        if (label) row.where.add(label);
      }
    }
    return [...map.values()]
      .map((r) => ({ ...r, sub: role === 'teacher' ? [...r.where].join(', ') : r.sub }))
      .sort((a, b) => b.periods - a.periods);
  }, [entries, role]);

  if (disabled) {
    return (<><Stack.Screen options={{ title: 'Timetable' }} /><ModuleDisabled /></>);
  }

  const children = data?.children || [];
  const child    = data?.child;
  const section  = data?.section;
  const dutyRows = data?.coverDuties || [];
  const handRows = data?.handedOver || [];
  const coverRows = data?.covers || [];
  const firstName = String(child?.name || '').split(' ')[0] || 'your child';
  const ready = periods.some(isTeachingPeriod) && (entries.length > 0 || dutyRows.length > 0);

  const title = role === 'teacher' ? 'My Timetable'
    : role === 'parent' ? 'Timetable' : 'My Timetable';

  const subtitle = role === 'parent'
    ? (child ? `${child.name}${section?.className ? ` · ${section.className} · ${section.sectionName}` : ''}` : '')
    : role === 'teacher'
      ? 'Every period you take, and this week’s cover'
      : (section?.className ? `${section.className} · Section ${section.sectionName}` : '');

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100, gap: Spacing.md }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : (
          <>
            {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}

            {role === 'parent' && children.length > 1 && (
              <ChildSwitch kids={children} value={childId || child?._id} onChange={pickChild} />
            )}

            {role === 'parent' && !children.length ? (
              <Card>
                <Empty icon="people-outline"
                  text="No student is linked to this account, so there is no timetable to show. The school office can link your child." />
              </Card>
            ) : !ready ? (
              <Card>
                <Empty icon="calendar-outline"
                  text={section?.className
                    ? `No timetable has been set up for ${section.className} · ${section.sectionName} yet.`
                    : role === 'teacher'
                      ? 'No periods have been assigned to you for this academic year yet.'
                      : 'No timetable has been assigned yet.'} />
              </Card>
            ) : (
              <>
                <NowNext periods={periods} days={days} cellFor={cellFor}
                  label={role === 'parent' ? firstName : 'you'} />

                <StatRow>
                  <StatTile label="Periods a week" value={entries.length} icon="calendar" tone="info" />
                  <StatTile label={role === 'teacher' ? 'Subjects' : 'Subjects'} value={subjects.length}
                    icon="book" tone="neutral" />
                  {/* A time range does not fit a quarter-width tile — it broke over three
                      lines. The day's span sits in the line under the tiles instead. */}
                  <StatTile label="A day" value={shape.perDay} icon="time" tone="success" />
                  {role === 'teacher'
                    ? <StatTile label="Cover duties" value={dutyRows.length} icon="repeat"
                        tone={dutyRows.length ? 'warning' : 'neutral'} />
                    : <StatTile label="Covered" value={coverRows.length} icon="repeat"
                        tone={coverRows.length ? 'warning' : 'neutral'} />}
                </StatRow>

                <Text style={s.dayline}>
                  School day {shape.dayLabel} · {shape.taughtLabel} taught · {shape.breakLabel} of breaks
                </Text>

                {(role === 'teacher' ? dutyRows.length > 0 : coverRows.length > 0) && (
                  <View style={s.note}>
                    <Text style={s.noteText}>
                      {role === 'teacher'
                        ? `You are covering ${plural(dutyRows.length, 'period')} for a colleague this week.`
                        : `${plural(coverRows.length, 'period')} this week ${coverRows.length === 1 ? 'is' : 'are'} being taken by a different teacher.`}
                      {' They are marked COVER below.'}
                    </Text>
                  </View>
                )}

                <SegTabs
                  tabs={[{ key: 'day', label: 'Day' }, { key: 'week', label: 'Week' }]}
                  active={view}
                  onChange={(k: string) => setView(k as 'day' | 'week')}
                />

                {view === 'day' ? (
                  <>
                    <DayStrip days={days} value={shownDay} onChange={setDay} />
                    <Card><DayList periods={periods} day={shownDay} cellFor={cellFor} showNow /></Card>
                  </>
                ) : (
                  <Card>
                    <WeekStrip periods={periods} days={days} cellFor={cellFor}
                      onPickDay={(d) => { setDay(d); setView('day'); }} />
                  </Card>
                )}

                {role === 'teacher' && (dutyRows.length > 0 || handRows.length > 0) && (
                  <>
                    <SectionTitle>Cover this week</SectionTitle>
                    <Card>
                      {dutyRows.length > 0 && (
                        <>
                          <Text style={s.miniCap}>YOU ARE COVERING</Text>
                          <CoverList rows={dutyRows} mode="duty" />
                        </>
                      )}
                      {handRows.length > 0 && (
                        <>
                          <Text style={[s.miniCap, dutyRows.length ? { marginTop: Spacing.md } : null]}>
                            BEING COVERED FOR YOU
                          </Text>
                          <CoverList rows={handRows} mode="class" />
                        </>
                      )}
                    </Card>
                  </>
                )}

                {role === 'parent' && coverRows.length > 0 && (
                  <>
                    <SectionTitle>Different teacher this week</SectionTitle>
                    <Card>
                      <CoverList
                        rows={coverRows.map((c: any) => ({ ...c, sectionLabel: section?.className || '' }))}
                        mode="class" />
                    </Card>
                  </>
                )}

                <SectionTitle>{role === 'teacher' ? 'What you teach' : 'Subjects and teachers'}</SectionTitle>
                <Card><SubjectList rows={subjects} /></Card>
              </>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  subtitle: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: -4 },
  dayline: { fontSize: 11.5, color: Colors.textSecondary, marginTop: -6 },
  note: {
    backgroundColor: Colors.warningLight, borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  noteText: { fontSize: 12, color: Colors.warning, lineHeight: 17 },
  miniCap: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, color: Colors.textSecondary, marginBottom: 8 },
});
