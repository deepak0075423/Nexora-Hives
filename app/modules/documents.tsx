import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity, Linking } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as studentApi from '@/api/student.api';
import * as teacherApi from '@/api/teacher.api';
import * as parentApi from '@/api/parent.api';
import { BASE_URL } from '@/api/axios';
import ModuleDisabled from '@/components/ModuleDisabled';

const TYPE_ICON: Record<string, { icon: string; bg: string; color: string }> = {
  assignment:   { icon: 'document-text',  bg: '#EDE9FE', color: '#7C3AED' },
  notice:       { icon: 'megaphone',      bg: Colors.accentLight, color: Colors.accent },
  resource:     { icon: 'book',           bg: '#DBEAFE', color: '#2563EB' },
  default:      { icon: 'folder',         bg: Colors.surfaceAlt, color: Colors.primary },
};

export default function DocumentsScreen() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = async () => {
    try {
      let res: any;
      if (user?.role === 'teacher') res = await teacherApi.getDocuments();
      else if (user?.role === 'parent') res = await parentApi.getDocuments();
      else res = await studentApi.getDocuments();
      setDocs((res as any)?.data ?? res ?? []);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    }
    finally { setLoading(false); setRefreshing(false); }
  };

  // Wait for the user record — firing before role is known would hit the wrong role's API
  useEffect(() => { if (user?.role) load(); }, [user?.role]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const openFile = (file: string) => {
    const url = file.startsWith('http') ? file : `${BASE_URL.replace('/api', '')}/${file}`;
    Linking.openURL(url);
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
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : docs.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="folder-open-outline" size={48} color={Colors.textLight} />
            <Text style={s.emptyText}>No documents available</Text>
          </View>
        ) : (
          docs.map((doc: any, i: number) => {
            const cfg = TYPE_ICON[doc.type] ?? TYPE_ICON.default;
            return (
              <View key={i} style={s.card}>
                <View style={[s.iconBox, { backgroundColor: cfg.bg }]}>
                  <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
                </View>
                <View style={s.body}>
                  <Text style={s.docTitle}>{doc.title ?? doc.name ?? 'Document'}</Text>
                  {doc.subject?.name && <Text style={s.docMeta}>{doc.subject.name}</Text>}
                  {doc.dueDate && (
                    <Text style={s.dueDate}>
                      Due: {new Date(doc.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </Text>
                  )}
                </View>
                {doc.files?.length > 0 && (
                  <TouchableOpacity onPress={() => openFile(doc.files[0])} style={s.downloadBtn}>
                    <Ionicons name="download-outline" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', paddingTop: 80 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { ...Typography.body, color: Colors.textSecondary },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: Spacing.md, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  iconBox: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  body: { flex: 1 },
  docTitle: { ...Typography.label, color: Colors.text },
  docMeta: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },
  dueDate: { fontSize: 11, color: Colors.danger, marginTop: 3, fontWeight: '500' },
  downloadBtn: { padding: 6 },
});
