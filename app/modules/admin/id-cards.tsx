/**
 * ID Cards for the office on the phone (Oct 2026) — the figures that say
 * whether everyone has a card, the verification desk (type the number off a
 * card), and the recent checks. Issuing, templates and printing are done on
 * the web portal, where a printer is.
 * GET /admin/id-cards/overview, /lookup, /activity — the same as the web.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { TextInput } from '@/components/ui/TextInput';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { idCardOverview, lookupIdCard, idCardActivity } from '@/api/idcards.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Empty, LoaderView, unwrap, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import Card3D from '@/components/idcard/Card3D';

const KIND: Record<string, { label: string; icon: string; fg: string; bg: string }> = {
  student: { label: 'Students', icon: 'school', fg: '#1D4ED8', bg: '#DBEAFE' },
  teacher: { label: 'Teachers', icon: 'people', fg: '#047857', bg: '#D1FAE5' },
  staff: { label: 'Staff', icon: 'briefcase', fg: '#B45309', bg: '#FEF3C7' },
  parent: { label: 'Parents', icon: 'person', fg: '#6D28D9', bg: '#EDE9FE' },
};
const ago = (d: string) => {
  const sec = (Date.now() - new Date(d).getTime()) / 1000;
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

function Figure({ kind, t, year }: { kind: string; t: any; year?: string }) {
  const k = KIND[kind];
  const pct = t?.holders ? Math.round((t.issued / t.holders) * 100) : 0;
  return (
    <View style={s.fig}>
      <View style={[s.figMark, { backgroundColor: k.bg }]}><Ionicons name={k.icon as any} size={18} color={k.fg} /></View>
      <Text style={s.figLabel}>{k.label}{kind === 'student' && year ? ` · ${year}` : ''}</Text>
      <Text style={s.figValue}>{t?.issued ?? 0}<Text style={s.figOf}> / {t?.holders ?? 0}</Text></Text>
      <View style={s.bar}><View style={[s.barFill, { width: `${pct}%`, backgroundColor: k.fg }]} /></View>
      <Text style={[s.figCap, t?.pending ? { color: Colors.warning } : { color: Colors.success }]}>{t?.pending ? `${t.pending} pending` : 'Everyone has a card'}</Text>
    </View>
  );
}

export default function AdminIdCards() {
  const { width } = useWindowDimensions();
  const [d, setD] = useState<any>(null);
  const [log, setLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [checking, setChecking] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [miss, setMiss] = useState('');

  const load = useCallback(async () => {
    try {
      const [o, a] = await Promise.all([idCardOverview(), idCardActivity(40)]);
      setD(unwrap(o));
      setLog((unwrap(a) || []).filter((x: any) => x.action === 'verified' || x.action === 'scanned').slice(0, 10));
      setError('');
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else setError(err?.message || 'ID cards could not be loaded');
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const check = async () => {
    if (!q.trim()) return;
    setChecking(true); setMiss('');
    try {
      setRes(unwrap(await lookupIdCard(q.trim())));
      load();
    } catch (err: any) {
      setRes(null);
      setMiss(err?.message || 'That card could not be checked');
    } finally { setChecking(false); }
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'ID Cards' }} /><ModuleDisabled /></>);
  const reissue = d ? ['students', 'teachers', 'staff', 'parents'].reduce((n, k) => n + (d[k]?.reissue || 0), 0) : 0;
  const r = res?.result;

  return (
    <>
      <Stack.Screen options={{ title: 'ID Cards' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        <Text style={s.h2}>Verify a card</Text>
        <View style={s.verify}>
          <Ionicons name="qr-code-outline" size={20} color={Colors.textSecondary} />
          <TextInput style={s.input} value={q} onChangeText={setQ} placeholder="Card number, e.g. ST2627-00042" placeholderTextColor={Colors.textLight}
            autoCapitalize="characters" autoCorrect={false} returnKeyType="search" onSubmitEditing={check} />
          <TouchableOpacity style={s.check} onPress={check} disabled={checking} accessibilityRole="button">
            {checking ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.checkText}>Check</Text>}
          </TouchableOpacity>
        </View>
        <Text style={s.hint}>Scanning the QR code with the phone’s camera app opens the same check in the browser.</Text>
        {miss ? <View style={s.miss}><Ionicons name="alert-circle" size={16} color={Colors.danger} /><Text style={s.missText}>{miss}</Text></View> : null}
        {r ? (
          <View style={[s.result, { borderColor: r.valid ? '#86EFAC' : '#FCA5A5' }]}>
            <View style={[s.verdict, { backgroundColor: r.valid ? '#F0FDF4' : '#FEF2F2' }]}>
              <Ionicons name={r.valid ? 'checkmark-circle' : 'close-circle'} size={30} color={r.valid ? Colors.success : Colors.danger} />
              <View style={{ flex: 1 }}>
                <Text style={[s.verdictTitle, { color: r.valid ? '#15803D' : '#B91C1C' }]}>{r.valid ? 'Valid ID card' : r.title}</Text>
                <Text style={s.verdictText}>{r.message}</Text>
              </View>
            </View>
            <View style={{ paddingVertical: 8 }}><Card3D card={res.card} width={Math.min(190, width - 120)} entrance={false} /></View>
            <View style={s.lines}>
              <Text style={s.who}>{r.name}</Text>
              {r.lines.filter(([k]: [string]) => !['Student', 'Teacher', 'Staff', 'Parent'].includes(k)).map(([k, v]: [string, string]) => (
                <View key={k} style={s.line}><Text style={s.lineK}>{k}</Text><Text style={s.lineV}>{v}</Text></View>
              ))}
              <View style={s.line}><Text style={s.lineK}>Card No.</Text><Text style={s.lineV}>{r.number}</Text></View>
              {r.validTill ? <View style={s.line}><Text style={s.lineK}>Valid till</Text><Text style={s.lineV}>{r.validTill}</Text></View> : null}
            </View>
            <Text style={s.tip}>Compare the face in front of you with the photo on the card.</Text>
          </View>
        ) : null}

        {loading && !d ? <LoaderView /> : null}
        {!d && error ? <Empty icon="cloud-offline-outline" text={error} /> : null}
        {d ? (
          <>
            <Text style={[s.h2, { marginTop: Spacing.lg }]}>Who has a card</Text>
            <View style={s.figs}>
              <Figure kind="student" t={d.students} year={d.year?.yearName} />
              <Figure kind="teacher" t={d.teachers} />
              <Figure kind="staff" t={d.staff} />
              <Figure kind="parent" t={d.parents} />
            </View>
            <View style={s.stats}>
              <View style={s.stat}><Text style={[s.statValue, { color: '#C2410C' }]}>{reissue}</Text><Text style={s.statLabel}>to reissue</Text></View>
              <View style={s.stat}><Text style={s.statValue}>{d.expired || 0}</Text><Text style={s.statLabel}>expired</Text></View>
              <View style={s.stat}><Text style={s.statValue}>{d.totals?.total || 0}</Text><Text style={s.statLabel}>issued in all</Text></View>
            </View>
            {d.attention?.length ? (
              <View style={s.attn}>
                <Text style={s.attnTitle}>Needs attention</Text>
                {d.attention.map((a: any) => (
                  <View key={`${a.key}-${a.kind}`} style={s.attnRow}><Text style={s.attnN}>{a.count}</Text><Text style={s.attnText}>{a.text}</Text></View>
                ))}
              </View>
            ) : null}
            <View style={s.web}>
              <Ionicons name="desktop-outline" size={18} color={Colors.primary} />
              <Text style={s.webText}>Generate, reissue, block and print cards, and edit the card designs, from the web portal under ID Cards.</Text>
            </View>
            <Text style={[s.h2, { marginTop: Spacing.lg }]}>Recent checks</Text>
            {log.length ? log.map((x) => (
              <View key={x._id} style={s.logRow}>
                <Ionicons name={x.action === 'verified' ? 'shield-checkmark' : 'qr-code'} size={16} color={Colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={s.logName}>{x.holderName || 'Card'} <Text style={s.logNum}>{x.number}</Text></Text>
                  <Text style={s.logWhen}>{x.action === 'verified' ? `Checked by ${x.by || 'the office'}` : 'QR code scanned'} · {ago(x.createdAt)}</Text>
                </View>
              </View>
            )) : <Text style={s.hint}>Cards checked here, and QR scans of the school’s cards, are listed here.</Text>}
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  body: { padding: Spacing.md, paddingBottom: 110 },
  h2: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  verify: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 52, paddingLeft: 12, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
  input: { flex: 1, height: '100%', fontSize: 15, fontWeight: '700', color: Colors.text, letterSpacing: 0.4 },
  check: { height: '100%', paddingHorizontal: 18, borderTopRightRadius: Radius.lg, borderBottomRightRadius: Radius.lg, backgroundColor: Colors.primary, justifyContent: 'center' },
  checkText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  hint: { marginTop: 6, fontSize: 12, color: Colors.textSecondary },
  miss: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, padding: 10, borderRadius: Radius.md, backgroundColor: Colors.dangerLight },
  missText: { flex: 1, fontSize: 13, color: Colors.danger, fontWeight: '600' },
  result: { marginTop: 12, borderRadius: 18, borderWidth: 2, overflow: 'hidden', backgroundColor: Colors.surface },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  verdictTitle: { fontSize: 19, fontWeight: '800' },
  verdictText: { fontSize: 12.5, color: Colors.text, marginTop: 2 },
  lines: { paddingHorizontal: 14 },
  who: { fontSize: 18, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: 10 },
  lineK: { fontSize: 13, color: Colors.textSecondary },
  lineV: { fontSize: 13.5, fontWeight: '700', color: Colors.text, flexShrink: 1, textAlign: 'right' },
  tip: { fontSize: 12, color: Colors.textSecondary, padding: 14 },
  figs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fig: { width: '48%', flexGrow: 1, padding: 12, borderRadius: 14, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  figMark: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  figLabel: { marginTop: 8, fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  figValue: { marginTop: 2, fontSize: 22, fontWeight: '800', color: Colors.text },
  figOf: { fontSize: 14, fontWeight: '700', color: Colors.textLight },
  bar: { height: 5, borderRadius: 3, backgroundColor: Colors.divider, marginTop: 6, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  figCap: { marginTop: 6, fontSize: 11.5, fontWeight: '700' },
  stats: { flexDirection: 'row', gap: 10, marginTop: 10 },
  stat: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2 },
  attn: { marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', gap: 8 },
  attnTitle: { fontSize: 13, fontWeight: '800', color: '#78350F' },
  attnRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  attnN: { minWidth: 26, textAlign: 'center', fontSize: 13, fontWeight: '800', color: '#92400E', backgroundColor: '#FEF3C7', borderRadius: 6, paddingVertical: 2, overflow: 'hidden' },
  attnText: { flex: 1, fontSize: 12.5, color: '#92400E' },
  web: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: '#EEF2FF' },
  webText: { flex: 1, fontSize: 12.5, color: Colors.primary, fontWeight: '600' },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, marginBottom: 8 },
  logName: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  logNum: { fontWeight: '600', color: Colors.textSecondary },
  logWhen: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2 },
});
