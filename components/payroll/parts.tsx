/**
 * The payroll module's shared pieces on the phone.
 *
 * The web screens are built from tinted figure tiles, a salary ledger, a run
 * stepper and a right-hand rail. On a 390pt screen the rail becomes the bottom
 * of the scroll, four tiles become two across, and a ten-column table becomes
 * a stack of rows — a table that wide is not a table on a phone, it is a
 * horizontal scroll bar nobody uses.
 *
 * The one thing that does NOT change shape is the ledger: earnings, deductions
 * and the net are the whole point of a payslip, and they read as a list on any
 * screen.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Colors, Spacing, Radius } from '@/constants/theme';

export type Tone = 'indigo' | 'green' | 'amber' | 'red' | 'violet' | 'blue' | 'pink' | 'slate' | 'orange';

export const TONES: Record<Tone, { bg: string; fg: string }> = {
  indigo: { bg: '#EEF2FF', fg: '#4338CA' },
  blue:   { bg: '#DBEAFE', fg: '#2563EB' },
  green:  { bg: '#DCFCE7', fg: '#16A34A' },
  amber:  { bg: '#FEF3C7', fg: '#B45309' },
  orange: { bg: '#FFEDD5', fg: '#C2410C' },
  red:    { bg: '#FEE2E2', fg: '#DC2626' },
  violet: { bg: '#EDE9FE', fg: '#7C3AED' },
  pink:   { bg: '#FCE7F3', fg: '#BE185D' },
  slate:  { bg: '#F1F5F9', fg: '#475569' },
};

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const money = (n?: number | null) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;

/** "₹6L" / "₹40K" — for a tile that has 140pt to say a number in. */
export const compactMoney = (n?: number | null) => {
  const v = Number(n || 0);
  if (!v) return '₹0';
  if (Math.abs(v) >= 1e7) return `₹${+(v / 1e7).toFixed(1)}Cr`;
  if (Math.abs(v) >= 1e5) return `₹${+(v / 1e5).toFixed(1)}L`;
  if (Math.abs(v) >= 1e3) return `₹${Math.round(v / 1e3)}K`;
  return `₹${Math.round(v)}`;
};

export const shortDate = (d?: string | Date | null) => (d
  ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—');

/* ── Vocabulary, kept identical to the web so the two never disagree ─────── */

export const RUN_STATUS: Record<string, [Tone, string]> = {
  draft:      ['blue',   'In Progress'],
  reviewed:   ['amber',  'In Progress'],
  approved:   ['indigo', 'In Progress'],
  publishing: ['indigo', 'Publishing'],
  published:  ['green',  'Completed'],
  failed:     ['red',    'Failed'],
  cancelled:  ['slate',  'Cancelled'],
};
export const RUN_STEPS = ['Configure', 'Review', 'Process', 'Complete'];

export const ASSIGN_STATUS: Record<string, [Tone, string]> = {
  active:   ['green', 'Active'],
  pending:  ['amber', 'Pending'],
  inactive: ['red',   'Inactive'],
  ended:    ['slate', 'Ended'],
};

export const STRUCTURE_TYPE: Record<string, [Tone, string]> = {
  teaching:       ['violet', 'Teaching'],
  non_teaching:   ['blue',   'Non-Teaching'],
  administration: ['orange', 'Administration'],
  contract:       ['pink',   'Contract'],
  general:        ['slate',  'General'],
};

export const PAYMENT_MODE: Record<string, string> = {
  bank_transfer: 'Bank Transfer', cash: 'Cash', cheque: 'Cheque',
};

/* ── Files ────────────────────────────────────────────────────────────────── */

const blobToBase64 = (blob: any): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = reject;
  reader.onloadend = () => resolve(String(reader.result).split(',')[1] ?? '');
  reader.readAsDataURL(blob);
});

/**
 * Fetch a server-rendered file and hand it to the phone's share sheet.
 *
 * The phone never redraws a payslip or a report of its own: what somebody
 * forwards to a bank has to be the document the school issued, byte for byte.
 */
export async function saveAndShare(loader: () => Promise<any>, filename: string, mimeType = 'application/pdf') {
  try {
    const blob = await loader();
    const base64 = await blobToBase64(blob);
    const uri = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType });
    else Alert.alert('Saved', `${filename} was saved to this device.`);
  } catch (err: any) {
    Alert.alert('Could not open the file', err?.message ?? 'Please try again.');
  }
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

export function Pill({ label, tone = 'slate' }: { label?: string; tone?: Tone }) {
  if (!label) return null;
  const t = TONES[tone] || TONES.slate;
  return (
    <View style={[s.pill, { backgroundColor: t.bg }]}>
      <Text style={[s.pillText, { color: t.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** A status straight from the server, written the way the web writes it. */
export const StatusPill = ({ status, map = RUN_STATUS }: { status?: string; map?: Record<string, [Tone, string]> }) => {
  const [tone, label] = map[status || ''] || (['slate', status || '—'] as [Tone, string]);
  return <Pill label={label} tone={tone} />;
};

export type FigItem = { icon: any; tone: Tone; label: string; value: React.ReactNode; caption?: string };

/** Figures, two across. Four across is unreadable below about 600pt. */
export function Figures({ items }: { items: FigItem[] }) {
  return (
    <View style={s.figWrap}>
      {items.map((f, i) => {
        const t = TONES[f.tone] || TONES.slate;
        return (
          <View key={`${f.label}-${i}`} style={s.fig}>
            <View style={[s.figIcon, { backgroundColor: t.bg }]}>
              <Ionicons name={f.icon} size={16} color={t.fg} />
            </View>
            <Text style={s.figLabel} numberOfLines={2}>{f.label}</Text>
            <Text style={s.figValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{f.value}</Text>
            {!!f.caption && <Text style={s.figCaption} numberOfLines={2}>{f.caption}</Text>}
          </View>
        );
      })}
    </View>
  );
}

export function Panel({ icon, tone = 'indigo', title, sub, right, children }: {
  icon?: any; tone?: Tone; title: string; sub?: string; right?: React.ReactNode; children?: React.ReactNode;
}) {
  const t = TONES[tone] || TONES.indigo;
  return (
    <View style={s.panel}>
      <View style={s.panelHead}>
        {!!icon && (
          <View style={[s.panelIcon, { backgroundColor: t.bg }]}>
            <Ionicons name={icon} size={16} color={t.fg} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.panelTitle} numberOfLines={2}>{title}</Text>
          {!!sub && <Text style={s.panelSub} numberOfLines={2}>{sub}</Text>}
        </View>
        {right}
      </View>
      {children ? <View style={s.panelBody}>{children}</View> : null}
    </View>
  );
}

/** Label / value pairs that wrap rather than truncate — money must not clip. */
export function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <View>
      {items.filter(Boolean).map(([k, v], i) => (
        <View key={`${k}-${i}`} style={[s.fact, i === 0 && { borderTopWidth: 0 }]}>
          <Text style={s.factKey}>{k}</Text>
          <Text style={s.factVal}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Earnings, deductions, employer cost — the shape of a payslip.
 * `note` is the "₹25,000 for a full month" line a short month needs.
 */
export function Ledger({ title, rows, total, tone }: {
  title: string;
  rows: { name: string; amount: number; note?: string }[];
  total?: number;
  tone?: 'red';
}) {
  return (
    <View style={s.ledger}>
      <View style={s.ledgerHead}>
        <Text style={s.ledgerHeadText}>{title}</Text>
        <Text style={s.ledgerHeadText}>Amount</Text>
      </View>
      {rows.length === 0 ? (
        <View style={s.ledgerRow}><Text style={s.ledgerNone}>None</Text><Text style={s.ledgerAmt}>{money(0)}</Text></View>
      ) : rows.map((r, i) => (
        <View key={`${r.name}-${i}`} style={s.ledgerRow}>
          <View style={{ flex: 1, paddingRight: Spacing.sm }}>
            <Text style={s.ledgerName}>{r.name}</Text>
            {!!r.note && <Text style={s.ledgerNote}>{r.note}</Text>}
          </View>
          <Text style={[s.ledgerAmt, tone === 'red' && { color: '#DC2626' }]}>{money(r.amount)}</Text>
        </View>
      ))}
      {total !== undefined && (
        <View style={[s.ledgerRow, s.ledgerTotal]}>
          <Text style={s.ledgerTotalText}>Total</Text>
          <Text style={s.ledgerTotalText}>{money(total)}</Text>
        </View>
      )}
    </View>
  );
}

export const NetBar = ({ label = 'Net Salary', value }: { label?: string; value?: number }) => (
  <View style={s.netBar}>
    <Text style={s.netLabel}>{label}</Text>
    <Text style={s.netValue}>{money(value)}</Text>
  </View>
);

/** 1 Configure — 2 Review — 3 Process — 4 Complete */
export function Steps({ step = 1, labels = RUN_STEPS }: { step?: number; labels?: string[] }) {
  return (
    <View style={s.steps}>
      {labels.map((l, i) => {
        const done = i + 1 < step;
        const on = i + 1 === step;
        return (
          <View key={l} style={s.step}>
            {i > 0 && <View style={[s.stepLine, (done || on) && { backgroundColor: '#C7D2FE' }]} />}
            <View style={[s.stepDot, done && { backgroundColor: '#DCFCE7' }, on && { backgroundColor: Colors.primary }]}>
              {done
                ? <Ionicons name="checkmark" size={12} color="#16A34A" />
                : <Text style={[s.stepNum, on && { color: '#FFF' }]}>{i + 1}</Text>}
            </View>
            <Text style={[s.stepLabel, on && { color: Colors.primary, fontWeight: '700' }]} numberOfLines={1}>{l}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** A warning a run raises about itself — over-CTC, zero pay, arrears. */
export function NoteBox({ tone = 'amber', icon = 'alert-circle', children }: {
  tone?: Tone; icon?: any; children: React.ReactNode;
}) {
  const t = TONES[tone] || TONES.amber;
  return (
    <View style={[s.note, { backgroundColor: t.bg, borderColor: t.fg + '33' }]}>
      <Ionicons name={icon} size={16} color={t.fg} style={{ marginTop: 1 }} />
      <Text style={[s.noteText, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

/** One person in a list: initials, name, and one line of context. */
export function PersonRow({ name, sub, right, onPress, tone = 'indigo' }: {
  name: string; sub?: string; right?: React.ReactNode; onPress?: () => void; tone?: Tone;
}) {
  const t = TONES[tone] || TONES.indigo;
  const initials = String(name || '?').trim().split(/\s+/).filter(Boolean)
    .map(p => p[0]).slice(0, 2).join('').toUpperCase() || '?';
  const Wrap: any = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={s.person} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.avatar, { backgroundColor: t.bg }]}>
        <Text style={[s.avatarText, { color: t.fg }]}>{initials}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.personName} numberOfLines={1}>{name}</Text>
        {!!sub && <Text style={s.personSub} numberOfLines={2}>{sub}</Text>}
      </View>
      {right}
    </Wrap>
  );
}

/** A figure beside a label, for the "this row in numbers" strips. */
export function MiniStat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'red' | 'green' }) {
  return (
    <View style={s.mini}>
      <Text style={s.miniLabel} numberOfLines={1}>{label}</Text>
      <Text style={[s.miniValue, tone === 'red' && { color: '#DC2626' }, tone === 'green' && { color: '#16A34A' }]}
        numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {value}
      </Text>
    </View>
  );
}
export const MiniRow = ({ children }: { children: React.ReactNode }) => <View style={s.miniRow}>{children}</View>;

export function Blank({ icon, title, body, children }: { icon: any; title: string; body?: string; children?: React.ReactNode }) {
  return (
    <View style={s.blank}>
      <View style={s.blankIcon}><Ionicons name={icon} size={26} color={Colors.textSecondary} /></View>
      <Text style={s.blankTitle}>{title}</Text>
      {!!body && <Text style={s.blankBody}>{body}</Text>}
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start', maxWidth: 150 },
  pillText: { fontSize: 11, fontWeight: '700' },

  figWrap: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs, marginBottom: Spacing.sm },
  fig: {
    width: '50%', paddingHorizontal: Spacing.xs, marginBottom: Spacing.sm,
  },
  figIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  figLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600', lineHeight: 14 },
  figValue: { fontSize: 19, fontWeight: '800', color: Colors.text, marginTop: 2 },
  figCaption: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, lineHeight: 13 },

  panel: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.sm, overflow: 'hidden',
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, paddingBottom: Spacing.sm },
  panelIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  panelTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  panelSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },
  panelBody: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },

  fact: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    gap: Spacing.sm, paddingVertical: 9, borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  factKey: { fontSize: 12.5, color: Colors.textSecondary, flex: 1 },
  factVal: { fontSize: 13, color: Colors.text, fontWeight: '700', flex: 1, textAlign: 'right' },

  ledger: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, overflow: 'hidden', marginBottom: Spacing.sm },
  ledgerHead: {
    flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.sm + 2, paddingVertical: 7,
    backgroundColor: '#F8FAFC',
  },
  ledgerHeadText: { fontSize: 10.5, fontWeight: '800', color: Colors.textSecondary, letterSpacing: 0.4, textTransform: 'uppercase' },
  ledgerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm + 2, paddingVertical: 9, borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  ledgerName: { fontSize: 13, color: Colors.text },
  ledgerNote: { fontSize: 10.5, color: Colors.textSecondary, marginTop: 1 },
  ledgerNone: { fontSize: 13, color: Colors.textSecondary },
  ledgerAmt: { fontSize: 13, fontWeight: '700', color: Colors.text },
  ledgerTotal: { backgroundColor: '#F8FAFC' },
  ledgerTotalText: { fontSize: 13, fontWeight: '800', color: Colors.text },

  netBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.primary, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  netLabel: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  netValue: { color: '#FFF', fontSize: 19, fontWeight: '800' },

  steps: { flexDirection: 'row', paddingVertical: Spacing.sm },
  step: { flex: 1, alignItems: 'center', gap: 5 },
  stepLine: { position: 'absolute', top: 12, right: '50%', width: '100%', height: 2, backgroundColor: '#EEF2F7' },
  stepDot: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#EEF2F7',
    alignItems: 'center', justifyContent: 'center',
  },
  stepNum: { fontSize: 11, fontWeight: '800', color: Colors.textSecondary },
  stepLabel: { fontSize: 10, color: Colors.textSecondary, textAlign: 'center' },

  note: {
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start',
    padding: Spacing.sm + 2, borderRadius: Radius.md, borderWidth: 1, marginBottom: Spacing.sm,
  },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 18 },

  person: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '800' },
  personName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  personSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2, lineHeight: 15 },

  miniRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  mini: { flexGrow: 1, flexBasis: '30%', backgroundColor: '#F8FAFC', borderRadius: Radius.sm, padding: Spacing.sm },
  miniLabel: { fontSize: 10.5, color: Colors.textSecondary, fontWeight: '600' },
  miniValue: { fontSize: 14, fontWeight: '800', color: Colors.text, marginTop: 2 },

  blank: { alignItems: 'center', paddingVertical: Spacing.xl, paddingHorizontal: Spacing.lg },
  blankIcon: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: Colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm,
  },
  blankTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  blankBody: { fontSize: 12.5, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: Spacing.sm },
});
