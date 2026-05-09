import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl,
  TextInput, TouchableOpacity,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as studentApi from '@/api/student.api';
import * as teacherApi from '@/api/teacher.api';
import ModuleDisabled from '@/components/ModuleDisabled';

export default function LibraryScreen() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<any>(null);
  const [myBooks, setMyBooks] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [tab, setTab] = useState<'browse' | 'mybooks'>('browse');

  const load = useCallback(async () => {
    try {
      const isTeacher = user?.role === 'teacher';
      const [dash, books]: [any, any] = await Promise.all([
        isTeacher ? teacherApi.getLibrary() : studentApi.getLibrary(),
        isTeacher ? teacherApi.getMyBooks() : studentApi.getMyBooks(),
      ]);
      setDashboard((dash as any)?.data ?? dash);
      setMyBooks((books as any)?.data ?? books ?? []);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.role]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res: any = user?.role === 'teacher'
        ? await teacherApi.searchLibrary(searchQuery.trim())
        : await studentApi.searchLibrary(searchQuery.trim());
      setSearchResults((res as any)?.data ?? res ?? []);
      setTab('browse');
    } catch { /* empty */ }
    finally { setSearching(false); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Library' }} />
      <ModuleDisabled />
    </>
  );

  const featuredBooks: any[] = dashboard?.featuredBooks ?? dashboard?.books ?? [];
  const stats = dashboard?.stats;

  return (
    <>
      <Stack.Screen options={{ title: 'Library' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : (
          <>
            {/* Stats banner */}
            {stats && (
              <View style={s.banner}>
                <StatItem label="Total Books" value={stats.totalBooks ?? '--'} />
                <View style={s.divider} />
                <StatItem label="Available" value={stats.availableCopies ?? '--'} />
                <View style={s.divider} />
                <StatItem label="My Books" value={myBooks.length} />
              </View>
            )}

            {/* Search */}
            <View style={s.searchRow}>
              <View style={s.searchBox}>
                <Ionicons name="search-outline" size={16} color={Colors.textLight} />
                <TextInput
                  style={s.searchInput}
                  placeholder="Search by title, author..."
                  placeholderTextColor={Colors.textLight}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onSubmitEditing={handleSearch}
                  returnKeyType="search"
                />
              </View>
              <TouchableOpacity style={s.searchBtn} onPress={handleSearch} disabled={searching}>
                {searching
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="search" size={18} color="#fff" />
                }
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={s.tabs}>
              {(['browse', 'mybooks'] as const).map((t) => (
                <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
                  <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                    {t === 'browse' ? 'Browse' : `My Books (${myBooks.length})`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ padding: Spacing.md, paddingTop: 0 }}>
              {tab === 'browse' ? (
                <>
                  {searchResults.length > 0 ? (
                    <>
                      <Text style={s.sectionLabel}>Search Results ({searchResults.length})</Text>
                      {searchResults.map((b: any, i: number) => <BookCard key={i} book={b} />)}
                    </>
                  ) : featuredBooks.length > 0 ? (
                    <>
                      <Text style={s.sectionLabel}>Available Books</Text>
                      {featuredBooks.map((b: any, i: number) => <BookCard key={i} book={b} />)}
                    </>
                  ) : (
                    <View style={s.empty}>
                      <Ionicons name="library-outline" size={48} color={Colors.textLight} />
                      <Text style={s.emptyText}>No books found</Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  {myBooks.length === 0 ? (
                    <View style={s.empty}>
                      <Ionicons name="book-outline" size={48} color={Colors.textLight} />
                      <Text style={s.emptyText}>No books currently issued</Text>
                    </View>
                  ) : (
                    myBooks.map((b: any, i: number) => <BookCard key={i} book={b} issued />)
                  )}
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

function StatItem({ label, value }: { label: string; value: any }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: '#fff' }}>{value}</Text>
      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function BookCard({ book, issued }: { book: any; issued?: boolean }) {
  const title = book.title ?? book.bookTitle ?? 'Untitled';
  const author = book.author ?? book.authorName ?? '';
  const available = book.availableCopies ?? book.available;
  const dueDate = book.dueDate ?? book.returnDate;

  return (
    <View style={bc.card}>
      <View style={bc.iconBox}>
        <Ionicons name="book" size={22} color={Colors.modules.library.icon} />
      </View>
      <View style={bc.body}>
        <Text style={bc.title} numberOfLines={1}>{title}</Text>
        {author ? <Text style={bc.meta}>{author}</Text> : null}
        {book.genre ? <Text style={bc.genre}>{book.genre}</Text> : null}
        {issued && dueDate && (
          <Text style={bc.due}>Return by: {new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
        )}
      </View>
      {!issued && available != null && (
        <View style={[bc.badge, { backgroundColor: available > 0 ? Colors.successLight : Colors.dangerLight }]}>
          <Text style={[bc.badgeText, { color: available > 0 ? Colors.success : Colors.danger }]}>
            {available > 0 ? `${available} left` : 'Unavailable'}
          </Text>
        </View>
      )}
      {issued && (
        <View style={[bc.badge, { backgroundColor: Colors.infoLight }]}>
          <Text style={[bc.badgeText, { color: Colors.info }]}>Issued</Text>
        </View>
      )}
    </View>
  );
}

const bc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: Spacing.md, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  iconBox: {
    width: 44, height: 44, borderRadius: Radius.md,
    backgroundColor: Colors.modules.library.bg, alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  body: { flex: 1 },
  title: { ...Typography.label, color: Colors.text },
  meta: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },
  genre: { fontSize: 10, color: Colors.textLight, marginTop: 2 },
  due: { fontSize: 11, color: Colors.warning, marginTop: 3, fontWeight: '500' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  badgeText: { fontSize: 10, fontWeight: '600' },
});

const s = StyleSheet.create({
  center: { alignItems: 'center', paddingTop: 80 },
  banner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary,
    margin: Spacing.md, borderRadius: Radius.xl, padding: Spacing.md,
  },
  divider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.2)' },
  searchRow: {
    flexDirection: 'row', paddingHorizontal: Spacing.md, marginBottom: Spacing.sm, gap: 8,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.sm,
  },
  searchInput: { flex: 1, paddingVertical: 10, marginLeft: 6, ...Typography.body, color: Colors.text },
  searchBtn: {
    backgroundColor: Colors.primary, paddingHorizontal: 14, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  tabs: { flexDirection: 'row', margin: Spacing.md, marginTop: Spacing.sm, gap: 8 },
  tab: {
    flex: 1, paddingVertical: 9, borderRadius: Radius.md,
    backgroundColor: Colors.surface, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText: { ...Typography.label, color: Colors.textSecondary },
  tabTextActive: { color: '#fff' },
  sectionLabel: { ...Typography.h4, color: Colors.text, marginBottom: 10 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { ...Typography.body, color: Colors.textSecondary },
});
