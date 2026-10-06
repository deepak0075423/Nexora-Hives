/**
 * Inventory on the phone — the pieces every inventory screen is built from.
 *
 * The same language as the web module (school-frontend/src/pages/inventory):
 * a plain page head, tinted state tiles, pill tabs, white panels, and a row
 * that leads with what the record is about. At phone width the tiles go two
 * across and a table becomes a stack of rows — a seven-column table on a 390pt
 * screen is a scroll bar with data behind it.
 *
 * Rules carried over from the web kit:
 *   • Stock figures are what is FREE, not what is on the shelf. Stock promised
 *     to an approved request cannot meet the next one, so `available` is the
 *     number a teacher is shown.
 *   • A tint carries identity, not judgement: amber means "waiting", not "bad".
 *   • A request line may carry a NAME instead of a catalogue id, because a
 *     teacher may need something the school has never bought.
 */
import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '@/constants/theme';
import { phoneInputValue } from '@/utils/validators';

// ── Palette ───────────────────────────────────────────────────────────────────
// The same values the other module kits use, so the app reads as one app.

export const BRAND = '#4F46E5';

export type Tone = 'indigo' | 'violet' | 'blue' | 'green' | 'amber' | 'orange' | 'red' | 'teal' | 'slate';

/** tile = the soft ground of a state tile; soft = an icon square or pill; fg = ink. */
export const TINT: Record<Tone, { tile: string; soft: string; fg: string }> = {
  indigo: { tile: '#F5F5FF', soft: '#E0E7FF', fg: '#4F46E5' },
  violet: { tile: '#F8F5FF', soft: '#EDE9FE', fg: '#7C3AED' },
  blue:   { tile: '#F3F8FF', soft: '#DBEAFE', fg: '#2563EB' },
  green:  { tile: '#F3FDF6', soft: '#D1FAE5', fg: '#059669' },
  amber:  { tile: '#FFFBF0', soft: '#FEF3C7', fg: '#D97706' },
  orange: { tile: '#FFF8F2', soft: '#FFEDD5', fg: '#EA580C' },
  red:    { tile: '#FFF5F5', soft: '#FEE2E2', fg: '#DC2626' },
  teal:   { tile: '#F0FDFA', soft: '#CCFBF1', fg: '#0D9488' },
  slate:  { tile: '#F8FAFC', soft: '#F1F5F9', fg: '#64748B' },
};

/** What a request's status means, in colour and in words. */
export const STATUS: Record<string, { tone: Tone; label: string; icon: any }> = {
  pending:              { tone: 'amber',  label: 'Pending',        icon: 'time-outline' },
  approved:             { tone: 'green',  label: 'Approved',       icon: 'checkmark-circle-outline' },
  converted:            { tone: 'blue',   label: 'Ordered',        icon: 'cart-outline' },
  fulfilled_from_stock: { tone: 'teal',   label: 'Issued',         icon: 'cube-outline' },
  rejected:             { tone: 'red',    label: 'Rejected',       icon: 'close-circle-outline' },
  cancelled:            { tone: 'slate',  label: 'Cancelled',      icon: 'remove-circle-outline' },
  draft:                { tone: 'slate',  label: 'Draft',          icon: 'document-outline' },
};
export const statusOf = (k?: string) => STATUS[String(k || '')] || { tone: 'slate' as Tone, label: words(k), icon: 'ellipse-outline' };

export const PRIORITY: Record<string, Tone> = { urgent: 'red', high: 'orange', normal: 'slate', low: 'slate' };

/** What each outcome actually means for the person who asked. */
export const OUTCOME: Record<string, string> = {
  pending: 'Somebody still has to look at this. You can cancel it until they do.',
  approved: 'Approved. It will either come out of stock or be ordered in.',
  converted: 'A purchase order has gone to a vendor for this.',
  fulfilled_from_stock: 'Issued to you from what the school already had — nothing needed to be ordered.',
  rejected: 'Turned down. The approver’s comment is under Approvals.',
  cancelled: 'You cancelled this before anybody acted on it.',
};

// ── Words and numbers ─────────────────────────────────────────────────────────

export function words(v?: string | null) {
  return String(v ?? '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
export const count = (n: any) => Number(n || 0).toLocaleString('en-IN');
export const money = (n: any, dec = 0) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
export const plural = (n: number, one: string, many = one + 's') => `${count(n)} ${n === 1 ? one : many}`;

export function fmtDay(d?: string | Date | null) {
  if (!d) return '—';
  const x = new Date(d);
  return x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "2 days ago" — how long since, in the largest unit that still reads. */
export function ago(d?: string | Date | null) {
  if (!d) return '—';
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  const w = Math.floor(days / 7);
  if (days < 30) return `${w} week${w === 1 ? '' : 's'} ago`;
  const mo = Math.floor(days / 30);
  if (days < 365) return `${mo} month${mo === 1 ? '' : 's'} ago`;
  const y = Math.floor(days / 365);
  return `${y} year${y === 1 ? '' : 's'} ago`;
}

/** A category's icon, from the web module's names to Ionicons. */
const ICON: Record<string, any> = {
  box: 'cube-outline', flask: 'flask-outline', book: 'book-outline', monitor: 'desktop-outline',
  pencil: 'pencil-outline', bulb: 'bulb-outline', shield: 'shield-outline', tools: 'hammer-outline',
  ball: 'football-outline', shirt: 'shirt-outline', medical: 'medkit-outline', clean: 'sparkles-outline',
};
export const iconFor = (name?: string) => ICON[String(name || '')] || 'cube-outline';

// ── Page head ─────────────────────────────────────────────────────────────────

/** The screen's own title. No icon block — the words lead, as on the web. */
export function Head({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={s.head}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.headTitle}>{title}</Text>
        {subtitle ? <Text style={s.headSub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

// ── State tiles ───────────────────────────────────────────────────────────────

export const Tiles = ({ children }: { children: React.ReactNode }) => <View style={s.tiles}>{children}</View>;

/**
 * A count in a condition. Four of these read faster in colour than in words,
 * which is why the whole card is tinted rather than just its icon.
 */
export function Tile({ icon, tone = 'indigo', value, label, caption, onPress, on }: {
  icon: any; tone?: Tone; value: React.ReactNode; label: string; caption?: string;
  onPress?: () => void; on?: boolean;
}) {
  const t = TINT[tone];
  const Wrap: any = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={[s.tile, { backgroundColor: t.tile }, on && { borderColor: t.fg }]} onPress={onPress} activeOpacity={0.75}
      accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={onPress ? `${label}, ${value}` : undefined}>
      <View style={[s.tileIcon, { backgroundColor: t.soft }]}>
        <Ionicons name={icon} size={17} color={t.fg} />
      </View>
      <Text style={s.tileValue} numberOfLines={1}>{value}</Text>
      <Text style={s.tileLabel} numberOfLines={2}>{label}</Text>
      {caption ? <Text style={s.tileCap} numberOfLines={2}>{caption}</Text> : null}
    </Wrap>
  );
}

// ── Pill tabs ─────────────────────────────────────────────────────────────────

export function Tabs({ value, onChange, items }: {
  value: string; onChange: (k: string) => void;
  items: { key: string; label: string; count?: number }[];
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
      {items.map((t) => {
        const on = t.key === value;
        return (
          <TouchableOpacity key={t.key} style={[s.tab, on && s.tabOn]} onPress={() => onChange(t.key)}
            accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text style={[s.tabText, on && { color: '#fff' }]}>
              {t.label}{t.count != null ? ` (${count(t.count)})` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function Panel({ icon, tone = 'indigo', title, subtitle, right, children, flush }: {
  icon?: any; tone?: Tone; title: string; subtitle?: string; right?: React.ReactNode;
  children?: React.ReactNode; flush?: boolean;
}) {
  const t = TINT[tone];
  return (
    <View style={s.panel}>
      <View style={s.panelHead}>
        {icon ? <View style={[s.panelIcon, { backgroundColor: t.soft }]}><Ionicons name={icon} size={15} color={t.fg} /></View> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.panelTitle}>{title}</Text>
          {subtitle ? <Text style={s.panelSub}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children != null ? <View style={flush ? undefined : s.panelBody}>{children}</View> : null}
    </View>
  );
}

// ── Badges ────────────────────────────────────────────────────────────────────

export function Pill({ tone = 'slate', icon, children }: { tone?: Tone; icon?: any; children: React.ReactNode }) {
  const t = TINT[tone];
  return (
    <View style={[s.pill, { backgroundColor: t.soft }]}>
      {icon ? <Ionicons name={icon} size={11} color={t.fg} /> : null}
      <Text style={[s.pillText, { color: t.fg }]} numberOfLines={1}>{children}</Text>
    </View>
  );
}

export const StatusPill = ({ value }: { value?: string }) => {
  const st = statusOf(value);
  return <Pill tone={st.tone} icon={st.icon}>{st.label}</Pill>;
};

// ── The thumbnail a row leads with ────────────────────────────────────────────

export function Thumb({ image, icon, tone = 'indigo', size = 38 }: {
  image?: string; icon?: string; tone?: Tone; size?: number;
}) {
  const t = TINT[tone];
  if (image) {
    return <Image source={{ uri: image }} style={[s.thumb, { width: size, height: size }]} resizeMode="cover" />;
  }
  return (
    <View style={[s.thumb, { width: size, height: size, backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }]}>
      <Ionicons name={iconFor(icon)} size={Math.round(size * 0.48)} color={t.fg} />
    </View>
  );
}

// ── A record, as a card ───────────────────────────────────────────────────────
// The web shows these as table rows. At phone width a row becomes a card, and
// the columns that mattered become the lines inside it.

export function Rec({ image, icon, title, sub, right, meta, onPress, children }: {
  image?: string; icon?: string; title: React.ReactNode; sub?: React.ReactNode;
  right?: React.ReactNode; meta?: React.ReactNode; onPress?: () => void; children?: React.ReactNode;
}) {
  const Wrap: any = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={s.rec} onPress={onPress} activeOpacity={0.75} accessibilityRole={onPress ? 'button' : undefined}>
      <View style={s.recTop}>
        <Thumb image={image} icon={icon} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.recTitle} numberOfLines={1}>{title}</Text>
          {sub != null ? <Text style={s.recSub} numberOfLines={2}>{sub}</Text> : null}
        </View>
        {right}
      </View>
      {meta != null ? <View style={s.recMeta}>{meta}</View> : null}
      {children}
    </Wrap>
  );
}

// ── Key / value ───────────────────────────────────────────────────────────────

export const Facts = ({ children }: { children: React.ReactNode }) => <View style={s.facts}>{children}</View>;

export function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <View style={s.fact}>
      <Text style={s.factK}>{k}</Text>
      <View style={s.factV}>
        {typeof v === 'string' || typeof v === 'number'
          ? <Text style={s.factVText}>{v}</Text>
          : (v ?? <Text style={s.factVMuted}>—</Text>)}
      </View>
    </View>
  );
}

// ── Notes and empties ─────────────────────────────────────────────────────────

export function Note({ tone = 'blue', icon = 'information-circle-outline', title, children }: {
  tone?: Tone; icon?: any; title?: string; children?: React.ReactNode;
}) {
  const t = TINT[tone];
  return (
    <View style={[s.note, { backgroundColor: t.tile, borderColor: t.soft }]}>
      <Ionicons name={icon} size={16} color={t.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        {title ? <Text style={[s.noteTitle, { color: t.fg }]}>{title}</Text> : null}
        {typeof children === 'string' ? <Text style={s.noteBody}>{children}</Text> : children}
      </View>
    </View>
  );
}

export function Blank({ icon = 'file-tray-outline', title, body, action }: {
  icon?: any; title: string; body?: string; action?: React.ReactNode;
}) {
  return (
    <View style={s.blank}>
      <View style={s.blankIcon}><Ionicons name={icon} size={26} color={Colors.textSecondary} /></View>
      <Text style={s.blankTitle}>{title}</Text>
      {body ? <Text style={s.blankBody}>{body}</Text> : null}
      {action ? <View style={{ marginTop: 12 }}>{action}</View> : null}
    </View>
  );
}

export const Muted = ({ children }: { children: React.ReactNode }) => <Text style={s.muted}>{children}</Text>;

// ── Buttons ───────────────────────────────────────────────────────────────────

export function Btn({ kind = 'ghost', icon, children, onPress, disabled, block }: {
  // 'stop' is solid red: going ahead past a safety check, never a soft choice.
  kind?: 'primary' | 'ghost' | 'danger' | 'stop'; icon?: any; children: React.ReactNode;
  onPress?: () => void; disabled?: boolean; block?: boolean;
}) {
  const bg = kind === 'primary' ? BRAND : kind === 'stop' ? '#DC2626' : kind === 'danger' ? '#FEF2F2' : '#fff';
  const fg = kind === 'primary' || kind === 'stop' ? '#fff' : kind === 'danger' ? Colors.danger : Colors.text;
  return (
    <TouchableOpacity
      style={[s.btn, { backgroundColor: bg, borderColor: kind === 'primary' ? BRAND : kind === 'stop' ? '#DC2626' : kind === 'danger' ? '#FECACA' : Colors.border },
        block && { flex: 1 }, disabled && { opacity: 0.5 }]}
      onPress={onPress} disabled={disabled} activeOpacity={0.8} accessibilityRole="button">
      {icon ? <Ionicons name={icon} size={15} color={fg} /> : null}
      <Text style={[s.btnText, { color: fg }]}>{children}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  headTitle: { fontSize: 21, fontWeight: '800', color: Colors.text, letterSpacing: -0.4 },
  headSub: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 3, lineHeight: 17 },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  tile: {
    // Two across at phone width: four would split "Pending Approval" mid-word.
    flexBasis: '47.8%', flexGrow: 1, minWidth: 0,
    borderRadius: Radius.lg, padding: 13, borderWidth: 1, borderColor: 'transparent',
  },
  tileIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  tileValue: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  tileLabel: { fontSize: 11.5, fontWeight: '600', color: Colors.text, marginTop: 2, lineHeight: 15 },
  tileCap: { fontSize: 10.5, color: Colors.textSecondary, marginTop: 3, lineHeight: 14 },

  tabs: { flexDirection: 'row', gap: 7, paddingVertical: 2, paddingRight: 12 },
  tab: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.border },
  tabOn: { backgroundColor: BRAND, borderColor: BRAND },
  tabText: { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary },

  panel: { backgroundColor: '#fff', borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, marginBottom: 12, overflow: 'hidden' },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  panelIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  panelTitle: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  panelSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 1 },
  panelBody: { padding: 13 },

  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 3.5, paddingHorizontal: 8, borderRadius: 999 },
  pillText: { fontSize: 10.5, fontWeight: '700' },

  thumb: { borderRadius: 10, backgroundColor: '#F1F5F9' },

  rec: { backgroundColor: '#fff', borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 10 },
  recTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  recTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  recSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },
  recMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.divider },

  facts: { gap: 0 },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  factK: { flex: 0.85, fontSize: 12, color: Colors.textSecondary },
  factV: { flex: 1.15, alignItems: 'flex-end' },
  factVText: { fontSize: 12.5, fontWeight: '600', color: Colors.text, textAlign: 'right' },
  factVMuted: { fontSize: 12.5, color: Colors.textSecondary },

  note: { flexDirection: 'row', gap: 9, padding: 11, borderRadius: 11, borderWidth: 1, marginBottom: 11 },
  noteTitle: { fontSize: 12.5, fontWeight: '700', marginBottom: 2 },
  noteBody: { fontSize: 12, color: Colors.text, lineHeight: 17 },

  blank: { alignItems: 'center', paddingVertical: 38, paddingHorizontal: 20 },
  blankIcon: { width: 54, height: 54, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  blankTitle: { fontSize: 14.5, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  blankBody: { fontSize: 12.5, color: Colors.textSecondary, textAlign: 'center', marginTop: 5, lineHeight: 18 },

  muted: { fontSize: 12, color: Colors.textSecondary },

  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1 },
  btnText: { fontSize: 13, fontWeight: '700' },
});

// ── Full-screen form sheet ────────────────────────────────────────────────────

import { Modal, KeyboardAvoidingView, Platform, TextInput, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * A form that takes the whole screen.
 *
 * The web puts this in a modal beside a summary column; a phone has no room
 * for a column, so the summary goes at the bottom where it reads as the total
 * of what you just filled in rather than a panel you ignore.
 */
export function Sheet({ visible, icon = 'create-outline', tone = 'violet', title, subtitle, onClose, footer, children, busy }: {
  visible: boolean; icon?: any; tone?: Tone; title: string; subtitle?: string;
  onClose: () => void; footer?: React.ReactNode; children: React.ReactNode; busy?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const t = TINT[tone];
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}>
      <KeyboardAvoidingView style={f.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[f.sheetHead, { paddingTop: Platform.OS === 'ios' ? 16 : 16 + insets.top }]}>
          <View style={[f.sheetIcon, { backgroundColor: t.soft }]}>
            <Ionicons name={icon} size={19} color={t.fg} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={f.sheetTitle} numberOfLines={2}>{title}</Text>
            {subtitle ? <Text style={f.sheetSub}>{subtitle}</Text> : null}
          </View>
          <TouchableOpacity onPress={onClose} disabled={busy} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={f.sheetBody} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer ? <View style={[f.sheetFoot, { paddingBottom: 12 + insets.bottom }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A numbered section, as the web form's three steps. */
export function Step({ n, title, sub, children }: { n: number; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <View style={f.step}>
      <View style={f.stepHead}>
        <View style={f.stepN}><Text style={f.stepNText}>{n}</Text></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={f.stepTitle}>{title}</Text>
          {sub ? <Text style={f.stepSub}>{sub}</Text> : null}
        </View>
      </View>
      <View style={f.stepBody}>{children}</View>
    </View>
  );
}

export function Field({ label, required, hint, error, children }: {
  label?: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <View style={f.field}>
      {label ? (
        <Text style={f.fieldLabel}>
          {label}{required ? <Text style={{ color: Colors.danger }}> *</Text> : null}
        </Text>
      ) : null}
      {children}
      {error ? <Text style={f.fieldErr}>{error}</Text> : hint ? <Text style={f.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/** A text box. `phone` makes it a 10-digit mobile number box, as the kit's Input does. */
export function Box({ value, onChange, placeholder, multiline, keyboardType, maxLength, onFocus, phone }: {
  value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean;
  keyboardType?: any; maxLength?: number; onFocus?: () => void; phone?: boolean;
}) {
  const shown = phone ? phoneInputValue(value) : value;
  return (
    <TextInput
      style={[f.box, multiline && { height: 92, textAlignVertical: 'top', paddingTop: 10 }]}
      value={shown} onChangeText={phone ? (t) => onChange(phoneInputValue(t, shown)) : onChange} placeholder={placeholder}
      placeholderTextColor={Colors.textLight} multiline={multiline}
      keyboardType={phone ? 'number-pad' : keyboardType} maxLength={phone ? undefined : maxLength} onFocus={onFocus}
    />
  );
}

/** A value picked from a list, in a sheet — a phone has no room for a dropdown. */
export function Pick({ value, options, placeholder = 'Select…', onChange, label }: {
  value: string; options: { label: string; value: string; sub?: string }[];
  placeholder?: string; onChange: (v: string) => void; label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const hit = options.find((o) => String(o.value) === String(value));
  return (
    <>
      <TouchableOpacity style={f.box} onPress={() => setOpen(true)} activeOpacity={0.7}
        accessibilityRole="button" accessibilityLabel={label ? `${label}: ${hit?.label || placeholder}` : undefined}>
        <Text style={[f.boxText, !hit && { color: Colors.textLight }]} numberOfLines={1}>{hit?.label || placeholder}</Text>
        <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={f.pickBack} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={f.pickCard}>
            {label ? <Text style={f.pickTitle}>{label}</Text> : null}
            <ScrollView style={{ maxHeight: 360 }}>
              {options.map((o) => {
                const on = String(o.value) === String(value);
                return (
                  <TouchableOpacity key={String(o.value)} style={f.pickRow}
                    onPress={() => { onChange(o.value); setOpen(false); }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[f.pickText, on && { color: BRAND, fontWeight: '700' }]} numberOfLines={1}>{o.label}</Text>
                      {o.sub ? <Text style={f.pickSub} numberOfLines={1}>{o.sub}</Text> : null}
                    </View>
                    {on ? <Ionicons name="checkmark" size={17} color={BRAND} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

/**
 * The item on a request line: search the catalogue, or name something that is
 * not in it.
 *
 * The phone screen used to post `item: null` for every line — a teacher could
 * never pick a catalogue item, so an approver got a list of names to match up
 * by hand. Typing filters the master; picking a hit links the line to its id;
 * text that matches nothing stays as text, which is the case the catalogue
 * cannot cover.
 */
export function ItemPick({ items, line, onPick, onName }: {
  items: any[]; line: { item: string; itemName: string };
  onPick: (id: string, it: any) => void; onName: (name: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const hit = items.find((i) => String(i._id) === String(line.item));

  const shown = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items.slice(0, 60);
    return items.filter((i) =>
      String(i.name).toLowerCase().includes(needle) || String(i.itemCode || '').toLowerCase().includes(needle),
    ).slice(0, 60);
  }, [items, q]);

  return (
    <>
      <TouchableOpacity style={f.box} onPress={() => { setQ(line.itemName || ''); setOpen(true); }} activeOpacity={0.7}
        accessibilityRole="button" accessibilityLabel="Choose an item">
        <Text style={[f.boxText, !line.itemName && { color: Colors.textLight }]} numberOfLines={1}>
          {line.itemName || 'Search or select an item…'}
        </Text>
        <Ionicons name="search" size={15} color={Colors.textSecondary} />
      </TouchableOpacity>

      {line.itemName ? (
        hit
          ? <Text style={f.hit}><Ionicons name="checkmark-circle" size={11} color="#16A34A" />{'  '}{hit.itemCode}
              {hit.available != null ? ` · ${count(hit.available)} in stock` : ''}</Text>
          : <Text style={f.new}><Ionicons name="information-circle-outline" size={11} color={Colors.textSecondary} />
              {'  '}Not in the catalogue — the office will decide what to order</Text>
      ) : null}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}>
        <View style={f.sheet}>
          <View style={[f.sheetHead, { paddingTop: 16 }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={f.sheetTitle}>Choose an item</Text>
              <Text style={f.sheetSub}>Search the catalogue, or type what you need.</Text>
            </View>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={f.searchWrap}>
            <Ionicons name="search" size={16} color={Colors.textSecondary} />
            <TextInput style={f.search} value={q} onChangeText={setQ} autoFocus
              placeholder="Search or type a name…" placeholderTextColor={Colors.textLight} />
            {q ? (
              <TouchableOpacity onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Clear">
                <Ionicons name="close-circle" size={17} color={Colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {/* Anything typed can be used as-is — that is the whole point of
                letting a teacher ask for what the school has never bought. */}
            {q.trim() && !shown.some((i) => String(i.name).toLowerCase() === q.trim().toLowerCase()) ? (
              <TouchableOpacity style={f.useRow} onPress={() => { onName(q.trim()); setOpen(false); }}>
                <View style={[f.thumbSm, { backgroundColor: TINT.slate.soft }]}>
                  <Ionicons name="add" size={17} color={TINT.slate.fg} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={f.useTitle} numberOfLines={1}>Ask for “{q.trim()}”</Text>
                  <Text style={f.useSub}>Not in the catalogue — the office decides what to order</Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {shown.map((i) => (
              <TouchableOpacity key={i._id} style={f.useRow} onPress={() => { onPick(String(i._id), i); setOpen(false); }}>
                <Thumb image={i.image} icon="box" size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={f.useTitle} numberOfLines={1}>{i.name}</Text>
                  <Text style={f.useSub} numberOfLines={1}>
                    {i.itemCode}
                    {i.available != null ? ` · ${count(i.available)} free` : ''}
                    {i.purchasePrice ? ` · ${money(i.purchasePrice)}` : ''}
                  </Text>
                </View>
                {String(i._id) === String(line.item) ? <Ionicons name="checkmark" size={17} color={BRAND} /> : null}
              </TouchableOpacity>
            ))}

            {!shown.length && !q.trim() ? <Blank icon="cube-outline" title="No items in the catalogue yet" /> : null}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

export const Spinner = () => <ActivityIndicator size="small" color={BRAND} />;

const f = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: Colors.background },
  sheetHead: {
    flexDirection: 'row', alignItems: 'center', gap: 11, padding: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  sheetIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  sheetSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },
  sheetBody: { padding: 14, paddingBottom: 30 },
  sheetFoot: {
    flexDirection: 'row', gap: 10, padding: 12,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: Colors.border,
  },

  step: { marginBottom: 18 },
  stepHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 11 },
  stepN: { width: 25, height: 25, borderRadius: 999, backgroundColor: TINT.indigo.soft, alignItems: 'center', justifyContent: 'center' },
  stepNText: { fontSize: 12, fontWeight: '800', color: BRAND },
  stepTitle: { fontSize: 14.5, fontWeight: '700', color: Colors.text },
  stepSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },
  stepBody: { paddingLeft: 0 },

  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  fieldHint: { fontSize: 11, color: Colors.textSecondary, marginTop: 5, lineHeight: 15 },
  fieldErr: { fontSize: 11, color: Colors.danger, marginTop: 5 },

  box: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    minHeight: 44, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    fontSize: 13.5, color: Colors.text,
  },
  boxText: { flex: 1, fontSize: 13.5, color: Colors.text },

  hit: { fontSize: 11, color: '#16A34A', marginTop: 6 },
  new: { fontSize: 11, color: Colors.textSecondary, marginTop: 6, lineHeight: 15 },

  pickBack: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 22 },
  pickCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, maxHeight: '80%' },
  pickTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  pickText: { fontSize: 13.5, color: Colors.text },
  pickSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, marginBottom: 0,
    paddingHorizontal: 12, height: 44, backgroundColor: '#fff',
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
  },
  search: { flex: 1, fontSize: 13.5, color: Colors.text },

  useRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, marginBottom: 8,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
  },
  thumbSm: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  useTitle: { fontSize: 13.5, fontWeight: '600', color: Colors.text },
  useSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
});
