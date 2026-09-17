/**
 * Attendance on the phone — the pieces the teacher's four tabs, the student's
 * screen and the parent's screen share.
 *
 * The phone half of school-frontend/src/components/attendance/parts.jsx (the
 * web `tat-` kit): the same status colours, tiles, cards, calendar and request
 * timeline, at phone width — figures two across, tables as stacks of rows. No
 * chart library exists in this app, so the bars, podium and meter are Views.
 *
 * Status colours are the validated attendance set used on the web: present
 * #15803d, absent #dc2626, late #ca8a04, half-day #4f46e5 — every use carries
 * the word as well, and text on a tint takes the dark ink of its hue.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, Platform,
  KeyboardAvoidingView, ActivityIndicator, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { BASE_URL } from '@/api/axios';

export const BRAND = '#4F46E5';
export const INK = '#1E1B4B';
export const TEXT = '#0F172A';
export const MUTE = '#64748B';
export const LINE = '#E7E9F0';

// ── Status ───────────────────────────────────────────────────────────────────

export type StatusStyle = { label: string; dot: string; bg: string; fg: string; line: string };
export const STATUS: Record<string, StatusStyle> = {
  present:    { label: 'Present',    dot: '#15803D', bg: '#EFFCF4', fg: '#15803D', line: '#D7F5E3' },
  absent:     { label: 'Absent',     dot: '#DC2626', bg: '#FFF4F4', fg: '#B91C1C', line: '#FDE2E2' },
  late:       { label: 'Late',       dot: '#CA8A04', bg: '#FFFAEB', fg: '#92400E', line: '#FDEFC8' },
  leave:      { label: 'Leave',      dot: '#CA8A04', bg: '#FFFAEB', fg: '#92400E', line: '#FDEFC8' },
  'half-day': { label: 'Half-Day',   dot: '#4F46E5', bg: '#F4F3FF', fg: '#4338CA', line: '#E4E2FD' },
  holiday:    { label: 'Holiday',    dot: '#64748B', bg: '#F1F5F9', fg: '#475569', line: '#E2E8F0' },
  weekend:    { label: 'Weekend',    dot: '#CBD5E1', bg: '#FAFBFC', fg: '#94A3B8', line: '#F1F3F7' },
  unmarked:   { label: 'Not marked', dot: '#94A3B8', bg: '#FFFFFF', fg: '#64748B', line: '#D5DAE3' },
  pending:    { label: 'Not in yet', dot: '#94A3B8', bg: '#FFFFFF', fg: '#64748B', line: '#D5DAE3' },
  approved:   { label: 'Approved',   dot: '#15803D', bg: '#DCFCE7', fg: '#166534', line: '#BBF7D0' },
  rejected:   { label: 'Rejected',   dot: '#DC2626', bg: '#FEE2E2', fg: '#B91C1C', line: '#FECACA' },
  waiting:    { label: 'Pending',    dot: '#CA8A04', bg: '#FEF3C7', fg: '#92400E', line: '#FDE68A' },
  reply:      { label: 'Reply needed', dot: '#CA8A04', bg: '#FEF3C7', fg: '#92400E', line: '#FDE68A' },
};
export const statusOf = (k?: string | null) => STATUS[String(k || 'unmarked')] || STATUS.unmarked;

/** The marks a teacher gives a student, in the order the register shows them. */
export const MARKS = ['present', 'absent', 'late', 'half-day'] as const;

export type Tone = 'indigo' | 'green' | 'amber' | 'red' | 'blue' | 'slate' | 'gold';
export const TONES: Record<Tone, { tile: string; line: string; icon: string; fg: string }> = {
  indigo: { tile: '#F4F3FF', line: '#E4E2FD', icon: '#E4E2FD', fg: '#4F46E5' },
  green:  { tile: '#EFFCF4', line: '#D7F5E3', icon: '#D9F7E6', fg: '#16A34A' },
  amber:  { tile: '#FFFAEB', line: '#FDEFC8', icon: '#FDEFC8', fg: '#D97706' },
  red:    { tile: '#FFF4F4', line: '#FDE2E2', icon: '#FDE3E3', fg: '#DC2626' },
  blue:   { tile: '#EFF6FF', line: '#DBEAFE', icon: '#DBEAFE', fg: '#2563EB' },
  slate:  { tile: '#F8FAFC', line: '#E2E8F0', icon: '#F1F5F9', fg: '#475569' },
  gold:   { tile: '#FFFBEB', line: '#FDEFC8', icon: '#FEF3C7', fg: '#F59E0B' },
};

// ── Dates ────────────────────────────────────────────────────────────────────
// Local calendar keys, never toISOString(): that is UTC, and in IST it shows
// yesterday until 5:30 in the morning.

const pad = (n: number) => String(n).padStart(2, '0');
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => keyOf(new Date());
/** 'YYYY-MM-DD' (or an ISO timestamp at UTC midnight) → a local Date on that day. */
export const dateOf = (key: string) => {
  const [y, m, d] = String(key).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const addDays = (key: string, n: number) => { const d = dateOf(key); d.setDate(d.getDate() + n); return keyOf(d); };
/** 'YYYY-MM' moved by n months. */
export const addMonths = (ym: string, n: number) => {
  const d = dateOf(`${ym}-01`); d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
/** "17 Sep 2026" */
export const fmtDay = (key?: string | null) => {
  if (!key) return '—';
  const d = dateOf(key);
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
};
/** "Friday, 11 Sep 2026" */
export const longDay = (key: string) => `${WEEKDAY[dateOf(key).getDay()]}, ${fmtDay(key)}`;
/** "September 2026" from 'YYYY-MM'. */
export const monthLabel = (ym: string) => { const d = dateOf(`${ym}-01`); return `${MONTH[d.getMonth()]} ${d.getFullYear()}`; };
/** "16 Sep, 10:30 AM" from a timestamp. */
export const fmtStamp = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${d.getDate()} ${MON[d.getMonth()]}, ${h}:${pad(d.getMinutes())} ${ap}`;
};
/** "08:05" → "8:05 AM" */
export const fmtClock = (hhmm?: string | null) => {
  if (!hhmm) return '';
  const [H, M] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(H)) return String(hhmm);
  return `${H % 12 || 12}:${pad(M || 0)} ${H >= 12 ? 'PM' : 'AM'}`;
};
export const workedFor = (a?: string, b?: string) => {
  if (!a || !b) return '';
  const [ah, am] = a.split(':').map(Number); const [bh, bm] = b.split(':').map(Number);
  const mins = (bh * 60 + bm) - (ah * 60 + am);
  return mins > 0 ? `${Math.floor(mins / 60)}h ${pad(mins % 60)}m` : '';
};
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** 40.5 → "40.5", 41 → "41": a half day is half a day, not a rounding error. */
export const num = (n?: number | null) => (n == null ? '—' : Number.isInteger(n) ? String(n) : n.toFixed(1));
export const errText = (e: any) => e?.data?.message ?? e?.message ?? 'Something went wrong';
export const fileUrl = (path?: string) => (!path ? '' : /^https?:/.test(path) ? path : `${BASE_URL.replace(/\/api\/?$/, '')}${path}`);
export const firstName = (name?: string) => String(name || '').split(/\s+/)[0] || 'Your child';

// ── Header & tabs ────────────────────────────────────────────────────────────

export function Head({ title, subtitle, icon = 'calendar', right }: {
  title: string; subtitle?: string; icon?: any; right?: React.ReactNode;
}) {
  return (
    <View style={s.head}>
      <View style={s.headBadge}><Ionicons name={icon} size={24} color={BRAND} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.headTitle}>{title}</Text>
        {subtitle ? <Text style={s.headSub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function TabBar({ tabs, value, onChange, counts = {} }: {
  tabs: { value: string; label: string; icon: any }[]; value: string; onChange: (v: string) => void; counts?: Record<string, number>;
}) {
  // A tab opened by a link can sit past the edge — bring the active one into view.
  const ref = useRef<ScrollView>(null);
  const [xs, setXs] = useState<Record<string, number>>({});
  useEffect(() => {
    if (xs[value] != null) ref.current?.scrollTo({ x: Math.max(0, xs[value] - 24), animated: true });
  }, [value, xs[value]]);
  return (
    <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} style={s.tabs} contentContainerStyle={s.tabsRow}>
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <TouchableOpacity key={t.value} style={[s.tab, on && s.tabOn]} onPress={() => onChange(t.value)}
            onLayout={(e) => { const x = e.nativeEvent.layout.x; setXs((o) => (o[t.value] === x ? o : { ...o, [t.value]: x })); }}
            accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label}>
            <Ionicons name={t.icon} size={15} color={on ? BRAND : MUTE} />
            <Text style={[s.tabText, on && s.tabTextOn]}>{t.label}</Text>
            {counts[t.value] ? <Text style={s.tabCount}>{counts[t.value]}</Text> : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/** Pills to pick one of a few — sections, subjects, periods, statuses. */
export function Chips({ options, value, onChange, label }: {
  options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; label?: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.chips}
      accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <TouchableOpacity key={o.value || 'all'} style={[s.chip, on && s.chipOn]} onPress={() => onChange(o.value)}
            accessibilityRole="radio" accessibilityState={{ selected: on }}>
            <Text style={[s.chipText, on && { color: '#fff' }]} numberOfLines={1}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ── Cards & figures ──────────────────────────────────────────────────────────

export function Card({ title, sub, icon, iconTone = 'indigo', right, children, style, flush }: {
  title?: string; sub?: string; icon?: any; iconTone?: Tone; right?: React.ReactNode;
  children?: React.ReactNode; style?: any; flush?: boolean;
}) {
  return (
    <View style={[s.card, style]}>
      {title || right ? (
        <View style={s.cardHead}>
          {icon ? <Ionicons name={icon} size={20} color={TONES[iconTone].fg} /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            {title ? <Text style={s.cardTitle}>{title}</Text> : null}
            {sub ? <Text style={s.cardSub}>{sub}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      <View style={flush ? null : s.cardBody}>{children}</View>
    </View>
  );
}

export const Tiles = ({ children }: { children: React.ReactNode }) => <View style={s.tiles}>{children}</View>;

/** One figure: icon, value, label; a share or change beside it; a quiet caption under. */
export function Tile({ icon, tone, value, label, note, noteTone, caption, captionTone, solid, wide }: {
  icon: any; tone: Tone; value: React.ReactNode; label: string; note?: React.ReactNode; noteTone?: Tone;
  caption?: string; captionTone?: Tone; solid?: boolean; wide?: boolean;
}) {
  const t = TONES[tone];
  return (
    <View style={[s.tile, { backgroundColor: t.tile, borderColor: t.line }, wide && { flexBasis: '100%' }]}>
      <View style={[s.tileIcon, { backgroundColor: solid ? t.fg : t.icon }]}>
        <Ionicons name={icon} size={20} color={solid ? '#fff' : t.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.tileTop}>
          <Text style={s.tileValue} numberOfLines={1}>{value}</Text>
          {note != null && note !== '' ? (
            typeof note === 'string'
              ? <Text style={[s.tileNote, { color: TONES[noteTone || tone].fg }]}>{note}</Text>
              : note
          ) : null}
        </View>
        <Text style={s.tileLabel} numberOfLines={1}>{label}</Text>
        {caption ? <Text style={[s.tileCaption, captionTone && { color: TONES[captionTone].fg, fontWeight: '600' }]} numberOfLines={1}>{caption}</Text> : null}
      </View>
    </View>
  );
}

/** "+5%" with an arrow, green when it is good news. */
export function Change({ value, good = 'up', unit = '%' }: { value?: number | null; good?: 'up' | 'down'; unit?: string }) {
  if (value == null) return <Text style={[s.change, { color: MUTE }]}>—</Text>;
  if (value === 0) return <Text style={[s.change, { color: MUTE }]}>±0{unit}</Text>;
  const up = value > 0;
  const fine = good === 'up' ? up : !up;
  const color = fine ? '#16A34A' : '#DC2626';
  return (
    <View style={s.changeRow}>
      <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={12} color={color} />
      <Text style={[s.change, { color }]}>{up ? '+' : ''}{value}{unit}</Text>
    </View>
  );
}

export function StatusPill({ status, label, small }: { status?: string | null; label?: string; small?: boolean }) {
  const st = statusOf(status);
  return (
    <View style={[s.pill, { backgroundColor: st.bg === '#FFFFFF' ? '#F1F5F9' : st.bg }, small && s.pillSmall]}>
      <Text style={[s.pillText, { color: st.fg }, small && { fontSize: 10.5 }]} numberOfLines={1}>{label || st.label}</Text>
    </View>
  );
}

export function Avatar({ name, size = 34 }: { name?: string; size?: number }) {
  const SOFT = [['#E7E5FF', '#4F46E5'], ['#FDE4EF', '#DB2777'], ['#D9F3F8', '#0E7490'], ['#EDE7FE', '#7C3AED'],
    ['#FFF0D1', '#C2410C'], ['#DFF1FD', '#0369A1'], ['#DCF7E8', '#15803D'], ['#FDE2E4', '#E11D48']];
  const [bg, fg] = SOFT[[...String(name || '')].reduce((n, c) => n + c.charCodeAt(0), 0) % SOFT.length];
  const initials = String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: size * 0.36 }}>{initials || '?'}</Text>
    </View>
  );
}

export function Btn({ label, icon, kind = 'ghost', onPress, busy, disabled, small, flex, accessibilityLabel }: {
  label: string; icon?: any; kind?: 'primary' | 'soft' | 'ghost' | 'approve' | 'reject'; onPress?: () => void;
  busy?: boolean; disabled?: boolean; small?: boolean; flex?: boolean; accessibilityLabel?: string;
}) {
  const k = BTN[kind];
  const off = disabled || busy;
  return (
    <TouchableOpacity onPress={onPress} disabled={off} activeOpacity={0.8} accessibilityLabel={accessibilityLabel || label}
      style={[s.btn, { backgroundColor: k.bg, borderColor: k.line }, small && s.btnSmall, flex && { flex: 1 }, off && { opacity: 0.5 }]}>
      {busy ? <ActivityIndicator size="small" color={k.fg} />
        : icon ? <Ionicons name={icon} size={small ? 15 : 17} color={k.fg} /> : null}
      <Text style={[s.btnText, { color: k.fg }, small && { fontSize: 12.5 }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}
const BTN = {
  primary: { bg: BRAND, line: BRAND, fg: '#fff' },
  soft:    { bg: '#EEF0FF', line: '#E0E4FF', fg: '#4338CA' },
  ghost:   { bg: '#fff', line: LINE, fg: TEXT },
  approve: { bg: '#16A34A', line: '#16A34A', fg: '#fff' },
  reject:  { bg: '#fff', line: '#F5A3A3', fg: '#DC2626' },
};

export function Callout({ tone = 'info', icon, title, body }: {
  tone?: 'info' | 'warn' | 'red' | 'amber'; icon?: any; title?: string; body?: string;
}) {
  const c = CALLOUT[tone];
  return (
    <View style={[s.callout, { backgroundColor: c.bg, borderColor: c.line }]}>
      <Ionicons name={icon || c.icon} size={18} color={c.icon2} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        {title ? <Text style={[s.calloutTitle, { color: c.fg }]}>{title}</Text> : null}
        {body ? <Text style={[s.calloutBody, { color: c.fg }]}>{body}</Text> : null}
      </View>
    </View>
  );
}
const CALLOUT = {
  info:  { bg: '#EFF6FF', line: '#DBEAFE', fg: '#1E3A8A', icon: 'information-circle-outline', icon2: '#2563EB' },
  warn:  { bg: '#FFFBEB', line: '#FDEFC8', fg: '#78350F', icon: 'alert-circle-outline', icon2: '#D97706' },
  amber: { bg: '#FFFAEB', line: '#FDEFC8', fg: '#78350F', icon: 'trending-down', icon2: '#D97706' },
  red:   { bg: '#FFF4F4', line: '#FDE2E2', fg: '#7F1D1D', icon: 'alert-circle', icon2: '#DC2626' },
} as const;

export function Blank({ icon, title, body }: { icon: any; title: string; body?: string }) {
  return (
    <View style={s.blank}>
      <View style={s.blankIcon}><Ionicons name={icon} size={22} color={MUTE} /></View>
      <Text style={s.blankTitle}>{title}</Text>
      {body ? <Text style={s.blankBody}>{body}</Text> : null}
    </View>
  );
}

export const Loading = () => <View style={{ paddingVertical: 40 }}><ActivityIndicator size="large" color={BRAND} /></View>;

// ── The month ────────────────────────────────────────────────────────────────

export type GridDay = { key: string; state?: string | null; tag?: string; sub?: string };

/**
 * A month, a week a row. Each day is tinted by its state and says it in a word
 * underneath (a dot alone at the narrowest), so the colour is never the only
 * way to read it.
 */
/** One-letter codes for a day cell — a word does not fit a seventh of a phone; the legend spells them out. */
export const CODE: Record<string, string> = {
  present: 'P', absent: 'A', late: 'L', 'half-day': '½', leave: 'Lv', holiday: 'Off', unmarked: '–', pending: '–',
};

export function MonthGrid({ days, selected, onSelect, loading }: {
  days: GridDay[]; selected?: string; onSelect?: (key: string) => void; loading?: boolean;
}) {
  const lead = days.length ? dateOf(days[0].key).getDay() : 0;
  const today = todayKey();
  const cells: (GridDay | null)[] = [...Array(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  return (
    <View style={loading ? { opacity: 0.55 } : null}>
      <View style={s.gridRow}>
        {WEEK.map((w) => <Text key={w} style={s.gridDow}>{w.slice(0, 1)}</Text>)}
      </View>
      {rows.map((row, i) => (
        <View key={i} style={s.gridRow}>
          {row.map((d, j) => {
            if (!d) return <View key={`b${j}`} style={s.gridCell} />;
            const st = d.state ? statusOf(d.state) : null;
            const on = d.key === selected;
            const future = !d.state;
            const off = d.state === 'weekend';
            const word = d.tag ?? (d.state ? CODE[d.state] || '' : '');
            return (
              <TouchableOpacity key={d.key} disabled={!onSelect || future || off} onPress={() => onSelect?.(d.key)}
                accessibilityLabel={`${fmtDay(d.key)}${st ? `, ${d.tag || st.label}` : ''}`}
                style={[s.gridCell, s.gridDay,
                  st && { backgroundColor: st.bg, borderColor: st.line },
                  d.state === 'unmarked' && { borderStyle: 'dashed' },
                  on && s.gridDayOn]}>
                <View style={[s.gridNumWrap, d.key === today && s.gridToday]}>
                  <Text style={[s.gridNum, (future || off) && { color: '#94A3B8', fontWeight: '500' }, d.key === today && { color: '#fff' }]}>
                    {dateOf(d.key).getDate()}
                  </Text>
                </View>
                {st && !off ? (
                  <View style={s.gridTag}>
                    {d.state !== 'holiday' && d.state !== 'unmarked' && d.state !== 'pending'
                      ? <View style={[s.gridDot, { backgroundColor: st.dot }]} /> : null}
                    {word ? <Text style={[s.gridWord, { color: st.fg }]} numberOfLines={1}>{word}</Text> : null}
                  </View>
                ) : null}
                {d.sub ? <Text style={s.gridSub} numberOfLines={1}>{d.sub}</Text> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function MonthNav({ label, onPrev, onNext, nextDisabled, onToday, todayDisabled }: {
  label: string; onPrev: () => void; onNext: () => void; nextDisabled?: boolean; onToday?: () => void; todayDisabled?: boolean;
}) {
  return (
    <View style={s.monthNav}>
      <TouchableOpacity style={s.iconBtn} onPress={onPrev} accessibilityLabel="Previous month">
        <Ionicons name="chevron-back" size={18} color={TEXT} />
      </TouchableOpacity>
      <Text style={s.monthNavLabel}>{label}</Text>
      {onToday ? (
        <TouchableOpacity style={[s.todayBtn, todayDisabled && { opacity: 0.45 }]} onPress={onToday} disabled={todayDisabled}>
          <Text style={s.todayBtnText}>Today</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={[s.iconBtn, nextDisabled && { opacity: 0.35 }]} onPress={onNext} disabled={nextDisabled} accessibilityLabel="Next month">
        <Ionicons name="chevron-forward" size={18} color={TEXT} />
      </TouchableOpacity>
    </View>
  );
}

export function Legend({ keys, labels = {}, codes = true }: { keys: string[]; labels?: Record<string, string>; codes?: boolean }) {
  return (
    <View style={s.legend}>
      {keys.map((k) => (
        <View key={k} style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: statusOf(k).dot }]} />
          <Text style={s.legendText}>{codes && CODE[k] ? <Text style={{ fontWeight: '800', color: statusOf(k).fg }}>{CODE[k]} </Text> : null}{labels[k] || statusOf(k).label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Pick a day from a small month — no native date picker is installed. */
export function DayPicker({ value, onChange, min, max }: { value: string; onChange: (k: string) => void; min?: string; max?: string }) {
  const [ym, setYm] = useState((value || max || todayKey()).slice(0, 7));
  useEffect(() => { if (value) setYm(value.slice(0, 7)); }, [value]);
  const [y, m] = ym.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  const days: GridDay[] = Array.from({ length: count }, (_, i) => ({ key: `${ym}-${pad(i + 1)}` }));
  const lead = dateOf(`${ym}-01`).getDay();
  const cells: (GridDay | null)[] = [...Array(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  return (
    <View style={s.picker}>
      <MonthNav label={monthLabel(ym)} onPrev={() => setYm(addMonths(ym, -1))} onNext={() => setYm(addMonths(ym, 1))}
        nextDisabled={!!max && `${addMonths(ym, 1)}-01` > max} />
      <View style={s.gridRow}>{WEEK.map((w) => <Text key={w} style={s.gridDow}>{w.slice(0, 1)}</Text>)}</View>
      {Array.from({ length: cells.length / 7 }, (_, i) => (
        <View key={i} style={s.gridRow}>
          {cells.slice(i * 7, i * 7 + 7).map((d, j) => {
            if (!d) return <View key={`b${j}`} style={s.pickCell} />;
            const out = (min && d.key < min) || (max && d.key > max);
            const on = d.key === value;
            return (
              <TouchableOpacity key={d.key} disabled={!!out} onPress={() => onChange(d.key)} style={[s.pickCell, on && s.pickOn]}
                accessibilityLabel={fmtDay(d.key)}>
                <Text style={[s.pickNum, out && { color: '#CBD5E1' }, on && { color: '#fff' }]}>{dateOf(d.key).getDate()}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ── Charts from Views ────────────────────────────────────────────────────────

/** One bar split by status, with the counts named underneath. */
export function SplitBar({ parts }: { parts: { key: string; label: string; n: number }[] }) {
  const total = parts.reduce((n, p) => n + p.n, 0);
  return (
    <View>
      <View style={s.split}>
        {total === 0 ? <View style={{ flex: 1, backgroundColor: '#EEF2F7' }} /> : parts.filter((p) => p.n > 0).map((p, i) => (
          <View key={p.key} style={{ flex: p.n, backgroundColor: statusOf(p.key).dot, marginLeft: i ? 2 : 0 }} />
        ))}
      </View>
      <View style={s.splitLegend}>
        {parts.map((p) => (
          <View key={p.key} style={s.splitItem}>
            <View style={[s.legendDot, { backgroundColor: statusOf(p.key).dot }]} />
            <Text style={s.splitLabel}>{p.label}</Text>
            <Text style={s.splitN}>{p.n}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** A percentage against a minimum, the minimum marked on the track. */
export function Meter({ value, mark = 75 }: { value?: number | null; mark?: number }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const low = value != null && value < mark;
  return (
    <View style={{ marginTop: 12, marginBottom: 22 }}>
      <View style={s.meter}>
        <View style={[s.meterFill, { width: `${v}%`, backgroundColor: low ? '#DC2626' : '#16A34A' }]} />
        <View style={[s.meterMark, { left: `${mark}%` }]} />
      </View>
      <Text style={[s.meterLabel, { left: `${mark}%` }]}>{mark}% minimum</Text>
    </View>
  );
}

const MEDAL: Record<number, { bg: string; fg: string; tile: string }> = {
  1: { bg: '#F5A300', fg: '#fff', tile: '#FFF7DB' },
  2: { bg: '#94A3B8', fg: '#fff', tile: '#EEF0FF' },
  3: { bg: '#D9772B', fg: '#fff', tile: '#FFEDEB' },
};

/** The top three, second · first · third, first standing tallest. */
export function Podium({ top, unit }: { top: any[]; unit: string }) {
  const order = [top[1], top[0], top[2]];
  const place = [2, 1, 3];
  return (
    <View style={s.podium}>
      {order.map((r, i) => (
        <View key={r?.student?._id || `empty-${i}`} style={[s.podiumStep, { backgroundColor: MEDAL[place[i]].tile, marginTop: place[i] === 1 ? 0 : 18 }]}>
          {r ? (
            <>
              {place[i] === 1 ? <Ionicons name="trophy" size={18} color="#F5A300" /> : <View style={{ height: 18 }} />}
              <Avatar name={r.student.name} size={42} />
              <View style={[s.medal, { backgroundColor: MEDAL[place[i]].bg }]}><Text style={s.medalText}>{place[i]}</Text></View>
              <Text style={s.podiumName} numberOfLines={2}>{r.student.name}</Text>
              <Text style={s.podiumPct}>{r.percentage}%</Text>
              <Text style={s.podiumCap}>({num(r.attended)}/{r.total} {unit})</Text>
            </>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// Band colours as the web draws them; each column is named and counted, so
// colour is never the only way to tell them apart.
const BAND: Record<string, string> = { 95: '#22C55E', 90: '#3B82F6', 80: '#FBBF24', 0: '#EF4444' };

export function Bands({ bands }: { bands: { key: string; label: string; count: number }[] }) {
  const max = Math.max(1, ...bands.map((b) => b.count));
  return (
    <View style={s.bands}>
      {bands.map((b) => (
        <View key={b.key} style={s.band} accessibilityLabel={`${b.label}: ${b.count} students`}>
          <Text style={s.bandCount}>{b.count}</Text>
          <View style={s.bandTrack}>
            <View style={[s.bandBar, { height: `${(b.count / max) * 100}%`, backgroundColor: BAND[b.key] }]} />
          </View>
          <Text style={s.bandLabel} numberOfLines={1}>{b.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── History ──────────────────────────────────────────────────────────────────

export type Step = { key: string; tone: string; title: string; by?: string; at?: string | null; message?: string };
const STEP_DOT: Record<string, string> = { green: '#22C55E', amber: '#F5B400', red: '#EF4444', indigo: '#6366F1', slate: '#64748B', muted: '#CBD5E1' };

export function Timeline({ steps }: { steps: Step[] }) {
  return (
    <View>
      {steps.map((e, i) => (
        <View key={e.key} style={s.step}>
          <View style={s.stepRail}>
            <View style={[s.stepDot, { backgroundColor: STEP_DOT[e.tone] || STEP_DOT.indigo }]} />
            {i < steps.length - 1 ? <View style={s.stepLine} /> : null}
          </View>
          <View style={{ flex: 1, minWidth: 0, paddingBottom: i < steps.length - 1 ? 14 : 0 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={[s.stepTitle, { flex: 1 }]}>{e.title}</Text>
              {e.at ? <Text style={s.stepAt}>{fmtStamp(e.at)}</Text> : null}
            </View>
            {e.by ? <Text style={s.stepBy}>{e.by}</Text> : null}
            {e.message ? <Text style={s.stepMsg}>{e.message}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const EVENT: Record<string, { title: string; tone: string }> = {
  submitted:      { title: 'Request submitted',          tone: 'green' },
  info_requested: { title: 'More information requested', tone: 'amber' },
  replied:        { title: 'Reply sent',                 tone: 'indigo' },
  approved:       { title: 'Approved',                   tone: 'green' },
  rejected:       { title: 'Rejected',                   tone: 'red' },
  corrected:      { title: 'Corrected by the teacher',   tone: 'indigo' },
};
const ROLE: Record<string, string> = { student: 'Student', teacher: 'Teacher', school_admin: 'School Office' };

/** A correction request's history as steps, ending on what it is waiting for. */
export function requestSteps(r: any, waitingFor: 'student' | 'teacher-view' | 'student-view' | 'parent-view'): Step[] {
  const steps: Step[] = (r.history || []).map((h: any, i: number) => ({
    key: `${h.event}-${h.at}-${i}`,
    tone: EVENT[h.event]?.tone || 'indigo',
    title: EVENT[h.event]?.title || h.event,
    by: h.byName ? `By ${h.byName}${ROLE[h.role] ? ` (${ROLE[h.role]})` : ''}` : '',
    at: h.at,
    message: h.event === 'submitted' ? '' : h.message,
  }));
  if (!steps.length) steps.push({ key: 'created', tone: 'green', title: 'Request submitted', at: r.createdAt });
  if (r.status === 'pending') {
    steps.push(r.awaitingReply
      ? { key: 'wait', tone: 'muted', title: waitingFor === 'student-view' ? 'Waiting for your reply' : 'Waiting for the student’s reply' }
      : { key: 'wait', tone: 'muted', title: 'Waiting for the teacher’s review' });
  }
  return steps;
}
/** A request's status as the pill says it. */
export const requestPill = (r: any) => (r.awaitingReply ? 'reply' : r.status === 'pending' ? 'waiting' : r.status);

// ── Forms ────────────────────────────────────────────────────────────────────

export function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.fieldLabel}>{label}{required ? <Text style={{ color: '#DC2626' }}> *</Text> : null}</Text>
      {children}
      {hint ? <Text style={s.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Box({ value, onChange, placeholder, multiline, maxLength = 500, keyboardType, label }: {
  value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; maxLength?: number; keyboardType?: any; label?: string;
}) {
  return (
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#94A3B8"
      multiline={multiline} maxLength={maxLength} keyboardType={keyboardType} accessibilityLabel={label || placeholder}
      style={[s.box, multiline && { minHeight: 84, textAlignVertical: 'top' }]} />
  );
}

/** Present / Absent / Late / Half-Day as four choices. */
export function MarkPick({ value, onChange, options = [...MARKS] }: { value: string; onChange: (m: string) => void; options?: string[] }) {
  return (
    <View style={s.markPick}>
      {options.map((m) => {
        const st = statusOf(m); const on = value === m;
        return (
          <TouchableOpacity key={m} onPress={() => onChange(m)} accessibilityRole="radio" accessibilityState={{ selected: on }}
            style={[s.mark, on && { backgroundColor: st.bg, borderColor: st.dot }]}>
            <View style={[s.markRing, { borderColor: st.dot }, on && { backgroundColor: st.dot }]}>
              {on ? <Ionicons name="checkmark" size={10} color="#fff" /> : null}
            </View>
            <Text style={[s.markText, on && { color: st.fg, fontWeight: '700' }]}>{st.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export type Picked = { uri: string; name: string; mimeType?: string; size?: number; file?: any };

/** Up to three files, 5 MB each — the server's limits, said before upload. */
export function FilePick({ files, onFiles, label = 'Attach proof (optional)', onError }: {
  files: Picked[]; onFiles: (f: Picked[]) => void; label?: string; onError?: (msg: string) => void;
}) {
  const pick = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
        multiple: true, copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      let next: Picked[] = [...files, ...res.assets.map((a: any) => ({ uri: a.uri, name: a.name || 'file', mimeType: a.mimeType, size: a.size, file: a.file }))];
      if (next.length > 3) { onError?.('Attach at most 3 files'); next = next.slice(0, 3); }
      const big = next.find((f) => (f.size || 0) > 5 * 1024 * 1024);
      if (big) { onError?.(`${big.name} is larger than 5 MB`); next = next.filter((f) => f !== big); }
      onFiles(next);
    } catch (e: any) { onError?.(errText(e)); }
  };
  return (
    <View>
      <TouchableOpacity style={s.drop} onPress={pick} accessibilityLabel={label}>
        <Ionicons name="cloud-upload-outline" size={20} color="#4338CA" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.dropTitle}>{label}</Text>
          <Text style={s.dropSub}>A medical certificate or a note from home — up to 3 files, 5 MB each</Text>
        </View>
      </TouchableOpacity>
      {files.length ? (
        <View style={s.files}>
          {files.map((f, i) => (
            <View key={`${f.name}-${i}`} style={s.fileChip}>
              <Ionicons name={/pdf$/i.test(f.name) ? 'document-text-outline' : /\.(png|jpe?g)$/i.test(f.name) ? 'image-outline' : 'document-outline'} size={14} color="#3730A3" />
              <Text style={s.fileChipText} numberOfLines={1}>{f.name}</Text>
              <TouchableOpacity onPress={() => onFiles(files.filter((_, j) => j !== i))} accessibilityLabel={`Remove ${f.name}`} hitSlop={8}>
                <Ionicons name="close" size={14} color="#3730A3" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Append picked files to a multipart body — a web File where there is one, else the native { uri, name, type }. */
export function appendFiles(body: FormData, files: Picked[]) {
  files.forEach((f) => {
    if (Platform.OS === 'web' && f.file) body.append('attachments', f.file);
    else body.append('attachments', { uri: f.uri, name: f.name, type: f.mimeType || 'application/octet-stream' } as any);
  });
}

export function Attachments({ files }: { files: any[] }) {
  if (!files?.length) return null;
  return (
    <View style={s.files}>
      {files.map((f: any, i: number) => {
        const url = typeof f === 'string' ? f : f.url;
        const name = typeof f === 'string' ? f.split('/').pop() : f.name;
        return (
          <TouchableOpacity key={`${url}-${i}`} style={s.fileLink} onPress={() => Linking.openURL(fileUrl(url))} accessibilityLabel={`Open ${name}`}>
            <Ionicons name={/pdf/i.test(`${f.type || ''}${name}`) ? 'document-text-outline' : 'attach-outline'} size={15} color="#3B5BDB" />
            <Text style={s.fileLinkText} numberOfLines={1}>{name}</Text>
            <Ionicons name="open-outline" size={13} color="#3B5BDB" />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** A full-screen form: title bar, scrolling body, footer buttons kept above the keyboard. */
export function Sheet({ visible, icon = 'create-outline', title, subtitle, onClose, footer, children, busy }: {
  visible: boolean; icon?: any; title: string; subtitle?: string; onClose: () => void;
  footer?: React.ReactNode; children: React.ReactNode; busy?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}>
      <KeyboardAvoidingView style={s.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.sheetHead, { paddingTop: Platform.OS === 'ios' ? 16 : 16 + insets.top }]}>
          <View style={s.sheetIcon}><Ionicons name={icon} size={19} color={BRAND} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.sheetTitle} numberOfLines={2}>{title}</Text>
            {subtitle ? <Text style={s.sheetSub}>{subtitle}</Text> : null}
          </View>
          <TouchableOpacity onPress={onClose} disabled={busy} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={MUTE} />
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.sheetBody} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer ? <View style={[s.sheetFoot, { paddingBottom: 12 + insets.bottom }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A short message that clears itself — Alert.alert does nothing on the web build. */
export function useFlash() {
  const [flash, setFlash] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), 3200);
    return () => clearTimeout(t);
  }, [flash]);
  const node = flash ? (
    <View style={[s.flash, flash.tone === 'good' ? s.flashGood : s.flashBad]} accessibilityLiveRegion="polite">
      <Ionicons name={flash.tone === 'good' ? 'checkmark-circle' : 'alert-circle'} size={17} color={flash.tone === 'good' ? '#15803D' : '#B91C1C'} />
      <Text style={[s.flashText, { color: flash.tone === 'good' ? '#14532D' : '#7F1D1D' }]}>{flash.text}</Text>
    </View>
  ) : null;
  return {
    node,
    good: (text: string) => setFlash({ tone: 'good', text }),
    bad: (text: string) => setFlash({ tone: 'bad', text }),
  };
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  headBadge: { width: 48, height: 48, borderRadius: 13, backgroundColor: '#EBEAFF', alignItems: 'center', justifyContent: 'center' },
  headTitle: { fontSize: 22, fontWeight: '800', color: INK, letterSpacing: -0.4 },
  headSub: { fontSize: 12.5, color: MUTE, marginTop: 2, lineHeight: 17 },

  tabs: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: LINE, marginBottom: 14 },
  tabsRow: { gap: 2 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, height: 42, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  tabOn: { borderBottomColor: BRAND },
  tabText: { fontSize: 13, fontWeight: '500', color: '#475569' },
  tabTextOn: { color: BRAND, fontWeight: '700' },
  tabCount: { minWidth: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: '#FEE2E2', color: '#B91C1C', fontSize: 10.5, fontWeight: '700', textAlign: 'center', overflow: 'hidden' },

  chips: { gap: 8, paddingBottom: 2 },
  chip: { height: 34, paddingHorizontal: 13, borderRadius: 9, borderWidth: 1, borderColor: LINE, backgroundColor: '#fff', justifyContent: 'center', maxWidth: 240 },
  chipOn: { backgroundColor: BRAND, borderColor: BRAND },
  chipText: { fontSize: 12.5, fontWeight: '600', color: '#334155' },

  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: LINE, marginBottom: 12, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 },
  cardTitle: { fontSize: 15.5, fontWeight: '700', color: INK },
  cardSub: { fontSize: 12, color: MUTE, marginTop: 1 },
  cardBody: { paddingHorizontal: 14, paddingBottom: 14 },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  tile: { flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 12, borderWidth: 1, minWidth: 0 },
  tileIcon: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  tileValue: { fontSize: 20, fontWeight: '800', color: TEXT, letterSpacing: -0.4 },
  tileNote: { fontSize: 12, fontWeight: '700' },
  tileLabel: { fontSize: 12.5, color: '#334155', marginTop: 1 },
  tileCaption: { fontSize: 11, color: MUTE, marginTop: 1 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  change: { fontSize: 12, fontWeight: '700' },

  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  pillSmall: { paddingHorizontal: 7, paddingVertical: 2 },
  pillText: { fontSize: 11.5, fontWeight: '700' },

  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 42, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1 },
  btnSmall: { height: 34, paddingHorizontal: 11, borderRadius: 8 },
  btnText: { fontSize: 13.5, fontWeight: '700' },

  callout: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  calloutTitle: { fontSize: 13.5, fontWeight: '700' },
  calloutBody: { fontSize: 12.5, marginTop: 2, lineHeight: 17 },

  blank: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 16 },
  blankIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  blankTitle: { fontSize: 14, fontWeight: '700', color: TEXT, textAlign: 'center' },
  blankBody: { fontSize: 12.5, color: MUTE, textAlign: 'center', marginTop: 4, lineHeight: 17 },

  gridRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  gridDow: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: MUTE },
  gridCell: { flex: 1, minHeight: 50 },
  gridDay: { borderRadius: 8, borderWidth: 1, borderColor: LINE, backgroundColor: '#fff', padding: 4, justifyContent: 'space-between', overflow: 'hidden' },
  gridDayOn: { borderWidth: 2, borderColor: BRAND, padding: 3 },
  gridNumWrap: { alignSelf: 'flex-start', minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  gridToday: { backgroundColor: BRAND },
  gridNum: { fontSize: 12, fontWeight: '700', color: TEXT },
  gridTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  gridDot: { width: 6, height: 6, borderRadius: 3 },
  gridWord: { fontSize: 10, fontWeight: '800', flexShrink: 1 },
  gridSub: { fontSize: 8, color: MUTE },

  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  monthNavLabel: { flex: 1, fontSize: 14.5, fontWeight: '700', color: TEXT, textAlign: 'center' },
  iconBtn: { width: 36, height: 36, borderRadius: 9, borderWidth: 1, borderColor: LINE, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  todayBtn: { height: 36, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: LINE, backgroundColor: '#fff', justifyContent: 'center' },
  todayBtnText: { fontSize: 12.5, fontWeight: '600', color: TEXT },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11.5, color: '#475569' },

  picker: { borderWidth: 1, borderColor: LINE, borderRadius: 12, padding: 10, backgroundColor: '#fff' },
  pickCell: { flex: 1, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  pickOn: { backgroundColor: BRAND },
  pickNum: { fontSize: 13, fontWeight: '600', color: TEXT },

  split: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: '#EEF2F7' },
  splitLegend: { marginTop: 12, gap: 8 },
  splitItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  splitLabel: { flex: 1, fontSize: 13, color: '#334155' },
  splitN: { fontSize: 13, fontWeight: '700', color: TEXT },

  meter: { height: 10, borderRadius: 5, backgroundColor: '#EEF2F7' },
  meterFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 5 },
  meterMark: { position: 'absolute', top: -4, bottom: -4, width: 2, marginLeft: -1, backgroundColor: TEXT, borderRadius: 1 },
  meterLabel: { position: 'absolute', top: 16, fontSize: 10.5, color: '#475569', transform: [{ translateX: -34 }], width: 80 },

  podium: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  podiumStep: { flex: 1, alignItems: 'center', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6, minHeight: 170 },
  medal: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: -8, borderWidth: 2, borderColor: '#fff' },
  medalText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  podiumName: { fontSize: 12, fontWeight: '700', color: TEXT, textAlign: 'center', marginTop: 4 },
  podiumPct: { fontSize: 18, fontWeight: '800', color: '#16A34A', marginTop: 2 },
  podiumCap: { fontSize: 10.5, color: MUTE, textAlign: 'center' },

  bands: { flexDirection: 'row', gap: 10, height: 150, alignItems: 'flex-end' },
  band: { flex: 1, alignItems: 'center', height: '100%' },
  bandCount: { fontSize: 12, fontWeight: '700', color: TEXT, marginBottom: 3 },
  bandTrack: { flex: 1, width: '70%', justifyContent: 'flex-end' },
  bandBar: { width: '100%', borderTopLeftRadius: 5, borderTopRightRadius: 5, minHeight: 2 },
  bandLabel: { fontSize: 10, color: '#475569', marginTop: 5 },

  step: { flexDirection: 'row', gap: 10 },
  stepRail: { width: 14, alignItems: 'center' },
  stepDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  stepLine: { flex: 1, width: 2, backgroundColor: '#E6E8EF', marginTop: 3 },
  stepTitle: { fontSize: 13, fontWeight: '700', color: TEXT },
  stepAt: { fontSize: 11, color: MUTE },
  stepBy: { fontSize: 11.5, color: MUTE, marginTop: 1 },
  stepMsg: { fontSize: 12.5, color: '#334155', marginTop: 6, padding: 8, borderRadius: 8, backgroundColor: '#F8FAFC' },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  fieldHint: { fontSize: 11.5, color: MUTE, marginTop: 4 },
  box: { borderWidth: 1, borderColor: '#DDE1EA', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: TEXT, backgroundColor: '#fff' },

  markPick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mark: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 11, borderRadius: 8, borderWidth: 1, borderColor: '#E2E5EC', backgroundColor: '#fff' },
  markRing: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  markText: { fontSize: 13, color: '#334155' },

  drop: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C7D2FE', backgroundColor: '#F8F9FF' },
  dropTitle: { fontSize: 13, fontWeight: '700', color: '#4338CA' },
  dropSub: { fontSize: 11, color: MUTE, marginTop: 1 },
  files: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  fileChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8, backgroundColor: '#EEF0FF', maxWidth: '100%' },
  fileChipText: { fontSize: 12, color: '#3730A3', flexShrink: 1 },
  fileLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 9, borderRadius: 8, borderWidth: 1, borderColor: '#D6DCFB', maxWidth: '100%' },
  fileLinkText: { fontSize: 12.5, fontWeight: '600', color: '#3B5BDB', flexShrink: 1 },

  sheet: { flex: 1, backgroundColor: '#F8F9FC' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: LINE },
  sheetIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#EEF0FF', alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: INK },
  sheetSub: { fontSize: 12, color: MUTE, marginTop: 2 },
  sheetBody: { padding: 16, paddingBottom: 30 },
  sheetFoot: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: LINE },

  flash: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  flashGood: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  flashBad: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  flashText: { flex: 1, fontSize: 13, fontWeight: '600' },
});

export const styles = s;
export const APP_BG = Colors.background;
