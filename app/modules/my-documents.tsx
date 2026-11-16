import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as dirApi from '@/api/employeeDirectory.api';
import { unwrap, LoaderView, Empty, Card, Badge, Input, Select, FormModal, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import { pickFile, partOf } from '@/components/admission/files';
import { DocStateBadge, openStaffFile, fmtDay } from '@/components/directory/docParts';

// ─────────────────────────────────────────────────────────────────────────────
//  My Documents — a member of staff's own paperwork (Employee Directory).
//
//  What the school office has asked for, where each document stands, and the
//  one thing to do about it: upload it — from the phone's files or as a photo
//  taken now — or, when the office turned it down, upload it again, with their
//  reason right beside the button. A new file goes back to the office as
//  "Re-submitted" and they are notified. Same page as the web's.
// ─────────────────────────────────────────────────────────────────────────────

const NEXT: Record<string, string> = {
  missing:     'Not uploaded yet.',
  pending:     'Uploaded — the school office has not reviewed it yet. You can still replace it.',
  resubmitted: 'Your new copy is with the school office for review.',
  verified:    'Checked and accepted by the school office.',
  rejected:    'The school office could not accept this. Upload a new copy.',
};

export default function MyDocumentsScreen() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fatal, setFatal] = useState<{ message: string; code?: string } | null>(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      setData(unwrap(await dirApi.getMyDocuments()));
      setFatal(null);
    } catch (e: any) {
      setFatal({ message: e?.message || 'Could not load your documents', code: e?.data?.code });
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const upload = async (doc: any, from: 'files' | 'camera') => {
    let picked;
    try { picked = await pickFile(from, ['pdf', 'jpg', 'jpeg', 'png']); }
    catch (e: any) { Alert.alert('Could not open that', e?.message || 'Please try again'); return; }
    if (!picked) return;
    if (!/\.(pdf|jpe?g|png)$/i.test(picked.name) && !/^(image\/(jpe?g|png)|application\/pdf)$/i.test(picked.type || '')) {
      Alert.alert('Not a PDF or photo', 'Choose a PDF, JPG or PNG file.');
      return;
    }
    if (picked.size && picked.size > 5 * 1024 * 1024) {
      Alert.alert('File too large', 'That file is over 5 MB — choose a smaller one or take a photo instead.');
      return;
    }
    // A photo from the camera may arrive without an extension the server reads.
    if (!/\.(pdf|jpe?g|png)$/i.test(picked.name)) picked = { ...picked, name: `${picked.name}.${/pdf/i.test(picked.type) ? 'pdf' : 'jpg'}` };
    setBusy(doc.key);
    try {
      const res = unwrap(await dirApi.uploadMyDocument(doc.key, partOf(picked)));
      setData(res);
      Alert.alert(
        doc.state === 'rejected' ? 'Sent again' : 'Uploaded',
        `${doc.label} is with the school office for review — they have been told.`,
      );
    } catch (e: any) {
      Alert.alert('Could not upload', e?.message || 'Please try again');
    } finally { setBusy(''); }
  };

  if (loading) return (<><Stack.Screen options={{ title: 'My Documents' }} /><LoaderView /></>);

  if (fatal) {
    const blocked = fatal.code && MODULE_BLOCKED_CODES.includes(fatal.code);
    return (
      <>
        <Stack.Screen options={{ title: 'My Documents' }} />
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <Empty icon={blocked ? 'lock-closed-outline' : 'cloud-offline-outline'} text={fatal.message} />
        </View>
      </>
    );
  }

  const documents = data?.documents ?? [];
  const outstanding = data?.outstanding ?? [];
  const reminder = (data?.reminders ?? [])[0];

  return (
    <>
      <Stack.Screen options={{ title: 'My Documents' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {!data?.hasProfile ? (
          <Empty icon="information-circle-outline" text="Your staff record has not been set up yet — ask the school office to complete it." />
        ) : (
          <>
            <Text style={s.lead}>The documents the school office keeps on your staff record. Upload what is missing, and anything they ask you to send again.</Text>

            {reminder ? (
              <View style={s.ask}>
                <Ionicons name="notifications-outline" size={18} color="#3730A3" />
                <View style={{ flex: 1 }}>
                  <Text style={s.askTitle}>
                    The school office has asked for your documents{reminder.sequence > 1 ? ` (reminder ${reminder.sequence})` : ''}
                  </Text>
                  <Text style={s.askSub}>
                    {fmtDay(reminder.sentAt)}{reminder.sentByName ? ` · ${reminder.sentByName}` : ''}
                    {reminder.message ? ` — “${reminder.message}”` : ''}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={[s.summary, outstanding.length ? s.summaryOwing : null]}>
              <Ionicons name={outstanding.length ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={17}
                color={outstanding.length ? '#92400E' : '#166534'} />
              <Text style={[s.summaryText, { color: outstanding.length ? '#92400E' : '#166534' }]}>
                {outstanding.length
                  ? `${outstanding.length} still needed: ${outstanding.map((o: any) => `${o.label}${o.reason === 'rejected' ? ' (upload again)' : ''}`).join(', ')}`
                  : 'Nothing is needed from you right now.'}
              </Text>
            </View>

            {documents.map((d: any) => (
              <Card key={d.key} style={[s.card, d.state === 'rejected' ? s.cardBad : null, d.state === 'missing' ? s.cardMissing : null]}>
                <View style={s.head}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.title}>{d.label}</Text>
                    <Text style={s.sub}>{d.required ? 'Required' : 'Optional'} · {d.category === 'identity' ? 'Identity' : 'Employment'}</Text>
                  </View>
                  <DocStateBadge state={d.state} />
                </View>
                <Text style={s.next}>{NEXT[d.state]}</Text>

                {(d.state === 'rejected' || d.state === 'resubmitted') && d.comment ? (
                  <View style={s.why}>
                    <Text style={s.whyTitle}>{d.state === 'rejected' ? 'Why it was not accepted' : 'Why the earlier copy was not accepted'}</Text>
                    <Text style={s.whyText}>“{d.comment}”</Text>
                    {d.reviewedAt ? <Text style={s.whyWhen}>{fmtDay(d.reviewedAt)}</Text> : null}
                  </View>
                ) : null}

                <View style={s.acts}>
                  {d.fileName && d.state !== 'rejected' ? (
                    <TouchableOpacity style={s.btn} onPress={() => openStaffFile(d.url)} accessibilityRole="button" accessibilityLabel={`View ${d.label}`}>
                      <Ionicons name="eye-outline" size={15} color={Colors.primary} />
                      <Text style={s.btnText}>View</Text>
                    </TouchableOpacity>
                  ) : null}
                  {/* Two ways in, side by side: a file already on the phone, or a
                      photo of the paper taken now. */}
                  {d.state !== 'verified' ? (
                    <>
                      <TouchableOpacity
                        style={[s.btn, (d.state === 'missing' || d.state === 'rejected') ? s.btnMain : null, busy ? { opacity: 0.6 } : null]}
                        disabled={!!busy} onPress={() => upload(d, 'files')}
                        accessibilityRole="button"
                        accessibilityLabel={`${d.state === 'missing' ? 'Upload' : d.state === 'rejected' ? 'Upload again' : 'Replace'} ${d.label}`}>
                        {busy === d.key
                          ? <ActivityIndicator size="small" color={(d.state === 'missing' || d.state === 'rejected') ? '#fff' : Colors.primary} />
                          : <Ionicons name="document-attach-outline" size={15} color={(d.state === 'missing' || d.state === 'rejected') ? '#fff' : Colors.primary} />}
                        <Text style={[s.btnText, (d.state === 'missing' || d.state === 'rejected') ? { color: '#fff' } : null]}>
                          {d.state === 'missing' ? 'Upload file' : d.state === 'rejected' ? 'Upload again' : 'Replace'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.btn, busy ? { opacity: 0.6 } : null]} disabled={!!busy} onPress={() => upload(d, 'camera')}
                        accessibilityRole="button" accessibilityLabel={`Take a photo of ${d.label}`}>
                        <Ionicons name="camera-outline" size={15} color={Colors.primary} />
                        <Text style={s.btnText}>Take photo</Text>
                      </TouchableOpacity>
                    </>
                  ) : null}
                </View>
              </Card>
            ))}

            <Text style={s.foot}>PDF, JPG or PNG, up to 5 MB. A document the office has verified can only be changed by them.</Text>

            <Corrections />
          </>
        )}
      </ScrollView>
    </>
  );
}

const ASK_STATE: Record<string, { label: string; tone: any }> = {
  open:     { label: 'Waiting for the office', tone: 'warning' },
  done:     { label: 'Dealt with',             tone: 'success' },
  declined: { label: 'Declined',               tone: 'danger' },
};

/**
 * "Something on my record is wrong." Staff cannot edit their own record — the
 * office keeps it — so this is the note that reaches the office, and where the
 * answer comes back.
 */
function Corrections() {
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState('personal');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(unwrap(await dirApi.getMyRequests())); } catch { /* the section simply stays empty */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (message.trim().length < 10) { Alert.alert('Say a little more', 'Say what needs correcting, and what it should be.'); return; }
    setBusy(true);
    try {
      await dirApi.createMyRequest({ area, message: message.trim() });
      setOpen(false);
      setMessage('');
      await load();
      Alert.alert('Sent', 'The school office has your request. You will be notified when they answer.');
    } catch (e: any) { Alert.alert('Could not send it', e?.message || 'Please try again'); }
    finally { setBusy(false); }
  };

  const requests: any[] = data?.requests || [];
  return (
    <Card style={{ marginTop: Spacing.md }}>
      <Text style={s.title}>Something on your record wrong?</Text>
      <Text style={s.next}>Your name, address, bank details and the rest are kept by the school office. Tell them what to correct.</Text>
      <View style={s.acts}>
        <TouchableOpacity style={[s.btn, s.btnMain]} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Ask for a correction">
          <Ionicons name="create-outline" size={15} color="#fff" />
          <Text style={[s.btnText, { color: '#fff' }]}>Ask for a correction</Text>
        </TouchableOpacity>
      </View>
      {requests.map((r) => (
        <View key={r._id} style={s.askRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[s.sub, { flex: 1 }]}>{r.areaLabel} · {fmtDay(r.createdAt)}</Text>
            <Badge label={ASK_STATE[r.status]?.label || r.status} tone={ASK_STATE[r.status]?.tone} />
          </View>
          <Text style={s.whyText}>“{r.message}”</Text>
          {!!r.reply && <Text style={s.next}>The office: “{r.reply}”</Text>}
        </View>
      ))}

      <FormModal visible={open} title="Ask the office to correct your record" onClose={() => setOpen(false)} onSubmit={send} submitting={busy} submitLabel="Send to the office">
        <Select label="What is it about" value={area}
          options={(data?.areas || []).map((a: any) => ({ label: a.label, value: a.value }))}
          onChange={(v) => setArea(v || 'other')} />
        <Input label="What is wrong, and what should it be" value={message} onChange={(v) => setMessage(v.slice(0, 600))} multiline text="sentence"
          placeholder="e.g. My current address has changed to 14 Lake Road, Pune 411001" />
        <Text style={s.foot}>Do not put a full Aadhaar or bank account number here — hand those to the office.</Text>
      </FormModal>
    </Card>
  );
}

const s = StyleSheet.create({
  lead: { fontSize: 13, lineHeight: 19, color: Colors.textSecondary, marginBottom: Spacing.md },
  ask: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, marginBottom: Spacing.sm,
    backgroundColor: '#EEF2FF', borderColor: '#C7D2FE', borderWidth: 1, borderRadius: Radius.lg,
  },
  askTitle: { fontSize: 13.5, fontWeight: '700', color: '#3730A3' },
  askSub: { fontSize: 12, color: '#4338CA', marginTop: 3 },
  summary: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 11, marginBottom: Spacing.md,
    backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', borderWidth: 1, borderRadius: Radius.lg,
  },
  summaryOwing: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  summaryText: { flex: 1, fontSize: 13, lineHeight: 18 },
  card: { marginBottom: Spacing.sm },
  cardBad: { borderWidth: 1, borderColor: '#FCA5A5' },
  cardMissing: { borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  next: { fontSize: 12.5, lineHeight: 18, color: Colors.textSecondary, marginTop: 8 },
  why: { marginTop: 10, padding: 10, borderRadius: Radius.md, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  whyTitle: { fontSize: 12, fontWeight: '700', color: '#991B1B' },
  whyText: { fontSize: 13, color: Colors.text, marginTop: 4 },
  whyWhen: { fontSize: 11, color: Colors.textLight, marginTop: 4 },
  acts: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
  },
  btnMain: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  btnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  foot: { fontSize: 11.5, color: Colors.textLight, marginTop: Spacing.sm },
  askRow: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
});
