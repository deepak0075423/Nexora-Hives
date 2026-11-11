import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet, Alert, Linking } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as dirApi from '@/api/employeeDirectory.api';
import { BASE_URL } from '@/api/axios';
import {
  unwrap, LoaderView, Empty, Badge, Card, SectionTitle, StatTile, StatRow, ActionBtn, SegTabs,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import { withFileToken } from '@/utils/fileAccess';
import {
  DocStateBadge, FilterChips, OwedChips, RejectSheet, ReminderSheet, RemindStateBadge, fmtDay, openStaffFile,
} from '@/components/directory/docParts';

// ─────────────────────────────────────────────────────────────────────────────
//  Profile verification.
//
//  Signing a section off means someone looked at the evidence, so Verify stays
//  disabled until they have. What counts as evidence depends on the section:
//
//    • Backed by uploads (Government ID, Employment Documents) — every document
//      on file must be opened. One of these with NOTHING uploaded cannot be
//      verified at all; the server refuses it too.
//    • Field-only (Personal, Contact, Education, Bank) — the employee's record
//      must be opened, which is where those values live.
//
//  "Reviewed" is per session on purpose: it records that THIS reviewer opened
//  the evidence before signing, not that anyone ever did.
//
//  Nov 2026: each uploaded document is also decided on by itself — Verify, or
//  Reject with a reason the employee is shown — and a document-backed section
//  is signed off once all of its documents are accepted (the server holds the
//  same rule). Two more tabs, as on the web: every document waiting for a
//  decision, and the reminders that chase what employees still owe.
// ─────────────────────────────────────────────────────────────────────────────

const UPLOADS_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');
const fileUrl = (p?: string) => withFileToken(!p ? '' : /^https?:/.test(p) ? p : `${UPLOADS_ORIGIN}${p}`);

const TONE: Record<string, any> = { verified: 'success', pending: 'warning', rejected: 'danger' };

const DOC_FILTERS = [
  { value: 'todo',        label: 'Awaiting review' },
  { value: 'resubmitted', label: 'Re-submitted' },
  { value: 'rejected',    label: 'Rejected' },
  { value: 'verified',    label: 'Verified' },
  { value: 'all',         label: 'All' },
];

const REMIND_FILTERS = [
  { value: 'owing',         label: 'Owing' },
  { value: 'not_reminded',  label: 'Not reminded' },
  { value: 'follow_up_due', label: 'Follow-up due' },
  { value: 'awaiting',      label: 'Awaiting upload' },
  { value: 'resolved',      label: 'Resolved' },
];

export default function EmployeeVerificationScreen() {
  // A "document re-submitted" notification lands on ?tab=documents&employee=<id>.
  const params = useLocalSearchParams<{ tab?: string; employee?: string }>();
  const [tab, setTab] = useState<string>(['documents', 'reminders'].includes(String(params.tab)) ? String(params.tab) : 'sections');
  const [focus, setFocus] = useState<string>(params.tab === 'documents' && params.employee ? String(params.employee) : '');
  const [docFilter, setDocFilter] = useState(params.tab === 'documents' && params.employee ? 'all' : 'todo');
  const [remindFilter, setRemindFilter] = useState('owing');
  const [desk, setDesk] = useState<any>(null);
  const [docBusy, setDocBusy] = useState('');
  const [rejecting, setRejecting] = useState<any>(null);
  const [reminding, setReminding] = useState<any[] | null>(null);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fatal, setFatal] = useState<{ message: string; code?: string } | null>(null);
  const [open, setOpen] = useState('');
  const [busy, setBusy] = useState('');
  const [seen, setSeen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [q, d] = await Promise.all([dirApi.getVerificationQueue(), dirApi.getDocumentDesk()]);
      setData(unwrap(q));
      setDesk(unwrap(d));
      setFatal(null);
    } catch (e: any) {
      setFatal({ message: e?.message || 'Could not load verification', code: e?.data?.code });
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const mark = (k: string) => setSeen(s => new Set(s).add(k));
  const keysFor = (id: string, sec: any) => (
    sec.documents.length
      ? sec.documents.map((d: any) => `${id}:${sec.section}:${d.key}`)
      : [`${id}:${sec.section}:record`]
  );
  const reviewed = (id: string, sec: any) => keysFor(id, sec).every((k: string) => seen.has(k));

  const verify = async (id: string, section: string, status: string) => {
    setBusy(`${id}:${section}`);
    try {
      await dirApi.setVerification(id, { section, status });
      await load();
    } catch (e: any) { Alert.alert('Could not update', e?.message || 'Please try again'); }
    finally { setBusy(''); }
  };

  // One document's decision; both lists are read again afterwards.
  const decide = async (doc: any, status: 'verified' | 'rejected', comment = '') => {
    setDocBusy(`${doc.employee}:${doc.key}:${status}`);
    try {
      await dirApi.reviewEmployeeDocument(doc.employee, doc.key, { status, comment, fileName: doc.fileName });
      setRejecting(null);
      await load();
      if (status === 'rejected') Alert.alert('Rejected', `${doc.employeeName || 'The employee'} has been asked to upload ${doc.label} again.`);
    } catch (e: any) { Alert.alert('Could not save that', e?.message || 'Please try again'); }
    finally { setDocBusy(''); }
  };

  const remind = async ({ message, email }: { message: string; email: boolean }) => {
    if (!reminding) return;
    setSending(true);
    try {
      const out = unwrap(await dirApi.sendDocumentReminders({ employeeIds: reminding.map((x) => x._id), message, email }));
      setReminding(null);
      await load();
      const n = out?.sent?.length || 0;
      Alert.alert('Reminders', n === 1 ? `Reminder sent to ${out.sent[0].name}.` : `${n} reminders sent.`);
    } catch (e: any) { Alert.alert('Could not send', e?.message || 'Please try again'); }
    finally { setSending(false); }
  };

  const deskEmployees: any[] = useMemo(() => desk?.employees ?? [], [desk]);
  const docRows = useMemo(() => deskEmployees.flatMap((e: any) => (e.documents || [])
    .filter((d: any) => d.fileName || d.state === 'rejected')
    .map((d: any) => ({ ...d, employee: e._id, employeeName: e.name, sub: [e.employeeId, e.designation].filter(Boolean).join(' · ') }))), [deskEmployees]);
  const docCounts: Record<string, number> = {
    todo: docRows.filter((r: any) => r.state === 'pending' || r.state === 'resubmitted').length,
    resubmitted: docRows.filter((r: any) => r.state === 'resubmitted').length,
    rejected: docRows.filter((r: any) => r.state === 'rejected').length,
    verified: docRows.filter((r: any) => r.state === 'verified').length,
    all: docRows.length,
  };
  const remindCounts: Record<string, number> = {
    owing: deskEmployees.filter((e: any) => e.outstanding?.length).length,
    not_reminded: deskEmployees.filter((e: any) => e.reminders?.state === 'not_reminded').length,
    follow_up_due: deskEmployees.filter((e: any) => e.reminders?.state === 'follow_up_due').length,
    awaiting: deskEmployees.filter((e: any) => e.reminders?.state === 'awaiting').length,
    resolved: deskEmployees.filter((e: any) => e.reminders?.state === 'resolved').length,
  };

  const openDoc = (url: string, key: string) => {
    mark(key);
    Linking.openURL(fileUrl(url)).catch(() => Alert.alert('Could not open', 'This document could not be opened.'));
  };

  if (loading) return (<><Stack.Screen options={{ title: 'Verification' }} /><LoaderView /></>);

  if (fatal) {
    const blocked = fatal.code && MODULE_BLOCKED_CODES.includes(fatal.code);
    return (
      <>
        <Stack.Screen options={{ title: 'Verification' }} />
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <Empty icon={blocked ? 'lock-closed-outline' : 'cloud-offline-outline'} text={fatal.message} />
        </View>
      </>
    );
  }

  const employees = data?.employees ?? [];

  return (
    <>
      <Stack.Screen options={{ title: 'Verification' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <SegTabs active={tab} onChange={setTab} tabs={[
          { key: 'sections',  label: 'Sections' },
          { key: 'documents', label: `Documents${docCounts.todo ? ` (${docCounts.todo})` : ''}` },
          { key: 'reminders', label: `Reminders${remindCounts.follow_up_due ? ` (${remindCounts.follow_up_due} due)` : ''}` },
        ]} />

        {tab === 'sections' && (<>
        <StatRow>
          <StatTile label="Fully verified" value={data?.fullyVerified ?? 0} icon="shield-checkmark" tone="success" />
          <StatTile label="Employees" value={employees.length} icon="people" tone="info" />
          <StatTile
            label="Outstanding"
            value={Math.max(0, employees.length - (data?.fullyVerified ?? 0))}
            icon="hourglass" tone="warning"
          />
        </StatRow>

        {employees.length === 0 ? (
          <Empty icon="shield-outline" text="No employees to verify yet" />
        ) : employees.map((e: any) => (
          <Card key={e._id} style={{ marginBottom: Spacing.sm }}>
            <TouchableOpacity
              style={s.head}
              activeOpacity={0.75}
              onPress={() => setOpen(open === e._id ? '' : e._id)}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.name} numberOfLines={1}>{e.name}</Text>
                <Text style={s.sub} numberOfLines={1}>
                  {[e.employeeId, e.designation].filter(Boolean).join(' · ') || 'No designation'}
                </Text>
              </View>
              <Badge label={`${e.verifiedCount}/${e.totalSections}`} tone={e.verifiedCount === e.totalSections ? 'success' : 'warning'} />
              <Ionicons
                name={open === e._id ? 'chevron-up' : 'chevron-down'}
                size={16} color={Colors.textLight} style={{ marginLeft: 8 }}
              />
            </TouchableOpacity>

            {open === e._id && (
              <View style={{ marginTop: Spacing.sm }}>
                <Text style={s.hint}>Open the evidence for a section to unlock its Verify button.</Text>
                {e.sections.map((sec: any) => {
                  const done = reviewed(e._id, sec);
                  const blocked = sec.missingDocuments;
                  // Signed off once each document in it has been accepted.
                  const undecided = (sec.documents || []).filter((d: any) => d.state && d.state !== 'verified');
                  return (
                    <View key={sec.section} style={s.section}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={s.secName}>{sec.label}</Text>
                        <Badge label={sec.status} tone={TONE[sec.status]} />
                      </View>

                      <View style={s.evidence}>
                        {blocked && <Badge label="No document on file" tone="warning" />}

                        {sec.documents.map((d: any) => {
                          const k = `${e._id}:${sec.section}:${d.key}`;
                          const row = { ...d, employee: e._id, employeeName: e.name };
                          return (
                            <View key={d.key} style={s.docLine}>
                              <TouchableOpacity
                                style={[s.doc, seen.has(k) && s.docSeen]}
                                onPress={() => openDoc(d.url, k)}
                                accessibilityRole="button" accessibilityLabel={`Open ${d.label}`}
                              >
                                <Ionicons
                                  name={seen.has(k) ? 'checkmark-circle' : 'eye-outline'}
                                  size={13} color={seen.has(k) ? Colors.success : Colors.primary}
                                />
                                <Text style={[s.docText, seen.has(k) && { color: Colors.textSecondary }]}>{d.label}</Text>
                              </TouchableOpacity>
                              <DocStateBadge state={d.state || 'pending'} />
                              {(d.state === 'pending' || d.state === 'resubmitted') ? (
                                <View style={s.decide}>
                                  <ActionBtn label={docBusy === `${e._id}:${d.key}:verified` ? 'Saving…' : 'Verify'} tone="success" small
                                    disabled={!!docBusy} onPress={() => decide(row, 'verified')} />
                                  <ActionBtn label="Reject" tone="danger" small disabled={!!docBusy} onPress={() => setRejecting(row)} />
                                </View>
                              ) : null}
                              {(d.state === 'rejected' || d.state === 'resubmitted') && d.comment ? (
                                <Text style={s.why}>{d.state === 'resubmitted' ? 'Rejected before: ' : 'Reason: '}“{d.comment}”</Text>
                              ) : null}
                            </View>
                          );
                        })}

                        {!blocked && sec.documents.length === 0 && (
                          <TouchableOpacity
                            style={[s.doc, seen.has(`${e._id}:${sec.section}:record`) && s.docSeen]}
                            onPress={() => mark(`${e._id}:${sec.section}:record`)}
                          >
                            <Ionicons
                              name={seen.has(`${e._id}:${sec.section}:record`) ? 'checkmark-circle' : 'eye-outline'}
                              size={13} color={seen.has(`${e._id}:${sec.section}:record`) ? Colors.success : Colors.primary}
                            />
                            <Text style={[s.docText, seen.has(`${e._id}:${sec.section}:record`) && { color: Colors.textSecondary }]}>
                              Mark details reviewed
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <View style={{ flex: 1 }}>
                          {blocked ? (
                            <Text style={s.blockedNote}>Nothing uploaded for this section yet.</Text>
                          ) : !done ? (
                            <Text style={s.blockedNote}>Open the evidence above to enable Verify.</Text>
                          ) : sec.status !== 'verified' && undecided.length ? (
                            <Text style={s.blockedNote}>Verify or reject each document above first.</Text>
                          ) : sec.status !== 'verified' ? (
                            <ActionBtn
                              label={busy === `${e._id}:${sec.section}` ? 'Saving…' : 'Verify'}
                              tone="success" small
                              onPress={() => verify(e._id, sec.section, 'verified')}
                            />
                          ) : (
                            <ActionBtn label="Reset to pending" tone="neutral" small
                              onPress={() => verify(e._id, sec.section, 'pending')} />
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </Card>
        ))}

        <SectionTitle>By section</SectionTitle>
        <Card>
          {(data?.sectionTotals ?? []).map((t: any) => (
            <View key={t.section} style={s.totalRow}>
              <Text style={s.totalLabel}>{t.label}</Text>
              <Text style={s.totalValue}>{t.verified} / {t.verified + t.pending + t.rejected}</Text>
            </View>
          ))}
        </Card>
        </>)}

        {/* ── Every uploaded document, one card each ─────────────────────── */}
        {tab === 'documents' && (() => {
          const shown = docRows
            .filter((r: any) => {
              if (focus && r.employee !== focus) return false;
              if (docFilter === 'todo') return r.state === 'pending' || r.state === 'resubmitted';
              if (docFilter === 'all') return true;
              return r.state === docFilter;
            })
            .sort((a: any, b: any) => (b.state === 'resubmitted' ? 1 : 0) - (a.state === 'resubmitted' ? 1 : 0)
              || a.employeeName.localeCompare(b.employeeName) || a.label.localeCompare(b.label));
          return (
            <>
              {focus ? (
                <View style={s.focus}>
                  <Text style={s.focusText}>Showing {deskEmployees.find((x: any) => x._id === focus)?.name || 'one employee'}’s documents</Text>
                  <TouchableOpacity onPress={() => setFocus('')} accessibilityRole="button" accessibilityLabel="Show everyone">
                    <Text style={s.link}>Show everyone</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <FilterChips value={docFilter} onChange={setDocFilter}
                items={DOC_FILTERS.map((f) => ({ ...f, count: docCounts[f.value] }))} />
              {!shown.length ? (
                <Empty icon="checkmark-done-outline" text={docFilter === 'todo' ? 'Nothing is waiting for review.' : 'No documents here.'} />
              ) : shown.map((r: any) => (
                <Card key={`${r.employee}:${r.key}`} style={{ marginBottom: Spacing.sm }}>
                  <View style={s.head}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.name} numberOfLines={1}>{r.label}</Text>
                      <Text style={s.sub} numberOfLines={1}>{r.employeeName}{r.sub ? ` · ${r.sub}` : ''}</Text>
                    </View>
                    <DocStateBadge state={r.state} />
                  </View>
                  {r.state === 'resubmitted' && <Text style={s.note}>New file. Rejected before: “{r.comment}”</Text>}
                  {r.state === 'rejected' && <Text style={s.note}>“{r.comment}” · {fmtDay(r.reviewedAt)} — waiting for a new upload</Text>}
                  {r.state === 'verified' && <Text style={s.note}>{r.reviewedAt ? `Verified ${fmtDay(r.reviewedAt)}` : 'Verified with its section'}</Text>}
                  <View style={s.cardActs}>
                    {r.fileName ? <ActionBtn label="View" tone="info" small onPress={() => openStaffFile(r.url)} /> : null}
                    {(r.state === 'pending' || r.state === 'resubmitted') ? (
                      <>
                        <ActionBtn label={docBusy === `${r.employee}:${r.key}:verified` ? 'Saving…' : 'Verify'} tone="success" small
                          disabled={!!docBusy} onPress={() => decide(r, 'verified')} />
                        <ActionBtn label="Reject" tone="danger" small disabled={!!docBusy} onPress={() => setRejecting(r)} />
                      </>
                    ) : null}
                  </View>
                </Card>
              ))}
            </>
          );
        })()}

        {/* ── Who owes what, and the reminders sent ───────────────────────── */}
        {tab === 'reminders' && (() => {
          const shown = deskEmployees.filter((e: any) => (remindFilter === 'owing' ? e.outstanding?.length : e.reminders?.state === remindFilter));
          const due = deskEmployees.filter((e: any) => ['not_reminded', 'follow_up_due'].includes(e.reminders?.state));
          return (
            <>
              <FilterChips value={remindFilter} onChange={setRemindFilter}
                items={REMIND_FILTERS.map((f) => ({ ...f, count: remindCounts[f.value], alert: f.value === 'follow_up_due' }))} />
              <View style={{ marginBottom: Spacing.sm }}>
                <ActionBtn label={`Remind everyone due (${due.length})`} tone="primary" disabled={!due.length} onPress={() => setReminding(due)} />
              </View>
              <Text style={s.hint}>
                A reminder unanswered for {desk?.followUpAfterDays || 3} days is due a follow-up. Reminders close by themselves once everything they asked for is uploaded.
              </Text>
              {!shown.length ? (
                <Empty icon="checkmark-done-outline" text={remindFilter === 'owing' ? 'Nobody owes any documents.' : 'Nobody here.'} />
              ) : shown.map((e: any) => {
                const last = e.reminders?.last;
                const st = e.reminders?.state;
                return (
                  <Card key={e._id} style={{ marginBottom: Spacing.sm }}>
                    <View style={s.head}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.name} numberOfLines={1}>{e.name}</Text>
                        <Text style={s.sub} numberOfLines={1}>{[e.employeeId, e.designation].filter(Boolean).join(' · ') || 'Staff'}</Text>
                      </View>
                      <RemindStateBadge state={st} />
                    </View>
                    <View style={{ marginTop: 8 }}>
                      {e.outstanding?.length ? <OwedChips items={e.outstanding} /> : <Text style={s.note}>Nothing owed — all on file.</Text>}
                    </View>
                    <Text style={s.note}>
                      {last ? `Last reminder ${fmtDay(last.sentAt)} · ${last.sequence > 1 ? `follow-up ${last.sequence - 1}` : 'first reminder'}${last.sentByName ? ` · ${last.sentByName}` : ''}` : 'Never reminded'}
                    </Text>
                    <View style={s.cardActs}>
                      {e.outstanding?.length ? (
                        <ActionBtn label={st === 'awaiting' || st === 'follow_up_due' ? 'Follow up' : 'Remind'}
                          tone={st === 'follow_up_due' ? 'primary' : 'info'} small onPress={() => setReminding([e])} />
                      ) : null}
                      {e.reminders?.total ? (
                        <ActionBtn label={history === e._id ? 'Hide history' : `History (${e.reminders.total})`} tone="neutral" small
                          onPress={() => setHistory(history === e._id ? '' : e._id)} />
                      ) : null}
                    </View>
                    {history === e._id && (e.reminders?.history || []).map((h: any) => (
                      <View key={h._id} style={s.histRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.histTitle}>
                            {fmtDay(h.sentAt)} · {h.sequence > 1 ? `Follow-up ${h.sequence - 1}` : 'Reminder'}{h.sentByName ? ` by ${h.sentByName}` : ''}{h.email ? ' · emailed' : ''}
                          </Text>
                          <Text style={s.histSub}>
                            {(h.documents || []).map((d: any) => `${d.label}${d.stillOwed ? '' : ' ✓'}`).join(', ')}
                            {h.message ? ` — “${h.message}”` : ''}
                          </Text>
                        </View>
                        <Badge label={h.open ? 'Open' : 'Answered'} tone={h.open ? 'warning' : 'success'} />
                      </View>
                    ))}
                  </Card>
                );
              })}
            </>
          );
        })()}
      </ScrollView>

      <RejectSheet target={rejecting} busy={!!docBusy} onClose={() => setRejecting(null)}
        onConfirm={(comment) => decide(rejecting, 'rejected', comment)} />
      <ReminderSheet employees={reminding} busy={sending} onClose={() => setReminding(null)} onSend={remind} />
    </>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 14.5, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  hint: { fontSize: 11.5, color: Colors.textLight, marginBottom: 8 },
  section: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.divider },
  secName: { fontSize: 13, fontWeight: '600', color: Colors.text, flex: 1 },
  evidence: { gap: 8, marginTop: 8 },
  docLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  decide: { flexDirection: 'row', gap: 6, marginLeft: 'auto' },
  why: { flexBasis: '100%', fontSize: 11.5, color: Colors.textSecondary },
  note: { fontSize: 12, color: Colors.textSecondary, marginTop: 6 },
  cardActs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  focus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  focusText: { fontSize: 13, fontWeight: '600', color: Colors.text, flex: 1 },
  link: { fontSize: 12.5, fontWeight: '600', color: Colors.info },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, marginTop: 8, borderTopWidth: 1, borderTopColor: Colors.divider },
  histTitle: { fontSize: 12, fontWeight: '600', color: Colors.text },
  histSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2 },
  doc: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
  },
  docSeen: { backgroundColor: Colors.successLight, borderColor: Colors.successLight },
  docText: { fontSize: 11.5, fontWeight: '600', color: Colors.primary },
  blockedNote: { fontSize: 11.5, color: Colors.textLight, paddingVertical: 6 },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  totalLabel: { fontSize: 13, color: Colors.text },
  totalValue: { fontSize: 13, fontWeight: '700', color: Colors.text },
});
