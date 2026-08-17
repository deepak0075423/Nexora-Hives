import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { Badge } from '@/components/ui/kit';

/* Shared vocabulary + small pieces for the timetable generator screens. */

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat',
};

export const PERIOD_TYPES = ['Teaching', 'Break', 'Lunch', 'Activity', 'Assembly', 'Free'];
export const SUBJECT_TYPES = ['Theory', 'Practical', 'Laboratory', 'Activity', 'Sports', 'Library', 'Other'];
export const ROOM_TYPES = [
  'Classroom', 'Science Lab', 'Computer Lab', 'Physics Lab', 'Chemistry Lab',
  'Biology Lab', 'Library', 'Auditorium', 'Activity Room', 'Sports', 'Other',
];

export const STATUS_TONE: Record<string, any> = {
  draft: 'warning', generating: 'info', generated: 'info', conflict: 'danger',
  validated: 'success', published: 'success', archived: 'neutral', failed: 'danger',
};

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', generating: 'Generating', generated: 'Generated', conflict: 'Conflict',
  validated: 'Validated', published: 'Published', archived: 'Archived', failed: 'Failed',
};

export const CONFLICT_LABELS: Record<string, string> = {
  TEACHER_CLASH: 'Teacher clash',
  CLASS_CLASH: 'Class clash',
  ROOM_CLASH: 'Room clash',
  TEACHER_UNAVAILABLE: 'Teacher unavailable',
  ROOM_UNAVAILABLE: 'Room unavailable',
  SUBJECT_PERIOD_SHORTAGE: 'Period shortage',
  ROOM_CAPACITY: 'Room capacity',
  SUBJECT_TEACHER_MISMATCH: 'Teacher not assigned to subject',
  PRACTICAL_ROOM_MISSING: 'No compatible room',
  DAILY_LIMIT_EXCEEDED: 'Daily limit exceeded',
  WEEKLY_LIMIT_EXCEEDED: 'Weekly limit exceeded',
  CONSECUTIVE_PERIOD_ERROR: 'Consecutive periods',
  NON_TEACHING_SLOT: 'Non-teaching slot',
  NO_TEACHER_ASSIGNED: 'No teacher assigned',
  OTHER: 'Other',
};

export function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  return <Badge label={STATUS_LABEL[status] ?? status} tone={STATUS_TONE[status] ?? 'neutral'} />;
}

/** Legacy rows carry only isRecess — mirrors the backend's periodTypeOf(). */
export function periodTypeOf(p: any): string {
  if (!p) return 'Teaching';
  if (p.periodType && PERIOD_TYPES.includes(p.periodType)) return p.periodType;
  if (p.isRecess) {
    const n = String(p.recessName ?? '').toLowerCase();
    if (n.includes('lunch')) return 'Lunch';
    if (n.includes('assembly')) return 'Assembly';
    if (n.includes('activity')) return 'Activity';
    return 'Break';
  }
  return 'Teaching';
}
export const isTeaching = (p: any) => periodTypeOf(p) === 'Teaching';

const PALETTE = [
  { bg: '#EEF2FF', fg: '#3730A3' }, { bg: '#ECFDF5', fg: '#065F46' },
  { bg: '#FEF3C7', fg: '#92400E' }, { bg: '#FCE7F3', fg: '#9D174D' },
  { bg: '#E0F2FE', fg: '#075985' }, { bg: '#F3E8FF', fg: '#6B21A8' },
  { bg: '#FFEDD5', fg: '#9A3412' }, { bg: '#D1FAE5', fg: '#047857' },
  { bg: '#E2E8F0', fg: '#334155' }, { bg: '#FEE2E2', fg: '#991B1B' },
];
export function subjectColor(subjectId?: string) {
  if (!subjectId) return { bg: Colors.surfaceAlt, fg: Colors.textSecondary };
  let hash = 0;
  const s = String(subjectId);
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export const SEVERITY_TONE: Record<string, { color: string; bg: string; icon: string }> = {
  ERROR:   { color: Colors.danger,  bg: Colors.dangerLight,  icon: '⛔' },
  WARNING: { color: Colors.warning, bg: Colors.warningLight, icon: '⚠️' },
  INFO:    { color: Colors.info,    bg: Colors.infoLight,    icon: 'ℹ️' },
};

export function ConflictRow({ conflict }: { conflict: any }) {
  const tone = SEVERITY_TONE[conflict.severity] ?? SEVERITY_TONE.INFO;
  return (
    <View style={[tk.conflict, { backgroundColor: tone.bg, borderLeftColor: tone.color }]}>
      <Text style={[tk.conflictType, { color: tone.color }]}>
        {tone.icon} {CONFLICT_LABELS[conflict.type] ?? conflict.type}
      </Text>
      <Text style={tk.conflictText}>{conflict.description}</Text>
      {conflict.suggestion ? <Text style={tk.conflictHint}>💡 {conflict.suggestion}</Text> : null}
    </View>
  );
}

/** Compact stat pill used on the generate/preview screens. */
export function MiniStat({ label, value, tone }: { label: string; value: any; tone?: string }) {
  return (
    <View style={tk.stat}>
      <Text style={tk.statLabel}>{label}</Text>
      <Text style={[tk.statValue, tone ? { color: tone } : null]}>{String(value ?? '—')}</Text>
    </View>
  );
}

export const tk = StyleSheet.create({
  conflict: { borderLeftWidth: 3, borderRadius: Radius.md, padding: 10, marginBottom: 8 },
  conflictType: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  conflictText: { fontSize: 12.5, color: Colors.text },
  conflictHint: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  stat: {
    flexGrow: 1, flexBasis: '30%', backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: 8,
  },
  statLabel: { fontSize: 9, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: 16, fontWeight: '700', color: Colors.text, marginTop: 2 },

  periodCard: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, minHeight: 44, justifyContent: 'center' },
  periodSubject: { fontSize: 11, fontWeight: '700' },
  periodMeta: { fontSize: 9, color: Colors.textSecondary },

  sectionHeading: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginTop: 6, marginBottom: 8 },
  hint: { fontSize: 11, color: Colors.textSecondary, marginBottom: Spacing.sm },
});
