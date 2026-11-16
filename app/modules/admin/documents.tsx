/**
 * The office's Documents list on the phone (Nov 2026 rebuild) — the same
 * server-side list the web page reads (school-frontend pages/admin/Documents.jsx):
 * its tabs, its search and its year filter, a page at a time.
 *
 * It used to load the newest fifty and stop, with no search and no tabs, a
 * badge that read "active" on every row, and no way to reach — or bring back —
 * anything that had been archived. Sharing a document was web-only.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View, ScrollView, RefreshControl, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Colors, Radius, Spacing } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, RowItem, Badge, FAB, SegTabs, SearchBar, Select, fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import { ShareSheet } from '@/components/documents/ShareSheet';

const PAGE = 20;

const TYPE_LABEL: Record<string, string> = {
  assignment: 'Assignment', notice: 'Notice', circular: 'Circular', study_material: 'Study material', other: 'Other',
};

export default function AdminDocumentsScreen() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [over, setOver] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [failed, setFailed] = useState('');

  const [tab, setTab] = useState('all');
  // null until the summary says which year is current; '' is "all years".
  const [year, setYear] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');

  const [sharing, setSharing] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 350); return () => clearTimeout(t); }, [search]);

  const query = useCallback((pg: number) => ({
    tab, page: pg, limit: PAGE, search: term || undefined, academicYear: year || 'all',   // '' is "All years" here; the list's own default is the year in view
  }), [tab, term, year]);

  const loadSummary = useCallback(async () => {
    try {
      const d = unwrap(await adminApi.getDocumentOverview());
      setOver(d);
      setYear((y) => (y === null ? (d?.academicYears || []).find((a: any) => a.status === 'active')?._id || '' : y));
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      setYear((y) => (y === null ? '' : y));
    }
  }, []);

  const load = useCallback(async () => {
    if (year === null) return;
    try {
      const r: any = await adminApi.getDocuments(query(1));
      setRows(Array.isArray(r?.data) ? r.data : []);
      setTotal(r?.total || 0);
      setPage(1);
      setFailed('');
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else setFailed(err?.data?.message || err?.message || 'The documents could not be loaded');
    } finally { setLoading(false); setRefreshing(false); }
  }, [query, year]);

  // Again on coming back — a document archived or deleted on its own page.
  useFocusEffect(useCallback(() => { loadSummary(); }, [loadSummary]));
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadMore = async () => {
    setMore(true);
    try {
      const r: any = await adminApi.getDocuments(query(page + 1));
      setRows((x) => [...x, ...(Array.isArray(r?.data) ? r.data : [])]);
      setPage(page + 1);
    } catch (e: any) { Alert.alert('Could not load more', e?.data?.message || e?.message || ''); }
    finally { setMore(false); }
  };

  const startShare = async () => {
    try {
      const [c, k] = await Promise.all([adminApi.getDocumentClasses(), adminApi.getDocumentCategories()]);
      setClasses(unwrap(c) || []);
      setCategories((unwrap(k) || []).map((x: any) => x.name ?? x));
    } catch { /* the form opens with what it has */ }
    // On its own, so a school with no teachers yet still gets its classes.
    adminApi.getDocumentTeachers().then((t: any) => setTeachers(unwrap(t) || [])).catch(() => {});
    setSharing(true);
  };

  const counts = over?.counts || {};
  const tabs = useMemo(() => [
    { key: 'all', label: 'All' },
    { key: 'assignments', label: 'Assignments' },
    { key: 'notices', label: 'Notices' },
    { key: 'study', label: 'Study material' },
    // Put away, not gone: listed here so it can be opened and restored.
    ...(counts.archived > 0 || tab === 'archived' ? [{ key: 'archived', label: `Archived (${counts.archived || 0})` }] : []),
  ], [counts.archived, tab]);

  if (disabled) return (<><Stack.Screen options={{ title: 'Documents' }} /><ModuleDisabled /></>);

  return (
    <>
      <Stack.Screen options={{ title: 'Documents' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadSummary(); load(); }} tintColor={Colors.primary} />}
      >
        <SegTabs tabs={tabs} active={tab} onChange={(v) => { setTab(v); setLoading(true); }} />
        <SearchBar value={search} onChange={setSearch} placeholder="Search documents…" />
        {(over?.academicYears || []).length > 0 && (
          <Select label="Academic year" value={year || ''}
            options={[
              { value: '', label: 'All academic years' },
              ...(over.academicYears as any[]).map((y) => ({ value: String(y._id), label: `${y.name}${y.status === 'active' ? ' (current)' : ''} · ${y.count}` })),
              ...(over.unfiledYear > 0 ? [{ value: 'none', label: `No academic year · ${over.unfiledYear}` }] : []),
            ]}
            onChange={(v) => { setYear(v); setLoading(true); }} />
        )}

        {loading ? <LoaderView /> : failed ? (
          <Empty icon="cloud-offline-outline" text={failed} />
        ) : rows.length === 0 ? (
          <Empty icon="folder-open-outline" text={term || tab !== 'all' ? 'No documents match that' : 'No documents in this year yet'} />
        ) : (
          <>
            <Text style={s.count}>Showing {rows.length} of {total} document{total === 1 ? '' : 's'}</Text>
            {rows.map((doc: any) => (
              <RowItem
                key={doc._id}
                icon={doc.isAssignment ? 'document-text' : 'document'} iconColor="#EA580C" iconBg="#FFEDD5"
                title={doc.title ?? 'Document'}
                sub={[doc.sharedWith?.label, fmtDate(doc.createdAt), doc.uploadedBy?.name ? `by ${doc.uploadedBy.name}` : ''].filter(Boolean).join(' · ')}
                // What it is, or that it has been put away — this read "active" on every row.
                right={<Badge label={doc.isDraft ? 'Draft' : doc.isArchived ? 'Archived' : (TYPE_LABEL[doc.docType] || 'Document')}
                  tone={doc.isDraft ? 'warning' : doc.isArchived ? 'neutral' : 'info'} />}
                onPress={() => router.push({ pathname: '/modules/document-detail', params: { id: String(doc._id), as: 'admin' } })}
              />
            ))}
            {rows.length < total && (
              <TouchableOpacity style={s.more} onPress={loadMore} disabled={more} accessibilityRole="button">
                <Text style={s.moreText}>{more ? 'Loading…' : `Show more (${total - rows.length} not shown)`}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>

      <FAB icon="add" label="Share a document" onPress={startShare} />
      <ShareSheet visible={sharing} mode="admin" classes={classes} teachers={teachers} categories={categories}
        onClose={() => setSharing(false)} send={adminApi.uploadDocument}
        onDone={() => { setSharing(false); loadSummary(); load(); }} />
    </>
  );
}

const s = StyleSheet.create({
  count: { fontSize: 12, color: Colors.textSecondary, marginBottom: 8 },
  more: { alignItems: 'center', padding: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, marginTop: 6 },
  moreText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
});
