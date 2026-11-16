/**
 * Documents, for a teacher, a student or a parent (Nov 2026 rebuild) — the
 * phone's counterpart of the web's three reader pages (school-frontend
 * pages/{teacher,student,parent}/Documents.jsx).
 *
 * The same shelf the web reads, from the same endpoints: the tabs, a search,
 * the academic year, what is new, and where each piece of set work stands.
 * The server narrows, counts and pages it — a page of thirty at a time.
 * A parent picks whose shelf is on screen; a teacher switches between what was
 * shared with them and what they shared, and can share from here.
 *
 * It used to be a bare list: every card drew the same icon (it read `doc.type`,
 * a field that does not exist), the download button opened ".../[object Object]"
 * (it was handed the file's record, not its address), a network error read
 * "No documents available", and opening anything here never marked it read.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as studentApi from '@/api/student.api';
import * as teacherApi from '@/api/teacher.api';
import * as parentApi from '@/api/parent.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Badge, Empty, FAB, LoaderView, SearchBar, SegTabs, Select, MODULE_BLOCKED_CODES, fmtDate } from '@/components/ui/kit';
import { openDocFile } from '@/components/documents/commentParts';
import { ShareSheet } from '@/components/documents/ShareSheet';

const TYPE: Record<string, { label: string; icon: string; bg: string; color: string }> = {
  assignment:     { label: 'Assignment',     icon: 'document-text', bg: '#EDE9FE', color: '#7C3AED' },
  notice:         { label: 'Notice',         icon: 'megaphone',     bg: '#E0E7FF', color: '#4338CA' },
  circular:       { label: 'Circular',       icon: 'newspaper',     bg: '#DBEAFE', color: '#2563EB' },
  study_material: { label: 'Study material', icon: 'book',          bg: '#F3E8FF', color: '#9333EA' },
  other:          { label: 'Other',          icon: 'folder',        bg: '#F1F5F9', color: '#475569' },
};

const STATE: Record<string, { label: string; tone: any }> = {
  pending:   { label: 'To do',          tone: 'warning' },
  submitted: { label: 'Submitted',      tone: 'success' },
  late:      { label: 'Submitted late', tone: 'warning' },
  marked:    { label: 'Marked',         tone: 'info' },
  missed:    { label: 'Missed',         tone: 'danger' },
  closed:    { label: 'Closed',         tone: 'neutral' },
};

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'notices', label: 'Notices' },
  { key: 'study', label: 'Study material' },
];

const PAGE = 30;

/** "Due in 3 days" / "Overdue by 2 days" — the sentence a student actually reads. */
function dueLine(iso?: string, state?: string | null) {
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(due) - day(new Date())) / 86400000);
  if (state && state !== 'pending' && state !== 'missed') return { text: `Due ${fmtDate(iso)}`, urgent: false };
  if (days < 0) return { text: `Overdue by ${-days} day${days === -1 ? '' : 's'}`, urgent: true };
  if (days === 0) return { text: 'Due today', urgent: true };
  if (days === 1) return { text: 'Due tomorrow', urgent: true };
  if (days <= 7) return { text: `Due in ${days} days`, urgent: false };
  return { text: `Due ${fmtDate(iso)}`, urgent: false };
}

export default function DocumentsScreen() {
  const { user } = useAuth();
  const role = user?.role === 'teacher' ? 'teacher' : user?.role === 'parent' ? 'parent' : 'student';
  const api: any = role === 'teacher' ? teacherApi : role === 'parent' ? parentApi : studentApi;

  const [res, setRes] = useState<any>(null);      // the last answer: figures, years, children…
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [failed, setFailed] = useState('');

  const [year, setYear] = useState('');            // '' = this year, 'all', or a year's id
  const [tab, setTab] = useState('all');
  const [scope, setScope] = useState('shared');    // teacher only
  const [who, setWho] = useState('');              // parent only: '' = all children
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [seen, setSeen] = useState<string[]>([]);  // opened on this visit
  const [sharing, setSharing] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  // Typing settles before the shelf is asked again.
  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 350); return () => clearTimeout(t); }, [search]);

  const query = useCallback((page: number, limit = PAGE) => ({
    page, limit,
    ...(year ? { year } : {}),
    ...(tab !== 'all' ? { tab } : {}),
    ...(term ? { search: term } : {}),
    ...(role === 'teacher' ? { scope } : {}),
    ...(role === 'parent' && who ? { child: who } : {}),
  }), [year, tab, term, scope, who, role]);

  const held = useRef(0);
  held.current = rows.length;
  const turn = useRef(0);

  // `keep` re-reads what is already on screen (coming back from a document);
  // otherwise the list starts again from its first page.
  const load = useCallback(async (keep = false) => {
    if (!user?.role) return;
    const mine = ++turn.current;
    try {
      const r: any = await api.getDocuments(query(1, keep ? Math.min(100, Math.max(PAGE, held.current)) : PAGE));
      if (mine !== turn.current) return;
      setRes(r);
      setRows(Array.isArray(r?.data) ? r.data : []);
      setFailed('');
    } catch (err: any) {
      if (mine !== turn.current) return;
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      // Said as what it is: "No documents" for a dropped connection sent
      // people looking for documents that were there all along.
      else setFailed(err?.data?.message || err?.message || 'The documents could not be loaded');
    } finally { if (mine === turn.current) { setLoading(false); setRefreshing(false); } }
  }, [user?.role, query]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setLoading(true); load(false); }, [load]);
  // Again on coming back — a document opened, handed in or deleted on its own page.
  const first = useRef(true);
  useFocusEffect(useCallback(() => {
    if (first.current) { first.current = false; return; }
    load(true);
  }, [load]));

  const loadMore = async () => {
    const mine = turn.current;
    setMore(true);
    try {
      const r: any = await api.getDocuments(query(Math.floor(rows.length / PAGE) + 1));
      if (mine !== turn.current) return;
      setRows((x) => {
        const have = new Set(x.map((d) => String(d._id)));
        return [...x, ...(Array.isArray(r?.data) ? r.data : []).filter((d: any) => !have.has(String(d._id)))];
      });
    } catch (e: any) { Alert.alert('Could not load more', e?.data?.message || e?.message || ''); }
    finally { setMore(false); }
  };

  const children: any[] = res?.children || [];
  const years: any[] = res?.years || [];
  const sections: any[] = res?.sections || [];
  const total: number = res?.total ?? rows.length;

  const list = useMemo(() => rows
    .map((d: any) => (d.isRead === false && seen.includes(String(d._id)) ? { ...d, isRead: true } : d))
    .map((d: any) => (role === 'parent' && who ? { ...d, state: d.perChild?.[who]?.state ?? null } : d)),
  [rows, seen, role, who]);

  // Everything unread under these filters — the server's list, less what has
  // been opened since — not just the page on screen.
  const unread: string[] = (res?.unreadIds || []).map(String).filter((id: string) => !seen.includes(id));

  const open = (d: any) => {
    if (d.isRead === false) {
      setSeen((x) => [...x, String(d._id)]);
      api.markDocumentRead?.(String(d._id)).catch(() => {});
    }
    router.push({ pathname: '/modules/document-detail', params: { id: String(d._id) } });
  };

  const readAll = async () => {
    const ids = unread;
    try { await api.markDocumentsRead(ids); setSeen((x) => [...x, ...ids]); }
    catch (e: any) { Alert.alert('Could not mark them read', e?.data?.message || e?.message || ''); }
  };

  const startShare = async () => {
    if (!categories.length) {
      try {
        const c: any = await teacherApi.getDocumentCategories();
        setCategories(((c?.data ?? c) || []).map((x: any) => x.name ?? x));
      } catch { /* the form says there are none */ }
    }
    setSharing(true);
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Documents' }} /><ModuleDisabled /></>);

  const nameOf = (id: string) => String(children.find((c) => String(c._id) === id)?.name || 'Child').split(' ')[0];

  return (
    <>
      <Stack.Screen options={{ title: 'Documents' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(false); }} tintColor={Colors.primary} />}
      >
        {loading && !res ? <LoaderView /> : failed && !res ? (
          <View>
            <Empty icon="cloud-offline-outline" text={failed} />
            <TouchableOpacity style={s.retry} onPress={() => { setLoading(true); load(false); }} accessibilityRole="button">
              <Text style={s.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {role === 'teacher' && (
              <SegTabs active={scope} onChange={setScope}
                tabs={[
                  { key: 'shared', label: `Shared with me (${res?.counts?.shared ?? 0})` },
                  { key: 'mine', label: `My uploads (${res?.counts?.mine ?? 0})` },
                ]} />
            )}

            {/* Whose shelf — only when there is more than one child to choose between. */}
            {role === 'parent' && children.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}
                contentContainerStyle={{ gap: 8 }}>
                {[{ _id: '', name: 'All children' }, ...children].map((c) => {
                  const on = who === String(c._id);
                  const n = c._id ? (res?.perChild?.[c._id]?.all ?? 0) : (res?.counts?.all ?? 0);
                  return (
                    <TouchableOpacity key={String(c._id) || 'all'} style={[s.kid, on && s.kidOn]}
                      onPress={() => setWho(String(c._id))}
                      accessibilityRole="button" accessibilityState={{ selected: on }}>
                      <Text style={[s.kidName, on && { color: Colors.primary }]}>{c.name}</Text>
                      {c.className ? <Text style={s.kidSub}>{c.className}</Text> : null}
                      <Text style={s.kidCount}>{n}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <SegTabs tabs={TABS} active={tab} onChange={setTab} />
            <SearchBar value={search} onChange={setSearch} placeholder="Search documents…" />
            {years.length > 1 && (
              <Select label="Academic year" value={year}
                options={[{ value: '', label: 'This year' }, { value: 'all', label: 'All years' },
                  ...years.map((y) => ({ value: String(y._id), label: y.name }))]}
                onChange={setYear} />
            )}

            {unread.length > 0 && (role !== 'teacher' || scope === 'shared') && (
              <View style={s.unread}>
                <View style={s.dot} />
                <Text style={s.unreadText}>{unread.length} unread</Text>
                <TouchableOpacity onPress={readAll} accessibilityRole="button">
                  <Text style={s.link}>Mark all as read</Text>
                </TouchableOpacity>
              </View>
            )}

            {loading ? <LoaderView /> : !list.length ? (
              <Empty icon="folder-open-outline"
                text={search || tab !== 'all' ? 'No documents match that' : 'Nothing has been shared here yet'} />
            ) : list.map((doc) => {
              const cfg = TYPE[doc.docType] || TYPE.other;
              const st = doc.state ? STATE[doc.state] : null;
              const due = doc.isAssignment ? dueLine(doc.dueDate, doc.state) : null;
              const isNew = doc.isRead === false;
              // Each child's own standing, when all of them are on screen and it differs.
              const kids = role === 'parent' && !who && children.length > 1
                ? (doc.forChildren || []).filter((id: string) => doc.forChildren.length !== children.length || doc.perChild?.[id]?.state)
                : [];
              return (
                // The card opens the document — its files, details and comments;
                // the download button beside it fetches the first file straight
                // away. Two buttons side by side, not one inside the other.
                <View key={String(doc._id)} style={[s.card, isNew && s.cardNew]}>
                <TouchableOpacity style={s.cardMain} activeOpacity={0.7}
                  onPress={() => open(doc)} accessibilityRole="button"
                  accessibilityLabel={`Open ${doc.title}${isNew ? ', unread' : ''}`}>
                  <View style={[s.iconBox, { backgroundColor: cfg.bg }]}>
                    <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
                  </View>
                  <View style={s.body}>
                    <Text style={s.docTitle} numberOfLines={2}>
                      {isNew ? <Text style={s.newTag}>NEW  </Text> : null}{doc.title}
                    </Text>
                    <Text style={s.docMeta} numberOfLines={1}>
                      {[cfg.label, doc.subject, doc.sharedWith?.label, fmtDate(doc.createdAt)].filter(Boolean).join(' · ')}
                    </Text>
                    <View style={s.badges}>
                      {st ? <Badge label={st.label} tone={st.tone} /> : null}
                      {doc.isDraft ? <Badge label="Draft" tone="warning" /> : null}
                      {doc.isArchived ? <Badge label="Archived" tone="neutral" /> : null}
                      {role === 'teacher' && doc.mine && doc.isAssignment
                        ? <Badge label={`${doc.markedCount}/${doc.submissionCount} marked`} tone={doc.submissionCount > doc.markedCount ? 'warning' : 'success'} />
                        : null}
                      {kids.map((id: string) => {
                        const k = doc.perChild?.[id]?.state ? STATE[doc.perChild[id].state] : null;
                        return <Badge key={id} label={k ? `${nameOf(id)}: ${k.label}` : nameOf(id)} tone={k?.tone || 'neutral'} />;
                      })}
                    </View>
                    {due ? <Text style={[s.due, due.urgent && { color: Colors.danger }]}>{due.text}</Text> : null}
                  </View>
                </TouchableOpacity>
                  {doc.files?.length > 0 && (
                    <TouchableOpacity onPress={() => openDocFile(doc.files[0])} style={s.downloadBtn} hitSlop={6}
                      accessibilityRole="button" accessibilityLabel={`Open ${doc.files[0].originalName || 'the file'}`}>
                      <Ionicons name="download-outline" size={18} color={Colors.primary} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}

            {total > list.length && (
              <TouchableOpacity style={s.retry} onPress={loadMore} disabled={more} accessibilityRole="button">
                <Text style={s.retryText}>{more ? 'Loading…' : `Show more (${total - list.length} not shown)`}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>

      {role === 'teacher' && !loading && sections.length > 0 && (
        <FAB icon="add" label="Share a document" onPress={startShare} />
      )}
      {role === 'teacher' && (
        <ShareSheet visible={sharing} mode="teacher" sections={sections} categories={categories}
          onClose={() => setSharing(false)} send={teacherApi.uploadDocument}
          onDone={() => { setSharing(false); setScope('mine'); load(false); }} />
      )}
    </>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: Spacing.md, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardNew: { borderColor: '#C7D2FE', backgroundColor: '#FAFAFF' },
  cardMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start' },
  iconBox: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  body: { flex: 1, minWidth: 0 },
  docTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  newTag: { fontSize: 10, fontWeight: '800', color: '#4338CA' },
  docMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  due: { fontSize: 11, color: Colors.textSecondary, marginTop: 5, fontWeight: '600' },
  downloadBtn: { padding: 6, marginLeft: 4 },
  unread: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4F46E5' },
  unreadText: { fontSize: 12, fontWeight: '700', color: Colors.text, flex: 1 },
  link: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  retry: { alignItems: 'center', padding: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, marginTop: 6 },
  retryText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  kid: {
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.border, backgroundColor: Colors.surface, minWidth: 96,
  },
  kidOn: { borderColor: Colors.primary, backgroundColor: '#EDE9FE' },
  kidName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  kidSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  kidCount: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, marginTop: 3 },
});
