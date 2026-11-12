/**
 * One document, opened (Nov 2026) — the phone's counterpart of the web's
 * document page (school-frontend pages/admin/DocumentDetail.jsx and the
 * student drawer). Every role opens it from the Documents list, and a
 * document notification lands here.
 *
 *   • Details — what it is, who it reached, its files (each opens).
 *   • Submissions (admin and teacher, assignments only) — the tiles, and the
 *     students filtered by section and status. The section choices are the
 *     document's own academic year only (the server decides): a student still
 *     placed in last year's section shows only if they already handed work in,
 *     labelled with that year, and never as a choice of its own.
 *   • Comments (admin, teacher, student) — your own comments to edit and
 *     delete; an admin deletes anyone's (components/documents/commentParts).
 *     Parents have no comments, as on the web.
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
  ActionBtn, FormModal, confirmAsync, fmtDate, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import { CommentsPanel, FileList, type CommentApi } from '@/components/documents/commentParts';

type Side = 'admin' | 'teacher' | 'student' | 'parent';

const PAGE = 20;

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

function apisFor(side: Side | null) {
  if (side === 'admin') return {
    detail: adminApi.getAssignmentDetail, one: null,
    comments: { list: adminApi.getDocumentComments, add: adminApi.addDocumentComment, update: adminApi.updateDocumentComment,
      remove: adminApi.deleteDocumentComment, like: adminApi.likeDocumentComment } as CommentApi,
  };
  if (side === 'teacher') return {
    detail: teacherApi.getAssignmentDetail, one: null,
    comments: { list: teacherApi.getDocumentComments, add: teacherApi.addDocumentComment, update: teacherApi.updateDocumentComment,
      remove: teacherApi.deleteDocumentComment, like: teacherApi.likeDocumentComment } as CommentApi,
  };
  if (side === 'student') return {
    detail: null, one: studentApi.getDocument,
    comments: { list: studentApi.getDocumentComments, add: studentApi.addDocumentComment, update: studentApi.updateDocumentComment,
      remove: studentApi.deleteDocumentComment } as CommentApi,
  };
  if (side === 'parent') return { detail: null, one: parentApi.getDocument, comments: null };
  return { detail: null, one: null, comments: null };
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
      else setFailed(e?.message || 'This document could not be opened');
    } finally { setLoading(false); setRefreshing(false); }
  }, [side, id, A, query]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (!A.detail) return;
    setMore(true);
    try {
      const d = unwrap(await A.detail(String(id), query(page + 1)));
      setRows((r) => [...r, ...(d?.roster?.students || [])]);
      setPage(page + 1);
    } catch (e: any) { Alert.alert('Could not load more', e?.message || ''); }
    finally { setMore(false); }
  };

  const archive = async () => {
    if (!(await confirmAsync('Archive document', `Archive “${head?.title}”? It stays, but leaves the main list.`, 'Archive'))) return;
    setBusy(true);
    try { await adminApi.archiveDocument(String(id)); await load(); }
    catch (e: any) { Alert.alert('Could not archive', e?.message || ''); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!(await confirmAsync('Delete document', `Permanently delete “${head?.title}”? Its files and every submission against it go with it.`, 'Delete'))) return;
    setBusy(true);
    try { await adminApi.deleteDocument(String(id)); router.back(); }
    catch (e: any) { Alert.alert('Could not delete', e?.message || ''); setBusy(false); }
  };

  const title = head?.title || 'Document';
  const tabs = [
    { key: 'details', label: 'Details' },
    ...(staff && roster ? [{ key: 'submissions', label: `Submissions (${roster.counts?.total ?? 0})` }] : []),
    ...(A.comments ? [{ key: 'comments', label: comments == null ? 'Comments' : `Comments (${comments})` }] : []),
  ];
  const active = tabs.some((t) => t.key === tab) ? tab : 'details';

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
                  {head.isArchived ? <Badge label="Archived" tone="neutral" /> : null}
                  {head.academicYearName ? <Badge label={head.academicYearName} tone="neutral" /> : null}
                </View>
              </View>
            </View>

            <SegTabs tabs={tabs} active={active} onChange={setTab} />

            {active === 'details' && (
              <Details head={head} side={side!} busy={busy} onArchive={archive} onDelete={remove} />
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

                <Select label="Section" value={section} onChange={setSection}
                  options={[
                    { value: '', label: 'All sections' },
                    // A student with no section has no id to filter by.
                    ...(roster.sections || []).filter((x: any) => x._id)
                      .map((x: any) => ({ value: String(x._id), label: `${x.label} (${x.total})` })),
                  ]} />
                <Select label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
                <SearchBar value={search} onChange={setSearch} placeholder="Search by name or roll no…" />

                <Text style={s.count}>Showing {rows.length} of {roster.shown ?? rows.length} students</Text>
                {!rows.length ? <Empty icon="people-outline" text="No students match these filters" /> : rows.map((r) => {
                  const st = STATE[r.state] || STATE.pending;
                  const outOf = roster.scores?.outOf;
                  return (
                    <TouchableOpacity key={r._id} style={s.row} disabled={!r.submissionId} activeOpacity={0.7}
                      onPress={() => setOpenSub(r)} accessibilityLabel={`${r.name}, ${st.label}`}>
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
                      {r.submissionId ? <Ionicons name="chevron-forward" size={16} color={Colors.textLight} style={{ marginLeft: 6 }} /> : null}
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

            {active === 'comments' && A.comments && (
              <CommentsPanel docId={String(id)} api={A.comments} adminSide={side === 'admin'} onCount={setComments} />
            )}
          </>
        )}
      </ScrollView>

      <FormModal visible={!!openSub} title={openSub ? `${openSub.name}’s work` : ''} onClose={() => setOpenSub(null)}>
        {openSub ? (
          <View>
            <KV label="Status" value={(STATE[openSub.state] || STATE.pending).label} />
            <KV label="Handed in" value={when(openSub.submittedAt) || '—'} />
            {openSub.marks != null ? <KV label="Marks" value={`${openSub.marks}${roster?.scores?.outOf ? ` / ${roster.scores.outOf}` : ''}`} /> : null}
            {openSub.feedback ? <KV label="Feedback" value={openSub.feedback} /> : null}
            <SectionTitle>Files</SectionTitle>
            {openSub.files?.length ? <FileList files={openSub.files} /> : <Text style={s.muted}>No files.</Text>}
          </View>
        ) : null}
      </FormModal>
    </>
  );
}

function Details({ head, side, busy, onArchive, onDelete }: {
  head: any; side: Side; busy: boolean; onArchive: () => void; onDelete: () => void;
}) {
  const subject = typeof head.subject === 'object' ? head.subject?.name : head.subject;
  const shared = Array.isArray(head.sharedWith) ? head.sharedWith.join(', ') : '';
  const sub = head.mySubmission;
  return (
    <View>
      <Card>
        {subject ? <KV label="Subject" value={subject} /> : null}
        {head.category ? <KV label="Category" value={head.category} /> : null}
        {shared ? <KV label="Shared with" value={shared} /> : null}
        {head.uploadedBy?.name ? <KV label="Shared by" value={head.uploadedBy.name} /> : null}
        <KV label={head.isAssignment ? 'Assigned on' : 'Shared on'} value={fmtDate(head.assignedOn || head.createdAt)} />
        {head.isAssignment ? <KV label="Due date" value={head.dueDate ? fmtDate(head.dueDate) : 'No due date'} /> : null}
        {head.isAssignment && head.totalMarks ? <KV label="Total marks" value={String(head.totalMarks)} /> : null}
      </Card>

      {head.description ? (
        <Card>
          <SectionTitle>About</SectionTitle>
          <Text style={s.desc}>{head.description}</Text>
        </Card>
      ) : null}

      {(side === 'student' || side === 'parent') && head.isAssignment && sub ? (
        <Card>
          <SectionTitle>{side === 'parent' ? 'Their work' : 'Your work'}</SectionTitle>
          <KV label="Status" value={sub.status === 'late' ? 'Handed in late' : 'Handed in'} />
          <KV label="Handed in" value={when(sub.submittedAt) || '—'} />
          {sub.marks != null ? <KV label="Marks" value={`${sub.marks}${head.totalMarks ? ` / ${head.totalMarks}` : ''}`} /> : null}
          {sub.feedback ? <KV label="Feedback" value={sub.feedback} /> : null}
        </Card>
      ) : null}

      <SectionTitle>Files ({head.files?.length || 0})</SectionTitle>
      {head.files?.length ? <FileList files={head.files} /> : <Text style={s.muted}>No files attached.</Text>}

      {side === 'admin' ? (
        <View style={s.adminActs}>
          {!head.isArchived ? <ActionBtn label="Archive" onPress={onArchive} disabled={busy} /> : null}
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
  adminActs: { flexDirection: 'row', gap: 8, marginTop: Spacing.lg },
});
