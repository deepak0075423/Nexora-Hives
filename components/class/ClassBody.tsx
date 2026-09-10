/**
 * One class, as every role sees it.
 *
 * The student's My Class and the parent's Class Info ask the same question
 * about the same student, so they draw the same body — a parent looking at a
 * child sees what the child sees. Only the header, the child switch and where
 * the quick links point differ.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '@/constants/theme';
import { KV } from '@/components/ui/kit';
import { Figures, Panel, Pill, Blank, TONES, shortDate } from '@/components/library/parts';

export const classTitle = (section: any, pending: any) => {
  const cls = section?.class?.className
    || (section?.class?.classNumber != null ? `Class ${section.class.classNumber}` : '')
    || pending?.className
    || (pending?.classNumber != null ? `Class ${pending.classNumber}` : '');
  if (!cls) return section?.sectionName ? `Section ${section.sectionName}` : 'My Class';
  return section?.sectionName ? `${cls} — Section ${section.sectionName}` : cls;
};

/** The body both this screen and the parent's share. */
export function ClassBody({ view, who, quickLinks }: {
  view: any; who?: string; quickLinks?: { icon: any; label: string; to: string; tone: any }[];
}) {
  const router = useRouter();
  const section = view?.section;
  const pending = view?.pendingClass;
  const mates: any[]    = view?.classmates ?? [];
  const subjectT: any[] = view?.subjectTeachers ?? [];
  const subjects: any[] = view?.subjects ?? [];
  const anns: any[]     = view?.announcements ?? [];
  const monitors: any[] = view?.monitors ?? [];
  const self = who || 'You';

  if (!section) {
    const name = pending?.className || (pending?.classNumber != null ? `Class ${pending.classNumber}` : '');
    return (
      <View style={s.alert}>
        <Ionicons name="information-circle" size={20} color={Colors.info} />
        <Text style={s.alertText}>
          {name
            ? `${self} ${who ? 'is' : 'are'} in ${name}. The section has not been decided yet — this page fills in as soon as the school assigns one.`
            : `${self} ${who ? 'has' : 'have'} not been assigned to a class yet. Please contact the school office.`}
        </Text>
      </View>
    );
  }

  const teachers = [
    { ...(section.classTeacher ?? {}), badge: 'Class Teacher', tone: 'indigo' },
    { ...(section.substituteTeacher ?? {}), badge: 'Vice Class Teacher', tone: 'blue' },
  ].filter((t: any) => t.name);

  const strength = section.currentCount ?? mates.length;
  const capacity = section.maxStudents;
  const year     = section.academicYear?.yearName || '';

  return (
    <>
      <Figures items={[
        { icon: 'people', tone: 'violet', label: 'Class Strength',
          value: capacity ? `${strength} / ${capacity}` : strength,
          caption: `${strength} student${strength === 1 ? '' : 's'} in this class` },
        { icon: 'person', tone: 'green', label: 'Classmates', value: mates.length,
          caption: 'Friends to learn with' },
        { icon: 'school', tone: 'pink', label: 'Class Teachers', value: teachers.length,
          caption: teachers.length ? 'Guiding the journey' : 'None assigned yet' },
        { icon: 'calendar', tone: 'blue', label: 'Academic Year', value: year || '—',
          caption: 'Current academic year' },
      ]} />

      <Panel icon="book" tone="indigo" title="Class Information">
        <KV label="Class" value={section.class?.className || '—'} />
        <KV label="Section" value={section.sectionName || '—'} />
        {view?.profile?.rollNumber ? <KV label="Roll number" value={view.profile.rollNumber} /> : null}
        <KV label="Class strength" value={capacity ? `${strength} / ${capacity}` : String(strength)} />
        <KV label="Classmates" value={String(mates.length)} />
      </Panel>

      <Panel icon="person" tone="amber" title="Class Teachers">
        {teachers.length === 0 ? (
          <Blank icon="person-outline" title="No class teacher assigned yet" />
        ) : teachers.map((t: any) => (
          <View key={t.badge} style={s.person}>
            <View style={[s.av, { backgroundColor: TONES[t.tone as 'indigo'].bg }]}>
              <Text style={[s.avText, { color: TONES[t.tone as 'indigo'].fg }]}>
                {String(t.name ?? '?')[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.personName} numberOfLines={1}>{t.name}</Text>
              {t.email ? <Text style={s.personSub} numberOfLines={1}>{t.email}</Text> : null}
            </View>
            <Pill label={t.badge} tone={t.tone} />
          </View>
        ))}
      </Panel>

      {quickLinks?.length ? (
        <Panel icon="compass" tone="blue" title="Quick Links">
          <View style={s.quick}>
            {quickLinks.map((l) => (
              <TouchableOpacity key={l.label} style={[s.quickItem, { backgroundColor: TONES[l.tone as 'blue'].bg }]}
                onPress={() => router.push(l.to as any)}>
                <Ionicons name={l.icon} size={17} color={TONES[l.tone as 'blue'].fg} />
                <Text style={[s.quickText, { color: TONES[l.tone as 'blue'].fg }]}>{l.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Panel>
      ) : null}

      <Panel icon="people" tone="violet" title={`Classmates (${mates.length})`}>
        {mates.length === 0 ? (
          <Blank icon="people-outline" title="No classmates yet"
            body="Students appear here as the school places them in this section." />
        ) : (
          <View style={s.mates}>
            {mates.map((c: any) => (
              <View key={c._id} style={[s.mate, c.isMe && s.mateMe]}>
                <View style={[s.avSm, { backgroundColor: c.isMe ? TONES.indigo.bg : TONES.violet.bg }]}>
                  <Text style={[s.avSmText, { color: c.isMe ? TONES.indigo.fg : TONES.violet.fg }]}>
                    {String(c.name ?? '?')[0].toUpperCase()}
                  </Text>
                </View>
                <Text style={s.mateName} numberOfLines={1}>{c.name}</Text>
                {c.isMe ? <Pill label={who ? 'Your child' : 'You'} tone="indigo" /> : null}
              </View>
            ))}
          </View>
        )}
      </Panel>

      <Panel icon="megaphone" tone="indigo" title="Class Updates">
        {anns.length === 0 ? (
          <Blank icon="document-text-outline" title="No announcements yet"
            body="Class announcements will appear here." />
        ) : anns.map((a: any) => (
          <View key={a._id} style={s.ann}>
            <View style={s.annTop}>
              <Text style={s.annTitle} numberOfLines={1}>{a.title}</Text>
              <Text style={s.annDate}>{shortDate(a.createdAt)}</Text>
            </View>
            {a.message ? <Text style={s.annBody} numberOfLines={4}>{a.message}</Text> : null}
          </View>
        ))}
      </Panel>

      {subjectT.length > 0 && (
        <Panel icon="book" tone="green" title="Subject Teachers">
          {subjectT.map((x: any, i: number) => (
            <KV key={`${x.subject}-${i}`} label={x.subject} value={x.teacher || '—'} />
          ))}
        </Panel>
      )}

      {subjects.length > 0 && (
        <Panel icon="layers" tone="blue" title={`Subjects (${subjects.length})`}>
          <View style={s.tags}>
            {subjects.map((x: any) => (
              <View key={x._id} style={s.tag}><Text style={s.tagText}>{x.name}</Text></View>
            ))}
          </View>
        </Panel>
      )}

      {monitors.length > 0 && (
        <Panel icon="star" tone="amber" title={`Class Monitors (${monitors.length})`}>
          <View style={s.tags}>
            {monitors.map((m: any) => (
              <View key={m._id} style={s.tag}><Text style={s.tagText}>{m.name}</Text></View>
            ))}
          </View>
        </Panel>
      )}
    </>
  );
}

const s = StyleSheet.create({
  alert: {
    flexDirection: 'row', gap: 10, padding: 14, borderRadius: Radius.lg,
    backgroundColor: Colors.infoLight, borderWidth: 1, borderColor: '#BAE6FD',
  },
  alertText: { flex: 1, fontSize: 12.5, color: Colors.text, lineHeight: 18 },

  person: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.divider,
  },
  av: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avText: { fontSize: 14, fontWeight: '800' },
  personName: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  personSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },

  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  quickItem: {
    flexGrow: 1, flexBasis: '46%', flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: Radius.md,
  },
  quickText: { fontSize: 12.5, fontWeight: '700' },

  mates: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mate: {
    flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 4, paddingRight: 10,
    paddingVertical: 4, borderRadius: 999, backgroundColor: Colors.surfaceAlt,
    borderWidth: 1, borderColor: Colors.border, maxWidth: '100%',
  },
  mateMe: { backgroundColor: TONES.indigo.bg, borderColor: '#C7D2FE' },
  avSm: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avSmText: { fontSize: 11, fontWeight: '800' },
  mateName: { fontSize: 12, fontWeight: '600', color: Colors.text, flexShrink: 1 },

  ann: { paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.divider },
  annTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  annTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.text },
  annDate: { fontSize: 10.5, color: Colors.textLight },
  annBody: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 3, lineHeight: 16 },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tag: {
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999,
    backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border,
  },
  tagText: { fontSize: 11.5, fontWeight: '600', color: Colors.textSecondary },
});
