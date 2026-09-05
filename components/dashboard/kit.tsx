/**
 * Dashboard building blocks, mirroring the web dashboards.
 *
 * Same information design as school-frontend — a tinted greeting, highlight
 * cards that carry a figure plus what it means, panels with a title and an
 * action, and row links — drawn in the app's own skin rather than the web's.
 *
 * Everything here is plain Views. The app has no SVG or charting dependency and
 * does not need one: a ratio against a limit is a meter, and comparing a handful
 * of classes is a column chart, both of which are boxes with a width or a
 * height. That keeps the bundle as it is and renders identically on every
 * device.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '@/constants/theme';

// The web dashboards' accent. Kept here rather than in the theme so the app's
// existing brand colours are untouched — this is the colour of *data* on these
// screens (meters, bars, links), matching school-frontend exactly.
export const BRAND = '#4F46E5';
export const BRAND_SOFT = '#EEF2FF';
export const BRAND_DARK = '#3730A3';

export const TONE = {
  good: '#16A34A',
  warn: '#D97706',
  bad:  '#DC2626',
};

/** Percentage → the status colour a figure should read in. */
export const toneFor = (pct?: number | null, good = 75, warn = 50) =>
  pct == null ? Colors.textSecondary : pct >= good ? TONE.good : pct >= warn ? TONE.warn : TONE.bad;

// ── Greeting ─────────────────────────────────────────────────────────────────
export function Hero({ title, subtitle, chips, children }: {
  title: string; subtitle?: string;
  chips?: { icon: string; text: string }[];
  children?: React.ReactNode;
}) {
  return (
    <View style={h.card}>
      <Text style={h.title}>{title}</Text>
      {!!subtitle && <Text style={h.sub}>{subtitle}</Text>}
      {!!chips?.length && (
        <View style={h.chips}>
          {chips.map((c) => (
            <View key={c.text} style={h.chip}>
              <Ionicons name={c.icon as any} size={12} color={BRAND} />
              <Text style={h.chipText} numberOfLines={1}>{c.text}</Text>
            </View>
          ))}
        </View>
      )}
      {children}
    </View>
  );
}

const h = StyleSheet.create({
  card: {
    backgroundColor: '#EFEDFF', borderRadius: Radius.xl,
    borderWidth: 1, borderColor: '#DDD6FE',
    padding: Spacing.md, marginBottom: Spacing.md,
  },
  title: { fontSize: 20, fontWeight: '700', color: Colors.text, letterSpacing: -0.3 },
  sub:   { fontSize: 13, color: Colors.textSecondary, marginTop: 4, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full,
    maxWidth: '100%',
  },
  chipText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, flexShrink: 1 },
});

// ── Highlight card ───────────────────────────────────────────────────────────
/**
 * The card a dashboard leads with: a figure, what it counts, and — when there
 * is a previous period to compare against — which way it moved.
 * `meter` draws the value as a share of 100.
 */
export function Highlight({
  icon, tint, tintBg, label, value, valueColor, caption, meter, delta, deltaSuffix = 'from last month',
  deltaUnit = '%', onPress, actionLabel, wide,
}: {
  icon: string; tint: string; tintBg: string;
  label: string; value: string; valueColor?: string; caption?: string;
  meter?: number | null; delta?: number | null; deltaSuffix?: string;
  /** '%' when the delta is a change in a rate; '' when it counts new records. */
  deltaUnit?: string;
  onPress?: () => void; actionLabel?: string; wide?: boolean;
}) {
  const up = (delta ?? 0) > 0;
  const flat = delta === 0;
  return (
    <View style={[hl.card, wide && hl.wide]}>
      <View style={hl.top}>
        <View style={[hl.icon, { backgroundColor: tintBg }]}>
          <Ionicons name={icon as any} size={17} color={tint} />
        </View>
        <Text style={hl.label} numberOfLines={2}>{label}</Text>
      </View>

      <Text style={[hl.value, valueColor ? { color: valueColor } : null]} numberOfLines={1}>{value}</Text>

      {delta != null && (
        <View style={hl.delta}>
          {flat
            ? <View style={hl.flat} />
            : <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={11}
                color={up ? TONE.good : TONE.bad} />}
          <Text style={[hl.deltaText, { color: flat ? Colors.textSecondary : up ? TONE.good : TONE.bad }]}>
            {flat ? `No change ${deltaSuffix}` : `${Math.abs(delta)}${deltaUnit} ${deltaSuffix}`}
          </Text>
        </View>
      )}

      {!!caption && <Text style={hl.caption} numberOfLines={2}>{caption}</Text>}

      {meter != null && <MeterBar value={meter} />}

      {!!onPress && (
        <TouchableOpacity style={hl.link} onPress={onPress} activeOpacity={0.7}>
          <Text style={hl.linkText} numberOfLines={1}>{actionLabel ?? 'View'}</Text>
          <Ionicons name="chevron-forward" size={12} color={BRAND} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const hl = StyleSheet.create({
  card: {
    // flexBasis under half the row (with the row's gap accounted for) is what
    // makes four cards wrap 2×2. `flex: 1` alone lets all four share one row and
    // shrink until the labels truncate.
    flexGrow: 1, flexBasis: '46%', minWidth: 150,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: 12,
  },
  wide: { flexBasis: '100%' },
  top:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 11, fontWeight: '600', color: Colors.textSecondary, lineHeight: 14 },
  value: { fontSize: 22, fontWeight: '700', color: Colors.text, marginTop: 10, letterSpacing: -0.5 },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  deltaText: { fontSize: 10, fontWeight: '600' },
  flat: { width: 9, height: 2, borderRadius: 2, backgroundColor: Colors.textLight },
  caption: { fontSize: 10.5, color: Colors.textSecondary, marginTop: 5, lineHeight: 14 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 10 },
  linkText: { fontSize: 11, fontWeight: '600', color: BRAND },
});

/** A value as a share of 100. The one honest way to draw a ratio in plain views. */
export function MeterBar({ value, color, height = 6 }: { value: number; color?: string; height?: number }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <View style={[mb.track, { height, borderRadius: height }]}>
      <View style={[mb.fill, { width: `${pct}%`, height, borderRadius: height, backgroundColor: color ?? BRAND }]} />
    </View>
  );
}

const mb = StyleSheet.create({
  track: { backgroundColor: Colors.divider, overflow: 'hidden', marginTop: 9, width: '100%' },
  fill:  {},
});

// ── Panel ────────────────────────────────────────────────────────────────────
export function Panel({ title, subtitle, actionLabel, onAction, children, padded = true }: {
  title?: string; subtitle?: string; actionLabel?: string; onAction?: () => void;
  children: React.ReactNode; padded?: boolean;
}) {
  return (
    <View style={p.card}>
      {(!!title || !!actionLabel) && (
        <View style={p.head}>
          <View style={{ flex: 1 }}>
            {!!title && <Text style={p.title}>{title}</Text>}
            {!!subtitle && <Text style={p.sub}>{subtitle}</Text>}
          </View>
          {!!actionLabel && (
            <TouchableOpacity onPress={onAction} activeOpacity={0.7} hitSlop={8}>
              <Text style={p.action}>{actionLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      <View style={padded ? p.body : undefined}>{children}</View>
    </View>
  );
}

const p = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.md, overflow: 'hidden',
  },
  head: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  title:  { fontSize: 14, fontWeight: '700', color: Colors.text },
  sub:    { fontSize: 11, color: Colors.textSecondary, marginTop: 3, lineHeight: 15 },
  action: { fontSize: 12, fontWeight: '600', color: BRAND },
  body:   { padding: 8 },
});

// ── Row link ─────────────────────────────────────────────────────────────────
export function RowLink({ icon, tint, tintBg, title, sub, onPress, right }: {
  icon: string; tint: string; tintBg: string;
  title: string; sub?: string; onPress?: () => void; right?: React.ReactNode;
}) {
  return (
    <TouchableOpacity style={rl.row} onPress={onPress} activeOpacity={onPress ? 0.7 : 1} disabled={!onPress}>
      <View style={[rl.icon, { backgroundColor: tintBg }]}>
        <Ionicons name={icon as any} size={16} color={tint} />
      </View>
      <View style={rl.body}>
        <Text style={rl.title} numberOfLines={2}>{title}</Text>
        {!!sub && <Text style={rl.sub} numberOfLines={1}>{sub}</Text>}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={15} color={Colors.textLight} /> : null)}
    </TouchableOpacity>
  );
}

const rl = StyleSheet.create({
  row:  { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 9, borderRadius: Radius.md },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 12.5, fontWeight: '600', color: Colors.text, lineHeight: 16 },
  sub:   { fontSize: 10.5, color: Colors.textSecondary, marginTop: 2 },
});

/** A hairline between rows inside a panel. */
export const RowSep = () => <View style={{ height: 1, backgroundColor: Colors.divider, marginHorizontal: 9 }} />;

// ── Labelled bars (subject marks, class averages) ────────────────────────────
/**
 * One hue, sorted by the caller, with the value written beside each bar. This
 * compares magnitudes, which is a bar's job; the status colours stay reserved
 * for state and are never spent on "subject 4".
 */
export function LabelledBars({ rows }: {
  rows: { key: string; label: string; value: number; note?: string }[];
}) {
  return (
    <View style={lb.wrap}>
      {rows.map((r) => (
        <View key={r.key} style={lb.item}>
          <View style={lb.head}>
            <Text style={lb.label} numberOfLines={1}>{r.label}</Text>
            <Text style={lb.value}>{r.value}%</Text>
          </View>
          <MeterBar value={r.value} height={7} />
          {!!r.note && <Text style={lb.note}>{r.note}</Text>}
        </View>
      ))}
    </View>
  );
}

const lb = StyleSheet.create({
  wrap: { paddingHorizontal: 6, paddingTop: 4, paddingBottom: 2 },
  item: { marginBottom: 13 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  label: { flex: 1, fontSize: 12.5, fontWeight: '600', color: Colors.text },
  value: { fontSize: 12.5, fontWeight: '700', color: Colors.text },
  note:  { fontSize: 10, color: Colors.textSecondary, marginTop: 4 },
});

// ── Column chart ─────────────────────────────────────────────────────────────
/**
 * Columns scaled against a fixed 0–100 axis, so two classes can be compared by
 * eye and a 90% never looks like a 60%. Scrolls sideways once there are more
 * columns than fit, rather than shrinking them into slivers.
 */
export function Columns({ rows, height = 132 }: {
  rows: { key: string; label: string; value: number }[];
  height?: number;
}) {
  const body = (
    <View style={[cl.plot, { height }]}>
      {rows.map((r) => (
        <View key={r.key} style={cl.col}>
          <Text style={cl.value}>{r.value}%</Text>
          <View style={cl.track}>
            <View style={[cl.bar, { height: `${Math.max(2, Math.min(100, r.value))}%` }]} />
          </View>
          <Text style={cl.label} numberOfLines={1}>{r.label}</Text>
        </View>
      ))}
    </View>
  );
  // Five columns fit a phone; past that the row scrolls rather than squeezing.
  return rows.length > 5
    ? <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 8 }}>{body}</ScrollView>
    : <View style={{ paddingHorizontal: 8 }}>{body}</View>;
}

const cl = StyleSheet.create({
  plot: { flexDirection: 'row', alignItems: 'stretch', gap: 10, paddingTop: 6 },
  col:  { minWidth: 54, flex: 1, alignItems: 'center' },
  value: { fontSize: 11, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  track: { flex: 1, width: 30, justifyContent: 'flex-end' },
  bar: {
    width: '100%', backgroundColor: BRAND,
    borderTopLeftRadius: 6, borderTopRightRadius: 6, minHeight: 3,
  },
  label: { fontSize: 10, color: Colors.textSecondary, marginTop: 6, textAlign: 'center' },
});

// ── Empty note ───────────────────────────────────────────────────────────────
export function Note({ icon = 'checkmark-circle', children }: { icon?: string; children: React.ReactNode }) {
  return (
    <View style={nt.wrap}>
      <Ionicons name={icon as any} size={15} color={Colors.textLight} />
      <Text style={nt.text}>{children}</Text>
    </View>
  );
}

const nt = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 8 },
  text: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },
});

/** The row a pair of highlight cards sits in. */
export const CardRow = ({ children }: { children: React.ReactNode }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.md }}>{children}</View>
);
