/**
 * My Section — the teacher's own corner of the school.
 *
 * Three questions in the order a teacher asks them: which class is mine, what
 * else am I responsible for, and what has been said to my class lately.
 *
 * A teacher is attached to a section in three ways — class teacher, vice class
 * teacher, subject teacher — and each row says which. Rows from another
 * academic year are kept but carry the year, because classes repeat every year
 * and next year's section must not read as today's work.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as teacherApi from '@/api/teacher.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { unwrap, LoaderView, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import { Hero, Figures, Panel, Pill, Blank, TONES, shortDate, type Tone } from '@/components/library/parts';

const chipFor = (row: any) => {
  if (row?.classNumber != null) return `C${row.classNumber}`;
  const d = String(row?.className ?? '').match(/\d+/);
  if (d) return `C${d[0]}`;
  return String(row?.className || row?.sectionName || '?').slice(0, 2).toUpperCase();
};

const classLabel = (row: any) => row?.className
  || (row?.classNumber != null ? `Class ${row.classNumber}` : '')
  || (row?.sectionName ? `Section ${row.sectionName}` : 'My class');

const secLabel = (row: any) => {
  const cls = row?.className || (row?.classNumber != null ? `Class ${row.classNumber}` : '');
  if (!cls) return row?.sectionName ? `Section ${row.sectionName}` : 'Section';
  return row?.sectionName ? `${cls} (Section ${row.sectionName})` : cls;
};

const plural = (n: number, one: string, many?: string) => `${n} ${n === 1 ? one : (many ?? `${one}s`)}`;

export default function MySectionScreen() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(unwrap(await teacherApi.getMySection()));
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'My Section' }} />
      <ModuleDisabled />
    </>
  );

  const section: any = data?.section;
  const classTeacherOf: any[] = data?.classTeacherOf ?? [];
  const viceOf: any[]         = data?.viceOf ?? [];
  const subjectClasses: any[] = data?.subjectClasses ?? [];
  const announcements: any[]  = data?.announcements ?? [];
  const monitors: any[]       = data?.monitors ?? [];
  const isClassTeacher = data?.role === 'classTeacher';
  const nothing = !section && !viceOf.length && !subjectClasses.length;

  const openSection = (row: any) => router.push({
    pathname: '/modules/teacher-section-detail',
    params: { id: row._id, title: secLabel(row) },
  } as any);

  /** A section as a row: chip, name, facts, badge. */
  const SectionRow = ({ row, tone, badge, chip, title, meta }: {
    row: any; tone: Tone; badge?: string; chip?: string; title?: string; meta?: string;
  }) => (
    <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={() => openSection(row)}>
      <View style={[s.chip, { backgroundColor: TONES[tone].bg }]}>
        <Text style={[s.chipText, { color: TONES[tone].fg }]}>{chip ?? chipFor(row)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.rowTitleLine}>
          <Text style={s.rowTitle} numberOfLines={1}>{title ?? classLabel(row)}</Text>
          {!row.isCurrentYear && row.yearName ? <Pill label={row.yearName} tone="slate" /> : null}
        </View>
        <Text style={s.rowMeta} numberOfLines={1}>{meta}</Text>
      </View>
      {badge ? <Pill label={badge} tone={tone} /> : null}
      <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
    </TouchableOpacity>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'My Section' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <Hero icon="people" title="My Section"
          blurb="Your class section, responsibilities and related information."
          quote="“Teachers plant seeds that grow forever.”" />

        {loading ? <LoaderView /> : nothing ? (
          <Blank icon="people-outline" title="You are not attached to any section yet"
            body="No class teacher, vice class teacher or subject teacher assignment. Your school office sets these up on the class." />
        ) : (
          <>
            <Figures items={[
              { icon: 'school', tone: 'indigo', label: 'Class Teacher',
                value: classTeacherOf.length ? classLabel(classTeacherOf[0]) : 'None',
                caption: classTeacherOf[0]
                  ? `Academic Year ${classTeacherOf[0].yearName || data?.currentYear || '—'}`
                  : 'No section of your own' },
              { icon: 'people', tone: 'green', label: 'Vice Class Teacher',
                value: viceOf.length ? plural(viceOf.length, 'Class', 'Classes') : 'None',
                caption: viceOf.length ? 'You are vice class teacher' : 'Not covering any class' },
              { icon: 'book', tone: 'violet', label: 'Subject Teacher',
                value: subjectClasses.length ? plural(subjectClasses.length, 'Class', 'Classes') : 'None',
                caption: subjectClasses.length ? 'Across different sections' : 'No subject assignments' },
              { icon: 'megaphone', tone: 'amber', label: 'Announcements',
                value: announcements.length,
                caption: announcements.length ? 'Posted to your class' : 'Nothing posted yet' },
            ]} />

            {section ? (
              <Panel icon="school" tone="indigo"
                title={`My Class (${isClassTeacher ? 'Class Teacher' : 'Vice Class Teacher'})`}>
                <TouchableOpacity style={s.mine} activeOpacity={0.7} onPress={() => openSection(section)}>
                  <View style={[s.chipLg, { backgroundColor: TONES.indigo.bg }]}>
                    <Text style={[s.chipLgText, { color: TONES.indigo.fg }]}>{chipFor(section)}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.mineTitle} numberOfLines={1}>{classLabel(section)}</Text>
                    <Text style={s.rowMeta} numberOfLines={2}>
                      Section {section.sectionName} · {plural(section.studentCount, 'Student')}
                      {'\n'}Academic Year {section.yearName || data?.currentYear || '—'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
                </TouchableOpacity>

                <View style={s.actions}>
                  <TouchableOpacity style={s.act} onPress={() => openSection(section)}>
                    <Ionicons name="people-outline" size={16} color={Colors.primary} />
                    <Text style={s.actText}>Students</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.act} onPress={() => router.push('/modules/teacher-attendance' as any)}>
                    <Ionicons name="checkbox-outline" size={16} color={Colors.primary} />
                    <Text style={s.actText}>Attendance</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.act} onPress={() => router.push('/modules/timetable' as any)}>
                    <Ionicons name="time-outline" size={16} color={Colors.primary} />
                    <Text style={s.actText}>Timetable</Text>
                  </TouchableOpacity>
                </View>
              </Panel>
            ) : null}

            {viceOf.length > 0 && (
              <Panel icon="people" tone="green" title={`Vice Class Teacher (${viceOf.length})`}>
                {viceOf.map((r: any) => (
                  <SectionRow key={r._id} row={r} tone="green" badge="Vice"
                    meta={`Section ${r.sectionName} · ${plural(r.studentCount, 'Student')}`} />
                ))}
              </Panel>
            )}

            {subjectClasses.length > 0 && (
              <Panel icon="book" tone="violet" title={`Subject Classes (${subjectClasses.length})`}>
                {subjectClasses.map((r: any) => (
                  <SectionRow key={`${r._id}:${r.subject}`} row={r} tone="violet"
                    chip={String(r.subject ?? '?')[0].toUpperCase()}
                    title={r.subject || 'Subject'}
                    meta={`${secLabel(r)} · ${plural(r.studentCount, 'Student')}`} />
                ))}
              </Panel>
            )}

            <Panel icon="megaphone" tone="amber" title="Recent Announcements">
              {announcements.length === 0 ? (
                <Blank icon="megaphone-outline" title="Nothing posted yet"
                  body={section ? `No announcements for ${secLabel(section)}.` : undefined} />
              ) : announcements.slice(0, 5).map((a: any) => (
                <View key={a._id} style={s.ann}>
                  <View style={s.annTop}>
                    <Text style={s.annTitle} numberOfLines={1}>{a.title}</Text>
                    <Text style={s.annDate}>{shortDate(a.createdAt)}</Text>
                  </View>
                  {a.message ? <Text style={s.annBody} numberOfLines={3}>{a.message}</Text> : null}
                </View>
              ))}
            </Panel>

            {monitors.length > 0 && (
              <Panel icon="star" tone="amber" title={`Class Monitors (${monitors.length})`}>
                <View style={s.mons}>
                  {monitors.map((m: any) => (
                    <View key={m._id} style={s.mon}>
                      <View style={s.monAv}><Text style={s.monAvText}>{String(m.name ?? '?')[0].toUpperCase()}</Text></View>
                      <Text style={s.monName} numberOfLines={1}>{m.name}</Text>
                    </View>
                  ))}
                </View>
              </Panel>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.divider,
  },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowTitle: { fontSize: 13.5, fontWeight: '700', color: Colors.text, flexShrink: 1 },
  rowMeta: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },
  chip: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 12.5, fontWeight: '800' },
  chipLg: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  chipLgText: { fontSize: 16, fontWeight: '800' },

  mine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mineTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },

  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  act: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 9, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
  },
  actText: { fontSize: 11.5, fontWeight: '700', color: Colors.text },

  ann: { paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.divider },
  annTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  annTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.text },
  annDate: { fontSize: 10.5, color: Colors.textLight },
  annBody: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 3, lineHeight: 16 },

  mons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mon: {
    flexDirection: 'row', alignItems: 'center', gap: 7, paddingRight: 11, paddingLeft: 4,
    paddingVertical: 4, borderRadius: 999, backgroundColor: Colors.surfaceAlt,
    borderWidth: 1, borderColor: Colors.border,
  },
  monAv: {
    width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: TONES.indigo.bg,
  },
  monAvText: { fontSize: 11, fontWeight: '800', color: TONES.indigo.fg },
  monName: { fontSize: 12, fontWeight: '600', color: Colors.text },
});
