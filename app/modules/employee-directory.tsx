import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as dirApi from '@/api/employeeDirectory.api';
import { BASE_URL } from '@/api/axios';
import {
  unwrap, LoaderView, Empty, Badge, SearchBar, Select, StatTile, StatRow, fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

// One screen for two audiences. A school admin (and a teacher whose designation
// grants administrative access) additionally sees the dashboard counters; every
// directory user gets the searchable staff list. Which fields come back is the
// server's decision, so nothing here branches on role for data.

const UPLOADS_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');
const photoUrl = (p?: string) => (!p ? '' : /^https?:/.test(p) ? p : `${UPLOADS_ORIGIN}${p}`);

const STATUS_TONE: Record<string, any> = { active: 'success', on_leave: 'warning', inactive: 'neutral' };
const STATUS_LABEL: Record<string, string> = { active: 'Active', on_leave: 'On Leave', inactive: 'Inactive' };


// Deliberately just these: the directory is a lookup, and every other filter it
// could offer keys on data the normal tier never receives.
//
// `accountStatus` starts at 'active' — an inactive account is one pick away, and
// Clear returns here rather than to "everyone", so the list keeps its meaning.
const EMPTY_FILTERS: Record<string, string> = { designation: '', accountStatus: 'active' };

const ACCOUNT_STATUS_OPTIONS = [
  { label: 'Active teachers',   value: 'active' },
  { label: 'Inactive teachers', value: 'inactive' },
  { label: 'All teachers',      value: 'all' },
];

// The page sizes the list offers, matching the web directory.
const PAGE_SIZES = [5, 10, 15, 20];

export function Avatar({ name, src, size = 42 }: { name?: string; src?: string; size?: number }) {
  const initials = String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0]).join('').toUpperCase();
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[s.avatarText, { fontSize: size * 0.38 }]}>{initials || '?'}</Text>
    </View>
  );
}

export default function EmployeeDirectoryScreen() {
  const router = useRouter();

  const [meta,      setMeta]      = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [pages,     setPages]     = useState(1);

  const [search,   setSearch]   = useState('');
  const [term,     setTerm]     = useState('');
  const [filters,  setFilters]  = useState(EMPTY_FILTERS);
  const [sortBy,   setSortBy]   = useState('name');
  const [limit,     setLimit]   = useState(10);

  const [loading,    setLoading]    = useState(true);
  const [listBusy,   setListBusy]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState('');
  // Kept apart from `error`: a failed /meta means the screen cannot render at
  // all, and must not be mistaken for "this school has no employees".
  const [fatal, setFatal] = useState<{ message: string; code?: string } | null>(null);

  const params = useMemo(() => {
    const p: any = { sortBy };
    if (term) p.search = term;
    Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v; });
    return p;
  }, [term, filters, sortBy]);

  // Debounce the search box so a keystroke does not become a request.
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadMeta = useCallback(async () => {
    try {
      const m = unwrap(await dirApi.getMeta());
      setMeta(m);
      setFatal(null);
      if (m?.viewer?.isAdmin) {
        try { setDashboard(unwrap(await dirApi.getDashboard())); } catch { /* not fatal */ }
      }
    } catch (e: any) {
      setFatal({ message: e?.message || 'Could not open the directory', code: e?.data?.code });
    }
  }, []);

  const loadList = useCallback(async () => {
    setListBusy(true);
    try {
      const res = unwrap(await dirApi.getEmployees({ ...params, page, limit }));
      setEmployees(res?.employees || []);
      setTotal(res?.total || 0);
      setPages(res?.pages || 1);
      setError('');
    } catch (e: any) { setError(e?.message || 'Could not load employees'); }
    finally { setListBusy(false); setLoading(false); setRefreshing(false); }
  }, [params, page, limit]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadList(); }, [loadList]);

  const setFilter = (k: string, v: string) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };
  const reset = () => { setFilters(EMPTY_FILTERS); setSearch(''); setTerm(''); setSortBy('name'); setPage(1); };

  if (loading && !fatal) return (<><Stack.Screen options={{ title: 'Employee Directory' }} /><LoaderView /></>);

  if (fatal) {
    const blocked = fatal.code && MODULE_BLOCKED_CODES.includes(fatal.code);
    return (
      <>
        <Stack.Screen options={{ title: 'Employee Directory' }} />
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <Empty icon={blocked ? 'lock-closed-outline' : 'cloud-offline-outline'} text={fatal.message} />
          {!blocked && (
            <TouchableOpacity style={s.retry} onPress={() => { setLoading(true); loadMeta().then(loadList); }}>
              <Text style={s.retryText}>Try again</Text>
            </TouchableOpacity>
          )}
        </View>
      </>
    );
  }

  const opts = meta?.filters || {};
  const isAdmin = !!meta?.viewer?.isAdmin;
  const t = dashboard?.totals || {};
  const activeCount = Object.entries(filters).filter(([k, v]) => v && v !== EMPTY_FILTERS[k]).length;

  const opt = (list: any[], labelKey = 'label', valueKey = '_id') =>
    [{ label: 'All', value: '' }, ...(list || []).map((x: any) =>
      (typeof x === 'string' ? { label: x, value: x } : { label: x[labelKey], value: x[valueKey] }))];

  return (
    <>
      <Stack.Screen options={{ title: 'Employee Directory' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadMeta(); loadList(); }} />}
      >
        {/* Counters — administrative view only, straight from the employee records */}
        {isAdmin && dashboard && (
          <>
            <StatRow>
              <StatTile label="Employees" value={t.employees ?? 0} icon="people" tone="info" />
              <StatTile label="Active" value={t.active ?? 0} icon="checkmark-circle" tone="success" />
              <StatTile label="On Leave" value={t.onLeave ?? 0} icon="airplane" tone="warning" />
            </StatRow>
            <StatRow>
              <StatTile label="Teaching" value={t.teaching ?? 0} icon="school" tone="info" />
              <StatTile label="Non-Teaching" value={t.nonTeaching ?? 0} icon="construct" tone="neutral" />
              <StatTile label="Inactive" value={t.inactive ?? 0} icon="close-circle" tone="danger" />
            </StatRow>
            <StatRow>
              <StatTile label="Incomplete" value={t.incompleteProfiles ?? 0} icon="document-text" tone="warning" />
              <StatTile label="To Verify" value={t.pendingVerification ?? 0} icon="shield-checkmark" tone="warning" />
              <StatTile label="Docs Missing" value={t.documentsNeedAttention ?? 0} icon="alert-circle" tone="danger" />
            </StatRow>
          </>
        )}

        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Name, ID, email, phone, subject, class…"
        />

        <Select
          label="Designation"
          value={filters.designation}
          options={opt(opts.designations)}
          onChange={v => setFilter('designation', v)}
        />

        <Select
          label="Status"
          value={filters.accountStatus}
          options={ACCOUNT_STATUS_OPTIONS}
          onChange={v => setFilter('accountStatus', v)}
        />

        <View style={s.filterBar}>
          {(activeCount > 0 || term) && (
            <TouchableOpacity style={s.filterBtn} onPress={reset}>
              <Ionicons name="close" size={15} color={Colors.danger} />
              <Text style={[s.filterBtnText, { color: Colors.danger }]}>Clear</Text>
            </TouchableOpacity>
          )}
          <Text style={s.countText}>{total} result{total === 1 ? '' : 's'}</Text>
        </View>

        {error ? (
          <View>
            <Empty icon="cloud-offline-outline" text={error} />
            <TouchableOpacity style={s.retry} onPress={loadList}><Text style={s.retryText}>Try again</Text></TouchableOpacity>
          </View>
        ) : listBusy && employees.length === 0 ? (
          <View style={{ paddingVertical: 40 }}><ActivityIndicator color={Colors.primary} /></View>
        ) : employees.length === 0 ? (
          <Empty
            icon={term || activeCount ? 'search-outline' : 'people-outline'}
            text={term || activeCount
              ? 'No employees match your search criteria. Try changing your filters.'
              : 'No employees found.'}
          />
        ) : (
          employees.map(e => (
            <TouchableOpacity
              key={e._id}
              style={s.card}
              activeOpacity={0.75}
              onPress={() => router.push(`/modules/employee-directory-detail?id=${e._id}` as any)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <Avatar name={e.name} src={photoUrl(e.profileImage)} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.name} numberOfLines={1}>{e.name}</Text>
                  <Text style={s.sub} numberOfLines={1}>
                    {[e.employeeId, e.designation].filter(Boolean).join(' · ') || 'No designation'}
                  </Text>
                </View>
                {!!e.employmentStatus && (
                  <Badge label={STATUS_LABEL[e.employmentStatus]} tone={STATUS_TONE[e.employmentStatus]} />
                )}
              </View>

              <View style={s.metaGrid}>
                {!!e.department && <Text style={s.meta}>🏢 {e.department}</Text>}
                {!!e.staffType && (
                  <Text style={s.meta}>{e.staffType === 'teaching' ? '👨‍🏫 Teaching' : '🧰 Non-Teaching'}</Text>
                )}
                {!!e.joiningDate && <Text style={s.meta}>📅 {fmtDate(e.joiningDate)}</Text>}
              </View>
              {(e.subjects || []).length > 0 && (
                <Text style={s.meta} numberOfLines={1}>📚 {e.subjects.join(', ')}</Text>
              )}
              {(e.classes || []).length > 0 && (
                <Text style={s.meta} numberOfLines={1}>🏛 {e.classes.map((c: any) => c.label).join(', ')}</Text>
              )}
              {e.isClassTeacher && <View style={{ alignSelf: 'flex-start', marginTop: 4 }}><Badge label="Class Teacher" tone="info" /></View>}
              <Text style={s.contact} numberOfLines={1}>✉️ {e.officialEmail}{e.officialPhone ? `  ·  📞 ${e.officialPhone}` : ''}</Text>
            </TouchableOpacity>
          ))
        )}

        {(total > PAGE_SIZES[0] || pages > 1) && (
          <View style={s.pageSizeRow}>
            <Text style={s.pageSizeLabel}>Show</Text>
            {PAGE_SIZES.map(n => (
              <TouchableOpacity
                key={n}
                style={[s.pageSizeBtn, limit === n && s.pageSizeBtnOn]}
                onPress={() => { setLimit(n); setPage(1); }}
              >
                <Text style={[s.pageSizeText, limit === n && s.pageSizeTextOn]}>{n}</Text>
              </TouchableOpacity>
            ))}
            <Text style={s.pageSizeLabel}>per page</Text>
          </View>
        )}

        {pages > 1 && (
          <View style={s.pager}>
            <TouchableOpacity disabled={page <= 1} style={[s.pageBtn, page <= 1 && s.pageBtnOff]} onPress={() => setPage(p => p - 1)}>
              <Ionicons name="chevron-back" size={16} color={page <= 1 ? Colors.textLight : Colors.primary} />
            </TouchableOpacity>
            <Text style={s.pageText}>Page {page} of {pages}</Text>
            <TouchableOpacity disabled={page >= pages} style={[s.pageBtn, page >= pages && s.pageBtnOff]} onPress={() => setPage(p => p + 1)}>
              <Ionicons name="chevron-forward" size={16} color={page >= pages ? Colors.textLight : Colors.primary} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  avatar: { backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md,
    marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border, gap: 4,
  },
  name: { fontSize: 15, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  meta: { fontSize: 12, color: Colors.textSecondary },
  contact: { fontSize: 11.5, color: Colors.textLight, marginTop: 6 },
  filterBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
  },
  filterBtnText: { fontSize: 12.5, color: Colors.primary, fontWeight: '600' },
  countText: { marginLeft: 'auto', fontSize: 12, color: Colors.textSecondary },
  filterPanel: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md,
    marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  note: { fontSize: 11.5, color: Colors.textLight, marginTop: 4 },
  pageSizeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: Spacing.md, flexWrap: 'wrap',
  },
  pageSizeLabel: { fontSize: 12, color: Colors.textSecondary },
  pageSizeBtn: {
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  pageSizeBtnOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pageSizeText: { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary },
  pageSizeTextOn: { color: '#fff' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.md, marginTop: Spacing.md },
  pageBtn: {
    padding: 9, borderRadius: Radius.md, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  pageBtnOff: { opacity: 0.45 },
  pageText: { fontSize: 13, color: Colors.text, fontWeight: '600' },
  retry: {
    alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: Colors.primary, borderRadius: Radius.md, marginTop: Spacing.sm,
  },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
