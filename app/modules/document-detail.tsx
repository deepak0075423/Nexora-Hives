/**
 * One document, opened (Nov 2026) — the phone's counterpart of the web's
 * document page (school-frontend pages/admin/DocumentDetail.jsx and the
 * student drawer). Every role opens it from the Documents list, and a
 * document notification lands here.
 *
 *   • Details — what it is, who it reached, its files (each opens). A student
 *     hands work in here; a parent sees where each of their children stands.
 *   • Submissions (admin and teacher, assignments only) — the tiles, the
 *     scores, and the students filtered by section and status. Whoever may
 *     manage the document (the office, or the teacher who set it) marks from
 *     here and sends reminders; anyone else reads.
 *   • Analytics (the same people, assignments only) — the class average and
 *     how it compares with the last piece of work, the hand-in trend, how each
 *     section and each question went, who did best and who needs attention.
 *
 * Whoever may manage it can also change it from here (Edit), archive or
 * restore it, delete it, see who has opened it and put an earlier set of
 * files back. A copy is a DRAFT until it is shared from here: nobody it is
 * aimed at sees it, or is told, before that.
 *   • Comments (everyone the document reaches) — your own comments to edit
 *     and delete; an admin deletes anyone's (components/documents/commentParts).
 *     A parent or student never sees what the staff kept among themselves.
 *
 * Opening it marks it read — it used to stay "New" on the web however many
 * times it was opened here.
 *
 * `as=admin` opens it the office's way — a module-admin teacher arriving from
 * the admin list reaches the /admin endpoints that list was read from.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as adminApi from '@/api/admin.api';
import * as teacherApi from '@/api/teacher.api';
import * as studentApi from '@/api/student.api';
import * as parentApi from '@/api/parent.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, SectionTitle, StatTile, StatRow, SegTabs, Select, SearchBar,
  ActionBtn, FormModal, Input, confirmAsync, fmtDate, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import { CommentsPanel, FileList, type CommentApi } from '@/components/documents/commentParts';
import { DocPick, appendDocFiles, HANDIN_TYPES, type Picked } from '@/components/documents/filePick';
import { ShareSheet } from '@/components/documents/ShareSheet';

type Side = 'admin' | 'teacher' | 'student' | 'parent';

const PAGE = 20;
/** The marking form's own line for what the named questions leave over (the server's name for it). */
const OTHER_MARKS = 'Other marks';

const TYPE_LABEL: Record<string, string> = {
  assignment: 'Assignment', notice: 'Notice', circular: 'Circular',
  study_material: 'Study material', resource: 'Resource',
};

const STATE: Record<string, { label: string; tone: any }> = {
  submitted: { label: 'Submitted',     tone: 'success' },
  late:      { label: 'Late',          tone: 'warning' },
  pending:   { label: 'Pending',       tone: 'neutral' },
  missed:    { label: 'Not submitted', tone: 'danger' },
};

const STATUS_OPTIONS = [
  { value: '',          label: 'All statuses' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'late',      label: 'Late' },
  { value: 'pending',   label: 'Pending' },
  { value: 'missed',    label: 'Not submitted' },
  { value: 'graded',    label: 'Marked' },
  { value: 'ungraded',  label: 'Not marked yet' },
];

const when = (d?: string | null) => {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${fmtDate(d)}, ${x.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()}`;
};

const said = (e: any, fallback = '') => e?.data?.message || e?.message || fallback;

function apisFor(side: Side | null) {
  if (side === 'admin') return {
    detail: adminApi.getAssignmentDetail, one: null, markRead: null,
    analytics: adminApi.getAssignmentAnalytics, update: adminApi.updateDocument,
    publish: adminApi.publishDocument, versions: adminApi.getDocumentVersions,
    restore: adminApi.restoreDocumentVersion, readers: adminApi.getDocumentReaders,
    review: adminApi.reviewSubmission, remind: adminApi.remindAssignment,
    archive: adminApi.archiveDocument, remove: adminApi.deleteDocument,
    comments: { list: adminApi.getDocumentComments, add: adminApi.addDocumentComment, update: adminApi.updateDocumentComment,
      remove: adminApi.deleteDocumentComment, like: adminApi.likeDocumentComment } as CommentApi,
  };
  if (side === 'teacher') return {
    detail: teacherApi.getAssignmentDetail, one: null, markRead: teacherApi.markDocumentRead,
    analytics: teacherApi.getAssignmentAnalytics, update: teacherApi.updateDocument,
    publish: teacherApi.publishDocument, versions: teacherApi.getDocumentVersions,
    restore: teacherApi.restoreDocumentVersion, readers: teacherApi.getDocumentReaders,
    review: teacherApi.reviewAssignment, remind: teacherApi.remindAssignment,
    archive: teacherApi.archiveDocument, remove: teacherApi.deleteDocument,
    comments: { list: teacherApi.getDocumentComments, add: teacherApi.addDocumentComment, update: teacherApi.updateDocumentComment,
      remove: teacherApi.deleteDocumentComment, like: teacherApi.likeDocumentComment } as CommentApi,
  };
  if (side === 'student') return {
    detail: null, one: studentApi.getDocument, markRead: studentApi.markDocumentRead,
    analytics: null, update: null, publish: null, versions: null, restore: null, readers: null,
    review: null, remind: null, archive: null, remove: null,
    comments: { list: studentApi.getDocumentComments, add: studentApi.addDocumentComment, update: studentApi.updateDocumentComment,
      remove: studentApi.deleteDocumentComment } as CommentApi,
  };
  if (side === 'parent') return {
    detail: null, one: parentApi.getDocument, markRead: parentApi.markDocumentRead,
    analytics: null, update: null, publish: null, versions: null, restore: null, readers: null,
    review: null, remind: null, archive: null, remove: null,
    // A parent reads the discussion and writes nothing in it (Nov 2026) — no
    // box, no reply, no edit or delete; the server has no write route for them.
    comments: { list: parentApi.getDocumentComments } as CommentApi,
  };
  return {
    detail: null, one: null, markRead: null, analytics: null, update: null, publish: null, versions: null, restore: null, readers: null,
    review: null, remind: null, archive: null, remove: null, comments: null,
  };
}

export default function DocumentDetailScreen() {
  const { id, as, tab: firstTab } = useLocalSearchParams<{ id: string; as?: string; tab?: string }>();
  const { user } = useAuth();
  const role = user?.role;
  // The phone names a school admin 'admin' (AuthContext UserRole).
  const side: Side | null = !role ? null
    : (as === 'admin' || role === 'admin') ? 'admin'
    : role === 'teacher' ? 'teacher'
    : role === 'parent' ? 'parent' : 'student';
  const staff = side === 'admin' || side === 'teacher';
  const A = useMemo(() => apisFor(side), [side]);

  const [tab, setTab] = useState(String(firstTab || 'details'));
  const [head, setHead] = useState<any>(null);
  const [roster, setRoster] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [failed, setFailed] = useState('');
  const [status, setStatus] = useState('');
  const [section, setSection] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [comments, setComments] = useState<number | null>(null);
  const [openSub, setOpenSub] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  // Analytics are read when their tab is first opened, and again after a mark changes.
  const [ana, setAna] = useState<any>(null);
  const [anaFailed, setAnaFailed] = useState('');

  // Earlier sets of files, and who has opened it — read when asked for.
  const [history, setHistory] = useState<any>(null);     // { current, versions } | 'loading'
  const [readers, setReaders] = useState<any>(null);     // { total, readers } | 'loading'

  // Editing: the form, and what it needs to offer.
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<{ sections: any[]; classes: any[]; teachers: any[]; categories: string[] }>(
    { sections: [], classes: [], teachers: [], categories: [] });

  // The marking form, for whoever is open in the sheet.
  const [marks, setMarks] = useState('');
  const [scores, setScores] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Typing settles before the roster is asked again.
  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 350); return () => clearTimeout(t); }, [search]);

  const query = useCallback((pg: number) => ({
    page: pg, limit: PAGE,
    status: status || undefined, section: section || undefined, search: q || undefined,
  }), [status, section, q]);

  const load = useCallback(async () => {
    if (!side || !id) return;
    try {
      if (A.detail) {
        const d = unwrap(await A.detail(String(id), query(1)));
        setHead(d?.document || null);
        setRoster(d?.roster || null);
        setRows(d?.roster?.students || []);
        setPage(1);
      } else if (A.one) {
        setHead(unwrap(await A.one(String(id))) || null);
      }
      setFailed('');
    } catch (e: any) {
      if (MODULE_BLOCKED_CODES.includes(e?.data?.code)) setDisabled(true);
      else setFailed(said(e, 'This document could not be opened'));
    } finally { setLoading(false); setRefreshing(false); }
  }, [side, id, A, query]);

  useEffect(() => { load(); }, [load]);

  // Arriving here — from the list or from a notification — is opening it.
  useEffect(() => { if (id && A.markRead) A.markRead(String(id)).catch(() => {}); }, [id, A]);

  const loadMore = async () => {
    if (!A.detail) return;
    setMore(true);
    try {
      const d = unwrap(await A.detail(String(id), query(page + 1)));
      setRows((r) => [...r, ...(d?.roster?.students || [])]);
      setPage(page + 1);
    } catch (e: any) { Alert.alert('Could not load more', said(e)); }
    finally { setMore(false); }
  };

  const canManage = !!head?.canManage;

  useEffect(() => {
    if (tab !== 'analytics' || ana || !A.analytics || !head?.isAssignment) return;
    setAnaFailed('');
    A.analytics(String(id))
      .then((r: any) => setAna(unwrap(r)))
      .catch((e: any) => setAnaFailed(said(e, 'The analytics could not be loaded')));
  }, [tab, ana, A, id, head?.isAssignment]);

  // A draft goes onto its audience's shelves — and they are told — only here.
  const publish = async () => {
    if (!A.publish) return;
    if (!(await confirmAsync('Share this draft', `Share “${head?.title}” now? Everyone it is for will see it and be told.`, 'Share'))) return;
    setBusy(true);
    try { await A.publish(String(id)); await load(); }
    catch (e: any) { Alert.alert('Could not share it', said(e)); }
    finally { setBusy(false); }
  };

  const openHistory = async () => {
    if (!A.versions) return;
    setHistory('loading');
    try { setHistory(unwrap(await A.versions(String(id)))); }
    catch (e: any) { setHistory(null); Alert.alert('Could not load the earlier files', said(e)); }
  };
  const restoreVersion = async (v: any) => {
    if (!A.restore) return;
    if (!(await confirmAsync('Use these files again', `Make version ${v.versionNumber} the current one? What is there now is kept as a version too.`, 'Use them'))) return;
    try { await A.restore(String(id), String(v._id)); setHistory(null); await load(); }
    catch (e: any) { Alert.alert('Could not restore', said(e)); }
  };
  const openReaders = async () => {
    if (!A.readers) return;
    setReaders('loading');
    try { setReaders(unwrap(await A.readers(String(id)))); }
    catch (e: any) { setReaders(null); Alert.alert('Could not load who has opened it', said(e)); }
  };

  // The edit form opens on what is already known and fills in its pickers.
  const startEdit = async () => {
    try {
      if (side === 'admin') {
        const [c, k] = await Promise.all([adminApi.getDocumentClasses(), adminApi.getDocumentCategories()]);
        const t: any = await adminApi.getDocumentTeachers().catch(() => ({ data: [] }));
        setFormData({ sections: [], classes: unwrap(c) || [], teachers: unwrap(t) || [], categories: (unwrap(k) || []).map((x: any) => x.name ?? x) });
      } else {
        const [l, k]: any[] = await Promise.all([teacherApi.getDocuments({ page: 1, limit: 1 }), teacherApi.getDocumentCategories()]);
        setFormData({ sections: l?.sections || [], classes: [], teachers: [], categories: ((k?.data ?? k) || []).map((x: any) => x.name ?? x) });
      }
    } catch { /* the form opens with what it has */ }
    setEditing(true);
  };

  const archive = async () => {
    if (!A.archive) return;
    const back = !!head?.isArchived;
    if (!(await confirmAsync(
      back ? 'Restore document' : 'Archive document',
      back ? `Put “${head?.title}” back on the shelf?` : `Archive “${head?.title}”? It stays, but leaves everyone’s list.`,
      back ? 'Restore' : 'Archive',
    ))) return;
    setBusy(true);
    try { await A.archive(String(id), !back); await load(); }
    catch (e: any) { Alert.alert(back ? 'Could not restore' : 'Could not archive', said(e)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!A.remove) return;
    if (!(await confirmAsync('Delete document', `Permanently delete “${head?.title}”? Its files, its comments and every submission against it go with it.`, 'Delete'))) return;
    setBusy(true);
    try { await A.remove(String(id)); router.back(); }
    catch (e: any) { Alert.alert('Could not delete', said(e)); setBusy(false); }
  };

  // ── Reminders ──────────────────────────────────────────────────────────────
  const outstanding = (roster?.counts?.pending || 0) + (roster?.counts?.missed || 0);
  const remind = async (student?: any) => {
    if (!A.remind) return;
    if (!student && !(await confirmAsync(
      'Send reminder',
      outstanding
        ? `Remind the ${outstanding} student${outstanding === 1 ? '' : 's'} who ${outstanding === 1 ? 'has' : 'have'} not handed this in? Their parents are told too. It can go to everyone once an hour.`
        : 'Everyone has handed this in — there is nobody to remind.',
      'Send',
    ))) return;
    try {
      const r: any = await A.remind(String(id), student ? { studentIds: [String(student._id)] } : {});
      Alert.alert('Reminder', r?.sent ? `Sent to ${r.sent} student${r.sent === 1 ? '' : 's'} and their parents.` : (r?.message || 'Nobody to remind.'));
    } catch (e: any) { Alert.alert('Not sent', said(e)); }
  };

  // ── Marking ────────────────────────────────────────────────────────────────
  // Set with no "Out of", it takes feedback only (Nov 2026): whoever set it
  // chose no marks, so the form offers none and the server refuses any.
  const outOf = Number(head?.totalMarks) > 0 ? Number(head.totalMarks) : null;
  const questions: any[] = outOf ? (head?.questions || []) : [];
  const byQuestion = questions.length > 0;
  const named = questions.reduce((n, x) => n + (Number(x.maxMarks) > 0 ? Number(x.maxMarks) : 0), 0);
  // What the named questions leave over, when each says what it is worth.
  const room = byQuestion && outOf && questions.every((x) => Number(x.maxMarks) > 0)
    ? Math.round((outOf - named) * 100) / 100 : 0;
  const labels = [...questions.map((x) => String(x.label)), ...(room > 0 ? [OTHER_MARKS] : [])];

  const openStudent = (r: any) => {
    setOpenSub(r);
    setMarks(r.marks == null ? '' : String(r.marks));
    setNote(r.feedback || '');
    setScores(Object.fromEntries([...questions.map((x) => String(x.label)), OTHER_MARKS].map((l) => {
      const hit = (r.questionScores || []).find((x: any) => x.label === l);
      return [l, hit?.score == null ? '' : String(hit.score)];
    })));
  };

  const derived = byQuestion
    ? (() => {
      const vals = labels.filter((l) => scores[l] !== '' && scores[l] != null).map((l) => Number(scores[l])).filter((n) => Number.isFinite(n));
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100 : null;
    })()
    : null;

  const saveMarks = async () => {
    if (!A.review || !openSub) return;
    setSaving(true);
    try {
      await A.review(String(id), String(openSub._id), !outOf
        ? { feedback: note }
        : byQuestion
          ? { feedback: note, questionScores: labels.map((l) => ({ label: l, score: scores[l] })) }
          : { feedback: note, marks });
      setOpenSub(null);
      setAna(null);      // worked out before this mark existed
      await load();
    } catch (e: any) { Alert.alert('Not saved', said(e)); }
    finally { setSaving(false); }
  };

  const title = head?.title || 'Document';
  const tabs = [
    { key: 'details', label: 'Details' },
    ...(staff && roster ? [{ key: 'submissions', label: `Submissions (${roster.counts?.total ?? 0})` }] : []),
    ...(staff && roster && A.analytics ? [{ key: 'analytics', label: 'Analytics' }] : []),
    ...(A.comments ? [{ key: 'comments', label: comments == null ? 'Comments' : `Comments (${comments})` }] : []),
  ];
  const active = tabs.some((t) => t.key === tab) ? tab : 'details';
  const handedIn = openSub && (openSub.state === 'submitted' || openSub.state === 'late');

  if (disabled) return (<><Stack.Screen options={{ title: 'Document' }} /><ModuleDisabled /></>);

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : failed ? (
          <Empty icon="alert-circle-outline" text={failed} />
        ) : !head ? (
          <Empty icon="document-outline" text="This document is no longer available" />
        ) : (
          <>
            <View style={s.hero}>
              <View style={s.heroIcon}>
                <Ionicons name={head.isAssignment ? 'document-text' : 'document'} size={22} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.heroTitle}>{title}</Text>
                <View style={s.badges}>
                  <Badge label={TYPE_LABEL[head.docType] || (head.isAssignment ? 'Assignment' : 'Document')} tone="info" />
                  {head.isDraft ? <Badge label="Draft" tone="warning" /> : null}
                  {head.isArchived ? <Badge label="Archived" tone="neutral" /> : null}
                  {head.academicYearName ? <Badge label={head.academicYearName} tone="neutral" /> : null}
                </View>
              </View>
            </View>

            <SegTabs tabs={tabs} active={active} onChange={setTab} />

            {active === 'details' && (
              <Details head={head} side={side!} busy={busy} docId={String(id)} reload={load}
                canAct={side === 'admin' || (side === 'teacher' && canManage)}
                onEdit={startEdit} onArchive={archive} onDelete={remove}
                onPublish={publish} onHistory={openHistory} onReaders={openReaders} />
            )}

            {active === 'submissions' && roster && (
              <View>
                <StatRow>
                  <StatTile label="Submitted" value={roster.counts?.submitted ?? 0} icon="checkmark-circle" tone="success" />
                  <StatTile label="Pending" value={roster.counts?.pending ?? 0} icon="time" tone="warning" />
                </StatRow>
                <StatRow>
                  <StatTile label="Not submitted" value={roster.counts?.missed ?? 0} icon="close-circle" tone="danger" />
                  <StatTile label="Total students" value={roster.counts?.total ?? 0} icon="people" tone="info" />
                </StatRow>

                {/* How the class did, once anything has been marked. */}
                {roster.counts?.graded > 0 && (
                  <Card>
                    <SectionTitle>Scores ({roster.counts.graded} marked)</SectionTitle>
                    <KV label="Average" value={`${roster.scores?.average ?? '—'}${outOf ? ` / ${outOf}` : ''}`} />
                    <KV label="Highest" value={`${roster.scores?.highest ?? '—'}${outOf ? ` / ${outOf}` : ''}`} />
                    <KV label="Lowest" value={`${roster.scores?.lowest ?? '—'}${outOf ? ` / ${outOf}` : ''}`} />
                    {(roster.distribution || []).some((b: any) => b.count > 0) && (
                      <View style={s.bands}>
                        {(roster.distribution as any[]).map((b) => (
                          <View key={b.label} style={s.band}>
                            <Text style={s.bandCount}>{b.count}</Text>
                            <Text style={s.bandLabel}>{b.label}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </Card>
                )}

                {canManage && A.remind && (
                  <View style={{ marginBottom: 10 }}>
                    <ActionBtn label={`Remind everyone still to hand in${outstanding ? ` (${outstanding})` : ''}`}
                      onPress={() => remind()} />
                  </View>
                )}

                <Select label="Section" value={section} onChange={setSection}
                  options={[
                    { value: '', label: 'All sections' },
                    // A student with no section has no id to filter by.
                    // The section alone — the line under the filters says how many.
                    ...(roster.sections || []).filter((x: any) => x._id)
                      .map((x: any) => ({ value: String(x._id), label: String(x.label) })),
                  ]} />
                <Select label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
                <SearchBar value={search} onChange={setSearch} placeholder="Search by name or roll no…" />

                <Text style={s.count}>Showing {rows.length} of {roster.shown ?? rows.length} students</Text>
                {!rows.length ? <Empty icon="people-outline" text="No students match these filters" /> : rows.map((r) => {
                  const st = STATE[r.state] || STATE.pending;
                  // Something to open: their work, or — for whoever marks — the form.
                  const opens = !!r.submissionId || canManage;
                  return (
                    <TouchableOpacity key={r._id} style={s.row} disabled={!opens} activeOpacity={0.7}
                      onPress={() => openStudent(r)} accessibilityLabel={`${r.name}, ${st.label}`}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowName} numberOfLines={1}>{r.name}</Text>
                        <Text style={s.rowSub} numberOfLines={1}>
                          {[r.rollNumber ? `Roll ${r.rollNumber}` : '', r.sectionLabel].filter(Boolean).join(' · ')}
                        </Text>
                        {r.submittedAt ? <Text style={s.rowWhen}>Handed in {when(r.submittedAt)}</Text> : null}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Badge label={st.label} tone={st.tone} />
                        {r.marks != null ? <Text style={s.marks}>{r.marks}{outOf ? ` / ${outOf}` : ''}</Text> : null}
                      </View>
                      {opens ? <Ionicons name="chevron-forward" size={16} color={Colors.textLight} style={{ marginLeft: 6 }} /> : null}
                    </TouchableOpacity>
                  );
                })}
                {rows.length < (roster.shown ?? 0) ? (
                  <TouchableOpacity style={s.more} onPress={loadMore} disabled={more} accessibilityRole="button">
                    {more ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={s.moreText}>Show more</Text>}
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            {active === 'analytics' && (
              anaFailed ? <Empty icon="alert-circle-outline" text={anaFailed} />
                : !ana ? <LoaderView /> : <Analytics ana={ana} roster={roster} outOf={outOf} />
            )}

            {active === 'comments' && A.comments && (
              <CommentsPanel docId={String(id)} api={A.comments} adminSide={side === 'admin'} onCount={setComments} />
            )}
          </>
        )}
      </ScrollView>

      {A.update ? (
        <ShareSheet visible={editing} mode={side === 'admin' ? 'admin' : 'teacher'} editing={head}
          sections={formData.sections} classes={formData.classes} teachers={formData.teachers} categories={formData.categories}
          send={async () => undefined} update={A.update}
          onClose={() => setEditing(false)}
          onDone={() => { setEditing(false); load(); }} />
      ) : null}

      {/* Earlier sets of files. Replacing a file keeps what was there. */}
      <FormModal visible={!!history} title="Earlier files" onClose={() => setHistory(null)}>
        {!history || history === 'loading' ? <LoaderView /> : (
          <View>
            <SectionTitle>Version {history.current?.versionNumber} — current</SectionTitle>
            {history.current?.files?.length ? <FileList files={history.current.files} /> : <Text style={s.muted}>No files.</Text>}
            {!history.versions?.length ? (
              <Text style={s.calm}>Nothing has been replaced on this document — there are no earlier files.</Text>
            ) : (history.versions as any[]).map((v) => (
              <View key={String(v._id)} style={{ marginTop: Spacing.md }}>
                <SectionTitle>Version {v.versionNumber}</SectionTitle>
                <Text style={s.rowSub}>Replaced {fmtDate(v.replacedAt)}{v.replacedBy ? ` by ${v.replacedBy}` : ''}</Text>
                <View style={{ marginVertical: 8 }}>
                  {v.files?.length ? <FileList files={v.files} /> : <Text style={s.muted}>No files.</Text>}
                </View>
                <ActionBtn label="Use these again" onPress={() => restoreVersion(v)} />
              </View>
            ))}
          </View>
        )}
      </FormModal>

      {/* Who has opened it — the read marks, read from the sharer's side. */}
      <FormModal visible={!!readers} title="Who has opened it" onClose={() => setReaders(null)}>
        {!readers || readers === 'loading' ? <LoaderView /> : !readers.readers?.length ? (
          <Text style={s.muted}>Nobody has opened this yet.</Text>
        ) : (readers.readers as any[]).map((r) => (
          <View key={String(r._id)} style={s.person}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.rowName} numberOfLines={1}>{r.name}</Text>
              <Text style={s.rowSub} numberOfLines={1}>
                {[({ school_admin: 'Admin', teacher: 'Teacher', student: 'Student', parent: 'Parent' } as any)[r.role] || r.role, r.section].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Text style={s.rowWhen}>{when(r.readAt)}</Text>
          </View>
        ))}
      </FormModal>

      <FormModal visible={!!openSub} title={openSub ? `${openSub.name}’s work` : ''} onClose={() => setOpenSub(null)}
        onSubmit={canManage && A.review ? saveMarks : undefined} submitting={saving}
        submitLabel={outOf ? 'Save marks & feedback' : 'Save feedback'}>
        {openSub ? (
          <View>
            <KV label="Status" value={(STATE[openSub.state] || STATE.pending).label} />
            <KV label="Handed in" value={when(openSub.submittedAt) || '—'} />
            {openSub.readAt ? <KV label="Opened" value={when(openSub.readAt)} /> : null}
            {openSub.marks != null ? <KV label="Marks" value={`${openSub.marks}${outOf ? ` / ${outOf}` : ''}`} /> : null}
            {!canManage && openSub.feedback ? <KV label="Feedback" value={openSub.feedback} /> : null}
            <SectionTitle>Files</SectionTitle>
            {openSub.files?.length ? <FileList files={openSub.files} /> : <Text style={s.muted}>No files.</Text>}

            {canManage && A.review ? (
              <View style={{ marginTop: Spacing.md }}>
                <SectionTitle>{outOf ? 'Mark it' : 'Feedback'}</SectionTitle>
                {!handedIn ? (
                  <Text style={s.warn}>
                    {outOf
                      ? 'Nothing was handed in here. Marks and feedback are recorded for work done on paper, or as a zero — the list still shows it as not submitted.'
                      : 'Nothing was handed in here. Feedback can still be recorded for work done on paper — the list still shows it as not submitted.'}
                  </Text>
                ) : null}
                {!outOf ? (
                  <Text style={s.muted}>This assignment was set without marks, so it takes feedback only.</Text>
                ) : byQuestion ? (
                  <>
                    {labels.map((l) => {
                      const max = l === OTHER_MARKS ? room : questions.find((x) => String(x.label) === l)?.maxMarks;
                      return (
                        <Input key={l} label={`${l}${max ? ` (out of ${max})` : ''}`} value={scores[l] ?? ''}
                          keyboardType="decimal-pad" onChange={(v) => setScores((x) => ({ ...x, [l]: v }))} />
                      );
                    })}
                    <Text style={s.total}>Total {derived ?? '—'}{outOf ? ` / ${outOf}` : ''} — added up from the lines above</Text>
                  </>
                ) : (
                  <Input label={`Marks${outOf ? ` (out of ${outOf})` : ''}`} value={marks} onChange={setMarks}
                    keyboardType="decimal-pad" placeholder="Leave empty to unmark" />
                )}
                <Input label="Feedback" value={note} onChange={(v) => setNote(v.slice(0, 600))} multiline
                  placeholder="What they did well, and what to fix next time" />
                {!handedIn ? (
                  <ActionBtn label="Send this student a reminder" onPress={() => remind(openSub)} />
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </FormModal>
    </>
  );
}

/** One labelled bar: a name, a figure, and how far along 0–100 it sits. */
const Bar = ({ label, value, pct, tone = '#4F46E5' }: { label: string; value: string; pct: number | null; tone?: string }) => (
  <View style={{ marginBottom: 10 }}>
    <View style={s.barHead}>
      <Text style={s.barLabel} numberOfLines={1}>{label}</Text>
      <Text style={s.barValue}>{value}</Text>
    </View>
    <View style={s.barTrack}>
      <View style={[s.barFill, { width: `${Math.max(0, Math.min(100, pct ?? 0))}%`, backgroundColor: tone }]} />
    </View>
  </View>
);

/**
 * How the class did — the web's Analytics tab, told in bars a phone can hold.
 * Nothing is drawn for what was not measured: an assignment with no marks says
 * so rather than showing an empty chart.
 */
function Analytics({ ana, roster, outOf }: { ana: any; roster: any; outOf: number | null }) {
  const sum = ana.summary || {};
  const cmp = ana.comparison;
  const total = sum.total || 0;
  // Daily arrivals as a running total — the line the web draws, as bars.
  let running = 0;
  const trend = (ana.trend || []).map((t: any) => {
    running += t.count || 0;
    const d = new Date(t.day);
    return { label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, total: running };
  });
  const sections = (ana.sections || []).filter((x: any) => x.total > 0);
  const questions = (ana.questions || []).filter((x: any) => x.percent != null);
  const person = (p: any, right: string) => (
    <View key={String(p._id)} style={s.person}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowName} numberOfLines={1}>{p.name}</Text>
        {p.section ? <Text style={s.rowSub} numberOfLines={1}>{p.section}</Text> : null}
      </View>
      <Text style={s.marks}>{right}</Text>
    </View>
  );

  return (
    <View>
      <Card>
        <SectionTitle>Class average</SectionTitle>
        <Text style={s.big}>
          {sum.average ?? '—'}<Text style={s.bigSub}>{outOf ? ` / ${outOf}` : ''}{sum.averagePercent != null ? `  ·  ${sum.averagePercent}%` : ''}</Text>
        </Text>
        <Text style={s.rowSub}>{sum.graded || 0} marked of {sum.submitted || 0} handed in · {total} on the assignment</Text>
        {cmp?.change != null ? (
          <Text style={[s.delta, { color: cmp.change >= 0 ? '#047857' : Colors.danger }]}>
            {cmp.change >= 0 ? '▲' : '▼'} {Math.abs(cmp.change)}% {cmp.change >= 0 ? 'higher' : 'lower'} than on “{cmp.title}”
          </Text>
        ) : null}
        {!sum.graded ? <Text style={s.calm}>Nothing has been marked yet, so there are no scores to compare.</Text> : null}
      </Card>

      {trend.length > 0 && (
        <Card>
          <SectionTitle>Handed in so far</SectionTitle>
          {trend.slice(-10).map((t: any) => (
            <Bar key={t.label} label={t.label} value={`${t.total} of ${total}`} pct={total ? (t.total / total) * 100 : 0} tone="#059669" />
          ))}
        </Card>
      )}

      {sections.length > 0 && (
        <Card>
          <SectionTitle>By section</SectionTitle>
          {sections.map((x: any) => (
            <Bar key={x.label} label={x.label}
              value={x.percent != null ? `${x.percent}% avg · ${x.submitted}/${x.total} in` : `${x.submitted}/${x.total} in`}
              pct={x.percent != null ? x.percent : (x.total ? (x.submitted / x.total) * 100 : 0)}
              tone={x.percent != null ? '#4F46E5' : '#94A3B8'} />
          ))}
        </Card>
      )}

      {questions.length > 0 && (
        <Card>
          <SectionTitle>By question (average)</SectionTitle>
          {questions.map((x: any) => (
            <Bar key={x.label} label={x.label} value={`${x.average}${x.maxMarks ? ` / ${x.maxMarks}` : ''} · ${x.percent}%`}
              pct={x.percent} tone={x.percent < 40 ? '#DC2626' : x.percent < 70 ? '#D97706' : '#059669'} />
          ))}
        </Card>
      )}

      {(roster?.distribution || []).some((b: any) => b.count > 0) && (
        <Card>
          <SectionTitle>Score distribution</SectionTitle>
          {(roster.distribution as any[]).map((b) => (
            <Bar key={b.label} label={b.label} value={`${b.count} student${b.count === 1 ? '' : 's'}`}
              pct={sum.graded ? (b.count / sum.graded) * 100 : 0} />
          ))}
        </Card>
      )}

      {(ana.top || []).length > 0 && (
        <Card>
          <SectionTitle>Top performers</SectionTitle>
          {(ana.top as any[]).map((p) => person(p, `${p.marks}${outOf ? ` / ${outOf}` : ''}`))}
        </Card>
      )}

      <Card>
        <SectionTitle>Needs attention</SectionTitle>
        {(ana.attention || []).length
          ? (ana.attention as any[]).map((p) => person(p, p.state === 'missed' ? 'Not submitted' : p.state === 'pending' ? 'Pending' : `${p.marks}${outOf ? ` / ${outOf}` : ''}`))
          : <Text style={s.calm}>Nobody is behind — everything is in.</Text>}
      </Card>
    </View>
  );
}

function Details({ head, side, busy, canAct, onEdit, onArchive, onDelete, onPublish, onHistory, onReaders, docId, reload }: {
  head: any; side: Side; busy: boolean; canAct: boolean; onEdit: () => void; onArchive: () => void; onDelete: () => void;
  onPublish: () => void; onHistory: () => void; onReaders: () => void;
  docId: string; reload: () => void;
}) {
  const subject = typeof head.subject === 'object' ? head.subject?.name : head.subject;
  const shared = Array.isArray(head.sharedWith) ? head.sharedWith.join(', ') : '';
  const sub = head.mySubmission;
  const [files, setFiles] = useState<Picked[]>([]);
  const [sending, setSending] = useState(false);

  const handed  = !!sub && (sub.status === 'submitted' || sub.status === 'late');
  // Looked at by the teacher: it can no longer be swapped for something else.
  const settled = !!sub && (sub.marks != null || !!sub.reviewedAt);
  const pastDue = !!head.dueDate && Date.now() > new Date(head.dueDate).getTime();

  const handIn = async () => {
    if (!files.length) { Alert.alert('Nothing attached', 'Attach at least one file.'); return; }
    setSending(true);
    try {
      const fd = new FormData();
      appendDocFiles(fd, files);
      const r: any = await studentApi.submitAssignment(docId, fd);
      setFiles([]);
      Alert.alert('Handed in', r?.message === 'Submitted late' ? 'It came in after the due date, so it is marked late.' : 'Your work has been handed in.');
      reload();
    } catch (e: any) {
      Alert.alert('Not handed in', said(e, 'Please try again.'));
    } finally { setSending(false); }
  };

  return (
    <View>
      {/* A copy waits here until it has been made this week's. */}
      {head.isDraft ? (
        <View style={s.draft}>
          <Text style={s.draftText}>
            This is a draft. Nobody it is shared with can see it yet, and nobody has been told about it.
            {canAct ? ' Edit it — the title, the due date, the file — then share it.' : ''}
          </Text>
          {canAct ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <ActionBtn label="Edit" onPress={onEdit} disabled={busy} />
              <ActionBtn label="Share now" tone="primary" onPress={onPublish} disabled={busy} />
            </View>
          ) : null}
        </View>
      ) : null}

      <Card>
        {subject ? <KV label="Subject" value={subject} /> : null}
        {head.category ? <KV label="Category" value={head.category} /> : null}
        {shared ? <KV label="Shared with" value={shared} /> : null}
        {head.uploadedBy?.name ? <KV label="Shared by" value={head.uploadedBy.name} /> : null}
        <KV label={head.isAssignment ? 'Assigned on' : 'Shared on'} value={fmtDate(head.assignedOn || head.createdAt)} />
        {head.isAssignment ? <KV label="Due date" value={head.dueDate ? fmtDate(head.dueDate) : 'No due date'} /> : null}
        {head.isAssignment && head.totalMarks ? <KV label="Total marks" value={String(head.totalMarks)} /> : null}
        {canAct && head.readCount != null ? (
          <KV label="Opened by" value={head.readCount ? `${head.readCount} ${head.readCount === 1 ? 'person' : 'people'}` : 'Nobody yet'} />
        ) : null}
        {canAct ? <KV label="Version" value={`v${head.currentVersion || 1}`} /> : null}
        {canAct ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {head.readCount > 0 ? <ActionBtn label="See who opened it" small onPress={onReaders} /> : null}
            <ActionBtn label="Earlier files" small onPress={onHistory} />
          </View>
        ) : null}
      </Card>

      {head.description ? (
        <Card>
          <SectionTitle>About</SectionTitle>
          <Text style={s.desc}>{head.description}</Text>
        </Card>
      ) : null}

      <SectionTitle>Files ({head.files?.length || 0})</SectionTitle>
      {head.files?.length ? <FileList files={head.files} /> : <Text style={s.muted}>No files attached.</Text>}

      {/* A student's own work: what came back, and handing it in. */}
      {side === 'student' && head.isAssignment ? (
        <Card style={{ marginTop: Spacing.md }}>
          <SectionTitle>Your work</SectionTitle>
          {sub ? (
            <>
              <KV label="Status" value={sub.marks != null ? 'Marked' : handed ? (sub.status === 'late' ? 'Handed in late' : 'Handed in') : 'Not handed in'} />
              {handed ? <KV label="Handed in" value={when(sub.submittedAt) || '—'} /> : null}
              {sub.marks != null ? <KV label="Marks" value={`${sub.marks}${head.totalMarks ? ` / ${head.totalMarks}` : ''}`} /> : null}
              {(sub.questionScores || []).filter((x: any) => x.score != null).map((x: any) => (
                <KV key={x.label} label={`   ${x.label}`} value={String(x.score)} />
              ))}
              {sub.feedback ? <KV label="Feedback" value={sub.feedback} /> : null}
              {handed && sub.files?.length ? <FileList files={sub.files} compact /> : null}
            </>
          ) : <Text style={s.muted}>You have not handed anything in yet.</Text>}

          {settled ? (
            <Text style={s.calm}>This has been marked, so it can no longer be replaced. Ask your teacher if you need to hand it in again.</Text>
          ) : !head.allowSubmission ? (
            <Text style={s.calm}>Submissions are closed for this one.</Text>
          ) : (
            <View style={{ marginTop: 10 }}>
              <DocPick files={files} onFiles={setFiles} max={5}
                types={HANDIN_TYPES} typeRule="assignments are handed in as PDF files only"
                label={handed ? 'Replace what you handed in' : 'Attach your work'}
                hint="PDF only — up to 5 files, 10 MB each" />
              {pastDue ? (
                <Text style={s.warn}>
                  {handed && sub.status !== 'late'
                    ? 'The due date has passed — replacing your work now will mark it late.'
                    : 'The due date has passed — this will be marked late.'}
                </Text>
              ) : null}
              <ActionBtn label={sending ? 'Sending…' : handed ? 'Replace submission' : 'Hand it in'} tone="primary"
                onPress={handIn} disabled={sending || !files.length} />
            </View>
          )}
        </Card>
      ) : null}

      {/* A parent: where each of their children stands on it. */}
      {side === 'parent' && head.isAssignment && (head.children || []).length ? (
        <Card style={{ marginTop: Spacing.md }}>
          <SectionTitle>{head.children.length > 1 ? 'Each of your children' : 'Their work'}</SectionTitle>
          {(head.children as any[]).map((c) => {
            const w = c.submission;
            const done = w && (w.status === 'submitted' || w.status === 'late');
            const line = w?.marks != null ? `Marked — ${w.marks}${head.totalMarks ? ` / ${head.totalMarks}` : ''}`
              : done ? `${w.status === 'late' ? 'Handed in late' : 'Handed in'} ${when(w.submittedAt)}`
                : !head.allowSubmission ? 'Closed'
                  : (head.dueDate && Date.now() > new Date(head.dueDate).getTime()) ? 'Not handed in — the due date has passed'
                    : 'Not handed in yet';
            return (
              <View key={String(c._id)} style={s.child}>
                <Text style={s.rowName}>{c.name}</Text>
                <Text style={s.rowSub}>{line}</Text>
                {w?.feedback ? <Text style={s.feedback}>“{w.feedback}”</Text> : null}
              </View>
            );
          })}
          <Text style={s.calm}>Work is handed in from your child’s own account.</Text>
        </Card>
      ) : null}

      {canAct ? (
        <View style={s.adminActs}>
          <ActionBtn label="Edit" tone="primary" onPress={onEdit} disabled={busy} />
          <ActionBtn label={head.isArchived ? 'Restore' : 'Archive'} onPress={onArchive} disabled={busy} />
          <ActionBtn label="Delete document" tone="danger" onPress={onDelete} disabled={busy} />
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: Spacing.md },
  heroIcon: { width: 46, height: 46, borderRadius: Radius.md, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  desc: { fontSize: 14, lineHeight: 20, color: Colors.text },
  muted: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.md },
  calm: { fontSize: 12, lineHeight: 18, color: Colors.textSecondary, marginTop: 10 },
  warn: {
    fontSize: 12, lineHeight: 18, color: '#92400E', backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: Radius.md, padding: 10, marginBottom: 10,
  },
  total: { fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 10 },
  count: { fontSize: 12, color: Colors.textSecondary, marginVertical: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 8,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg,
  },
  rowName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  rowSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  rowWhen: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
  marks: { fontSize: 12, fontWeight: '700', color: Colors.text },
  more: { alignItems: 'center', padding: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  moreText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  adminActs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.lg },
  draft: {
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: Radius.lg,
    padding: 12, marginBottom: Spacing.md,
  },
  draftText: { fontSize: 13, lineHeight: 19, color: '#92400E' },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  barLabel: { flex: 1, fontSize: 12, fontWeight: '600', color: Colors.text },
  barValue: { fontSize: 12, color: Colors.textSecondary },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  big: { fontSize: 28, fontWeight: '800', color: Colors.text },
  bigSub: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  delta: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  bands: { flexDirection: 'row', gap: 6, marginTop: 10 },
  band: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.md, backgroundColor: Colors.background },
  bandCount: { fontSize: 15, fontWeight: '800', color: Colors.text },
  bandLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  child: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  feedback: { fontSize: 12, fontStyle: 'italic', color: Colors.textSecondary, marginTop: 4 },
});
