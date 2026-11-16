import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as dirApi from '@/api/employeeDirectory.api';
import { BASE_URL } from '@/api/axios';
import {
  unwrap, LoaderView, Empty, Badge, Card, SectionTitle, StatTile, StatRow, ActionBtn, SegTabs,
  SearchBar, Input, FormModal, KV, fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import { withFileToken, openUpload } from '@/utils/fileAccess';
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

// The sensitive numbers a section needs read in full before it can be checked.
// Each read goes through the audited endpoint, exactly as on the web.
const REVEALS: Record<string, string[]> = {
  government_id: ['aadhaarNumber', 'panNumber', 'uanNumber'],
  bank: ['bankAccountNumber'],
};
const addr = (a: any) => (!a ? '' : [a.line, a.city, a.state, a.pincode].filter(Boolean).join(', '));

/** What a section is made of, read off the employee record — the values a reviewer checks. */
function fieldsFor(section: string, d: any, shown: Record<string, string> = {}): [string, string][] {
  if (!d) return [];
  const full = (key: string, masked?: string) => shown[key] || masked || '';
  switch (section) {
    case 'personal': return [
      ['Full name', d.personal?.fullName || d.overview?.name || ''],
      ['Date of birth', d.personal?.dob ? fmtDate(d.personal.dob) : ''],
      ['Gender', d.personal?.gender || ''],
      ['Blood group', d.personal?.bloodGroup || ''],
      ["Father's / husband's name", d.personal?.fatherOrHusbandName || ''],
      ['Emergency contact', [d.personal?.emergencyContactName, d.personal?.emergencyContactPhone].filter(Boolean).join(' · ')],
    ];
    case 'contact': return [
      ['Phone', d.contact?.phone || ''],
      ['Alternate phone', d.contact?.alternatePhone || ''],
      ['Email', d.contact?.email || ''],
      ['Current address', addr(d.contact?.currentAddress)],
      ['Permanent address', addr(d.contact?.permanentAddress)],
    ];
    case 'education': return (d.education?.qualifications || []).map((q: any) => [
      q.kind === 'teaching_degree' ? 'Teaching degree' : q.kind === 'highest' ? 'Highest qualification' : 'Qualification',
      [q.qualification, q.specialization, q.institution, q.passingYear, q.grade].filter(Boolean).join(' · '),
    ]);
    case 'government_id': return [
      ['Aadhaar number', full('aadhaarNumber', d.governmentIds?.aadhaarNumber)],
      ['PAN number', full('panNumber', d.governmentIds?.panNumber)],
      ['UAN / PF number', full('uanNumber', d.governmentIds?.uanNumber)],
    ];
    case 'bank': return [
      ['Account holder', d.bank?.accountHolder || ''],
      ['Account number', full('bankAccountNumber', d.bank?.accountNumber)],
      ['IFSC', d.bank?.ifsc || ''],
      ['Branch', d.bank?.branch || ''],
    ];
    case 'employment_documents': return [
      ['Employee ID', d.employment?.employeeId || ''],
      ['Joining date', d.employment?.joiningDate ? fmtDate(d.employment.joiningDate) : ''],
      ['Designation', d.employment?.designation || ''],
      ['Department', d.employment?.department || ''],
      ['Previous school', d.employment?.previousSchool || ''],
    ];
    default: return [];
  }
}

const REQUEST_FILTERS = [
  { value: 'open',     label: 'Waiting' },
  { value: 'done',     label: 'Dealt with' },
  { value: 'declined', label: 'Declined' },
];
const PAGE = 15;

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
  const [tab, setTab] = useState<string>(['documents', 'reminders', 'requests'].includes(String(params.tab)) ? String(params.tab) : 'sections');
  // The queue is searched and shown a page at a time — a school's whole staff
  // in one scroll is slow to draw and slower to find anyone in.
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  // The record behind an open employee (fetched once each), and the sensitive
  // numbers read in full for the sections that were opened.
  const [details, setDetails] = useState<Record<string, any>>({});
  const [revealed, setRevealed] = useState<Record<string, Record<string, string>>>({});
  // Documents this reviewer has opened: one is decided on only after it was looked at.
  const [openedDocs, setOpenedDocs] = useState<Set<string>>(new Set());
  const [asks, setAsks] = useState<any>(null);
  const [askFilter, setAskFilter] = useState('open');
  const [answering, setAnswering] = useState<any>(null);   // { request, status }
  const [reply, setReply] = useState('');
  const [answerBusy, setAnswerBusy] = useState(false);
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
      const [queue, d, r] = await Promise.all([
        dirApi.getVerificationQueue(), dirApi.getDocumentDesk(),
        dirApi.getChangeRequests().catch(() => null),
      ]);
      setData(unwrap(queue));
      setDesk(unwrap(d));
      if (r) setAsks(unwrap(r));
      setFatal(null);
    } catch (e: any) {
      setFatal({ message: e?.message || 'Could not load verification', code: e?.data?.code });
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const mark = (k: string) => setSeen(s => new Set(s).add(k));

  // Opening an employee fetches their record once; the values are what a
  // reviewer checks a field-only section against.
  useEffect(() => {
    if (!open || details[open]) return;
    let alive = true;
    dirApi.getEmployee(open)
      .then((res) => { if (alive) setDetails(d => ({ ...d, [open]: unwrap(res) })); })
      .catch(() => { /* the section says the record could not be loaded */ });
    return () => { alive = false; };
  }, [open, details]);

  /** Put a section's values on screen — which is the review — reading its sensitive numbers in full. */
  const showValues = (employeeId: string, sec: any) => {
    mark(`${employeeId}:${sec.section}:record`);
    // A number that is not on file has nothing to read in full.
    const d = details[employeeId];
    const masked: any = d ? { ...d.governmentIds, bankAccountNumber: d.bank?.accountNumber } : null;
    for (const field of REVEALS[sec.section] || []) {
      if (revealed[employeeId]?.[field] !== undefined) continue;
      if (masked && !masked[field]) continue;
      dirApi.revealField(employeeId, field)
        .then((res) => {
          const v = (unwrap(res) as any)?.value;
          if (v) setRevealed(r => ({ ...r, [employeeId]: { ...r[employeeId], [field]: v } }));
        })
        .catch(() => { /* not on file, or not this reader's to see: the masked value stays */ });
    }
  };

  const answer = async () => {
    if (!answering) return;
    if (answering.status === 'declined' && reply.trim().length < 5) { Alert.alert('Give a reason', 'The employee is shown why it was declined.'); return; }
    setAnswerBusy(true);
    try {
      await dirApi.closeChangeRequest(answering.request._id, { status: answering.status, reply: reply.trim() });
      setAnswering(null);
      setReply('');
      await load();
    } catch (e: any) { Alert.alert('Could not save that', e?.message || 'Please try again'); }
    finally { setAnswerBusy(false); }
  };
  // What has to have been on screen before a section can be signed: its
  // values, and every scan in it.
  const keysFor = (id: string, sec: any) => [
    `${id}:${sec.section}:record`,
    ...sec.documents.map((d: any) => `${id}:${sec.section}:${d.key}`),
  ];
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
    openUpload(fileUrl(url));
  };
  const viewDoc = (r: any) => {
    setOpenedDocs(o => new Set(o).add(`${r.employee}:${r.key}:${r.fileName}`));
    openStaffFile(r.url);
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

  const everyone = data?.employees ?? [];
  const term = q.trim().toLowerCase();
  const employees = term
    ? everyone.filter((e: any) => `${e.name} ${e.employeeId || ''} ${e.designation || ''} ${e.department || ''}`.toLowerCase().includes(term))
    : everyone;
  const requests: any[] = asks?.requests ?? [];
  const openAsks = asks?.counts?.open || 0;

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
          { key: 'requests',  label: `Requests${openAsks ? ` (${openAsks})` : ''}` },
        ]} />

        {tab === 'sections' && (<>
        <StatRow>
          <StatTile label="Fully verified" value={data?.fullyVerified ?? 0} icon="shield-checkmark" tone="success" />
          <StatTile label="Employees" value={everyone.length} icon="people" tone="info" />
          <StatTile
            label="Outstanding"
            value={Math.max(0, everyone.length - (data?.fullyVerified ?? 0))}
            icon="hourglass" tone="warning"
          />
        </StatRow>

        <SearchBar value={q} onChange={(v) => { setQ(v); setLimit(PAGE); }} placeholder="Name, employee ID, designation, department…" />

        {employees.length === 0 ? (
          <Empty icon="shield-outline" text={term ? 'Nobody matches that search' : 'No employees to verify yet'} />
        ) : employees.slice(0, limit).map((e: any) => (
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
                  const closed = !!sec.restricted;
                  const recordKey = `${e._id}:${sec.section}:record`;
                  const detail = details[e._id];
                  const fields = seen.has(recordKey) ? fieldsFor(sec.section, detail, revealed[e._id]) : [];
                  // Signed off once each document in it has been accepted.
                  const undecided = (sec.documents || []).filter((d: any) => d.state && d.state !== 'verified');
                  return (
                    <View key={sec.section} style={s.section}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={s.secName}>{sec.label}</Text>
                        <Badge label={sec.status} tone={TONE[sec.status]} />
                      </View>

                      <View style={s.evidence}>
                        {closed && <Text style={s.blockedNote}>{sec.restrictedWhy}</Text>}
                        {!closed && blocked && <Badge label={`Waiting for ${(sec.missingRequired || []).join(', ')}`} tone="warning" />}

                        {/* The recorded values, in place: nothing is signed unseen. */}
                        {!closed && sec.status !== 'verified' && (
                          <TouchableOpacity
                            style={[s.doc, seen.has(recordKey) && s.docSeen]}
                            onPress={() => showValues(e._id, sec)}
                            accessibilityRole="button" accessibilityLabel={`Show the recorded values for ${sec.label}`}
                          >
                            <Ionicons
                              name={seen.has(recordKey) ? 'checkmark-circle' : 'eye-outline'}
                              size={13} color={seen.has(recordKey) ? Colors.success : Colors.primary}
                            />
                            <Text style={[s.docText, seen.has(recordKey) && { color: Colors.textSecondary }]}>
                              {seen.has(recordKey) ? 'Recorded values shown' : 'Show the recorded values'}
                            </Text>
                          </TouchableOpacity>
                        )}
                        {seen.has(recordKey) && !closed && (
                          <View style={{ alignSelf: 'stretch', width: '100%' }}>
                            {!detail ? <Text style={s.blockedNote}>Loading the record…</Text>
                              : fields.map(([label, value]) => <KV key={label} label={label} value={value || 'Not on file'} />)}
                          </View>
                        )}

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
                                  {/* Decided only after it has been opened (the chip beside it). */}
                                  <ActionBtn label={docBusy === `${e._id}:${d.key}:verified` ? 'Saving…' : 'Verify'} tone="success" small
                                    disabled={!!docBusy || !seen.has(k)} onPress={() => decide(row, 'verified')} />
                                  <ActionBtn label="Reject" tone="danger" small disabled={!!docBusy || !seen.has(k)} onPress={() => setRejecting(row)} />
                                </View>
                              ) : null}
                              {(d.state === 'rejected' || d.state === 'resubmitted') && d.comment ? (
                                <Text style={s.why}>{d.state === 'resubmitted' ? 'Rejected before: ' : 'Reason: '}“{d.comment}”</Text>
                              ) : null}
                            </View>
                          );
                        })}

                      </View>

                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <View style={{ flex: 1 }}>
                          {/* Verifying is the only write this screen makes: a section
                              that is signed off offers nothing to press. */}
                          {sec.status === 'verified' ? (
                            <Text style={s.blockedNote}>Signed off.</Text>
                          ) : closed ? null : blocked ? (
                            <Text style={s.blockedNote}>It cannot be signed off until {(sec.missingRequired || []).join(', ')} {(sec.missingRequired || []).length === 1 ? 'is' : 'are'} uploaded.</Text>
                          ) : !done ? (
                            <Text style={s.blockedNote}>Show the recorded values{sec.documents.length ? ' and open each document' : ''} above to enable Verify.</Text>
                          ) : undecided.length ? (
                            <Text style={s.blockedNote}>Verify or reject each document above first.</Text>
                          ) : sec.problem ? (
                            <Text style={s.blockedNote}>{sec.problem}</Text>
                          ) : (
                            <ActionBtn
                              label={busy === `${e._id}:${sec.section}` ? 'Saving…' : 'Verify'}
                              tone="success" small
                              onPress={() => verify(e._id, sec.section, 'verified')}
                            />
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

        {employees.length > limit && (
          <View style={{ marginBottom: Spacing.md }}>
            <ActionBtn label={`Show ${Math.min(PAGE, employees.length - limit)} more (${employees.length - limit} left)`} tone="neutral"
              onPress={() => setLimit(n => n + PAGE)} />
          </View>
        )}

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
                    {r.fileName ? <ActionBtn label={openedDocs.has(`${r.employee}:${r.key}:${r.fileName}`) ? 'View again' : 'View'} tone="info" small onPress={() => viewDoc(r)} /> : null}
                    {(r.state === 'pending' || r.state === 'resubmitted') ? (
                      <>
                        {/* Decided only after it has been viewed. */}
                        <ActionBtn label={docBusy === `${r.employee}:${r.key}:verified` ? 'Saving…' : 'Verify'} tone="success" small
                          disabled={!!docBusy || !openedDocs.has(`${r.employee}:${r.key}:${r.fileName}`)} onPress={() => decide(r, 'verified')} />
                        <ActionBtn label="Reject" tone="danger" small
                          disabled={!!docBusy || !openedDocs.has(`${r.employee}:${r.key}:${r.fileName}`)} onPress={() => setRejecting(r)} />
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
        {/* ── "Please correct my details" ─────────────────────────────────── */}
        {tab === 'requests' && (() => {
          const shown = requests.filter((r: any) => r.status === askFilter);
          return (
            <>
              <FilterChips value={askFilter} onChange={setAskFilter}
                items={REQUEST_FILTERS.map((f) => ({ ...f, count: asks?.counts?.[f.value] || 0 }))} />
              {!shown.length ? (
                <Empty icon="chatbubble-ellipses-outline" text={askFilter === 'open' ? 'No correction is waiting.' : 'Nothing here.'} />
              ) : shown.map((r: any) => (
                <Card key={r._id} style={{ marginBottom: Spacing.sm }}>
                  <View style={s.head}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.name} numberOfLines={1}>{r.employeeName}</Text>
                      <Text style={s.sub} numberOfLines={1}>{r.areaLabel} · {fmtDay(r.createdAt)}</Text>
                    </View>
                    <Badge label={r.status === 'open' ? 'Waiting' : r.status === 'done' ? 'Dealt with' : 'Declined'}
                      tone={r.status === 'open' ? 'warning' : r.status === 'done' ? 'success' : 'danger'} />
                  </View>
                  <Text style={s.note}>“{r.message}”</Text>
                  {r.status !== 'open' && !!r.reply && <Text style={s.note}>The office: “{r.reply}”</Text>}
                  {r.status === 'open' && (
                    <View style={s.cardActs}>
                      <ActionBtn label="Done" tone="success" small onPress={() => { setReply(''); setAnswering({ request: r, status: 'done' }); }} />
                      <ActionBtn label="Decline" tone="neutral" small onPress={() => { setReply(''); setAnswering({ request: r, status: 'declined' }); }} />
                    </View>
                  )}
                </Card>
              ))}
            </>
          );
        })()}
      </ScrollView>

      <FormModal visible={!!answering} onClose={() => setAnswering(null)} onSubmit={answer} submitting={answerBusy}
        title={answering?.status === 'declined' ? 'Decline this request' : 'Mark as dealt with'}
        submitLabel={answering?.status === 'declined' ? 'Decline' : 'Mark as done'}>
        {!!answering && (
          <>
            <Text style={s.note}>{answering.request.employeeName} · {answering.request.areaLabel}: “{answering.request.message}”</Text>
            <Input label={answering.status === 'declined' ? 'Why it cannot be changed' : 'A note for the employee (optional)'}
              value={reply} onChange={setReply} multiline text="sentence"
              placeholder={answering.status === 'declined' ? 'e.g. The name has to match your Aadhaar card' : 'e.g. Updated — please check your profile'} />
            <Text style={s.note}>
              {answering.status === 'declined'
                ? 'They will be told the request was declined, with this reason.'
                : 'Make the change on their record first (on the web: Admin → Teachers → Edit). They will be told it has been dealt with.'}
            </Text>
          </>
        )}
      </FormModal>

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
