import React, { useEffect, useState, useCallback } from 'react';
import { MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput, Alert, RefreshControl,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as videoApi from '@/api/video.api';
import ModuleDisabled from '@/components/ModuleDisabled';

type Tab = 'catalog' | 'add';

export default function TeacherVideosScreen() {
  const [tab, setTab] = useState<Tab>('catalog');
  const [catalog, setCatalog] = useState<any[]>([]);
  const [scope, setScope] = useState<any>(null);
  const [mine, setMine] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [form, setForm] = useState({ title: '', sourceUrl: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cat, sc, my]: any[] = await Promise.all([
        videoApi.teacherCatalog({ limit: 30 }), videoApi.teacherScope(), videoApi.teacherMyVideos(),
      ]);
      setCatalog(((cat as any)?.data ?? cat)?.items ?? []);
      setScope((sc as any)?.data ?? sc);
      setMine((my as any)?.data ?? my ?? []);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const assign = (v: any) => {
    const section = scope?.classSectionIds?.[0] || scope?.subjectSectionIds?.[0];
    if (!section) return Alert.alert('No section', 'You are not assigned to a section you can assign videos to.');
    Alert.alert('Assign video', `Assign "${v.title}" to your section?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Assign', onPress: async () => {
        try {
          await videoApi.teacherAssign({ contentType: 'video', video: v._id, targetType: 'section', section, title: `Watch: ${v.title}`, minWatchPercent: 80 });
          Alert.alert('Assigned', 'Students in your section have been notified.');
        } catch (err: any) { Alert.alert('Error', err?.message || 'Could not assign'); }
      } },
    ]);
  };

  const submit = async () => {
    if (!form.title.trim() || !form.sourceUrl.trim()) return Alert.alert('Required', 'Enter a title and a YouTube/Vimeo URL.');
    setSaving(true);
    try {
      const res: any = await videoApi.teacherAddVideo({ ...form });
      const requiresApproval = (res as any)?.data?.requiresApproval;
      Alert.alert(requiresApproval ? 'Submitted' : 'Published', requiresApproval ? 'Sent to your school admin for approval.' : 'Your video is live.');
      setForm({ title: '', sourceUrl: '' }); load();
    } catch (err: any) { Alert.alert('Error', err?.message || 'Could not submit'); }
    finally { setSaving(false); }
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Video Learning' }} /><ModuleDisabled /></>);
  if (loading) return (<><Stack.Screen options={{ title: 'Video Learning' }} /><View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View></>);

  return (
    <>
      <Stack.Screen options={{ title: 'Video Learning' }} />
      <View style={s.tabs}>
        {(['catalog', 'add'] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabTxt, tab === t && s.tabTxtActive]}>{t === 'catalog' ? 'Catalog' : 'Add Video'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={s.screen} contentContainerStyle={{ padding: Spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
        {tab === 'catalog' ? (
          catalog.length === 0
            ? <Text style={s.muted}>No videos available yet. Ask your admin to enable videos, or add your own.</Text>
            : catalog.map((v) => (
              <View key={v._id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={2}>{v.title}</Text>
                  <Text style={s.rowSub}>{String(v.category || '').replace(/_/g, ' ')} · {v.source}</Text>
                </View>
                <TouchableOpacity style={s.assignBtn} onPress={() => assign(v)}>
                  <Text style={s.assignTxt}>Assign</Text>
                </TouchableOpacity>
              </View>
            ))
        ) : (
          <>
            <View style={s.form}>
              <Text style={s.label}>Title</Text>
              <TextInput style={s.input} value={form.title} onChangeText={(t) => setForm((f) => ({ ...f, title: t }))} placeholder="Video title" placeholderTextColor={Colors.textSecondary} />
              <Text style={s.label}>YouTube / Vimeo URL</Text>
              <TextInput style={s.input} value={form.sourceUrl} onChangeText={(t) => setForm((f) => ({ ...f, sourceUrl: t }))} placeholder="https://youtu.be/…" placeholderTextColor={Colors.textSecondary} autoCapitalize="none" />
              <TouchableOpacity style={[s.submitBtn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.submitTxt}>Submit for approval</Text>}
              </TouchableOpacity>
              <Text style={s.hint}>🔒 Teachers can add YouTube/Vimeo links only. They go to your school admin for approval before students can watch.</Text>
            </View>

            <Text style={[s.label, { marginTop: Spacing.lg }]}>My submitted videos</Text>
            {mine.length === 0 ? <Text style={s.muted}>None yet.</Text> : mine.map((v) => (
              <View key={v._id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{v.title}</Text>
                  <Text style={s.rowSub}>{v.source}</Text>
                </View>
                <View style={[s.pill, pillTone(v.approvalStatus)]}><Text style={s.pillTxt}>{v.approvalStatus}</Text></View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </>
  );
}

function pillTone(st: string) {
  if (st === 'approved') return { backgroundColor: '#DCFCE7' };
  if (st === 'rejected') return { backgroundColor: '#FEE2E2' };
  return { backgroundColor: '#FEF3C7' };
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  muted: { color: Colors.textSecondary, ...Typography.body, padding: Spacing.md },
  tabs: { flexDirection: 'row', backgroundColor: Colors.surface, paddingHorizontal: Spacing.md, gap: Spacing.sm, paddingTop: Spacing.sm },
  tab: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: Radius.sm },
  tabActive: { backgroundColor: Colors.primary },
  tabTxt: { ...Typography.label, color: Colors.textSecondary },
  tabTxtActive: { color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.sm },
  rowTitle: { ...Typography.label, color: Colors.text, fontWeight: '600' },
  rowSub: { ...Typography.caption, color: Colors.textSecondary, textTransform: 'capitalize', marginTop: 2 },
  assignBtn: { backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingHorizontal: 14, paddingVertical: 8 },
  assignTxt: { color: '#fff', fontWeight: '600', fontSize: 13 },
  form: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md },
  label: { ...Typography.label, color: Colors.text, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: Spacing.md, color: Colors.text },
  submitBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 13, alignItems: 'center' },
  submitTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  hint: { ...Typography.caption, color: Colors.textSecondary, marginTop: Spacing.sm },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  pillTxt: { fontSize: 11, fontWeight: '600', color: '#374151', textTransform: 'capitalize' },
});
