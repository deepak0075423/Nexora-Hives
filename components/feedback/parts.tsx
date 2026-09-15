/**
 * Teacher Feedback on the phone — the pieces every feedback screen is built from.
 *
 * The same language as the web module (school-frontend/src/pages/feedback):
 * a hero band, tinted figure tiles, white panels, rating bars on a fixed 0–5
 * scale, and a neutral dashed pill wherever the privacy floor withholds a
 * number. At phone width the tiles go two across and a table becomes a stack of
 * rows, because a seven-column table on a 390pt screen is a scroll bar.
 *
 * Rules carried over from the web kit:
 *   • A rating bar is proportional to 5, never to the widest value on screen,
 *     and the number is always printed beside it.
 *   • A withheld figure wears no rating colour at all — tinting it would let a
 *     reader guess at the number the floor exists to hide.
 *   • Tints carry identity, not magnitude: a green tile says "responses", not "good".
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Image,
  ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BASE_URL } from '@/api/axios';
import { Colors, Radius } from '@/constants/theme';
import { MODULE_BLOCKED_CODES, unwrap } from '@/components/ui/kit';

// ── Palette ───────────────────────────────────────────────────────────────────

export const BRAND = '#4F46E5';

export type Tone = 'purple' | 'indigo' | 'blue' | 'green' | 'amber' | 'pink' | 'red' | 'teal' | 'slate' | 'orange';

/** tile = the soft ground of a figure tile; soft = an icon square or pill; fg = ink. */
export const TINT: Record<Tone, { tile: string; soft: string; fg: string }> = {
  purple: { tile: '#F5F3FF', soft: '#EDE9FE', fg: '#7C3AED' },
  indigo: { tile: '#EEF2FF', soft: '#E0E7FF', fg: '#4F46E5' },
  blue:   { tile: '#EFF6FF', soft: '#DBEAFE', fg: '#2563EB' },
  green:  { tile: '#ECFDF5', soft: '#D1FAE5', fg: '#059669' },
  amber:  { tile: '#FFFBEB', soft: '#FEF3C7', fg: '#D97706' },
  pink:   { tile: '#FDF2F8', soft: '#FCE7F3', fg: '#DB2777' },
  red:    { tile: '#FEF2F2', soft: '#FEE2E2', fg: '#DC2626' },
  teal:   { tile: '#F0FDFA', soft: '#CCFBF1', fg: '#0D9488' },
  orange: { tile: '#FFF7ED', soft: '#FFEDD5', fg: '#EA580C' },
  slate:  { tile: '#F8FAFC', soft: '#F1F5F9', fg: '#64748B' },
};

const ROTA: Tone[] = ['purple', 'blue', 'green', 'amber', 'pink', 'teal', 'indigo', 'orange'];
export const toneAt = (i: number): Tone => ROTA[((i % ROTA.length) + ROTA.length) % ROTA.length];

/** Bar colours for a series — the web palette, validated there. */
export const SERIES = ['#8B5CF6', '#38BDF8', '#34D399', '#FBBF24', '#F472B6', '#2DD4BF', '#818CF8', '#FB923C'];

const TRACK = '#EEF2F7';

// ── Words and numbers ─────────────────────────────────────────────────────────

export const ratingWord = (v?: number | null) =>
  (v == null ? '' : v >= 4.5 ? 'Excellent' : v >= 4 ? 'Very Good' : v >= 3.5 ? 'Good' : v >= 3 ? 'Average' : v >= 2 ? 'Needs Improvement' : 'Poor');

export const RATING_LABELS: Record<number, string> = { 1: 'Poor', 2: 'Needs Improvement', 3: 'Average', 4: 'Good', 5: 'Excellent' };
export const EMOJI: Record<number, string> = { 1: '😞', 2: '🙁', 3: '😐', 4: '🙂', 5: '😄' };

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A campaign date as it was entered. Stored as UTC midnight, so the ISO day is
 * read as written — a local Date would move it to yesterday west of Greenwich.
 */
export function fmtDay(d?: string | Date | null) {
  if (!d) return '—';
  const iso = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
  const [y, m, day] = iso.split('-').map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Today's LOCAL date — an ISO string of now is the UTC date, which in India before 05:30 is yesterday. */
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** A YYYY-MM-DD plus n days, done in UTC so no timezone can move the day. */
export const addDays = (iso: string, n: number) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
export const isoOf = (d?: string | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');
export const daysBetween = (a?: string, b?: string) => {
  if (!a || !b) return null;
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
};

/** Whole calendar days until a closing date: 0 on the day itself, negative once past. */
export function daysLeft(end?: string | Date | null) {
  if (!end) return null;
  const iso = isoOf(end);
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  return Math.round((new Date(y, m - 1, d).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
}

export function closesIn(end?: string | Date | null): { text: string; tone: Tone; left: number | null } {
  const left = daysLeft(end);
  if (left == null) return { text: '', tone: 'slate', left };
  if (left < 0) return { text: 'Closed', tone: 'slate', left };
  if (left === 0) return { text: 'Closes today', tone: 'red', left };
  if (left === 1) return { text: 'Closes tomorrow', tone: 'red', left };
  return { text: `Closes in ${left} days`, tone: left <= 3 ? 'amber' : 'blue', left };
}

/** Rough time to fill a questionnaire in, at about eight seconds a question. */
export const minutesFor = (n: number) => Math.max(1, Math.round(((n || 0) * 8) / 60));

export const errText = (e: any) => e?.data?.message ?? e?.message ?? 'Something went wrong';

const UPLOADS_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');
export const photoUrl = (p?: string | null) =>
  (!p ? null : /^https?:/.test(p) ? p : `${UPLOADS_ORIGIN}${p.startsWith('/') ? p : `/uploads/images/${p}`}`);

// ── Loading ───────────────────────────────────────────────────────────────────

/**
 * One endpoint's state. A module-blocked answer is handed to `onBlocked` so the
 * route can swap to <ModuleDisabled/>; any other failure is kept as an error the
 * screen can print, never a blank.
 */
export function useLoad<T = any>(fetch: () => Promise<any>, deps: any[], opts: { onBlocked?: () => void; skip?: boolean } = {}) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!opts.skip);
  const [refreshing, setRefreshing] = useState(false);
  const run = useRef(0);
  const blocked = useRef(opts.onBlocked);
  blocked.current = opts.onBlocked;

  const load = useCallback(async (soft = false) => {
    if (opts.skip) return;
    const mine = ++run.current;
    if (soft) setRefreshing(true); else setLoading(true);
    try {
      const body = unwrap(await fetch());
      if (mine === run.current) { setData(body); setError(''); }
    } catch (e: any) {
      if (mine !== run.current) return;
      if (MODULE_BLOCKED_CODES.includes(e?.data?.code)) blocked.current?.();
      setError(errText(e));
    } finally {
      if (mine === run.current) { setLoading(false); setRefreshing(false); }
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  return { data, error, loading, refreshing, reload: () => load(true), setData };
}

/** A short confirmation line at the top of a screen, gone after a few seconds. */
export function useFlash() {
  const [msg, setMsg] = useState<{ text: string; tone: Tone } | null>(null);
  const timer = useRef<any>(null);
  const show = useCallback((text: string, tone: Tone = 'green') => {
    setMsg({ text, tone });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 4000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const node = msg ? <NoteBar tone={msg.tone} icon={msg.tone === 'red' ? 'alert-circle' : 'checkmark-circle'}>{msg.text}</NoteBar> : null;
  return [node, show] as const;
}

// ── Screen shell ──────────────────────────────────────────────────────────────

export function Page({ children, refreshing, onRefresh }: {
  children: React.ReactNode; refreshing?: boolean; onRefresh?: () => void;
}) {
  return (
    <ScrollView
      style={s.page}
      contentContainerStyle={s.pageIn}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={BRAND} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export const Loading = () => (
  <View style={s.loading}><ActivityIndicator size="large" color={BRAND} /></View>
);

/** The module's section rail — the web's tab rail, scrolled sideways on a phone. */
export function Rail({ tabs, value, onChange }: {
  tabs: { key: string; label: string; icon: any }[]; value: string; onChange: (k: string) => void;
}) {
  return (
    <View style={s.railWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>
        {tabs.map((t) => {
          const on = t.key === value;
          return (
            <TouchableOpacity key={t.key} style={[s.railTab, on && s.railTabOn]} onPress={() => onChange(t.key)}
              accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <Ionicons name={t.icon} size={15} color={on ? '#fff' : Colors.textSecondary} />
              <Text style={[s.railText, on && { color: '#fff' }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

export function Hero({ icon, tone = 'purple', title, subtitle, children }: {
  icon: any; tone?: Tone; title: string; subtitle?: string; children?: React.ReactNode;
}) {
  const t = TINT[tone];
  return (
    <View style={s.hero}>
      <View style={s.heroTop}>
        <View style={[s.heroIcon, { backgroundColor: t.soft }]}>
          <Ionicons name={icon} size={24} color={t.fg} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.heroTitle}>{title}</Text>
          {subtitle ? <Text style={s.heroSub}>{subtitle}</Text> : null}
        </View>
      </View>
      {children ? <View style={s.heroActs}>{children}</View> : null}
    </View>
  );
}

// ── Figure tiles ──────────────────────────────────────────────────────────────

export const Tiles = ({ children }: { children: React.ReactNode }) => <View style={s.tiles}>{children}</View>;

export function Tile({ icon, tone = 'purple', value, unit, label, caption, delta, deltaDir = 'up', onPress, on }: {
  icon: any; tone?: Tone; value: React.ReactNode; unit?: string; label: string; caption?: string;
  delta?: string | null; deltaDir?: 'up' | 'down' | 'flat'; onPress?: () => void; on?: boolean;
}) {
  const t = TINT[tone];
  const Wrap: any = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={[s.tile, { backgroundColor: t.tile }, on && s.tileOn]} onPress={onPress} activeOpacity={0.75}
      accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={onPress ? label : undefined}>
      <View style={s.tileTop}>
        <View style={[s.tileIcon, { backgroundColor: t.soft }]}>
          <Ionicons name={icon} size={18} color={t.fg} />
        </View>
        {delta != null && delta !== '' ? (
          <View style={[s.delta, deltaDir === 'up' ? s.deltaUp : deltaDir === 'down' ? s.deltaDown : s.deltaFlat]}>
            <Ionicons name={deltaDir === 'up' ? 'arrow-up' : deltaDir === 'down' ? 'arrow-down' : 'remove'} size={10}
              color={deltaDir === 'up' ? '#15803D' : deltaDir === 'down' ? '#B91C1C' : Colors.textSecondary} />
            <Text style={[s.deltaText, { color: deltaDir === 'up' ? '#15803D' : deltaDir === 'down' ? '#B91C1C' : Colors.textSecondary }]}>{delta}</Text>
          </View>
        ) : null}
      </View>
      <Text style={s.tileValue} numberOfLines={1}>
        {value}{unit ? <Text style={s.tileUnit}> {unit}</Text> : null}
      </Text>
      <Text style={s.tileLabel} numberOfLines={1}>{label}</Text>
      {caption ? <Text style={s.tileCap} numberOfLines={2}>{caption}</Text> : null}
    </Wrap>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function Panel({ icon, tone = 'purple', title, subtitle, right, children, flush }: {
  icon?: any; tone?: Tone; title: string; subtitle?: string; right?: React.ReactNode; children?: React.ReactNode; flush?: boolean;
}) {
  const t = TINT[tone];
  return (
    <View style={s.panel}>
      <View style={s.panelHead}>
        {icon ? (
          <View style={[s.panelIcon, { backgroundColor: t.soft }]}><Ionicons name={icon} size={16} color={t.fg} /></View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.panelTitle}>{title}</Text>
          {subtitle ? <Text style={s.panelSub}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children != null ? <View style={flush ? null : s.panelBody}>{children}</View> : null}
    </View>
  );
}

export const Muted = ({ children }: { children: React.ReactNode }) => <Text style={s.muted}>{children}</Text>;

export const SubHead = ({ children }: { children: React.ReactNode }) => <Text style={s.subhead}>{children}</Text>;

// ── Pills ─────────────────────────────────────────────────────────────────────

export function Tag({ label, tone = 'slate', icon }: { label: string; tone?: Tone; icon?: any }) {
  const t = TINT[tone];
  return (
    <View style={[s.tag, { backgroundColor: t.soft }]}>
      {icon ? <Ionicons name={icon} size={11} color={t.fg} /> : null}
      <Text style={[s.tagText, { color: t.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function Dot({ label, tone = 'slate' }: { label: string; tone?: Tone }) {
  const t = TINT[tone];
  return (
    <View style={[s.dot, { backgroundColor: t.tile, borderColor: t.soft }]}>
      <View style={[s.dotI, { backgroundColor: t.fg }]} />
      <Text style={[s.tagText, { color: t.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export const TagRow = ({ children }: { children: React.ReactNode }) => <View style={s.tagRow}>{children}</View>;

// ── Ratings ───────────────────────────────────────────────────────────────────

/** "★ 4.3" with a small line under it. Null reads as a dash, never as a nought. */
export function Rating({ value, sub, big }: { value?: number | null; sub?: string; big?: boolean }) {
  return (
    <View style={{ alignItems: big ? 'flex-start' : 'flex-end' }}>
      <View style={s.rating}>
        <Ionicons name="star" size={big ? 22 : 13} color="#F59E0B" />
        <Text style={[s.ratingV, big && s.ratingBig]}>{value == null ? '—' : Number(value).toFixed(1)}</Text>
        {big ? <Text style={s.ratingOf}>/ 5.0</Text> : null}
      </View>
      {sub ? <Text style={s.ratingSub}>{sub}</Text> : null}
    </View>
  );
}

export function Stars({ value = 0, size = 16 }: { value?: number; size?: number }) {
  return (
    <Text style={{ fontSize: size, letterSpacing: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => <Text key={n} style={{ color: value >= n ? '#F59E0B' : '#E2E8F0' }}>★</Text>)}
    </Text>
  );
}

/** Why one figure is not shown — neutral and dashed, whatever the number was. */
export function Withheld({ reason, responses = 0, minimum = 0 }: { reason?: string | null; responses?: number; minimum?: number }) {
  const text = reason === 'protect' ? 'Hidden to protect others'
    : reason === 'none' || responses === 0 ? 'No responses'
    : `${responses} of ${minimum}`;
  return (
    <View style={s.locked} accessibilityLabel={reason === 'protect'
      ? 'Hidden, because showing it would let a smaller hidden group be worked out'
      : `${responses} of ${minimum} responses needed`}>
      <Ionicons name="key-outline" size={11} color={Colors.textSecondary} />
      <Text style={s.lockedText}>{text}</Text>
    </View>
  );
}

/** A rating when it can be shown, the reason when it cannot. */
export const RatingOr = ({ value, locked, responses, minimum, sub, reason }: {
  value?: number | null; locked?: boolean; responses?: number; minimum?: number; sub?: string; reason?: string | null;
}) => (locked || value == null
  ? <Withheld reason={reason ?? (locked ? 'floor' : 'none')} responses={responses} minimum={minimum} />
  : <Rating value={value} sub={sub} />);

// ── Bars ──────────────────────────────────────────────────────────────────────

export function Meter({ value, color = '#3B82F6', width, label }: { value?: number | null; color?: string; width?: number; label?: string }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <View style={[s.meter, width ? { width } : { flex: 1 }]}>
      <View style={s.meterTrack}><View style={[s.meterFill, { width: `${v}%`, backgroundColor: color }]} /></View>
      <Text style={s.meterText}>{label ?? `${Math.round(v)}%`}</Text>
    </View>
  );
}

/** Label, bar on a fixed max, value. `colored` gives each row its own series colour. */
export function Bars({ data, max = 5, colored, color = '#8B5CF6', unit = '' }: {
  data: { label: string; value: number | null }[]; max?: number; colored?: boolean; color?: string; unit?: string;
}) {
  return (
    <View style={{ gap: 11 }}>
      {data.map((d, i) => (
        <View key={`${d.label}-${i}`}>
          <View style={s.barHead}>
            <Text style={s.barLabel} numberOfLines={2}>{d.label}</Text>
            <Text style={s.barValue}>{d.value == null ? '—' : max === 5 && !unit ? Number(d.value).toFixed(1) : `${d.value}${unit}`}</Text>
          </View>
          <View style={s.barTrack}>
            <View style={[s.barFill, {
              width: `${d.value == null ? 0 : Math.min(100, (d.value / max) * 100)}%`,
              backgroundColor: colored ? SERIES[i % SERIES.length] : color,
            }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * A series as columns with the value on each — the phone's stand-in for the
 * web's area chart, since a line on a 300pt canvas with five points reads worse
 * than five labelled columns. `min` lifts the floor so 3.6 → 4.2 is visible.
 */
export function Columns({ data, max = 5, min = 0, color = BRAND, unit = '', height = 130 }: {
  data: { label: string; value: number | null }[]; max?: number; min?: number; color?: string; unit?: string; height?: number;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={[s.cols, { height: height + 44 }]}>
        {data.map((d, i) => {
          const h = d.value == null ? 0 : Math.max(4, ((d.value - min) / (max - min)) * height);
          return (
            <View key={`${d.label}-${i}`} style={s.col}>
              <Text style={s.colV}>{d.value == null ? '—' : max === 5 && !unit ? Number(d.value).toFixed(1) : `${d.value}${unit}`}</Text>
              <View style={[s.colBar, { height: h, backgroundColor: d.value == null ? TRACK : color }]} />
              <Text style={s.colL} numberOfLines={2}>{d.label}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

/** Parts of a whole as one bar plus a legend — the phone's donut. */
export function Spread({ data, noun = '' }: { data: { label: string; value: number; color: string }[]; noun?: string }) {
  const total = data.reduce((n, d) => n + d.value, 0);
  return (
    <View>
      <View style={s.spreadBar}>
        {total ? data.filter((d) => d.value > 0).map((d) => (
          <View key={d.label} style={{ flex: d.value, backgroundColor: d.color }} />
        )) : <View style={{ flex: 1, backgroundColor: TRACK }} />}
      </View>
      <View style={s.legend}>
        {data.map((d) => (
          <View key={d.label} style={s.legendRow}>
            <View style={[s.legendDot, { backgroundColor: d.color }]} />
            <Text style={s.legendL} numberOfLines={1}>{d.label}</Text>
            <Text style={s.legendV}>{d.value}{total ? ` · ${Math.round((d.value / total) * 100)}%` : ''}</Text>
          </View>
        ))}
      </View>
      <Text style={s.spreadTotal}>{total.toLocaleString('en-IN')} {noun}</Text>
    </View>
  );
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export function NoteBar({ tone = 'blue', icon = 'information-circle', title, children, action }: {
  tone?: Tone; icon?: any; title?: string; children?: React.ReactNode; action?: React.ReactNode;
}) {
  const t = TINT[tone];
  return (
    <View style={[s.note, { backgroundColor: t.tile, borderColor: t.soft }]}>
      <Ionicons name={icon} size={16} color={t.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        {title ? <Text style={[s.noteTitle, { color: t.fg }]}>{title}</Text> : null}
        {children != null ? <Text style={[s.noteText, { color: t.fg }]}>{children}</Text> : null}
        {action ? <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{action}</View> : null}
      </View>
    </View>
  );
}

export function Blank({ icon = 'file-tray-outline', title, body, action }: {
  icon?: any; title: string; body?: string; action?: React.ReactNode;
}) {
  return (
    <View style={s.blank}>
      <View style={s.blankIcon}><Ionicons name={icon} size={24} color={Colors.textLight} /></View>
      <Text style={s.blankTitle}>{title}</Text>
      {body ? <Text style={s.blankBody}>{body}</Text> : null}
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}

export const Card = ({ children, style }: { children: React.ReactNode; style?: any }) => (
  <View style={[s.card, style]}>{children}</View>
);

// ── People ────────────────────────────────────────────────────────────────────

export function Avatar({ name, src, size = 38, tone = 'purple' }: { name?: string; src?: string | null; size?: number; tone?: Tone }) {
  const [broken, setBroken] = useState(false);
  const uri = photoUrl(src);
  const initials = String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  if (uri && !broken) {
    return <Image source={{ uri }} onError={() => setBroken(true)} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: TRACK }} />;
  }
  const t = TINT[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: t.fg, fontWeight: '800', fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

// ── Controls ──────────────────────────────────────────────────────────────────

export function Btn({ label, icon, kind = 'ghost', onPress, disabled, small, busy }: {
  label: string; icon?: any; kind?: 'primary' | 'ghost' | 'danger' | 'soft'; onPress: () => void;
  disabled?: boolean; small?: boolean; busy?: boolean;
}) {
  const primary = kind === 'primary';
  const fg = primary ? '#fff' : kind === 'danger' ? '#DC2626' : kind === 'soft' ? BRAND : Colors.text;
  return (
    <TouchableOpacity
      style={[s.btn, primary && s.btnPrimary, kind === 'danger' && s.btnDanger, kind === 'soft' && s.btnSoft,
        small && s.btnSmall, (disabled || busy) && { opacity: 0.5 }]}
      onPress={onPress} disabled={disabled || busy} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={label}>
      {busy ? <ActivityIndicator size="small" color={fg} /> : icon ? <Ionicons name={icon} size={small ? 13 : 15} color={fg} /> : null}
      <Text style={[s.btnText, { color: fg }, small && { fontSize: 12 }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Pill segments — a filter or a sub-view. Scrolls sideways when it outgrows the row. */
export function Seg({ options, value, onChange }: {
  options: { value: string; label: string }[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 12 }}>
      <View style={s.seg}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <TouchableOpacity key={o.value} style={[s.segBtn, on && s.segOn]} onPress={() => onChange(o.value)}
              accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <Text style={[s.segText, on && s.segTextOn]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

/** A selectable chip with an optional second line. */
export function Chip({ label, sub, on, onPress, disabled }: {
  label: string; sub?: string; on?: boolean; onPress: () => void; disabled?: boolean;
}) {
  return (
    <TouchableOpacity style={[s.chip, on && s.chipOn, disabled && { opacity: 0.45 }]} onPress={onPress} disabled={disabled}
      accessibilityRole="checkbox" accessibilityState={{ checked: !!on }} accessibilityLabel={label}>
      {on ? <Ionicons name="checkmark-circle" size={14} color={BRAND} /> : null}
      <Text style={[s.chipText, on && { color: BRAND }]}>{label}</Text>
      {sub ? <Text style={s.chipSub}>{sub}</Text> : null}
    </TouchableOpacity>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <View style={s.search}>
      <Ionicons name="search" size={15} color={Colors.textLight} />
      <TextInput style={s.searchIn} value={value} onChangeText={onChange} placeholder={placeholder}
        placeholderTextColor={Colors.textLight} autoCorrect={false} />
      {value ? (
        <TouchableOpacity onPress={() => onChange('')} hitSlop={8} accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={16} color={Colors.textLight} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** A picker that opens a sheet — `value` '' means "all". */
export function Pick({ label, value, options, onChange, all }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; all?: string;
}) {
  const [open, setOpen] = useState(false);
  const list = all ? [{ value: '', label: all }, ...options] : options;
  const cur = list.find((o) => o.value === value);
  return (
    <>
      <TouchableOpacity style={[s.pick, !!value && all && s.pickOn]} onPress={() => setOpen(true)} accessibilityLabel={label}>
        <Text style={s.pickLabel} numberOfLines={1}>{cur?.label ?? label}</Text>
        <Ionicons name="chevron-down" size={14} color={value && all ? BRAND : Colors.textLight} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={s.pickBack}>
          <View style={s.pickSheet}>
            <View style={s.pickHead}>
              <Text style={s.pickTitle}>{label}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10} accessibilityLabel="Close">
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {list.map((o) => (
                <TouchableOpacity key={o.value || '__all'} style={[s.pickRow, o.value === value && s.pickRowOn]}
                  onPress={() => { onChange(o.value); setOpen(false); }}>
                  <Text style={[s.pickRowText, o.value === value && { color: BRAND, fontWeight: '700' }]}>{o.label}</Text>
                  {o.value === value ? <Ionicons name="checkmark" size={16} color={BRAND} /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

export const Toolbar = ({ children }: { children: React.ReactNode }) => <View style={s.toolbar}>{children}</View>;

/** Page through a list already in memory. */
export function Pager({ page, pages, total, onPage, noun, many }: { page: number; pages: number; total: number; onPage: (p: number) => void; noun: string; many?: string }) {
  if (pages <= 1) return <Text style={s.pagerText}>{plural(total, noun, many)}</Text>;
  return (
    <View style={s.pager}>
      <Btn small label="Prev" icon="chevron-back" onPress={() => onPage(page - 1)} disabled={page <= 1} />
      <Text style={s.pagerText}>Page {page} of {pages} · {plural(total, noun, many)}</Text>
      <Btn small label="Next" icon="chevron-forward" onPress={() => onPage(page + 1)} disabled={page >= pages} />
    </View>
  );
}

// ── Form pieces ───────────────────────────────────────────────────────────────

export function Field({ label, hint, error, required, count, children }: {
  label: string; hint?: string | null; error?: string | null; required?: boolean; count?: string; children: React.ReactNode;
}) {
  return (
    <View style={s.field}>
      <View style={s.fieldHead}>
        <Text style={s.fieldLabel}>{label}{required ? <Text style={{ color: '#DC2626' }}> *</Text> : null}</Text>
        {count ? <Text style={s.fieldCount}>{count}</Text> : null}
      </View>
      {children}
      {error ? <Text style={s.fieldErr}>{error}</Text> : hint ? <Text style={s.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function TextBox({ value, onChange, placeholder, multiline, maxLength, editable = true, keyboardType, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; maxLength?: number;
  editable?: boolean; keyboardType?: 'default' | 'numeric'; rows?: number;
}) {
  return (
    <TextInput
      style={[s.input, multiline && { minHeight: 22 * rows, textAlignVertical: 'top' }, !editable && s.inputOff]}
      value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={Colors.textLight}
      multiline={multiline} maxLength={maxLength} editable={editable} keyboardType={keyboardType}
    />
  );
}

export function Stepper({ value, onChange, min = 0, max = 999, suffix, disabled }: {
  value: number | string; onChange: (v: number) => void; min?: number; max?: number; suffix?: string; disabled?: boolean;
}) {
  const n = Number(value) || 0;
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <View style={[s.stepper, disabled && { opacity: 0.5 }]}>
      <TouchableOpacity style={s.stepBtn} onPress={() => onChange(clamp(n - 1))} disabled={disabled || n <= min} accessibilityLabel="Decrease">
        <Ionicons name="remove" size={16} color={Colors.text} />
      </TouchableOpacity>
      <TextInput style={s.stepIn} value={String(value)} keyboardType="numeric" editable={!disabled}
        onChangeText={(t) => { const v = parseInt(t.replace(/\D/g, ''), 10); onChange(Number.isNaN(v) ? min : clamp(v)); }} />
      <TouchableOpacity style={s.stepBtn} onPress={() => onChange(clamp(n + 1))} disabled={disabled || n >= max} accessibilityLabel="Increase">
        <Ionicons name="add" size={16} color={Colors.text} />
      </TouchableOpacity>
      {suffix ? <Text style={s.stepSuffix}>{suffix}</Text> : null}
    </View>
  );
}

/** A labelled switch. The whole row is the target. */
export function Switch({ label, hint, value, onChange, disabled }: {
  label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <TouchableOpacity style={[s.switchRow, disabled && { opacity: 0.5 }]} onPress={() => onChange(!value)} disabled={disabled}
      accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} activeOpacity={0.7}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.switchLabel}>{label}</Text>
        {hint ? <Text style={s.switchHint}>{hint}</Text> : null}
      </View>
      <View style={[s.track, value && { backgroundColor: BRAND }]}>
        <View style={[s.thumb, value && { alignSelf: 'flex-end' }]} />
      </View>
    </TouchableOpacity>
  );
}

export const FormSection = ({ title, hint, locked, children }: {
  title: string; hint?: string | null; locked?: boolean; children: React.ReactNode;
}) => (
  <View style={s.fsec}>
    <View style={s.fsecHead}>
      <Text style={s.fsecTitle}>{title}</Text>
      {locked ? <Tag label="Locked" tone="slate" icon="lock-closed" /> : null}
    </View>
    {hint ? <Text style={s.fsecHint}>{hint}</Text> : null}
    {children}
  </View>
);

export const FormError = ({ children }: { children: React.ReactNode }) => (
  <View style={s.ferr}><Ionicons name="alert-circle" size={15} color="#B91C1C" /><Text style={s.ferrText}>{children}</Text></View>
);

/**
 * A full-height form sheet — the web's FbModal at phone size. The step chips,
 * when given, sit under the title; the footer never scrolls away.
 */
export function Sheet({ visible, icon = 'create-outline', title, subtitle, onClose, steps, step, onStep, footer, children, busy }: {
  visible: boolean; icon?: any; title: string; subtitle?: string; onClose: () => void;
  steps?: { key: string; label: string; state?: 'todo' | 'done' | 'error' | 'locked' }[]; step?: string; onStep?: (k: string) => void;
  footer?: React.ReactNode; children: React.ReactNode; busy?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}>
      <KeyboardAvoidingView style={s.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.sheetHead, { paddingTop: Platform.OS === 'ios' ? 16 : 16 + insets.top }]}>
          <View style={[s.panelIcon, { backgroundColor: TINT.purple.soft, width: 38, height: 38 }]}>
            <Ionicons name={icon} size={19} color={TINT.purple.fg} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.sheetTitle} numberOfLines={2}>{title}</Text>
            {subtitle ? <Text style={s.sheetSub}>{subtitle}</Text> : null}
          </View>
          <TouchableOpacity onPress={onClose} disabled={busy} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
        {steps?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.stepsWrap} contentContainerStyle={s.steps}>
            {steps.map((st, i) => {
              const on = st.key === step;
              const glyph = st.state === 'done' ? 'checkmark-circle' : st.state === 'error' ? 'alert-circle' : st.state === 'locked' ? 'lock-closed' : null;
              return (
                <TouchableOpacity key={st.key} style={[s.stepChip, on && s.stepChipOn]} disabled={!onStep}
                  onPress={() => onStep?.(st.key)} accessibilityLabel={`Step ${i + 1}: ${st.label}`}>
                  {glyph
                    ? <Ionicons name={glyph} size={14} color={on ? '#fff' : st.state === 'error' ? '#DC2626' : st.state === 'done' ? '#16A34A' : Colors.textSecondary} />
                    : <Text style={[s.stepN, on && { color: BRAND, backgroundColor: '#fff' }]}>{i + 1}</Text>}
                  <Text style={[s.stepText, on && { color: '#fff' }]}>{st.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.sheetBody} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer ? <View style={[s.sheetFoot, { paddingBottom: 12 + insets.bottom }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * A centred question with its consequences spelled out — used where the answer
 * changes something other people see. Content can be richer than a plain Alert,
 * and unlike Alert it also works on react-native-web.
 */
export function Dialog({ visible, icon = 'help-circle-outline', tone = 'purple', title, message, children, confirmLabel = 'Confirm', danger, busy, onConfirm, onClose }: {
  visible: boolean; icon?: any; tone?: Tone; title: string; message?: string; children?: React.ReactNode;
  confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  const t = TINT[danger ? 'red' : tone];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
      <View style={s.pickBack}>
        <View style={s.dialog}>
          <View style={[s.panelIcon, { backgroundColor: t.soft, width: 44, height: 44, borderRadius: 13 }]}>
            <Ionicons name={icon} size={22} color={t.fg} />
          </View>
          <Text style={s.dialogTitle}>{title}</Text>
          {message ? <Text style={s.dialogText}>{message}</Text> : null}
          {children}
          <View style={s.dialogActs}>
            <Btn label="Go back" onPress={onClose} disabled={busy} />
            <Btn label={confirmLabel} kind={danger ? 'danger' : 'primary'} onPress={onConfirm} busy={busy} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Role pieces ───────────────────────────────────────────────────────────────

export function Countdown({ endDate }: { endDate?: string | null }) {
  const c = closesIn(endDate);
  return c.text ? <Tag label={c.text} tone={c.tone} icon="time-outline" /> : null;
}

/** Done / missed / to-do / upcoming as one segmented bar with its numbers under it. */
export function ProgressSplit({ done = 0, missed = 0, todo = 0, upcoming = 0 }: { done?: number; missed?: number; todo?: number; upcoming?: number }) {
  const parts = [
    { key: 'done', n: done, color: '#22C55E', word: 'done' },
    { key: 'missed', n: missed, color: '#F472B6', word: 'missed' },
    { key: 'todo', n: todo, color: '#F59E0B', word: 'to do' },
    { key: 'upcoming', n: upcoming, color: '#93C5FD', word: 'upcoming' },
  ];
  const total = done + missed + todo + upcoming;
  return (
    <View style={{ gap: 7 }}>
      <View style={s.split}>
        {total ? parts.filter((p) => p.n).map((p) => <View key={p.key} style={{ flex: p.n, backgroundColor: p.color }} />) : null}
      </View>
      <View style={s.splitKey}>
        {parts.filter((p) => p.key === 'done' || p.n).map((p) => (
          <View key={p.key} style={s.splitItem}>
            <View style={[s.legendDot, { backgroundColor: p.color }]} />
            <Text style={s.splitText}>{p.n} {p.word}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const STATE: Record<string, { word: string; tone: Tone }> = {
  todo: { word: 'To do', tone: 'amber' }, done: { word: 'Done', tone: 'green' },
  missed: { word: 'Missed', tone: 'pink' }, upcoming: { word: 'Upcoming', tone: 'blue' },
};
export const StatePill = ({ state }: { state: string }) => {
  const st = STATE[state] ?? STATE.todo;
  return <Dot label={st.word} tone={st.tone} />;
};

/**
 * The whole results screen while the floor has not been reached — said to the
 * teacher it hides from, so it explains how far off the floor is.
 */
export function LockedResults({ responses, minimum, assigned, campaignOpen, who = 'your' }: {
  responses: number; minimum: number; assigned?: number; campaignOpen?: boolean; who?: 'your' | 'these';
}) {
  const need = Math.max(0, minimum - responses);
  const pct = minimum ? Math.min(100, Math.round((responses / minimum) * 100)) : 0;
  return (
    <View style={s.lockHero}>
      <View style={s.lockIcon}><Ionicons name="key" size={26} color={BRAND} /></View>
      <Text style={s.lockTitle}>
        {responses === 0 ? 'No responses yet' : `${plural(need, 'more response')} before ${who} results appear`}
      </Text>
      <Text style={s.lockText}>
        Results stay hidden until at least <Text style={{ fontWeight: '800' }}>{minimum}</Text> students have answered, so no single
        student’s answer can ever be picked out — not by the teacher, and not by anyone else in the school.
      </Text>
      <View style={s.lockMeter}>
        <View style={s.lockTrack}><View style={[s.lockFill, { width: `${pct}%` }]} /></View>
        <Text style={s.lockCount}>{responses} of {minimum}</Text>
      </View>
      <Text style={s.lockFoot}>
        {assigned ? `${plural(assigned, 'student')} ${assigned === 1 ? 'was' : 'were'} asked. ` : ''}
        {campaignOpen ? 'The campaign is still collecting.' : 'This campaign has closed with too few responses to show.'}
      </Text>
    </View>
  );
}

/** A subject or section slice: responses, rate, and the rating or its reason. */
export function SliceList({ slices, minimum, empty }: { slices?: any[]; minimum: number; empty: string }) {
  if (!slices?.length) return <Muted>{empty}</Muted>;
  return (
    <View>
      {slices.map((x, i) => (
        <View key={x._id} style={[s.slice, i > 0 && s.sliceSep]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.sliceName} numberOfLines={1}>{x.name}</Text>
            <Text style={s.sliceSub}>{x.responses} of {x.assigned} answered · {x.responseRate}%</Text>
          </View>
          {x.locked
            ? <Withheld reason={x.protectsOthers ? 'protect' : 'floor'} responses={x.responses} minimum={minimum} />
            : <Rating value={x.rating} />}
        </View>
      ))}
    </View>
  );
}

// ── Vocabulary ────────────────────────────────────────────────────────────────

const CAMPAIGN: Record<string, { word: string; tone: Tone }> = {
  draft: { word: 'Draft', tone: 'slate' }, scheduled: { word: 'Scheduled', tone: 'blue' },
  active: { word: 'Active', tone: 'green' }, closed: { word: 'Completed', tone: 'indigo' },
  archived: { word: 'Archived', tone: 'slate' },
};
export const campaignWord = (st?: string) => CAMPAIGN[st ?? '']?.word ?? st ?? '';
export const CampaignPill = ({ status }: { status?: string }) => {
  const c = CAMPAIGN[status ?? 'draft'] ?? CAMPAIGN.draft;
  return <Tag label={c.word} tone={c.tone} />;
};

/** "Insufficient" and "Needs More" are about the SAMPLE; "Needs Attention" is about the teaching. */
export const TeacherState = ({ status, responses }: { status?: string; responses?: number }) => {
  if (status === 'insufficient' && (responses ?? 0) > 0) return <Tag label="Needs More" tone="pink" />;
  const m: Record<string, [string, Tone]> = {
    good: ['Well Rated', 'green'], average: ['Average', 'amber'], attention: ['Needs Attention', 'red'], insufficient: ['Insufficient', 'amber'],
  };
  const [w, t] = m[status ?? 'insufficient'] ?? m.insufficient;
  return <Tag label={w} tone={t} />;
};

const CATEGORY_ICONS: [RegExp, string][] = [
  [/teach|deliver|quality/i, 'school-outline'], [/subject|knowledge/i, 'book-outline'], [/communic/i, 'chatbubbles-outline'],
  [/classroom|discipline|manage/i, 'people-outline'], [/engage|particip/i, 'pulse-outline'], [/support|help/i, 'heart-outline'],
  [/assess|test|homework/i, 'document-text-outline'], [/overall|general/i, 'star-outline'], [/profession/i, 'briefcase-outline'],
];
export const categoryIcon = (name?: string): any => CATEGORY_ICONS.find(([re]) => re.test(name || ''))?.[1] ?? 'layers-outline';

const DEPARTMENT_ICONS: [RegExp, string][] = [
  [/math/i, 'calculator-outline'], [/science|physics|chem|bio/i, 'flask-outline'], [/english|hindi|language|lit/i, 'book-outline'],
  [/social|history|geo|civic/i, 'map-outline'], [/computer|it\b|tech/i, 'laptop-outline'], [/sport|physical|pe\b/i, 'trophy-outline'],
  [/art|music|dance/i, 'color-palette-outline'], [/unassigned/i, 'person-outline'],
];
export const departmentIcon = (name?: string): any => DEPARTMENT_ICONS.find(([re]) => re.test(name || ''))?.[1] ?? 'business-outline';

export const QUESTION_TYPES = [
  { value: 'rating_5', label: '1–5 Rating', short: '1–5 Rating', icon: 'star-outline', text: 'Poor to Excellent, counts towards the rating' },
  { value: 'emoji_5', label: 'Emoji Rating (1–5)', short: 'Emoji', icon: 'happy-outline', text: 'The same 1–5 scale, shown with faces' },
  { value: 'yes_no', label: 'Yes / No', short: 'Yes / No', icon: 'checkmark-circle-outline', text: 'A single yes or no' },
  { value: 'multiple_choice', label: 'Multiple Choice (pick one)', short: 'Pick one', icon: 'list-outline', text: 'Choose one option from a list' },
  { value: 'checkbox', label: 'Checkbox (pick many)', short: 'Pick many', icon: 'checkbox-outline', text: 'Tick any number of options' },
  { value: 'text', label: 'Written answer', short: 'Text', icon: 'create-outline', text: 'Free words, never averaged' },
];
export const typeShort = (v?: string) => QUESTION_TYPES.find((t) => t.value === v)?.short ?? v ?? '';
/** A written answer or a pick-list has nothing to average, so it never scores. */
export const isScorable = (t?: string) => !['text', 'checkbox', 'multiple_choice'].includes(t ?? '');

/** The model's own defaults (models/FeedbackSettings.js), for "Reset to default". */
export const SETTINGS_DEFAULTS = {
  defaultAnonymous: true, defaultMinimumResponses: 5, defaultCampaignDays: 14,
  teacherCanSeeComments: true, teacherCanSeeTrends: true, publishToTeachersOnClose: false,
  notifyOnCampaignStart: true, notifyReminders: true, reminderIntervalDays: 3,
  notifyBeforeClose: true, closingSoonDays: 2, notifyOnSubmission: true,
  emailNotifications: false, autoActivateScheduled: true, autoCloseExpired: true,
};

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F6F5FB' },
  pageIn: { padding: 14, paddingBottom: 60, gap: 12 },
  loading: { paddingVertical: 80, alignItems: 'center' },

  railWrap: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rail: { paddingHorizontal: 12, paddingVertical: 9, gap: 6 },
  railTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999 },
  railTabOn: { backgroundColor: BRAND },
  railText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },

  hero: { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: 14 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, letterSpacing: -0.4 },
  heroSub: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 },
  heroActs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, flexBasis: '46%', borderRadius: Radius.lg, padding: 12, borderWidth: 1, borderColor: 'transparent' },
  tileOn: { borderColor: BRAND },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  tileIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tileValue: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  tileUnit: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  tileLabel: { fontSize: 12.5, fontWeight: '700', color: Colors.text, marginTop: 1 },
  tileCap: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, lineHeight: 15 },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  deltaUp: { backgroundColor: '#DCFCE7' }, deltaDown: { backgroundColor: '#FEE2E2' }, deltaFlat: { backgroundColor: '#F1F5F9' },
  deltaText: { fontSize: 10.5, fontWeight: '700' },

  panel: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  panelIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  panelTitle: { fontSize: 14.5, fontWeight: '700', color: Colors.text },
  panelSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 1, lineHeight: 15 },
  panelBody: { paddingHorizontal: 14, paddingBottom: 14 },
  muted: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
  subhead: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: Colors.textSecondary, marginTop: 4, marginLeft: 2 },

  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  tagText: { fontSize: 11, fontWeight: '700' },
  dot: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  dotI: { width: 6, height: 6, borderRadius: 3 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingV: { fontSize: 14, fontWeight: '800', color: Colors.text },
  ratingBig: { fontSize: 32, letterSpacing: -0.8 },
  ratingOf: { fontSize: 13, color: Colors.textSecondary, marginLeft: 3, alignSelf: 'flex-end', marginBottom: 6 },
  ratingSub: { fontSize: 10.5, color: Colors.textSecondary, marginTop: 1 },
  locked: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border, backgroundColor: '#F8FAFC',
  },
  lockedText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },

  meter: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  meterTrack: { flex: 1, height: 6, borderRadius: 99, backgroundColor: TRACK, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 99 },
  meterText: { fontSize: 11.5, fontWeight: '700', color: Colors.text, minWidth: 34, textAlign: 'right' },

  barHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 5 },
  barLabel: { flex: 1, fontSize: 12.5, color: Colors.text },
  barValue: { fontSize: 12.5, fontWeight: '800', color: Colors.text },
  barTrack: { height: 8, borderRadius: 99, backgroundColor: TRACK, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 99 },

  cols: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, flexGrow: 1, paddingTop: 4 },
  col: { flex: 1, minWidth: 48, alignItems: 'center', justifyContent: 'flex-end' },
  colV: { fontSize: 11, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  colBar: { width: '70%', maxWidth: 38, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  colL: { fontSize: 10, color: Colors.textSecondary, marginTop: 5, textAlign: 'center', height: 26 },

  spreadBar: { flexDirection: 'row', height: 14, borderRadius: 99, overflow: 'hidden', backgroundColor: TRACK },
  legend: { marginTop: 12, gap: 7 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendL: { flex: 1, fontSize: 12.5, color: Colors.text },
  legendV: { fontSize: 12, fontWeight: '700', color: Colors.text },
  spreadTotal: { fontSize: 11, color: Colors.textSecondary, marginTop: 8 },

  note: { flexDirection: 'row', gap: 9, borderRadius: Radius.md, borderWidth: 1, padding: 12 },
  noteTitle: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  noteText: { fontSize: 12.5, lineHeight: 18 },

  blank: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 18, gap: 6 },
  blankIcon: {
    width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: Colors.border, marginBottom: 4,
  },
  blankTitle: { fontSize: 14.5, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  blankBody: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', lineHeight: 17 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border },

  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 9,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  btnPrimary: { backgroundColor: BRAND, borderColor: BRAND },
  btnDanger: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  btnSoft: { backgroundColor: '#EEF2FF', borderColor: '#E0E7FF' },
  btnSmall: { paddingHorizontal: 9, paddingVertical: 6 },
  btnText: { fontSize: 13, fontWeight: '700' },

  seg: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 3, gap: 2 },
  segBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9 },
  segOn: { backgroundColor: '#EEF2FF' },
  segText: { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary },
  segTextOn: { color: BRAND, fontWeight: '800' },

  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  chipOn: { borderColor: '#A5B4FC', backgroundColor: '#EEF2FF' },
  chipText: { fontSize: 12.5, fontWeight: '700', color: Colors.text },
  chipSub: { fontSize: 11, color: Colors.textSecondary },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.surface, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10, minHeight: 40,
  },
  searchIn: { flex: 1, fontSize: 13.5, color: Colors.text, paddingVertical: 8 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pick: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, minHeight: 36, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, maxWidth: '100%',
  },
  pickOn: { borderColor: '#A5B4FC', backgroundColor: '#EEF2FF' },
  pickLabel: { fontSize: 12.5, fontWeight: '600', color: Colors.text, flexShrink: 1 },
  pickBack: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 20 },
  pickSheet: { backgroundColor: Colors.surface, borderRadius: 16, paddingBottom: 8, maxHeight: '85%' },
  pickHead: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  pickTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.text },
  pickRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  pickRowOn: { backgroundColor: '#F5F3FF' },
  pickRowText: { flex: 1, fontSize: 14, color: Colors.text },
  dialog: { backgroundColor: Colors.surface, borderRadius: 18, padding: 18, gap: 10, maxHeight: '90%' },
  dialogTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  dialogText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  dialogActs: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 },

  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pagerText: { fontSize: 11.5, color: Colors.textSecondary, textAlign: 'center', flexShrink: 1 },

  field: { marginBottom: 12 },
  fieldHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  fieldLabel: { fontSize: 12.5, fontWeight: '700', color: Colors.text },
  fieldCount: { fontSize: 11, color: Colors.textLight },
  fieldHint: { fontSize: 11, color: Colors.textSecondary, marginTop: 4, lineHeight: 15 },
  fieldErr: { fontSize: 11.5, color: '#B91C1C', marginTop: 4, fontWeight: '600' },
  input: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 11, paddingVertical: 10, fontSize: 14, color: Colors.text,
  },
  inputOff: { backgroundColor: '#F8FAFC', color: Colors.textSecondary },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: { width: 34, height: 34, borderRadius: 9, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  stepIn: { width: 56, height: 34, borderRadius: 9, borderWidth: 1, borderColor: Colors.border, textAlign: 'center', fontSize: 14, fontWeight: '700', color: Colors.text, backgroundColor: Colors.surface },
  stepSuffix: { fontSize: 12, color: Colors.textSecondary },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  switchLabel: { fontSize: 13.5, fontWeight: '600', color: Colors.text },
  switchHint: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2, lineHeight: 15 },
  track: { width: 42, height: 24, borderRadius: 12, backgroundColor: '#CBD5E1', padding: 3, justifyContent: 'center' },
  thumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' },
  fsec: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 12 },
  fsecHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  fsecTitle: { flex: 1, fontSize: 14.5, fontWeight: '800', color: Colors.text },
  fsecHint: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16, marginBottom: 10 },
  ferr: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12 },
  ferrText: { flex: 1, fontSize: 12.5, color: '#B91C1C', lineHeight: 17 },

  sheet: { flex: 1, backgroundColor: '#F6F5FB' },
  sheetHead: {
    flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  sheetTitle: { fontSize: 16.5, fontWeight: '800', color: Colors.text },
  sheetSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2, lineHeight: 15 },
  stepsWrap: { flexGrow: 0, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  steps: { paddingHorizontal: 12, paddingVertical: 9, gap: 6 },
  stepChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: '#F1F5F9' },
  stepChipOn: { backgroundColor: BRAND },
  stepN: { width: 18, height: 18, borderRadius: 9, textAlign: 'center', lineHeight: 18, fontSize: 10.5, fontWeight: '800', color: Colors.textSecondary, backgroundColor: '#E2E8F0', overflow: 'hidden' },
  stepText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  sheetBody: { padding: 14, paddingBottom: 30 },
  sheetFoot: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 12,
    backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border,
  },

  split: { flexDirection: 'row', height: 8, borderRadius: 99, overflow: 'hidden', backgroundColor: TRACK },
  splitKey: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  splitItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  splitText: { fontSize: 11.5, color: Colors.textSecondary },

  lockHero: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C7D2FE', padding: 18, gap: 8 },
  lockIcon: { width: 54, height: 54, borderRadius: 16, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  lockTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  lockText: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
  lockMeter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  lockTrack: { flex: 1, height: 8, borderRadius: 99, backgroundColor: TRACK, overflow: 'hidden' },
  lockFill: { height: '100%', backgroundColor: BRAND, borderRadius: 99 },
  lockCount: { fontSize: 12.5, fontWeight: '800', color: Colors.text },
  lockFoot: { fontSize: 11.5, color: Colors.textSecondary },

  slice: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  sliceSep: { borderTopWidth: 1, borderTopColor: Colors.divider },
  sliceName: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  sliceSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 1 },
});
