import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, Linking } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import { BASE_URL } from '@/api/axios';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, RowItem, Badge, confirmAsync, fmtDate,
} from '@/components/ui/kit';

// Uploads live at the backend root, not under /api
const FILE_BASE = BASE_URL.replace(/\/api\/?$/, '');

export default function AdminDocumentsScreen() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = async () => {
    try {
      const d = unwrap(await adminApi.getDocuments({ page: 1, limit: 50 }));
      setList(Array.isArray(d) ? d : d?.data ?? d?.documents ?? []);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const openFile = (doc: any) => {
    const url = doc.fileUrl ?? doc.filePath ?? doc.file;
    if (!url) return Alert.alert('No file', 'This document has no attached file.');
    const full = String(url).startsWith('http') ? url : `${FILE_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
    Linking.openURL(full).catch(() => Alert.alert('Error', 'Could not open the file'));
  };

  const archive = async (doc: any) => {
    if (!(await confirmAsync('Archive Document', `Archive "${doc.title}"?`, 'Archive'))) return;
    try { await adminApi.archiveDocument(doc._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const remove = async (doc: any) => {
    if (!(await confirmAsync('Delete Document', `Delete "${doc.title}"? This cannot be undone.`, 'Delete'))) return;
    try { await adminApi.deleteDocument(doc._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Documents' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Documents' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: Spacing.sm }}>
          Uploading new documents with attachments is available on the web admin panel.
        </Text>
        {loading ? <LoaderView /> : list.length === 0 ? (
          <Empty icon="folder-open-outline" text="No documents" />
        ) : (
          list.map((doc: any) => (
            <RowItem
              key={doc._id}
              icon="document" iconColor="#EA580C" iconBg="#FFEDD5"
              title={doc.title ?? doc.name ?? 'Document'}
              sub={`${doc.category?.name ?? doc.category ?? 'Uncategorised'} · ${fmtDate(doc.createdAt)}${doc.uploadedBy?.name ? ` · by ${doc.uploadedBy.name}` : ''}`}
              right={<Badge label={doc.status ?? 'active'} />}
              onPress={() => {
                Alert.alert(doc.title ?? 'Document', undefined, [
                  { text: 'Close', style: 'cancel' },
                  { text: 'Open File', onPress: () => openFile(doc) },
                  { text: 'Archive', onPress: () => archive(doc) },
                  { text: 'Delete', style: 'destructive', onPress: () => remove(doc) },
                ]);
              }}
            />
          ))
        )}
      </ScrollView>
    </>
  );
}
