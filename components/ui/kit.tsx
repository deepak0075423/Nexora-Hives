import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, Modal, ScrollView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

// ─── Data helpers ─────────────────────────────────────────────────────────────

/** Axios interceptor returns the body; most controllers wrap payload as { success, data } */
export const unwrap = (res: any) => (res as any)?.data ?? res;

export const fmtDate = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '--';

export const fmtDateTime = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '--';

export const fmtMoney = (n?: number | null) =>
  n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '--';

export const confirmAsync = (title: string, message: string, destructiveLabel = 'Confirm') =>
  new Promise<boolean>((resolve) => {
    // RN Alert is a no-op on react-native-web — use the browser dialog there
    if (Platform.OS === 'web') {
      resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: destructiveLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });

// ─── Status badge ─────────────────────────────────────────────────────────────

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<Tone, { bg: string; color: string }> = {
  success: { bg: Colors.successLight, color: Colors.success },
  warning: { bg: Colors.warningLight, color: Colors.warning },
  danger:  { bg: Colors.dangerLight,  color: Colors.danger },
  info:    { bg: Colors.infoLight,    color: Colors.info },
  neutral: { bg: Colors.surfaceAlt,   color: Colors.textSecondary },
};

const STATUS_TONE: Record<string, Tone> = {
  active: 'success', approved: 'success', paid: 'success', published: 'success',
  completed: 'success', success: 'success', collected: 'success', returned: 'success',
  present: 'success', available: 'success', ready: 'info', verified: 'success',
  pending: 'warning', draft: 'warning', partial: 'warning', reviewed: 'info',
  processing: 'warning', due: 'warning', half_day: 'warning', late: 'warning',
  inactive: 'neutral', archived: 'neutral', cancelled: 'neutral', waived: 'neutral',
  rejected: 'danger', overdue: 'danger', failed: 'danger', absent: 'danger',
  expired: 'danger', lost: 'danger', unpaid: 'danger',
};

export function toneFor(status?: string): Tone {
  return STATUS_TONE[String(status ?? '').toLowerCase().replace(/[\s-]/g, '_')] ?? 'neutral';
}

export function Badge({ label, tone }: { label?: string; tone?: Tone }) {
  if (!label) return null;
  const t = TONES[tone ?? toneFor(label)];
  return (
    <View style={[k.badge, { backgroundColor: t.bg }]}>
      <Text style={[k.badgeText, { color: t.color }]}>{label}</Text>
    </View>
  );
}

// ─── Layout primitives ────────────────────────────────────────────────────────

export function LoaderView() {
  return (
    <View style={k.center}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}

export function Empty({ icon = 'file-tray-outline', text = 'Nothing here yet' }: { icon?: string; text?: string }) {
  return (
    <View style={k.empty}>
      <Ionicons name={icon as any} size={44} color={Colors.textLight} />
      <Text style={k.emptyText}>{text}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[k.card, style]}>{children}</View>;
}

export function KV({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <View style={k.kvRow}>
      <Text style={k.kvLabel}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number'
        ? <Text style={k.kvValue}>{value}</Text>
        : value ?? <Text style={k.kvValue}>--</Text>}
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={k.sectionTitle}>{children}</Text>;
}

/** Generic tappable list row: title, subtitle, right accessory */
export function RowItem({ title, sub, right, onPress, icon, iconColor, iconBg }: {
  title: string; sub?: string; right?: React.ReactNode; onPress?: () => void;
  icon?: string; iconColor?: string; iconBg?: string;
}) {
  const inner = (
    <>
      {icon && (
        <View style={[k.rowIcon, { backgroundColor: iconBg ?? Colors.surfaceAlt }]}>
          <Ionicons name={icon as any} size={18} color={iconColor ?? Colors.primary} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={k.rowTitle} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={k.rowSub} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {right}
      {onPress && <Ionicons name="chevron-forward" size={16} color={Colors.textLight} style={{ marginLeft: 6 }} />}
    </>
  );
  if (!onPress) return <View style={k.row}>{inner}</View>;
  return (
    <TouchableOpacity style={k.row} onPress={onPress} activeOpacity={0.7}>
      {inner}
    </TouchableOpacity>
  );
}

export function StatTile({ label, value, icon, tone = 'info' }: {
  label: string; value: string | number; icon: string; tone?: Tone;
}) {
  const t = TONES[tone];
  return (
    <View style={k.statTile}>
      <View style={[k.statIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon as any} size={14} color={t.color} />
      </View>
      <Text style={k.statLabel}>{label}</Text>
      <Text style={k.statValue}>{String(value)}</Text>
    </View>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <View style={k.statRow}>{children}</View>;
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

export function SearchBar({ value, onChange, placeholder = 'Search…' }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <View style={k.search}>
      <Ionicons name="search" size={16} color={Colors.textLight} />
      <TextInput
        style={k.searchInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textLight}
        autoCapitalize="none"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChange('')}>
          <Ionicons name="close-circle" size={16} color={Colors.textLight} />
        </TouchableOpacity>
      )}
    </View>
  );
}

export function Input({ label, value, onChange, placeholder, keyboardType, multiline, secure, editable = true }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad'; multiline?: boolean;
  secure?: boolean; editable?: boolean;
}) {
  return (
    <View style={k.field}>
      <Text style={k.fieldLabel}>{label}</Text>
      <TextInput
        style={[k.input, multiline && { height: 80, textAlignVertical: 'top' }, !editable && { opacity: 0.5 }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textLight}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        secureTextEntry={secure}
        editable={editable}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
      />
    </View>
  );
}

export interface SelectOption { label: string; value: string }

export function Select({ label, value, options, onChange, placeholder = 'Select…' }: {
  label: string; value: string; options: SelectOption[]; onChange: (v: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  // Centred sheet, so overflow spills off both ends and the top options become
  // unreachable. Long lists (the 36 states / UTs) hit this on shorter phones.
  const maxListH = Math.max(180, winH - insets.top - insets.bottom - Spacing.lg * 2 - 90);
  return (
    <View style={k.field}>
      <Text style={k.fieldLabel}>{label}</Text>
      <TouchableOpacity style={k.select} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={[k.selectText, !current && { color: Colors.textLight }]} numberOfLines={1}>
          {current?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={Colors.textLight} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={k.sheetBackdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={k.sheet}>
            <Text style={k.sheetTitle}>{label}</Text>
            <ScrollView style={{ maxHeight: maxListH }}>
              {options.length === 0 && <Text style={k.sheetEmpty}>No options available</Text>}
              {options.map(o => (
                <TouchableOpacity
                  key={o.value}
                  style={[k.sheetOption, o.value === value && k.sheetOptionActive]}
                  onPress={() => { onChange(o.value); setOpen(false); }}
                >
                  <Text style={[k.sheetOptionText, o.value === value && { color: Colors.accent, fontWeight: '600' }]}>
                    {o.label}
                  </Text>
                  {o.value === value && <Ionicons name="checkmark" size={16} color={Colors.accent} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export function Toggle({ label, value, onChange, sub }: {
  label: string; value: boolean; onChange: (v: boolean) => void; sub?: string;
}) {
  return (
    <TouchableOpacity style={k.toggleRow} onPress={() => onChange(!value)} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={k.rowTitle}>{label}</Text>
        {sub ? <Text style={k.rowSub}>{sub}</Text> : null}
      </View>
      <View style={[k.toggleTrack, value && { backgroundColor: Colors.success }]}>
        <View style={[k.toggleThumb, value && { alignSelf: 'flex-end' }]} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Segmented tabs ───────────────────────────────────────────────────────────

export function SegTabs({ tabs, active, onChange }: {
  tabs: { key: string; label: string }[]; active: string; onChange: (key: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: Spacing.md }}>
      <View style={k.segWrap}>
        {tabs.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[k.segTab, active === t.key && k.segTabActive]}
            onPress={() => onChange(t.key)}
          >
            <Text style={[k.segText, active === t.key && k.segTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── FAB & form modal ─────────────────────────────────────────────────────────

export function FAB({ icon = 'add', onPress }: { icon?: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={k.fab} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name={icon as any} size={26} color="#fff" />
    </TouchableOpacity>
  );
}

export function FormModal({ visible, title, onClose, onSubmit, submitting, submitLabel = 'Save', children }: {
  visible: boolean; title: string; onClose: () => void; onSubmit?: () => void;
  submitting?: boolean; submitLabel?: string; children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  // The sheet is anchored to the bottom, so anything taller than the screen
  // overflows off the TOP where it can't be reached. Cap the card against the
  // real window height (minus the notch) instead of a fixed 480, and let the
  // scroll area take whatever is left after the header and submit button.
  const maxCardH = winH - insets.top - Spacing.md;
  const maxScrollH = Math.max(160, maxCardH - 140);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={k.modalRoot}
      >
        <View style={[k.modalCard, { maxHeight: maxCardH, paddingBottom: Spacing.xl + insets.bottom }]}>
          <View style={k.modalHeader}>
            <Text style={k.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={k.modalClose}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: maxScrollH }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {onSubmit && (
            <TouchableOpacity
              style={[k.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={onSubmit}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={k.submitText}>{submitLabel}</Text>}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Small action button ──────────────────────────────────────────────────────

export function ActionBtn({ label, tone = 'neutral', onPress, small }: {
  label: string; tone?: Tone; onPress: () => void; small?: boolean;
}) {
  const t = TONES[tone];
  return (
    <TouchableOpacity
      style={[k.actionBtn, { backgroundColor: t.bg }, small && { paddingVertical: 5, paddingHorizontal: 10 }]}
      onPress={onPress}
    >
      <Text style={[k.actionBtnText, { color: t.color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const k = StyleSheet.create({
  center: { alignItems: 'center', paddingTop: 80 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { ...Typography.body, color: Colors.textSecondary },

  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },

  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: 10, borderWidth: 1, borderColor: Colors.border,
  },
  kvRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, gap: 12,
  },
  kvLabel: { fontSize: 12, color: Colors.textSecondary },
  kvValue: { fontSize: 13, fontWeight: '600', color: Colors.text, flexShrink: 1, textAlign: 'right' },
  sectionTitle: { ...Typography.h4, color: Colors.text, marginBottom: 8, marginTop: 4 },

  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: Spacing.sm + 4, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border, gap: 10,
  },
  rowIcon: {
    width: 38, height: 38, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { ...Typography.label, color: Colors.text },
  rowSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  statRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.md },
  statTile: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: 12, borderWidth: 1, borderColor: Colors.border,
  },
  statIcon: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statLabel: { fontSize: 9, fontWeight: '600', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  statValue: { fontSize: 17, fontWeight: '700', color: Colors.text },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.md, height: 42,
  },
  searchInput: { flex: 1, fontSize: 13, color: Colors.text, paddingVertical: 0 },

  field: { marginBottom: Spacing.md },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: Colors.text,
  },
  select: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 12,
  },
  selectText: { fontSize: 14, color: Colors.text, flex: 1 },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: Spacing.lg },
  sheet: { backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.md },
  sheetTitle: { ...Typography.h4, color: Colors.text, marginBottom: 10 },
  sheetEmpty: { ...Typography.bodySmall, color: Colors.textSecondary, paddingVertical: 16, textAlign: 'center' },
  sheetOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  sheetOptionActive: { backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md },
  sheetOptionText: { fontSize: 14, color: Colors.text },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: Spacing.md, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border, gap: 12,
  },
  toggleTrack: {
    width: 44, height: 26, borderRadius: 13, backgroundColor: Colors.border,
    padding: 3, justifyContent: 'center',
  },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },

  segWrap: {
    flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.full,
    padding: 4, borderWidth: 1, borderColor: Colors.border,
  },
  segTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.full },
  segTabActive: { backgroundColor: Colors.primary },
  segText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  segTextActive: { color: '#fff' },

  fab: {
    position: 'absolute', right: 20, bottom: 30, width: 54, height: 54,
    borderRadius: 27, backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 6,
  },

  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.md, paddingBottom: Spacing.xl,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  modalTitle: { ...Typography.h3, color: Colors.text },
  modalClose: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtn: {
    backgroundColor: Colors.accent, borderRadius: Radius.md, paddingVertical: 14,
    alignItems: 'center', marginTop: Spacing.sm,
  },
  submitText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  actionBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.md, alignItems: 'center',
  },
  actionBtnText: { fontSize: 12, fontWeight: '700' },
});
