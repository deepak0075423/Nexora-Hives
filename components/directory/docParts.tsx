/**
 * Employee documents on the phone (Nov 2026) — the same words, rules and two
 * dialogs as the web (school-frontend/src/pages/directory/documentParts.jsx).
 *
 *   • Each uploaded document is decided on by itself: Verify, or Reject with a
 *     reason the employee is shown. The reason is required.
 *   • A reminder asks each person for exactly what they still owe — a required
 *     document never uploaded, or one that was rejected.
 *
 * The server decides every rule; these are how the phone shows them.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { BASE_URL } from '@/api/axios';
import { withFileToken } from '@/utils/fileAccess';
import { Badge, FormModal, Input, Toggle } from '@/components/ui/kit';

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const DOC_STATE: Record<string, { label: string; tone: Tone }> = {
  missing:     { label: 'Not uploaded',    tone: 'neutral' },
  pending:     { label: 'Awaiting review', tone: 'warning' },
  resubmitted: { label: 'Re-submitted',    tone: 'info' },
  verified:    { label: 'Verified',        tone: 'success' },
  rejected:    { label: 'Rejected',        tone: 'danger' },
};

export const REMIND_STATE: Record<string, { label: string; tone: Tone }> = {
  not_reminded:  { label: 'Not reminded yet', tone: 'neutral' },
  awaiting:      { label: 'Awaiting upload',  tone: 'warning' },
  follow_up_due: { label: 'Follow-up due',    tone: 'danger' },
  resolved:      { label: 'Resolved',         tone: 'success' },
  clear:         { label: 'Nothing owed',     tone: 'success' },
};

export const DocStateBadge = ({ state }: { state: string }) => {
  const s = DOC_STATE[state] || DOC_STATE.pending;
  return <Badge label={s.label} tone={s.tone} />;
};

export const RemindStateBadge = ({ state }: { state: string }) => {
  const s = REMIND_STATE[state] || REMIND_STATE.clear;
  return <Badge label={s.label} tone={s.tone} />;
};

const UPLOADS_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');

/** Open one staff document. The folder is private — the file token rides on the address. */
export function openStaffFile(url?: string) {
  if (!url) return;
  const full = withFileToken(/^https?:/.test(url) ? url : `${UPLOADS_ORIGIN}${url}`);
  Linking.openURL(full).catch(() => Alert.alert('Could not open', 'This document could not be opened.'));
}

export const fmtDay = (d?: string | null) => {
  if (!d) return '';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '' : x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** "Missing · PAN Card", "Re-upload · Aadhaar — Back" — what a person owes. */
export const OwedChips = ({ items }: { items: any[] }) => (
  <View style={s.chips}>
    {items.map((o) => (
      <View key={o.key} style={[s.chip, o.reason === 'rejected' ? s.chipBad : null]}>
        <Text style={[s.chipText, o.reason === 'rejected' ? { color: Colors.danger } : null]} numberOfLines={1}>
          {o.reason === 'rejected' ? 'Re-upload' : 'Missing'} · {o.label}
        </Text>
      </View>
    ))}
  </View>
);

/**
 * Reject one document: the reason, then a plain statement of what happens.
 * The reason is required — it is the only thing the employee is told.
 */
export function RejectSheet({ target, busy, onClose, onConfirm }: {
  target: any | null; busy: boolean; onClose: () => void; onConfirm: (comment: string) => void;
}) {
  const [comment, setComment] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { if (target) { setComment(''); setTried(false); } }, [target]);
  const short = comment.trim().length < 5;
  return (
    <FormModal visible={!!target} title="Reject this document?" onClose={busy ? () => {} : onClose}
      submitting={busy} submitLabel="Reject document"
      onSubmit={() => { setTried(true); if (!short) onConfirm(comment.trim()); }}>
      {target ? (
        <View>
          <Text style={s.what}><Text style={s.b}>{target.label}</Text> uploaded by <Text style={s.b}>{target.employeeName}</Text></Text>
          <Input label="Reason for rejecting *" value={comment} onChange={setComment} multiline
            placeholder="e.g. The image is blurred and the number cannot be read" />
          {tried && short ? (
            <Text style={s.err}>Give a reason — the employee is shown it when they upload the document again.</Text>
          ) : null}
          <View style={s.warn}>
            <Ionicons name="information-circle-outline" size={16} color="#9A3412" />
            <Text style={s.warnText}>
              {target.employeeName} will be notified and asked to upload a new copy. The document stays rejected
              until they do, and the new file comes back for review as Re-submitted.
            </Text>
          </View>
        </View>
      ) : null}
    </FormModal>
  );
}

/** What a reminder will ask of each person, an optional note, and email on/off. */
export function ReminderSheet({ employees, busy, onClose, onSend }: {
  employees: any[] | null; busy: boolean; onClose: () => void; onSend: (o: { message: string; email: boolean }) => void;
}) {
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(false);
  useEffect(() => { if (employees) { setMessage(''); setEmail(false); } }, [employees]);
  const owing = (employees || []).filter((e) => e.outstanding?.length);
  return (
    <FormModal visible={!!employees} onClose={busy ? () => {} : onClose} submitting={busy}
      title={owing.length === 1 ? `Remind ${owing[0].name}` : `Remind ${owing.length} employees`}
      submitLabel={owing.length === 1 ? 'Send reminder' : `Send ${owing.length} reminders`}
      onSubmit={() => onSend({ message: message.trim(), email })}>
      <Text style={s.lead}>Each person is asked for exactly what they still owe.</Text>
      {owing.map((e) => (
        <View key={e._id} style={s.person}>
          <Text style={s.personName}>{e.name}</Text>
          <OwedChips items={e.outstanding} />
        </View>
      ))}
      <Input label="Add a note (optional)" value={message} onChange={setMessage} multiline
        placeholder="e.g. Please upload these by Friday" />
      <Toggle label="Also send it by email" sub="An in-app and phone notification is always sent." value={email} onChange={setEmail} />
    </FormModal>
  );
}

/** A small filter chip row (counts beside each). */
export function FilterChips({ items, value, onChange }: {
  items: { value: string; label: string; count?: number; alert?: boolean }[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <View style={s.filters}>
      {items.map((f) => {
        const on = f.value === value;
        return (
          <TouchableOpacity key={f.value} style={[s.filter, on && s.filterOn]} onPress={() => onChange(f.value)}
            accessibilityRole="button" accessibilityLabel={f.label} accessibilityState={{ selected: on }}>
            <Text style={[s.filterText, on && s.filterTextOn]}>{f.label}</Text>
            {f.count != null ? (
              <View style={[s.count, on && s.countOn, f.alert && !on && f.count ? s.countAlert : null]}>
                <Text style={[s.countText, on && { color: '#fff' }, f.alert && !on && f.count ? { color: Colors.danger } : null]}>{f.count}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  b: { fontWeight: '700', color: Colors.text },
  what: { fontSize: 13.5, color: Colors.text, marginBottom: Spacing.sm },
  err: { fontSize: 12, color: Colors.danger, marginTop: -4, marginBottom: 8 },
  warn: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 6, padding: 10,
    backgroundColor: '#FFF7ED', borderColor: '#FED7AA', borderWidth: 1, borderRadius: Radius.md,
  },
  warnText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: '#9A3412' },
  lead: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.sm },
  person: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  personName: { fontSize: 13.5, fontWeight: '700', color: Colors.text, marginBottom: 5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border, maxWidth: '100%' },
  chipBad: { backgroundColor: Colors.dangerLight, borderColor: Colors.dangerLight },
  chipText: { fontSize: 11.5, fontWeight: '600', color: Colors.textSecondary },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.sm },
  filter: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  filterOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  filterTextOn: { color: '#fff' },
  count: { minWidth: 20, paddingHorizontal: 5, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, alignItems: 'center' },
  countOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  countAlert: { backgroundColor: Colors.dangerLight },
  countText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
});
