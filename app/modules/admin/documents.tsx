import React, { useCallback, useState } from 'react';
import { Text, ScrollView, RefreshControl } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, RowItem, Badge, fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

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
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  // Again on coming back — a document archived or deleted on its own page.
  useFocusEffect(useCallback(() => { load(); }, []));

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
              // The document's own page: files, submissions, comments — and
              // Archive / Delete, which used to sit in a pop-up menu here.
              onPress={() => router.push({ pathname: '/modules/document-detail', params: { id: String(doc._id), as: 'admin' } })}
            />
          ))
        )}
      </ScrollView>
    </>
  );
}
