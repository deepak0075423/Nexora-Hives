/**
 * The week, as the people who attend it read it — on a phone.
 *
 * The mobile twin of school-frontend/src/pages/timetable/view/viewParts.jsx.
 * Students, parents and teachers look at the same object for three different
 * reasons, so the screen decides what goes in a cell (`cellFor`) and this kit
 * decides how a cell looks. A change to how a period is drawn lands in all three.
 *
 * A phone is not a wide grid. The day is the primary unit here and the week is
 * a horizontally scrolling strip — the opposite emphasis from the web screens,
 * because nobody plans a term on a phone but everybody checks "what's next" on
 * one.
 */
import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_SHORT: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed',
  Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
};

export const todayName = () => DAYS[(new Date().getDay() + 6) % 7];
export const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

export const toMinutes = (t?: string): number | null => {
  const m = /^(\d{1,2}):(\d{1,2})/.exec(String(t || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const hhmm = (t?: string) => {
  const m = /^(\d{1,2}):(\d{1,2})/.exec(String(t || ''));
  return m ? `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}` : (t || '');
};
export const timeRange = (a?: string, b?: string) => (a ? `${hhmm(a)}${b ? ` – ${hhmm(b)}` : ''}` : '—');

export const isTeachingPeriod = (p: any) =>
  !p?.isRecess && (p?.periodType || 'Teaching') === 'Teaching';

export const plural = (n: number, one: string, many?: string) =>
  `${n} ${n === 1 ? one : many || `${one}s`}`;

export function duration(mins: number) {
  const n = Math.max(0, Math.round(mins || 0));
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Period rows in clock order, breaks included. */
export function orderPeriods(periods: any[]) {
  return [...(periods || [])].sort((a, b) => {
    const at = toMinutes(a.startTime);
    const bt = toMinutes(b.startTime);
    if (at != null && bt != null && at !== bt) return at - bt;
    return (a.periodNumber || 99) - (b.periodNumber || 99);
  });
}

/* ── Subject colour ────────────────────────────────────────────────────────
   One hue per subject, stable across screens, so the same lesson is the same
   colour on the dashboard, the day list and the week strip. */
const PALETTE = [
  { bg: '#EEF2FF', fg: '#4338CA' }, { bg: '#EFF6FF', fg: '#1D4ED8' },
  { bg: '#F0FDF4', fg: '#047857' }, { bg: '#FFFBEB', fg: '#B45309' },
  { bg: '#FEF2F2', fg: '#B91C1C' }, { bg: '#F5F3FF', fg: '#6D28D9' },
  { bg: '#FDF2F8', fg: '#BE185D' }, { bg: '#F0FDFA', fg: '#0F766E' },
];
export function subjectTone(key?: string) {
  if (!key) return { bg: Colors.surfaceAlt, fg: Colors.textSecondary };
  let hash = 0;
  const s = String(key);
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export type Cell = {
  title: string;
  sub?: string;
  extras?: string[];
  toneKey?: string;
  /** Who the period belongs to, and who is actually taking it. */
  cover?: { from?: string; to?: string } | null;
  /** Keep `sub` visible under a cover — for a teacher it is the CLASS, which a
   *  cover must not delete. For a student it is the teacher, which it replaces. */
  keepSub?: boolean;
};

export type CellFor = (day: string, periodNumber: number) => Cell | null;

/** A cover index keyed the way a grid looks one up. */
export function coverIndex(covers: any[]) {
  const map = new Map<string, any>();
  for (const c of covers || []) map.set(`${c.dayOfWeek}#${c.periodNumber}`, c);
  return map;
}

/** Where the day has got to. Nulls outside school hours rather than guessing. */
export function nowNext(periods: any[], day: string) {
  if (day !== todayName()) return { current: null as any, next: null as any, done: false };
  const now = nowMinutes();
  const rows = orderPeriods(periods).filter((p) => toMinutes(p.startTime) != null);
  if (!rows.length) return { current: null as any, next: null as any, done: false };
  const current = rows.find((p) => {
    const a = toMinutes(p.startTime);
    const b = toMinutes(p.endTime);
    return a != null && b != null && now >= a && now < b;
  }) || null;
  const next = rows.find((p) => (toMinutes(p.startTime) as number) > now) || null;
  const last = rows[rows.length - 1];
  return { current, next, done: !current && !next && now >= (toMinutes(last.endTime) ?? 0) };
}

/* ══════════════════════════════════════════════════════════════════════════
   What is on now
══════════════════════════════════════════════════════════════════════════ */

export function NowNext({ periods, days, cellFor, label = 'you' }: {
  periods: any[]; days: string[]; cellFor: CellFor; label?: string;
}) {
  const day = todayName();
  const { current, next, done } = useMemo(() => nowNext(periods, day), [periods, day]);
  const isSchoolDay = days.includes(day);

  if (!isSchoolDay || done) {
    return (
      <View style={[v.now, v.nowRest]}>
        <View style={[v.nowIcon, { backgroundColor: Colors.surfaceAlt }]}>
          <Ionicons name={isSchoolDay ? 'checkmark-circle' : 'sunny'} size={20} color={Colors.textSecondary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={v.nowRestTitle}>{isSchoolDay ? 'That’s the day done' : 'No school today'}</Text>
          <Text style={v.nowRestSub}>
            {isSchoolDay
              ? `Every period for ${day} has finished.`
              : `${day} is not a working day — below is the next school day.`}
          </Text>
        </View>
      </View>
    );
  }

  const cur = current ? cellFor(day, current.periodNumber) : null;
  const nxt = next ? cellFor(day, next.periodNumber) : null;

  return (
    <View style={v.now}>
      <View style={v.nowIcon}><Ionicons name="time" size={20} color={Colors.primary} /></View>
      <View style={{ flex: 1, flexDirection: 'row', gap: Spacing.md }}>
        <View style={{ flex: 1 }}>
          <Text style={v.nowCap}>NOW</Text>
          <Text style={v.nowTitle} numberOfLines={2}>
            {current ? (cur ? cur.title : 'Free period') : 'Between periods'}
          </Text>
          <Text style={v.nowSub} numberOfLines={1}>
            {current
              ? `${cur?.sub ? `${cur.sub} · ` : ''}${timeRange(current.startTime, current.endTime)}`
              : 'Nothing running this minute'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={v.nowCap}>NEXT</Text>
          <Text style={v.nowTitle} numberOfLines={2}>
            {next ? (nxt ? nxt.title : 'Free period') : 'Nothing left'}
          </Text>
          <Text style={v.nowSub} numberOfLines={1}>
            {next
              ? `${nxt?.sub ? `${nxt.sub} · ` : ''}${timeRange(next.startTime, next.endTime)}`
              : `${label === 'you' ? 'You are' : `${label} is`} done for the day`}
          </Text>
        </View>
      </View>
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The day picker and the day
══════════════════════════════════════════════════════════════════════════ */

export function DayStrip({ days, value, onChange }: {
  days: string[]; value: string; onChange: (d: string) => void;
}) {
  const today = todayName();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {DAYS.filter((d) => days.includes(d)).map((d) => {
        const on = d === value;
        return (
          <TouchableOpacity key={d} onPress={() => onChange(d)} activeOpacity={0.8}
            style={[v.dayPill, on && v.dayPillOn]}>
            <Text style={[v.dayPillText, on && v.dayPillTextOn]}>{DAY_SHORT[d]}</Text>
            {d === today && <View style={[v.dayDot, on && { backgroundColor: Colors.textInverse }]} />}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export function DayList({ periods, day, cellFor, showNow }: {
  periods: any[]; day: string; cellFor: CellFor; showNow?: boolean;
}) {
  const rows = orderPeriods(periods);
  const { current } = useMemo(() => nowNext(periods, day), [periods, day]);
  const isToday = day === todayName();

  if (!rows.length) {
    return <Text style={v.empty}>No periods are set up for {day}.</Text>;
  }

  return (
    <View style={{ gap: 8 }}>
      {rows.map((p, i) => {
        if (!isTeachingPeriod(p)) {
          return (
            <View key={`b${i}`} style={v.breakRow}>
              <Ionicons name="cafe-outline" size={15} color={Colors.warning} />
              <Text style={v.breakText}>{p.recessName || p.label || p.periodType || 'Break'}</Text>
              <Text style={v.breakTime}>{timeRange(p.startTime, p.endTime)}</Text>
            </View>
          );
        }
        const cell = cellFor(day, p.periodNumber);
        const on = !!(showNow && isToday && current && current.periodNumber === p.periodNumber);
        const tone = subjectTone(cell?.toneKey || cell?.title);
        const showSub = cell?.sub && (!cell.cover || cell.keepSub);
        return (
          <View key={`p${p.periodNumber}-${i}`} style={[v.row, on && v.rowNow]}>
            <View style={[v.rowNum, { backgroundColor: tone.bg }]}>
              <Text style={[v.rowNumText, { color: tone.fg }]}>{p.periodNumber}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={[v.rowTitle, !cell && { color: Colors.textLight }]} numberOfLines={1}>
                  {cell ? cell.title : 'Free period'}
                </Text>
                {cell?.cover && (
                  <View style={v.coverTag}><Text style={v.coverTagText}>COVER</Text></View>
                )}
                {on && <View style={v.nowTag}><Text style={v.nowTagText}>NOW</Text></View>}
              </View>
              {showSub ? <Text style={v.rowSub} numberOfLines={1}>{cell!.sub}</Text> : null}
              {cell?.cover ? (
                <Text style={v.rowSub} numberOfLines={1}>
                  {cell.cover.from ? <Text style={v.struck}>{cell.cover.from}</Text> : null}
                  {cell.cover.from ? ' → ' : ''}
                  <Text style={v.rowStrong}>{cell.cover.to || 'cover to be arranged'}</Text>
                </Text>
              ) : null}
              {(cell?.extras || []).map((x, k) => (
                <Text key={k} style={v.rowExtra} numberOfLines={1}>{x}</Text>
              ))}
            </View>
            <Text style={v.rowTime}>{timeRange(p.startTime, p.endTime)}</Text>
          </View>
        );
      })}
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The week, as a scrolling strip
══════════════════════════════════════════════════════════════════════════ */

export function WeekStrip({ periods, days, cellFor, onPickDay }: {
  periods: any[]; days: string[]; cellFor: CellFor; onPickDay?: (d: string) => void;
}) {
  const rows = orderPeriods(periods).filter(isTeachingPeriod);
  const cols = DAYS.filter((d) => days.includes(d));
  const today = todayName();
  if (!rows.length || !cols.length) return null;

  return (
    <View style={{ flexDirection: 'row' }}>
      {/* The period gutter stays put while the days scroll — without it a phone
          user has to count cells to tell period 2 from period 4. Cells are a
          fixed height so the gutter rows line up with them. */}
      <View style={v.gutter}>
        <Text style={v.weekColHead}> </Text>
        {rows.map((p) => (
          <View key={p.periodNumber} style={v.gutterCell}>
            <Text style={v.gutterNum}>P{p.periodNumber}</Text>
            <Text style={v.gutterTime}>{hhmm(p.startTime)}</Text>
          </View>
        ))}
      </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {cols.map((d) => (
          <View key={d} style={[v.weekCol, d === today && v.weekColToday]}>
            <TouchableOpacity disabled={!onPickDay} onPress={() => onPickDay?.(d)} activeOpacity={0.8}>
              <Text style={[v.weekColHead, d === today && { color: Colors.primary }]}>
                {DAY_SHORT[d]}{d === today ? ' · Today' : ''}
              </Text>
            </TouchableOpacity>
            {rows.map((p) => {
              const cell = cellFor(d, p.periodNumber);
              const tone = subjectTone(cell?.toneKey || cell?.title);
              return (
                <View key={p.periodNumber}
                  style={[
                    v.weekCell,
                    cell ? { backgroundColor: tone.bg, borderColor: `${tone.fg}44` } : v.weekCellFree,
                    cell?.cover ? { borderStyle: 'dashed' } : null,
                  ]}>
                  {cell ? (
                    <>
                      <Text style={[v.weekCellTitle, { color: tone.fg }]} numberOfLines={2}>{cell.title}</Text>
                      <Text style={v.weekCellSub} numberOfLines={1}>
                        {cell.cover && !cell.keepSub ? (cell.cover.to || 'cover') : cell.sub}
                      </Text>
                      {cell.cover && cell.keepSub ? (
                        <Text style={v.weekCellSub} numberOfLines={1}>→ {cell.cover.to || 'cover'}</Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={v.weekCellFreeText}>Free</Text>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Subjects, covers, children
══════════════════════════════════════════════════════════════════════════ */

export function SubjectList({ rows, emptyText = 'Nothing timetabled yet.' }: {
  rows: { key: string; name: string; sub?: string; periods: number }[]; emptyText?: string;
}) {
  if (!rows.length) return <Text style={v.empty}>{emptyText}</Text>;
  return (
    <View style={{ gap: 10 }}>
      {rows.map((r) => {
        const tone = subjectTone(r.key || r.name);
        return (
          <View key={r.key || r.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[v.dot, { backgroundColor: tone.fg }]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={v.subjName} numberOfLines={1}>{r.name}</Text>
              {!!r.sub && <Text style={v.subjSub} numberOfLines={1}>{r.sub}</Text>}
            </View>
            <View style={[v.countPill, { backgroundColor: tone.bg }]}>
              <Text style={[v.countPillText, { color: tone.fg }]}>{r.periods}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function CoverList({ rows, mode, emptyText = 'Nothing this week.' }: {
  rows: any[]; mode: 'duty' | 'class'; emptyText?: string;
}) {
  if (!rows.length) return <Text style={v.empty}>{emptyText}</Text>;
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r) => (
        <View key={r._id} style={v.coverRow}>
          <View style={v.coverNum}><Text style={v.coverNumText}>{r.periodNumber}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={v.rowTitle} numberOfLines={1}>
              {r.sectionLabel || r.section} · {r.subject || 'Subject'}
            </Text>
            <Text style={v.rowSub} numberOfLines={2}>
              {r.date} · {timeRange(r.startTime, r.endTime)}
              {mode === 'duty'
                ? (r.originalTeacher ? ` · for ${r.originalTeacher}` : '')
                : (r.substituteTeacher ? ` · ${r.substituteTeacher} is taking it` : ' · nobody assigned yet')}
            </Text>
          </View>
          <View style={[v.statePill, {
            backgroundColor: r.status === 'assigned' ? Colors.successLight : Colors.warningLight,
          }]}>
            <Text style={[v.statePillText, {
              color: r.status === 'assigned' ? Colors.success : Colors.warning,
            }]}>{r.status === 'assigned' ? 'Confirmed' : 'Open'}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * A parent with two children has two timetables. Cards rather than a dropdown:
 * which child you are looking at is the most important fact on the screen, and
 * a collapsed picker hides it.
 */
export function ChildSwitch({ kids, value, onChange }: {
  kids: any[]; value?: string; onChange: (id: string) => void;
}) {
  if (kids.length < 2) return null;
  return (
    <View style={{ gap: 8 }}>
      <Text style={v.switchCap}>WHOSE TIMETABLE</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {kids.map((k) => {
          const on = String(k._id) === String(value);
          return (
            <TouchableOpacity key={k._id} onPress={() => onChange(String(k._id))} activeOpacity={0.85}
              style={[v.kid, on && v.kidOn]}>
              <View style={[v.kidAvatar, on && { backgroundColor: Colors.primary }]}>
                <Text style={[v.kidAvatarText, on && { color: Colors.textInverse }]}>
                  {String(k.name || '?').trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={[v.kidName, on && { color: Colors.primary }]} numberOfLines={1}>{k.name}</Text>
                <Text style={v.kidClass} numberOfLines={1}>
                  {k.className ? `${k.className}${k.sectionName ? ` · ${k.sectionName}` : ''}` : 'No class yet'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Summary tiles, two across
══════════════════════════════════════════════════════════════════════════ */

const TILE_TONE: Record<string, { fg: string; bg: string }> = {
  info: { fg: Colors.info, bg: Colors.infoLight },
  success: { fg: Colors.success, bg: Colors.successLight },
  warning: { fg: Colors.warning, bg: Colors.warningLight },
  danger: { fg: Colors.danger, bg: Colors.dangerLight },
  neutral: { fg: Colors.textSecondary, bg: Colors.surfaceAlt },
};

/**
 * The module's own summary tiles. Two across, not the kit's four: at phone width
 * a four-across tile is ~58px wide and splits UTILISATION, UNCOVERED,
 * OVERLOADED, CLASSROOMS and RESTRICTED mid-word — which no overflow check
 * catches, because the word wraps rather than spills.
 */
export function Tiles({ items }: {
  items: { label: string; value: any; icon: string; tone?: string; cap?: string }[];
}) {
  return (
    <View style={v.tiles}>
      {items.map((t) => {
        const tone = TILE_TONE[t.tone || 'neutral'] || TILE_TONE.neutral;
        return (
          <View key={t.label} style={v.tile}>
            <View style={[v.tileIcon, { backgroundColor: tone.bg }]}>
              <Ionicons name={t.icon as any} size={16} color={tone.fg} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={v.tileValue} numberOfLines={1}>{String(t.value ?? '—')}</Text>
              <Text style={v.tileLabel} numberOfLines={1}>{t.label}</Text>
              {!!t.cap && <Text style={v.tileCap} numberOfLines={1}>{t.cap}</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Teaching slots, filled slots and the minutes behind them. */
export function weekShape(periods: any[], days: string[], filled: number) {
  const teaching = (periods || []).filter(isTeachingPeriod);
  const cols = DAYS.filter((d) => (days || []).includes(d));
  let taught = 0;
  let broken = 0;
  for (const p of periods || []) {
    const a = toMinutes(p.startTime);
    const b = toMinutes(p.endTime);
    if (a == null || b == null || b <= a) continue;
    if (isTeachingPeriod(p)) taught += b - a; else broken += b - a;
  }
  const ordered = orderPeriods(periods || []);
  return {
    perDay: teaching.length,
    days: cols.length,
    slots: teaching.length * cols.length,
    filled,
    taughtLabel: duration(taught),
    breakLabel: duration(broken),
    dayLabel: ordered.length
      ? timeRange(ordered[0]?.startTime, ordered[ordered.length - 1]?.endTime)
      : '—',
  };
}

// One height for every week cell and its gutter row, so the two columns align.
const WEEK_CELL = 58;

const v = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.md },
  tile: {
    width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 10, paddingHorizontal: 11,
  },
  tileIcon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  tileValue: { fontSize: 17, fontWeight: '800', color: Colors.text },
  tileLabel: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, marginTop: 1 },
  tileCap: { fontSize: 9.5, color: Colors.textLight, marginTop: 1 },
  now: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#E0E7FF',
    borderRadius: Radius.lg, padding: 14,
  },
  nowRest: { backgroundColor: Colors.surface, borderColor: Colors.border },
  nowIcon: {
    width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  nowCap: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, color: Colors.primary },
  nowTitle: { ...Typography.h4, color: Colors.text, marginTop: 2 },
  nowSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  nowRestTitle: { ...Typography.h4, color: Colors.text },
  nowRestSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  dayPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  dayPillOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayPillText: { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary },
  dayPillTextOn: { color: Colors.textInverse },
  dayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.accent },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: 12,
  },
  rowNow: { borderColor: Colors.primary, borderWidth: 1.5 },
  rowNum: { width: 30, height: 30, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowNumText: { fontSize: 13, fontWeight: '800' },
  rowTitle: { ...Typography.h4, color: Colors.text },
  rowSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 1 },
  rowStrong: { fontWeight: '700', color: Colors.text },
  rowExtra: { fontSize: 10.5, color: Colors.textLight, marginTop: 1 },
  rowTime: { fontSize: 10.5, color: Colors.textSecondary, textAlign: 'right' },
  struck: { textDecorationLine: 'line-through', color: Colors.textLight },

  breakRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.warningLight, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 9,
  },
  breakText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: Colors.warning },
  breakTime: { fontSize: 11, color: Colors.warning },

  coverTag: { backgroundColor: Colors.warningLight, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  coverTagText: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.4, color: Colors.warning },
  nowTag: { backgroundColor: Colors.successLight, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  nowTagText: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.4, color: Colors.success },

  // Narrow enough that a third day's edge shows — the only cue the strip swipes.
  weekCol: { width: 116, gap: 6 },
  weekColToday: {},
  weekColHead: {
    fontSize: 11, fontWeight: '800', letterSpacing: 0.4, color: Colors.textSecondary,
    textTransform: 'uppercase', marginBottom: 2,
  },
  weekCell: { borderRadius: Radius.sm, borderWidth: 1, padding: 7, height: WEEK_CELL, justifyContent: 'center' },
  gutter: { width: 40, gap: 6, marginRight: 6 },
  gutterCell: { height: WEEK_CELL, justifyContent: 'center' },
  gutterNum: { fontSize: 11, fontWeight: '800', color: Colors.primary },
  gutterTime: { fontSize: 9.5, color: Colors.textSecondary, marginTop: 1 },
  weekCellFree: { backgroundColor: Colors.surface, borderColor: Colors.border, borderStyle: 'dashed' },
  weekCellFreeText: { fontSize: 10.5, color: Colors.textLight, textAlign: 'center' },
  weekCellTitle: { fontSize: 11.5, fontWeight: '700' },
  weekCellSub: { fontSize: 9.5, color: Colors.textSecondary, marginTop: 1 },

  dot: { width: 9, height: 9, borderRadius: 5 },
  subjName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  subjSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  countPill: { minWidth: 30, alignItems: 'center', borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  countPillText: { fontSize: 12, fontWeight: '800' },

  coverRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: 10,
    backgroundColor: Colors.surface,
  },
  coverNum: {
    width: 28, height: 28, borderRadius: Radius.sm, backgroundColor: Colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  coverNumText: { fontSize: 12, fontWeight: '800', color: Colors.primary },
  statePill: { borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  statePillText: { fontSize: 10, fontWeight: '700' },

  switchCap: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, color: Colors.textSecondary },
  kid: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 9,
  },
  kidOn: { borderColor: Colors.primary, backgroundColor: '#EEF2FF' },
  kidAvatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  kidAvatarText: { fontSize: 11, fontWeight: '800', color: Colors.primary },
  kidName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  kidClass: { fontSize: 10.5, color: Colors.textSecondary, marginTop: 1 },

  empty: { fontSize: 12.5, color: Colors.textSecondary, paddingVertical: 8 },
});
