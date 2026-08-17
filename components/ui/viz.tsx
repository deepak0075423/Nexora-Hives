import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius } from '@/constants/theme';

// ── Chart palette ─────────────────────────────────────────────────────────────
//  Validated against the card surface (#FFFFFF) before being written down, and
//  deliberately the same values the web dashboard uses so a number looks the
//  same on both platforms.
//
//   • good / warn / bad — lightness, chroma, CVD (worst adjacent ΔE 8.9) and
//     normal-vision (ΔE 19.8) all pass. Contrast sits under 3:1, which requires
//     relief: every meter and bar here ships its label and value as text.
//   • bands — single-hue ordinal ramp: monotone lightness, ≥0.06 ΔL per step,
//     light end clears the 2:1 floor.
//
//  Note this is NOT Colors.success/warning/danger: that trio fails the
//  normal-vision floor (danger↔warning ΔE 14.4) when used as adjacent chart
//  marks. Those tokens stay where they belong — on labelled Badge chips.
export const VIZ = {
  accent: '#4F46E5',
  good:   '#10B981',
  warn:   '#F59E0B',
  bad:    '#EF4444',
  bands:  ['#9AA8FB', '#7C86F5', '#5B52E8', '#3730A3'],
  track:  '#EEF2F7',
};

export const toneForPercent = (p?: number | null) =>
  (p == null ? 'muted' : p >= 75 ? 'good' : p >= 50 ? 'warn' : 'bad') as keyof typeof TONE_COLOR;

export const TONE_COLOR: Record<string, string> = {
  good: VIZ.good, warn: VIZ.warn, bad: VIZ.bad, accent: VIZ.accent, muted: Colors.textLight,
};

export const fmtMonth = (key?: string) => {
  if (!key) return '';
  const [y, m] = String(key).split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};

export const pctText = (v?: number | null, suffix = '%') => (v == null ? '--' : `${v}${suffix}`);

// ── Hero — the one number a card leads with ───────────────────────────────────
export function Hero({ value, unit, label, tone = 'accent', sub }: {
  value: React.ReactNode; unit?: string; label: string; tone?: string; sub?: string | null;
}) {
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <Text style={v.heroValue}>{value ?? '--'}</Text>
        {unit ? <Text style={v.heroUnit}>{unit}</Text> : null}
        <View style={[v.heroDot, { backgroundColor: TONE_COLOR[tone] ?? VIZ.accent }]} />
      </View>
      <Text style={v.heroLabel}>{label}</Text>
      {sub ? <Text style={v.heroSub}>{sub}</Text> : null}
    </View>
  );
}

// ── Meter — one ratio against its limit ───────────────────────────────────────
export function Meter({ value, label, right, tone, height = 8 }: {
  value?: number | null; label?: string; right?: string; tone?: string; height?: number;
}) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const color = TONE_COLOR[tone ?? toneForPercent(value)] ?? VIZ.accent;
  return (
    <View style={{ width: '100%' }}>
      {(label || right) && (
        <View style={v.meterHead}>
          <Text style={v.meterLabel} numberOfLines={1}>{label}</Text>
          {right ? <Text style={v.meterValue}>{right}</Text> : null}
        </View>
      )}
      <View style={[v.track, { height, borderRadius: height }]}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: height }} />
      </View>
    </View>
  );
}

// ── Band bar — an ordered part-to-whole distribution ──────────────────────────
//  Touching segments are separated by a 2px surface-coloured gap, never a
//  border, and every band is named with its count below the bar.
export function BandBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + (x.value || 0), 0);
  if (!total) return <Text style={v.empty}>Nothing recorded yet.</Text>;
  const shown = segments.filter(s => s.value > 0);
  return (
    <View>
      <View style={{ flexDirection: 'row', height: 14, marginBottom: Spacing.sm }}>
        {shown.map((s, i) => (
          <View key={s.label} style={{
            flex: s.value,
            backgroundColor: s.color,
            marginLeft: i === 0 ? 0 : 2,
            borderTopLeftRadius: i === 0 ? 4 : 0,
            borderBottomLeftRadius: i === 0 ? 4 : 0,
            borderTopRightRadius: i === shown.length - 1 ? 4 : 0,
            borderBottomRightRadius: i === shown.length - 1 ? 4 : 0,
          }} />
        ))}
      </View>
      <View style={v.legend}>
        {segments.map(s => (
          <View key={s.label} style={v.legendItem}>
            <View style={[v.swatch, { backgroundColor: s.color }]} />
            <Text style={v.legendLabel}>{s.label}</Text>
            <Text style={v.legendValue}>{s.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Status split — labelled state bars ────────────────────────────────────────
export function StatusSplit({ items }: {
  items: { label: string; value: number | string; percent?: number; color: string; suffix?: string }[];
}) {
  return (
    <View style={{ gap: Spacing.sm }}>
      {items.map(it => (
        <View key={it.label}>
          <View style={v.meterHead}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[v.swatch, { backgroundColor: it.color }]} />
              <Text style={v.meterLabel}>{it.label}</Text>
            </View>
            <Text style={v.meterValue}>{it.value}{it.suffix ?? ''}</Text>
          </View>
          <View style={[v.track, { height: 6, borderRadius: 6 }]}>
            <View style={{ width: `${Math.max(0, Math.min(100, it.percent ?? 0))}%`, height: '100%', backgroundColor: it.color, borderRadius: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Ranked bars — compare magnitude across named items ────────────────────────
//  One series, so one colour for every bar; the value rides at the end of each
//  row rather than on an axis.
export function RankBars({ data, max, unit = '%' }: {
  data: { label: string; value: number }[]; max?: number; unit?: string;
}) {
  if (!data?.length) return <Text style={v.empty}>No data recorded yet.</Text>;
  const ceiling = max ?? Math.max(...data.map(d => d.value), 1);
  return (
    <View style={{ gap: Spacing.sm }}>
      {data.map(d => (
        <View key={d.label}>
          <View style={v.meterHead}>
            <Text style={v.meterLabel} numberOfLines={1}>{d.label}</Text>
            <Text style={v.meterValue}>{d.value}{unit}</Text>
          </View>
          <View style={[v.track, { height: 8, borderRadius: 8 }]}>
            <View style={{
              width: `${(d.value / ceiling) * 100}%`, height: '100%',
              backgroundColor: VIZ.accent, borderRadius: 8,
            }} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Sparkline columns — a magnitude per period ────────────────────────────────
//  The peak column is labelled; the rest are read off the shared baseline.
export function MiniColumns({ data, unit = '', format }: {
  data: { label: string; value: number }[]; unit?: string; format?: (n: number) => string;
}) {
  if (!data?.length) return <Text style={v.empty}>No data recorded yet.</Text>;
  const peak = Math.max(...data.map(d => d.value), 1);
  const fmt = format ?? ((n: number) => `${n}${unit}`);
  return (
    <View>
      <Text style={v.peakLabel}>Peak {fmt(peak)}</Text>
      <View style={v.columnsRow}>
        {data.map(d => (
          <View key={d.label} style={v.column}>
            <View style={v.columnTrack}>
              <View style={{
                height: `${Math.max(2, (d.value / peak) * 100)}%`,
                backgroundColor: d.value === peak ? VIZ.accent : '#A5B4FC',
                borderTopLeftRadius: 4, borderTopRightRadius: 4, width: '100%',
              }} />
            </View>
            <Text style={v.columnLabel} numberOfLines={1}>{d.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const v = StyleSheet.create({
  heroValue: { fontSize: 30, fontWeight: '700', color: Colors.text, lineHeight: 34 },
  heroUnit:  { fontSize: 15, fontWeight: '600', color: Colors.textSecondary, marginLeft: 2, marginBottom: 4 },
  heroDot:   { width: 9, height: 9, borderRadius: 3, marginLeft: 8, marginBottom: 8 },
  heroLabel: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  heroSub:   { fontSize: 11, color: Colors.textLight, marginTop: 2 },

  meterHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  meterLabel: { fontSize: 12, color: Colors.textSecondary, flexShrink: 1 },
  meterValue: { fontSize: 12, fontWeight: '700', color: Colors.text, marginLeft: Spacing.sm },
  track:      { backgroundColor: VIZ.track, overflow: 'hidden', width: '100%' },

  legend:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  legendItem:  { flexDirection: 'row', alignItems: 'center', marginRight: Spacing.md },
  swatch:      { width: 9, height: 9, borderRadius: 3, marginRight: 6 },
  legendLabel: { fontSize: 11, color: Colors.textSecondary },
  legendValue: { fontSize: 11, fontWeight: '700', color: Colors.text, marginLeft: 5 },

  peakLabel:   { fontSize: 11, color: Colors.textLight, marginBottom: 6 },
  columnsRow:  { flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 4 },
  column:      { flex: 1, alignItems: 'center' },
  columnTrack: { width: '100%', maxWidth: 26, height: 88, justifyContent: 'flex-end', backgroundColor: VIZ.track, borderRadius: 4, overflow: 'hidden' },
  columnLabel: { fontSize: 9, color: Colors.textLight, marginTop: 4 },

  empty: { fontSize: 12, color: Colors.textLight, paddingVertical: Spacing.md, textAlign: 'center' },
});

export const VizCard = ({ title, subtitle, children }: {
  title?: string; subtitle?: string; children: React.ReactNode;
}) => (
  <View style={{
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  }}>
    {title ? <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.text }}>{title}</Text> : null}
    {subtitle ? <Text style={{ fontSize: 11, color: Colors.textSecondary, marginTop: 2 }}>{subtitle}</Text> : null}
    <View style={{ marginTop: title ? Spacing.md : 0 }}>{children}</View>
  </View>
);
