/**
 * The library module's shared pieces on the phone.
 *
 * The web screens are built from a hero band, a row of figures, tinted cards
 * and a book row; these are the same shapes at phone width — figures go two
 * across instead of four, and a table becomes a stack of rows, because a
 * seven-column table on a 390pt screen is not a table, it is a scroll bar.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

export type Tone = 'indigo' | 'green' | 'amber' | 'red' | 'violet' | 'blue' | 'pink' | 'slate';

export const TONES: Record<Tone, { bg: string; fg: string }> = {
  indigo: { bg: '#EEF2FF', fg: '#4338CA' },
  blue:   { bg: '#DBEAFE', fg: '#2563EB' },
  green:  { bg: '#DCFCE7', fg: '#16A34A' },
  amber:  { bg: '#FEF3C7', fg: '#D97706' },
  red:    { bg: '#FEE2E2', fg: '#DC2626' },
  violet: { bg: '#EDE9FE', fg: '#7C3AED' },
  pink:   { bg: '#FCE7F3', fg: '#DB2777' },
  slate:  { bg: '#F1F5F9', fg: '#64748B' },
};

export const money = (n?: number | null) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export const shortDate = (d?: string | Date | null) => (d
  ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—');

/** "2 hours ago" — activity is read as recency, not as a timestamp. */
export function ago(d?: string | Date | null) {
  if (!d) return '';
  const secs = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const steps: [string, number][] = [['minute', 60], ['hour', 60], ['day', 24], ['week', 7], ['month', 4.35], ['year', 12]];
  let n = secs / 60; let unit = 'minute';
  for (let i = 0; i < steps.length - 1 && n >= steps[i + 1][1]; i++) { n /= steps[i + 1][1]; unit = steps[i + 1][0]; }
  const whole = Math.floor(n);
  return `${whole} ${unit}${whole === 1 ? '' : 's'} ago`;
}

// ── Header band ──────────────────────────────────────────────────────────────
export function Hero({ icon, title, blurb, quote, tone = 'indigo' }: {
  icon: any; title: string; blurb: string; quote?: string; tone?: Tone;
}) {
  const t = TONES[tone];
  return (
    <View style={s.hero}>
      <View style={s.heroTop}>
        <View style={[s.heroIcon, { backgroundColor: t.bg }]}>
          <Ionicons name={icon} size={24} color={t.fg} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.heroTitle}>{title}</Text>
          <Text style={s.heroBlurb}>{blurb}</Text>
        </View>
      </View>
      {quote ? <Text style={s.heroQuote}>{quote}</Text> : null}
    </View>
  );
}

// ── Figures ──────────────────────────────────────────────────────────────────
export type FigItem = { icon: any; tone: Tone; label: string; value: React.ReactNode; caption?: string };

export function Figures({ items }: { items: FigItem[] }) {
  return (
    <View style={s.figs}>
      {items.map((f) => {
        const t = TONES[f.tone];
        return (
          <View key={f.label} style={s.fig}>
            <View style={[s.figIcon, { backgroundColor: t.bg }]}>
              <Ionicons name={f.icon} size={18} color={t.fg} />
            </View>
            <Text style={s.figLabel} numberOfLines={1}>{f.label}</Text>
            <Text style={s.figValue} numberOfLines={1}>{f.value}</Text>
            {f.caption ? <Text style={s.figCap} numberOfLines={2}>{f.caption}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

// ── Pill ─────────────────────────────────────────────────────────────────────
export function Pill({ label, tone = 'slate' }: { label: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View style={[s.pill, { backgroundColor: t.bg }]}>
      <Text style={[s.pillText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────
export function Panel({ icon, tone = 'indigo', title, right, children }: {
  icon?: any; tone?: Tone; title: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  const t = TONES[tone];
  return (
    <View style={s.panel}>
      <View style={s.panelHead}>
        {icon ? <Ionicons name={icon} size={17} color={t.fg} /> : null}
        <Text style={s.panelTitle} numberOfLines={1}>{title}</Text>
        {right}
      </View>
      <View style={s.panelBody}>{children}</View>
    </View>
  );
}

// ── A book ───────────────────────────────────────────────────────────────────
export function Cover({ book, large }: { book?: any; large?: boolean }) {
  const box = large ? s.coverLg : s.cover;
  const uri = book?.coverImage
    ? (/^https?:/.test(book.coverImage) ? book.coverImage : undefined)
    : undefined;
  if (uri) return <Image source={{ uri }} style={box} />;
  return (
    <View style={[box, s.coverNone]}>
      <Ionicons name="book" size={large ? 26 : 16} color={Colors.primary} />
    </View>
  );
}

/** A book as a row: cover, title, author, ISBN, then whatever the screen adds. */
export function BookRow({ book, meta, right, footer, onPress }: {
  book?: any; meta?: string; right?: React.ReactNode; footer?: React.ReactNode; onPress?: () => void;
}) {
  const Wrap: any = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={s.bookRow} onPress={onPress} activeOpacity={0.7}>
      <View style={s.bookTop}>
        <Cover book={book} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.bookTitle} numberOfLines={2}>{book?.title ?? 'Book'}</Text>
          <Text style={s.bookBy} numberOfLines={1}>
            {(book?.authors ?? []).join(', ') || 'Unknown author'}
          </Text>
          {meta ? <Text style={s.bookMeta} numberOfLines={2}>{meta}</Text> : null}
        </View>
        {right ? <View style={s.bookRight}>{right}</View> : null}
      </View>
      {footer ? <View style={s.bookFoot}>{footer}</View> : null}
    </Wrap>
  );
}

/** A line of label/value facts under a row. */
export function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <View style={s.facts}>
      {items.filter(([, v]) => v !== '' && v != null).map(([k, v]) => (
        <View key={k} style={s.fact}>
          <Text style={s.factKey}>{k}</Text>
          <Text style={s.factVal} numberOfLines={1}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

/** A quiet note at the foot of a screen. */
export function Note({ icon = 'person-outline', children }: { icon?: any; children: React.ReactNode }) {
  return (
    <View style={s.note}>
      <Ionicons name={icon} size={13} color={Colors.textLight} />
      <Text style={s.noteText}>{children}</Text>
    </View>
  );
}

/** An empty state that says what would fill it. */
export function Blank({ icon, title, body }: { icon: any; title: string; body?: string }) {
  return (
    <View style={s.blank}>
      <View style={s.blankIcon}><Ionicons name={icon} size={24} color={Colors.textLight} /></View>
      <Text style={s.blankTitle}>{title}</Text>
      {body ? <Text style={s.blankBody}>{body}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  hero: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, letterSpacing: -0.4 },
  heroBlurb: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 },
  heroQuote: {
    marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.divider,
    fontSize: 12.5, fontStyle: 'italic', color: Colors.primary, fontWeight: '600', lineHeight: 18,
  },

  figs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.md },
  fig: {
    flexGrow: 1, flexBasis: '47%', backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: 12,
  },
  figIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  figLabel: { fontSize: 11.5, color: Colors.textSecondary, fontWeight: '600' },
  figValue: { fontSize: 19, fontWeight: '800', color: Colors.text, letterSpacing: -0.4, marginTop: 1 },
  figCap: { fontSize: 10.5, color: Colors.textLight, marginTop: 2, lineHeight: 14 },

  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: '700' },

  panel: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1,
    borderColor: Colors.border, marginBottom: Spacing.md, overflow: 'hidden',
  },
  panelHead: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  panelTitle: { flex: 1, fontSize: 14.5, fontWeight: '700', color: Colors.text },
  panelBody: { padding: 12 },

  cover: { width: 38, height: 52, borderRadius: 5, backgroundColor: Colors.surfaceAlt },
  coverLg: { width: 66, height: 90, borderRadius: 8, backgroundColor: Colors.surfaceAlt },
  coverNone: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },

  bookRow: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1,
    borderColor: Colors.border, padding: 11, marginBottom: 9,
  },
  bookTop: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  bookRight: { alignItems: 'flex-end', gap: 6 },
  bookTitle: { fontSize: 13.5, fontWeight: '700', color: Colors.text, lineHeight: 18 },
  bookBy: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 1 },
  bookMeta: { fontSize: 11, color: Colors.textLight, marginTop: 3, lineHeight: 15 },
  bookFoot: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.divider },

  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fact: { flexGrow: 1, flexBasis: '30%' },
  factKey: { fontSize: 10, color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '700' },
  factVal: { fontSize: 12.5, color: Colors.text, fontWeight: '600', marginTop: 1 },

  note: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, marginBottom: 8 },
  noteText: { fontSize: 11.5, color: Colors.textLight, flex: 1 },

  blank: { alignItems: 'center', paddingVertical: 26, gap: 6 },
  blankIcon: {
    width: 48, height: 48, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border, marginBottom: 4,
  },
  blankTitle: { ...Typography.body, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  blankBody: { fontSize: 11.5, color: Colors.textSecondary, textAlign: 'center', lineHeight: 16, paddingHorizontal: 20 },
});
