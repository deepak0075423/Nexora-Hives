/**
 * Report Card on the phone (Oct 2026), for a student and a parent — the year
 * on one sheet, from the same read model as the web page and the PDF
 * (GET /student|parent/results/report-card). Until the year's final results
 * are out it is a Progress Report: the marks so far, the teacher's remarks to
 * come. "Share PDF" hands the school's own PDF to the phone's share sheet.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as R from '@/api/results.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Empty, LoaderView, SegTabs, unwrap, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import { KidSwitch } from '@/components/results/parts';
import ReportCardView from '@/components/results/ReportCardView';
import { saveAndShare } from '@/components/payroll/parts';

export default function ReportCardScreen() {
  const { user } = useAuth();
  const parent = user?.role === 'parent';
  const params = useLocalSearchParams<{ child?: string }>();
  const [childId, setChildId] = useState(String(params.child || ''));
  const [year, setYear] = useState('');
  const [term, setTerm] = useState('');
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.role) return;
    try {
      setD(unwrap(parent ? await R.parentReportCard(childId || undefined, year || undefined, term || undefined) : await R.studentReportCard(year || undefined, term || undefined)));
      setError('');
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else setError(err?.message || 'The report card could not be loaded');
    } finally { setLoading(false); setRefreshing(false); }
  }, [user?.role, parent, childId, year, term]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  const share = async () => {
    if (!d?.card) return;
    setSharing(true);
    const name = `report-card-${String(d.card.student.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${d.year?.yearName || ''}.pdf`;
    const t = d.frame?.term || undefined;
    await saveAndShare(() => (parent ? R.parentReportCardPdf(d.child || childId || undefined, d.year?._id, t) : R.studentReportCardPdf(d.year?._id, t)), name);
    setSharing(false);
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Report Card' }} /><ModuleDisabled /></>);
  const children = d?.children || [];
  const years = d?.years || [];
  const card = d?.card;
  const withheld = d?.withheld;
  const terms = d?.frame?.terms || [];

  return (
    <>
      <Stack.Screen options={{ title: card && !card.complete ? 'Progress Report' : 'Report Card' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        {parent ? <KidSwitch kids={children} value={d?.child} onPick={(id) => { setYear(''); setTerm(''); setChildId(id); }} caption="WHOSE REPORT CARD" showSchool={!!d?.multiSchool} /> : null}
        {years.length > 1 ? (
          <SegTabs active={year || d?.year?._id || ''} onChange={(v) => { setYear(v); setTerm(''); }} tabs={years.map((y: any) => ({ key: String(y._id), label: y.yearName }))} />
        ) : null}
        {terms.length ? (
          <SegTabs active={term || d?.frame?.term || ''} onChange={setTerm}
            tabs={[{ key: '', label: 'Whole year' }, ...terms.map((t: any) => ({ key: String(t.key), label: t.label }))]} />
        ) : null}
        {withheld ? (
          <View style={s.held}>
            <Ionicons name="lock-closed" size={18} color="#8A4B05" />
            <Text style={s.heldText}>
              {withheld.student?.name ? `${withheld.student.name}'s report card is withheld` : 'This report card is withheld'}
              {withheld.reason ? ` — ${withheld.reason}` : ''}. Please contact the school office.
            </Text>
          </View>
        ) : null}
        {loading && !d ? <LoaderView /> : null}
        {!d && error ? <Empty icon="cloud-offline-outline" text={error} /> : null}
        {d && parent && !children.length ? <Empty icon="people-outline" text="No children are linked to your account yet." /> : null}
        {d && parent && children.length > 0 && d.resultsOn === false ? <Empty icon="document-text-outline" text={`${d.school?.name || 'This school'} does not use the Results module.`} /> : null}
        {d && (!parent || (children.length && d.resultsOn !== false)) && !card && !withheld ? (
          <Empty icon="document-text-outline" text="A report card appears once the school publishes results for the year." />
        ) : null}

        {card ? (
          <View style={loading ? { opacity: 0.55 } : undefined}>
            {!card.complete ? (
              <Text style={s.note}>This is a progress report: the results published so far. The class teacher’s remarks and co-scholastic grades come when the school releases the report cards.</Text>
            ) : null}
            <TouchableOpacity style={s.share} onPress={share} disabled={sharing} accessibilityRole="button">
              {sharing ? <ActivityIndicator color={Colors.primary} size="small" /> : <Ionicons name="share-outline" size={16} color={Colors.primary} />}
              <Text style={s.shareText}>Share PDF</Text>
            </TouchableOpacity>
            <ReportCardView frame={d.frame} card={card} family />
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  body: { padding: Spacing.md, paddingBottom: 100 },
  note: { fontSize: 12, color: '#075985', backgroundColor: Colors.infoLight, padding: 10, borderRadius: Radius.md, marginBottom: 10 },
  share: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, marginBottom: 10,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  shareText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  held: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: Radius.lg, backgroundColor: Colors.warningLight, marginBottom: 10 },
  heldText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#8A4B05', lineHeight: 19 },
});
