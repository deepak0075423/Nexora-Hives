import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as libApi from '@/api/library.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, RowItem, SearchBar, FAB, FormModal, Input,
  confirmAsync, Badge,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

export default function LibraryBooksScreen() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', isbn: '', authors: '', publisher: '', category: '' });

  const load = async (p = 1, q = search) => {
    try {
      const res: any = await libApi.getBooks({ page: p, limit: 20, q });
      const rows = (res as any)?.data ?? [];
      if (p === 1) setList(rows); else setList(prev => [...prev, ...rows]);
      setTotal((res as any)?.total ?? rows.length);
      setPage(p);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code) || err?.status === 403) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(1, ''); }, []);
  useEffect(() => {
    const t = setTimeout(() => { setLoading(true); load(1, search); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const openCopies = (b: any) =>
    router.push({ pathname: '/modules/library-admin/book-copies', params: { id: b._id, title: b.title } });

  const handleDelete = async (b: any) => {
    if (!(await confirmAsync('Delete Book', `Delete "${b.title}"?`, 'Delete'))) return;
    try { await libApi.deleteBook(b._id); load(1); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const submit = async () => {
    if (!form.title.trim()) return Alert.alert('Required', 'Title is required');
    setSaving(true);
    try {
      const res: any = await libApi.createBook({
        title: form.title.trim(), isbn: form.isbn,
        authors: form.authors.split(',').map(a => a.trim()).filter(Boolean),
        publisher: form.publisher, category: form.category,
      });
      setShowForm(false);
      setForm({ title: '', isbn: '', authors: '', publisher: '', category: '' });
      load(1);
      const bookId = (res as any)?.data?._id;
      Alert.alert(
        'Book added',
        'It has no physical copies yet, so it cannot be issued or reserved.',
        bookId
          ? [{ text: 'Later', style: 'cancel' },
             { text: 'Add copies', onPress: () => openCopies({ _id: bookId, title: form.title.trim() }) }]
          : [{ text: 'OK' }],
      );
    } catch (err: any) {
      // The server refuses a title that is already catalogued and says which
      // one, so the next step is adding copies to it rather than retyping it.
      if (err?.data?.code === 'DUPLICATE_BOOK') {
        const existing = err.data.data;
        setShowForm(false);
        Alert.alert('Already in the catalogue', err.message, [
          { text: 'Close', style: 'cancel' },
          { text: 'Add copies to it', onPress: () => openCopies({ _id: existing.existingBookId, title: existing.title }) },
        ]);
        return;
      }
      Alert.alert('Error', err.message);
    }
    finally { setSaving(false); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Books' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: `Books (${total})` }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1); }} tintColor={Colors.primary} />}
        >
          <SearchBar value={search} onChange={setSearch} placeholder="Search title or ISBN…" />
          {loading ? <LoaderView /> : list.length === 0 ? (
            <Empty icon="book-outline" text="No books in the catalogue" />
          ) : (
            <>
              {list.map((b: any) => (
                <RowItem
                  key={b._id}
                  icon="book" iconColor="#059669" iconBg="#D1FAE5"
                  title={b.title}
                  sub={`${(b.authors ?? []).join(', ') || 'Unknown author'}${b.isbn ? ` · ISBN ${b.isbn}` : ''}${b.category ? ` · ${b.category}` : ''}`}
                  right={
                    (b.totalCopies ?? 0) === 0
                      ? <Badge label="No copies" tone="warning" />
                      : <Badge label={`${b.availableCopies ?? 0}/${b.totalCopies ?? 0} avail`} tone={(b.availableCopies ?? 0) > 0 ? 'success' : 'danger'} />
                  }
                  onPress={() => {
                    Alert.alert(b.title, `${(b.authors ?? []).join(', ')}`, [
                      { text: 'Close', style: 'cancel' },
                      { text: 'Manage copies', onPress: () => openCopies(b) },
                      { text: 'Delete', style: 'destructive', onPress: () => handleDelete(b) },
                    ]);
                  }}
                />
              ))}
              {list.length < total && (
                <TouchableOpacity onPress={() => load(page + 1)} style={{ padding: 14, alignItems: 'center' }}>
                  <Text style={{ color: Colors.accent, fontWeight: '600', fontSize: 13 }}>Load more ({list.length}/{total})</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
        <FAB onPress={() => setShowForm(true)} />
      </View>

      <FormModal visible={showForm} title="Add Book" onClose={() => setShowForm(false)} onSubmit={submit} submitting={saving} submitLabel="Add Book">
        <Input label="Title *" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="Book title" />
        <Input label="ISBN" value={form.isbn} onChange={v => setForm(f => ({ ...f, isbn: v }))} placeholder="Optional" />
        <Input label="Authors (comma separated)" value={form.authors} onChange={v => setForm(f => ({ ...f, authors: v }))} placeholder="e.g. R.K. Narayan" />
        <Input label="Publisher" value={form.publisher} onChange={v => setForm(f => ({ ...f, publisher: v }))} placeholder="Optional" />
        <Input label="Category" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} placeholder="e.g. Fiction" />
      </FormModal>
    </>
  );
}
