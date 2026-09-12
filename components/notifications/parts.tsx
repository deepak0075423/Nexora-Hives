import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

/**
 * The pieces of the notifications screen — the one every role shares.
 *
 * The mobile half of school-frontend/src/pages/shared/notificationParts.jsx.
 * Same decisions, in React Native: one mark per row rather than a colour code,
 * the module in words on the meta line, and the emoji taken out of the title
 * because the row already carries an icon.
 */

// ── What a notification is about ─────────────────────────────────────────────
// The server derives the module from the notification's destination and sends
// `{ key, label }`; this is only which glyph it gets. The tint is the same for
// every row — fifteen colours down one list reads as a code nobody was taught.
const MODULE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  leave:      'calendar-outline',
  attendance: 'checkbox-outline',
  fees:       'card-outline',
  payroll:    'wallet-outline',
  library:    'book-outline',
  results:    'trophy-outline',
  timetable:  'time-outline',
  calendar:   'sparkles-outline',
  inventory:  'cube-outline',
  transport:  'bus-outline',
  hostel:     'bed-outline',
  video:      'videocam-outline',
  feedback:   'star-outline',
  academics:  'school-outline',
  general:    'megaphone-outline',
};

/** An unknown key falls back to the bell, so a new module never renders a hole. */
export const moduleIcon = (key?: string): keyof typeof Ionicons.glyphMap =>
  (key && MODULE_ICON[key]) || 'notifications-outline';

// ── Priority ─────────────────────────────────────────────────────────────────
// The word is always printed; the tint is a second channel on top of it.
export const PRIORITIES = [
  { value: 'high',   label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low',    label: 'Low' },
];

const PRIORITY_TONE: Record<string, { bg: string; fg: string }> = {
  high:   { bg: Colors.dangerLight,  fg: Colors.danger },
  medium: { bg: Colors.warningLight, fg: Colors.warning },
  low:    { bg: Colors.successLight, fg: Colors.success },
};

export const PriorityPill = ({ level }: { level?: string }) => {
  const key  = level && PRIORITY_TONE[level] ? level : 'low';
  const tone = PRIORITY_TONE[key];
  const label = PRIORITIES.find((p) => p.value === key)?.label ?? 'Low';
  return (
    <View style={[s.pill, { backgroundColor: tone.bg }]}>
      <Text style={[s.pillText, { color: tone.fg }]}>{label}</Text>
    </View>
  );
};

// What a notification is, as a reader would divide them.
export const KINDS = [
  { value: 'activity',     label: 'Activity' },
  { value: 'announcement', label: 'Announcements' },
];

export const READ_STATES = [
  { value: 'unread', label: 'Unread' },
  { value: 'read',   label: 'Read' },
];

export const SORTS = [
  { value: 'newest',   label: 'Newest first' },
  { value: 'oldest',   label: 'Oldest first' },
  { value: 'unread',   label: 'Unread first' },
  { value: 'priority', label: 'Priority' },
  { value: 'title',    label: 'Title (A–Z)' },
];

export const TARGET_LABEL: Record<string, string> = {
  all: 'Everyone', all_teachers: 'All Teachers', all_students: 'All Students',
  all_parents: 'All Parents', class_students: 'Class Students',
  class_parents: 'Class Parents', section_students: 'Section Students',
  section_parents: 'Section Parents', section_all: 'Section Everyone',
  all_schools: 'All Schools', specific_school: 'Specific School',
  individual: 'Raised by a module',
};

// ── Text ─────────────────────────────────────────────────────────────────────

/**
 * The text without the little pictures in it.
 *
 * Titles are written with an emoji in front — "🎉 Holiday: …", "📚 Book issued"
 * — which made sense when the row had no mark of its own. It has one now, so
 * the two together read as a stutter. The stored text keeps its emoji: the same
 * title goes out by email and as a push notification, where nothing is drawn
 * beside it. Horizontal whitespace only, so a body written as a block of
 * labelled lines keeps its line breaks.
 */
const PICTOGRAPHS = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu;

export const plain = (text?: string | null): string => {
  const out = String(text ?? '')
    .replace(PICTOGRAPHS, '')
    .replace(/[^\S\r\n]{2,}/g, ' ')
    .trim();
  return out || String(text ?? '');
};

export function timeAgo(iso?: string) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export const fullWhen = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

// ── One notification ─────────────────────────────────────────────────────────

export interface Receipt {
  _id: string;
  isRead: boolean;
  isCleared?: boolean;
  createdAt: string;
  priority?: string;
  kind?: string;
  module?: { key: string; label: string };
  sender?: { name: string; role: string };
  notification: {
    _id: string; title: string; body: string;
    senderRole: string; createdAt: string;
  } | null;
  link?: any;
}

/**
 * A row in the mailbox.
 *
 * Tapping opens it. While the screen is selecting, tapping ticks it instead —
 * a long press is how selection starts, which is the platform's own idiom and
 * keeps a checkbox off every row until one is wanted.
 */
export function NotifRow({
  row, picked, selecting, onOpen, onToggle, onLongPress,
}: {
  row: Receipt;
  picked?: boolean;
  selecting?: boolean;
  onOpen: (r: Receipt) => void;
  onToggle: (r: Receipt) => void;
  onLongPress: (r: Receipt) => void;
}) {
  const n = row.notification;
  if (!n) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => (selecting ? onToggle(row) : onOpen(row))}
      onLongPress={() => onLongPress(row)}
      style={[s.row, !row.isRead && s.rowUnread, picked && s.rowPicked]}
    >
      {selecting ? (
        <View style={[s.tick, picked && s.tickOn]}>
          {picked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
        </View>
      ) : (
        <View style={[s.dot, !row.isRead && s.dotOn]} />
      )}

      <View style={s.mark}>
        <Ionicons name={moduleIcon(row.module?.key)} size={18} color={Colors.primary} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.title, !row.isRead && s.titleUnread]} numberOfLines={1}>
          {plain(n.title)}
        </Text>
        {n.body ? <Text style={s.body} numberOfLines={1}>{plain(n.body)}</Text> : null}
        <View style={s.meta}>
          <Text style={s.metaWho} numberOfLines={1}>{row.sender?.name || 'System'}</Text>
          <Text style={s.metaDot}>•</Text>
          <Text style={s.metaText}>{row.module?.label || 'General'}</Text>
          <Text style={s.metaDot}>•</Text>
          <Text style={s.metaText}>{timeAgo(row.createdAt)}</Text>
        </View>
      </View>

      <View style={s.end}>
        <PriorityPill level={row.priority} />
        {!selecting && <Ionicons name="chevron-forward" size={15} color={Colors.textLight} />}
      </View>
    </TouchableOpacity>
  );
}

// ── Filters ──────────────────────────────────────────────────────────────────

/** One row of choices in the filter sheet. `''` is always "everything". */
export const FilterChips = ({
  label, value, options, onPick,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onPick: (v: string) => void;
}) => (
  <View style={{ marginBottom: Spacing.md }}>
    <Text style={s.filterLabel}>{label}</Text>
    <View style={s.chipWrap}>
      {[{ value: '', label: 'All' }, ...options].map((o) => {
        const on = value === o.value;
        return (
          <TouchableOpacity key={o.value || 'all'} onPress={() => onPick(o.value)}
            style={[s.chip, on && s.chipOn]} activeOpacity={0.8}>
            <Text style={[s.chipText, on && s.chipTextOn]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
);

const s = StyleSheet.create({
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  pillText: { fontSize: 10, fontWeight: '700' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  // An unread row carries a rail on its leading edge as well as the dot — down
  // a long list the rail is what reads, not a column of small circles.
  rowUnread: { backgroundColor: Colors.surfaceAlt, borderLeftWidth: 3, borderLeftColor: Colors.primary },
  rowPicked: { borderColor: Colors.primary, backgroundColor: Colors.surfaceAlt },

  dot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: Colors.primary },

  tick: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 1.5,
    borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  tickOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },

  mark: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },

  title:       { ...Typography.body, fontWeight: '600', color: Colors.text },
  titleUnread: { fontWeight: '700' },
  body:        { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },

  meta:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  metaWho:  { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, maxWidth: 120 },
  metaText: { fontSize: 11, color: Colors.textLight },
  metaDot:  { fontSize: 11, color: Colors.border },

  end: { alignItems: 'flex-end', gap: 6 },

  filterLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.textSecondary,
    marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  chipOn:      { borderColor: Colors.primary, backgroundColor: Colors.primary },
  chipText:    { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  chipTextOn:  { color: '#fff', fontWeight: '700' },
});
