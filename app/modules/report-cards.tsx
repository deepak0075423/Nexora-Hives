/**
 * Report Cards on the phone (Oct 2026), for a class or vice class teacher —
 * the web's Report Cards page (GET /teacher/results/report-cards): their
 * section's students, how far each card has got, and for each student the
 * co-scholastic grades and remarks to write. A card, or the whole section, is
 * shared as the school's own PDF.
 *
 * Since Oct 2026: `?office=1` is the office's (every section); a card can be
 * for one term; remarks can be picked from the school's remark bank; and the
 * section's cards are released to families (they are told, and read the
 * remarks from then on) and emailed to parents as PDFs.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, TextInput,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as R from '@/api/results.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Empty, LoaderView, Select, SearchBar, confirmAsync, unwrap, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import { GradePill, Pill, classLine, pct, fmtDay, plural } from '@/components/results/parts';
import ReportCardView from '@/components/results/ReportCardView';
import { saveAndShare } from '@/components/payroll/parts';

const REMARKS_MAX = 1000;
const progressOf = (c: any) => {
  const areas = c.coScholastic.length;
  const graded = c.coScholastic.filter((a: any) => a.grade).length;
  const remarks = !!String(c.remarks || '').trim();
  return { areas, graded, remarks, done: remarks && graded === areas };
};
const fileName = (who: string, year?: string) => `report-card-${String(who).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${year || ''}.pdf`;

/** One student's card: the class teacher's part to write, then the card as it reads. */
function StudentCard({ frame, card, office, onClose, onSaved }: { frame: any; card: any; office: boolean; onClose: () => void; onSaved: (next: any) => void }) {
  const insets = useSafeAreaInsets();
  const [remarks, setRemarks] = useState(card.remarks || '');
  const [co, setCo] = useState<Record<string, string>>(() => Object.fromEntries(card.coScholastic.map((a: any) => [a.key, a.grade || ''])));
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const before = useMemo(() => JSON.stringify({ r: (card.remarks || '').trim(), c: Object.fromEntries(card.coScholastic.map((a: any) => [a.key, a.grade || ''])) }), [card]);
  const dirty = JSON.stringify({ r: remarks.trim(), c: co }) !== before;

  const save = async () => {
    setBusy(true); setError('');
    try {
      const body = { studentId: card.student._id, academicYear: frame.year?._id, term: frame.term || undefined, remarks: remarks.trim(), coScholastic: co };
      const next = unwrap(office ? await R.office.saveNotes(body) : await R.saveReportCardNotes(body));
      onSaved(next);
    } catch (e: any) { setError(e?.message || 'The report card could not be saved'); }
    finally { setBusy(false); }
  };
  const share = async () => {
    setSharing(true);
    const scope = { academicYear: frame.year?._id, studentId: card.student._id, sectionId: card.sectionId, term: frame.term || undefined };
    await saveAndShare(() => (office ? R.office.reportCardsPdf(scope) : R.teacherReportCardsPdf(scope)), fileName(card.student.name, frame.year?.yearName));
    setSharing(false);
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[s.modal, { paddingTop: insets.top }]}>
        <View style={s.modalHead}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.modalTitle} numberOfLines={1}>{card.student.name}</Text>
            <Text style={s.sub}>{[classLine(card.student), card.student.rollNumber ? `Roll ${card.student.rollNumber}` : ''].filter(Boolean).join(' · ')}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={s.close} accessibilityLabel="Close"><Ionicons name="close" size={20} color={Colors.textSecondary} /></TouchableOpacity>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: 40 + insets.bottom }} keyboardShouldPersistTaps="handled">
            <View style={s.card}>
              <Text style={s.cap}>CO-SCHOLASTIC GRADES</Text>
              {card.coScholastic.length ? card.coScholastic.map((a: any) => (
                <View key={a.key} style={s.coRow}>
                  <Text style={s.coName} numberOfLines={2}>{a.label}</Text>
                  <View style={s.coOpts}>
                    {(frame.coScholasticGrades || []).map((g: string) => {
                      const on = co[a.key] === g;
                      return (
                        <TouchableOpacity key={g} onPress={() => setCo((x) => ({ ...x, [a.key]: x[a.key] === g ? '' : g }))} style={[s.coOpt, on && s.coOn]}
                          accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${a.label}: ${g}`}>
                          <Text style={[s.coText, on && { color: Colors.textInverse }]}>{g}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )) : <Text style={s.sub}>The school grades no co-scholastic areas.</Text>}
              <Text style={[s.cap, { marginTop: 12 }]}>CLASS TEACHER’S REMARKS</Text>
              {frame.remarkBank?.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.bank} keyboardShouldPersistTaps="handled">
                  {frame.remarkBank.map((r: string) => (
                    <TouchableOpacity key={r} style={s.bankChip} onPress={() => { setRemarks((x: string) => (x.trim() ? `${x.trim()} ${r}` : r).slice(0, REMARKS_MAX)); setError(''); }}
                      accessibilityRole="button" accessibilityLabel={`Add the remark: ${r}`}>
                      <Ionicons name="add" size={12} color={Colors.primary} />
                      <Text style={s.bankText} numberOfLines={1}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : null}
              <TextInput style={s.remarks} value={remarks} onChangeText={(v) => { setRemarks(v.slice(0, REMARKS_MAX)); setError(''); }} multiline
                placeholder={`How ${String(card.student.name).split(' ')[0]}'s year went — strengths, and what to work on.`} placeholderTextColor={Colors.textLight} />
              <Text style={s.count}>{remarks.length}/{REMARKS_MAX}</Text>
              {error ? <Text style={s.error}>{error}</Text> : null}
              <View style={s.btns}>
                <TouchableOpacity style={s.btnGhost} onPress={share} disabled={sharing}>
                  {sharing ? <ActivityIndicator color={Colors.primary} size="small" /> : <Text style={s.btnGhostText}>Share PDF</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, !dirty && { opacity: 0.5 }]} onPress={save} disabled={!dirty || busy}>
                  {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
            <ReportCardView frame={frame} card={card} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default function ReportCardsScreen() {
  const { office: officeParam } = useLocalSearchParams<{ office?: string }>();
  const office = officeParam === '1';
  const [q, setQ] = useState<{ academicYear?: string; sectionId?: string; term?: string }>({});
  const [releasing, setReleasing] = useState('');
  const [d, setD] = useState<any>(null);
  const [edited, setEdited] = useState<Record<string, any>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    try { setD(unwrap(office ? await R.office.reportCards(q) : await R.teacherReportCards(q))); setEdited({}); setError(''); }
    catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else setError(err?.message || 'Report cards could not be loaded');
    } finally { setRefreshing(false); }
  }, [q, office]);
  useEffect(() => { load(); }, [load]);

  const cards = useMemo(() => (d?.cards || []).map((c: any) => edited[c.student._id] || c), [d, edited]);
  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    return t ? cards.filter((c: any) => `${c.student.name} ${c.student.rollNumber}`.toLowerCase().includes(t)) : cards;
  }, [cards, search]);
  const open = cards.find((c: any) => c.student._id === openId);
  const done = cards.filter((c: any) => progressOf(c).done).length;

  const scope = { academicYear: d?.year?._id, sectionId: d?.section?._id, term: d?.frame?.term || undefined };
  const shareAll = async () => {
    if (!d?.section) return;
    setSharing(true);
    await saveAndShare(() => (office ? R.office.reportCardsPdf(scope) : R.teacherReportCardsPdf(scope)), fileName(classLine(d.section), d.year?.yearName));
    setSharing(false);
  };
  const what = `${d?.frame?.termLabel ? `${d.frame.termLabel} ` : ''}report cards`;
  const release = async (released: boolean) => {
    const ok = released
      ? await confirmAsync('Release to families?', `Each family of ${classLine(d.section)} is told, and can read the whole ${what.replace(/s$/, '')} — remarks and co-scholastic grades too. Each card gets a QR that proves the school issued it.`, 'Release')
      : await confirmAsync('Take back the release?', 'Families stop seeing the remarks until the cards are released again. Nobody is told.', 'Take Back');
    if (!ok) return;
    setReleasing(released ? 'release' : 'unrelease');
    try {
      await (office ? R.office.releaseCards({ ...scope, released }) : R.teacherReleaseCards({ ...scope, released }));
      await load();
    } catch (err: any) { setError(err?.message || 'That did not work'); }
    finally { setReleasing(''); }
  };
  const send = async () => {
    if (!(await confirmAsync('Send to parents?', `Email each parent their child's ${what.replace(/s$/, '')} as a PDF. Parents without an email get an in-app notice; withheld results are left out.`, 'Send'))) return;
    setReleasing('send');
    try {
      const n = unwrap(await (office ? R.office.sendCards(scope) : R.teacherSendCards(scope)));
      setError('');
      await load();
      if (n?.students != null) setNotice(`Sending ${plural(n.students, 'card')} to ${plural(n.parents || 0, 'parent')} — it takes a minute or two.`);
    } catch (err: any) { setError(err?.message || 'The cards could not be sent'); }
    finally { setReleasing(''); }
  };
  const [notice, setNotice] = useState('');
  const rel = d?.release;

  if (disabled) return (<><Stack.Screen options={{ title: 'Report Cards' }} /><ModuleDisabled /></>);
  return (
    <>
      <Stack.Screen options={{ title: 'Report Cards' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        {!d && !error ? <LoaderView /> : null}
        {!d && error ? <Empty icon="cloud-offline-outline" text={error} /> : null}
        {d && !d.year ? <Empty icon="document-text-outline" text="You are not class teacher of a section yet." /> : null}
        {d && d.year && !d.sections.length ? <Empty icon="document-text-outline" text={office ? `${d.year.yearName} has no sections yet.` : `You are not class teacher or vice class teacher of a section in ${d.year.yearName}.`} /> : null}

        {d && d.sections.length ? (
          <>
            {d.years.length > 1 ? (
              <Select label="Academic year" value={String(d.year?._id || '')} onChange={(v) => setQ({ academicYear: v })}
                options={d.years.map((y: any) => ({ value: String(y._id), label: `${y.yearName}${y.current ? ' (current)' : ''}` }))} />
            ) : null}
            {d.sections.length > 1 ? (
              <Select label="Class / section" value={String(d.section?._id || '')} onChange={(v) => setQ((x) => ({ ...x, sectionId: v }))}
                options={d.sections.map((x: any) => ({ value: String(x._id), label: `${classLine(x)} (${x.students})` }))} />
            ) : null}
            {d.frame?.terms?.length ? (
              <Select label="Report for" value={String(d.frame.term || '')} onChange={(v) => setQ((x) => ({ ...x, term: v }))}
                options={[{ value: '', label: 'The whole year' }, ...d.frame.terms.map((t: any) => ({ value: t.key, label: t.label }))]} />
            ) : null}
            {cards.length ? (
              <View style={s.release}>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Pill label={rel?.releasedAt ? 'Released to families' : 'Not released'} fg={rel?.releasedAt ? Colors.success : Colors.textSecondary} bg={rel?.releasedAt ? Colors.successLight : Colors.surfaceAlt} />
                  <Text style={s.sub}>
                    {rel?.releasedAt
                      ? `${fmtDay(rel.releasedAt)}${rel.releasedBy ? ` by ${rel.releasedBy}` : ''} · ${rel.sentAt ? `sent to ${plural(rel.sentCount, 'parent')}` : 'not emailed yet'}`
                      : 'Families see the marks so far; the remarks once released.'}
                  </Text>
                </View>
                {rel?.releasedAt ? (
                  <View style={s.releaseBtns}>
                    <TouchableOpacity style={s.relGhost} onPress={() => release(false)} disabled={!!releasing}>
                      {releasing === 'unrelease' ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={s.relGhostText}>Take Back</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={s.relBtn} onPress={send} disabled={!!releasing}>
                      {releasing === 'send' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.relBtnText}>{rel.sentAt ? 'Send Again' : 'Email Parents'}</Text>}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={s.relBtn} onPress={() => release(true)} disabled={!!releasing}>
                    {releasing === 'release' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.relBtnText}>Release</Text>}
                  </TouchableOpacity>
                )}
              </View>
            ) : null}
            {notice ? <Text style={s.okNote}>{notice}</Text> : null}
            {error ? <Text style={s.error}>{error}</Text> : null}
            <View style={s.sumRow}>
              <Text style={s.sum}>{classLine(d.section)} · {done} of {cards.length} cards complete</Text>
              <TouchableOpacity style={s.shareAll} onPress={shareAll} disabled={sharing || !cards.length}>
                {sharing ? <ActivityIndicator color={Colors.primary} size="small" /> : <Ionicons name="share-outline" size={15} color={Colors.primary} />}
                <Text style={s.shareText}>Section PDF</Text>
              </TouchableOpacity>
            </View>
            <SearchBar value={search} onChange={setSearch} placeholder="Search students…" />
            {shown.map((c: any) => {
              const p = progressOf(c);
              return (
                <TouchableOpacity key={c.student._id} style={s.row} activeOpacity={0.75} onPress={() => setOpenId(c.student._id)}>
                  <Text style={s.roll}>{c.student.rollNumber || '—'}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.name} numberOfLines={1}>{c.student.name}</Text>
                    <Text style={s.sub}>
                      {c.withheld ? 'Withheld · ' : ''}{c.overall ? `${pct(c.overall.percentage)}` : 'No results yet'}
                      {p.areas ? ` · ${p.graded}/${p.areas} graded` : ''}{p.remarks ? ' · remarks' : ''}
                    </Text>
                  </View>
                  {c.overall ? <GradePill grade={c.overall.grade} /> : null}
                  {p.done ? <Ionicons name="checkmark-circle" size={18} color={Colors.success} /> : <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />}
                </TouchableOpacity>
              );
            })}
            {!shown.length ? <Empty icon="search-outline" text="Nobody matches." /> : null}
          </>
        ) : null}
      </ScrollView>
      {open ? (
        <StudentCard frame={d.frame} card={{ ...open, sectionId: d.section?._id }} office={office} onClose={() => setOpenId(null)}
          onSaved={(next) => { if (next) setEdited((x) => ({ ...x, [next.student._id]: next })); }} />
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  body: { padding: Spacing.md, paddingBottom: 100 },
  sumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  sum: { flex: 1, fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  shareAll: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 34, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  shareText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: 10, marginBottom: 6, borderWidth: 1, borderColor: Colors.border,
  },
  roll: { width: 26, fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textAlign: 'center' },
  name: { fontSize: 13, fontWeight: '600', color: Colors.text },
  sub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: Spacing.md, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { ...Typography.h4, color: Colors.text },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  cap: { fontSize: 10, fontWeight: '800', color: '#1E2452', letterSpacing: 0.8, marginBottom: 6 },
  coRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.divider },
  coName: { flex: 1, fontSize: 13, fontWeight: '500', color: Colors.text },
  coOpts: { flexDirection: 'row', gap: 6 },
  coOpt: { minWidth: 34, height: 32, paddingHorizontal: 8, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  coOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  coText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  remarks: {
    minHeight: 90, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
    padding: 10, fontSize: 14, color: Colors.text, textAlignVertical: 'top',
  },
  count: { fontSize: 10.5, color: Colors.textLight, textAlign: 'right', marginTop: 4 },
  error: { fontSize: 12, color: Colors.danger, backgroundColor: Colors.dangerLight, padding: 10, borderRadius: Radius.md, marginTop: 8 },
  btns: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: { flex: 1, height: 42, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent },
  btnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  btnGhost: { flex: 1, height: 42, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  btnGhostText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  bank: { gap: 6, paddingBottom: 8 },
  bankChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 240, paddingHorizontal: 10, height: 30,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
  },
  bankText: { fontSize: 12, color: Colors.text, flexShrink: 1 },
  release: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 10,
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
  },
  releaseBtns: { flexDirection: 'row', gap: 6 },
  relBtn: { height: 36, paddingHorizontal: 12, borderRadius: Radius.md, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  relBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  relGhost: { height: 36, paddingHorizontal: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  relGhostText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  okNote: { fontSize: 12, color: '#14532D', backgroundColor: Colors.successLight, padding: 10, borderRadius: Radius.md, marginBottom: 10 },
});
