/**
 * ID Card on the phone (Oct 2026) — for a student, a teacher (or any other
 * employee) and a parent. The card in force hangs in the showcase: tap it to
 * turn it over, swipe to spin it. "Show at the gate" puts it on a dark full
 * screen with the school's name and a clock ticking to the second — a live
 * screen, which a screenshot is not — and keeps the phone awake meanwhile.
 * "Share PDF" hands the school's own print file to the share sheet.
 *
 * A parent sees their own card and each child's, one at a time, with the
 * switch every parent screen uses; every holder sees their whole history —
 * a student's by academic year, each year's card exactly as it was issued.
 * GET /{student|teacher|parent}/id-cards.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Modal, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { myIdCards, myIdCardPdf } from '@/api/idcards.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Empty, LoaderView, unwrap, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import { KidSwitch } from '@/components/results/parts';
import { saveAndShare } from '@/components/payroll/parts';
import Card3D from '@/components/idcard/Card3D';
import CardFace, { fmtDay, subLine } from '@/components/idcard/CardFace';

const STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  active: { label: 'Active', fg: '#15803D', bg: '#DCFCE7' },
  generated: { label: 'Generated', fg: '#4338CA', bg: '#E0E7FF' },
  expired: { label: 'Expired', fg: '#475569', bg: '#E2E8F0' },
  blocked: { label: 'Blocked', fg: '#B91C1C', bg: '#FEE2E2' },
  lost: { label: 'Lost', fg: '#BE123C', bg: '#FFE4E6' },
  damaged: { label: 'Damaged', fg: '#C2410C', bg: '#FFEDD5' },
  reissued: { label: 'Reissued', fg: '#6D28D9', bg: '#EDE9FE' },
  cancelled: { label: 'Cancelled', fg: '#52525B', bg: '#F4F4F5' },
};
const REASON: Record<string, string> = { lost: 'lost', damaged: 'damaged', details: 'details changed', other: 'reissued' };

function words(c: any) {
  if (!c) return '';
  if (c.status === 'active') return c.kind === 'student' ? `Valid for ${c.academicYear?.yearName || 'this year'}` : 'Valid — in force';
  if (c.status === 'generated') return `For ${c.academicYear?.yearName || 'next year'} — not yet in force`;
  if (c.status === 'expired') return `Expired — this card was for ${c.academicYear?.yearName || c.snapshot?.yearName || 'an earlier year'}`;
  if (c.status === 'blocked') return c.statusReason ? `Blocked — ${c.statusReason}` : 'Blocked by the school';
  if (c.status === 'lost') return 'Reported lost — no longer valid';
  if (c.status === 'damaged') return 'Reported damaged — replaced';
  if (c.status === 'reissued') return 'Replaced by a newer card';
  if (c.status === 'cancelled') return 'Cancelled';
  return c.status;
}

const Pill = ({ status }: { status: string }) => {
  const t = STATUS[status] || STATUS.expired;
  return <View style={[s.pill, { backgroundColor: t.bg }]}><Text style={[s.pillText, { color: t.fg }]}>{t.label}</Text></View>;
};

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <>
      <View style={s.live}><View style={s.liveDot} /><Text style={s.liveText}>LIVE · {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</Text></View>
      <Text style={s.presentDate}>{now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Text>
    </>
  );
}

/** Full screen, for the guard at the gate. Keeps the phone awake while open. */
function Present({ card, onClose }: { card: any; onClose: () => void }) {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [back, setBack] = useState(false);
  const landscape = card?.design?.layout === 'landscape';
  const cw = Math.min(width - 64, landscape ? 260 : Math.min(300, (height - 330) / 1.6));
  const valid = card.status === 'active';
  return (
    <View style={[s.present, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <Text style={s.presentSchool}>{String(card.design?.identity?.name || '').toUpperCase()}</Text>
      <Clock />
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Card3D card={card} width={cw} flipped={back} onFlip={setBack} entrance={false} />
      </View>
      <View style={[s.verdict, !valid && s.verdictVoid]}>
        <Ionicons name={valid ? 'checkmark-circle' : 'close-circle'} size={20} color={valid ? '#BBF7D0' : '#FECACA'} />
        <Text style={[s.verdictText, !valid && { color: '#FECACA' }]}>{words(card)}</Text>
      </View>
      <Text style={s.presentTip}>{back ? 'The guard scans this code to check the card.' : 'Tap the card to show its QR code.'}</Text>
      <TouchableOpacity style={s.done} onPress={onClose} accessibilityRole="button"><Text style={s.doneText}>Done</Text></TouchableOpacity>
    </View>
  );
}

export default function IdCardScreen() {
  const { user } = useAuth();
  const role = user?.role === 'parent' ? 'parent' : user?.role === 'teacher' ? 'teacher' : 'student';
  const { width } = useWindowDimensions();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');
  const [who, setWho] = useState('me');
  const [shownId, setShownId] = useState<string | null>(null);
  const [back, setBack] = useState(false);
  const [present, setPresent] = useState(false);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.role) return;
    try {
      setD(unwrap(await myIdCards(role)));
      setError('');
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else setError(err?.message || 'Your ID card could not be loaded');
    } finally { setLoading(false); setRefreshing(false); }
  }, [user?.role, role]);
  useEffect(() => { load(); }, [load]);

  // Whose cards are on screen: mine, or (a parent) one child's.
  const holder = useMemo(() => {
    if (!d) return null;
    if (role !== 'parent') return { name: user?.name, ...d };
    if (who === 'me') return { name: user?.name, ...(d.mine || {}) };
    const c = (d.children || []).find((k: any) => String(k._id) === who);
    return c ? { ...c } : { name: user?.name, ...(d.mine || {}) };
  }, [d, role, who, user?.name]);
  const cards: any[] = holder?.cards || [];
  const current = holder?.current || null;
  const shown = cards.find((c) => c._id === shownId) || current || cards[0] || null;
  useEffect(() => { setShownId(null); setBack(false); }, [who]);

  const share = async () => {
    if (!shown) return;
    setSharing(true);
    const name = `id-card-${String(shown.snapshot?.name || 'card').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${String(shown.number).toLowerCase()}.pdf`;
    await saveAndShare(() => myIdCardPdf(role, shown._id), name);
    setSharing(false);
  };

  const groups = useMemoGroups(cards);
  if (disabled) return (<><Stack.Screen options={{ title: 'ID Card' }} /><ModuleDisabled /></>);
  const kids = role === 'parent' ? [{ _id: 'me', name: `${user?.name || 'Me'} (me)` }, ...(d?.children || [])] : [];
  const landscape = shown?.design?.layout === 'landscape';
  const cardWidth = Math.min(landscape ? 250 : 270, width - 96);

  return (
    <>
      <Stack.Screen options={{ title: role === 'parent' ? 'ID Cards' : 'My ID Card' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        {role === 'parent' && kids.length > 1 ? <KidSwitch kids={kids} value={who} onPick={setWho} caption="WHOSE ID CARD" /> : null}
        {loading && !d ? <LoaderView /> : null}
        {!d && error ? <Empty icon="cloud-offline-outline" text={error} /> : null}
        {d && role === 'parent' && who !== 'me' && holder && holder.idCardOn === false ? (
          <Empty icon="card-outline" text={`${holder.schoolName || 'This school'} does not issue ID cards through Aksharum.`} />
        ) : null}

        {d && shown ? (
          <View style={s.hero}>
            <View style={s.stage}>
              <Card3D key={shown._id} card={shown} width={cardWidth} lanyard flipped={back} onFlip={setBack} />
            </View>
            <View style={s.info}>
              <View style={s.row}>
                <Pill status={shown.status} />
                {shown.kind === 'student' && shown.academicYear?.yearName ? <Text style={s.year}>{shown.academicYear.yearName}</Text> : null}
                {shown.reissueNo ? <Text style={s.year}>Reissue {shown.reissueNo}</Text> : null}
              </View>
              <Text style={s.name}>{shown.snapshot?.name}</Text>
              <Text style={s.sub}>{subLine(shown)}{shown.kind === 'student' && shown.snapshot?.rollNumber ? ` · Roll ${shown.snapshot.rollNumber}` : ''}</Text>
              <View style={[s.state, shown.status !== 'active' && s.stateVoid]}>
                <Ionicons name={shown.status === 'active' ? 'checkmark-circle' : shown.status === 'generated' ? 'hourglass' : 'close-circle'} size={15} color={shown.status === 'active' ? '#BBF7D0' : '#FECACA'} />
                <Text style={[s.stateText, shown.status !== 'active' && { color: '#FECACA' }]}>{words(shown)}</Text>
              </View>
              <View style={s.facts}>
                <View style={s.fact}><Text style={s.factLabel}>CARD NUMBER</Text><Text style={s.factValue}>{shown.number}</Text></View>
                {shown.kind === 'student'
                  ? <View style={s.fact}><Text style={s.factLabel}>VALID TILL</Text><Text style={s.factValue}>{fmtDay(shown.validUntil || shown.snapshot?.yearEnd) || '—'}</Text></View>
                  : <View style={s.fact}><Text style={s.factLabel}>{shown.kind === 'parent' ? 'PARENT ID' : 'EMPLOYEE ID'}</Text><Text style={s.factValue}>{shown.snapshot?.holderCode || '—'}</Text></View>}
              </View>
              <View style={s.acts}>
                {shown.status === 'active' ? (
                  <TouchableOpacity style={[s.btn, s.btnLight]} onPress={() => setPresent(true)} accessibilityRole="button">
                    <Ionicons name="scan" size={16} color="#1E1B4B" /><Text style={[s.btnText, { color: '#1E1B4B' }]}>Show at the gate</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={s.btn} onPress={() => setBack((b) => !b)} accessibilityRole="button">
                  <Ionicons name="sync" size={16} color="#fff" /><Text style={s.btnText}>{back ? 'Show front' : 'Flip card'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btn} onPress={share} disabled={sharing} accessibilityRole="button">
                  {sharing ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="share-outline" size={16} color="#fff" />}
                  <Text style={s.btnText}>Share PDF</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}

        {d && !shown && !(role === 'parent' && who !== 'me' && holder?.idCardOn === false) ? (
          <View style={s.none}>
            <Ionicons name="card-outline" size={30} color="#C7D2FE" />
            <Text style={s.noneTitle}>{holder?.pending ? `The ${holder.pending.yearName} ID card is on its way` : 'No ID card yet'}</Text>
            <Text style={s.noneText}>The school office has not issued it yet. It appears here — with a notification — as soon as it is ready.</Text>
          </View>
        ) : null}

        {holder?.upcoming && shown?._id !== holder.upcoming._id ? (
          <TouchableOpacity style={s.next} onPress={() => setShownId(holder.upcoming._id)}>
            <Ionicons name="sparkles" size={15} color={Colors.primary} />
            <Text style={s.nextText}>The {holder.upcoming.academicYear?.yearName} card is ready — in force from {fmtDay(holder.upcoming.validFrom)}.</Text>
          </TouchableOpacity>
        ) : null}

        {cards.length ? (
          <View style={{ marginTop: Spacing.lg }}>
            <Text style={s.h2}>ID Card History</Text>
            <Text style={s.h2sub}>{cards[0]?.kind === 'student' ? 'A new card every academic year — each stays exactly as it was issued.' : 'Every card issued, including any it replaced.'}</Text>
            {groups.map((g) => (
              <View key={g.key} style={{ marginTop: 10 }}>
                {g.label ? <Text style={s.groupLabel}>{g.label}</Text> : null}
                {g.cards.map((c: any) => (
                  <TouchableOpacity key={c._id} style={[s.hrow, shown?._id === c._id && s.hrowOn]} onPress={() => { setShownId(c._id); setBack(false); }} activeOpacity={0.85}>
                    <View style={s.thumb}><CardFace card={c} width={46} /></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={s.row}><Text style={s.hnum}>{c.number}</Text><Pill status={c.status} /></View>
                      <Text style={s.hline} numberOfLines={1}>{c.kind === 'student'
                        ? [[c.snapshot?.className, c.snapshot?.sectionName].filter(Boolean).join(' – '), c.snapshot?.rollNumber ? `Roll ${c.snapshot.rollNumber}` : ''].filter(Boolean).join(' · ')
                        : subLine(c)}</Text>
                      <Text style={s.hwhen} numberOfLines={1}>Issued {new Date(c.issuedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}{c.reissueNo ? ` · reissue ${c.reissueNo}${REASON[c.reissueReason] ? ` (${REASON[c.reissueReason]})` : ''}` : ''}</Text>
                    </View>
                    <Ionicons name={shown?._id === c._id ? 'eye' : 'chevron-forward'} size={16} color={Colors.textLight} />
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        ) : null}
        <Text style={s.help}>Card lost or damaged? Tell the school office — they will block it and issue a replacement.</Text>
      </ScrollView>
      <Modal visible={present && !!shown} animationType="fade" onRequestClose={() => setPresent(false)} presentationStyle="fullScreen" statusBarTranslucent>
        {shown ? <Present card={shown} onClose={() => setPresent(false)} /> : null}
      </Modal>
    </>
  );
}

/** A student's cards by academic year, newest year first; everyone else's in one list. */
function useMemoGroups(cards: any[]) {
  return useMemo(() => {
    if (!cards.length) return [];
    if (cards[0].kind !== 'student') return [{ key: 'all', label: '', cards }];
    const by = new Map<string, any[]>();
    for (const c of cards) {
      const k = c.academicYear?.yearName || c.snapshot?.yearName || '—';
      if (!by.has(k)) by.set(k, []);
      by.get(k)!.push(c);
    }
    return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([label, list]) => ({ key: label, label, cards: list }));
  }, [cards]);
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  body: { padding: Spacing.md, paddingBottom: 110 },
  hero: { borderRadius: 22, overflow: 'hidden', backgroundColor: '#1D1A54', paddingBottom: 18 },
  stage: { paddingTop: 0, alignItems: 'center' },
  info: { paddingHorizontal: 18, marginTop: -4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99 },
  pillText: { fontSize: 11, fontWeight: '700' },
  year: { fontSize: 12, fontWeight: '700', color: '#fff', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  name: { marginTop: 10, fontSize: 24, fontWeight: '800', color: '#fff' },
  sub: { marginTop: 2, fontSize: 14, color: 'rgba(255,255,255,0.78)', fontWeight: '600' },
  state: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(34,197,94,0.16)', borderWidth: 1, borderColor: 'rgba(134,239,172,0.3)' },
  stateVoid: { backgroundColor: 'rgba(248,113,113,0.16)', borderColor: 'rgba(252,165,165,0.3)' },
  stateText: { fontSize: 12.5, fontWeight: '600', color: '#BBF7D0', flexShrink: 1 },
  facts: { flexDirection: 'row', gap: 10, marginTop: 14 },
  fact: { flex: 1, padding: 11, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  factLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 0.8 },
  factValue: { marginTop: 4, fontSize: 14.5, fontWeight: '800', color: '#fff' },
  acts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.1)' },
  btnLight: { backgroundColor: '#fff', borderColor: '#fff' },
  btnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  none: { alignItems: 'center', gap: 8, padding: 26, borderRadius: 20, backgroundColor: '#1D1A54' },
  noneTitle: { fontSize: 17, fontWeight: '800', color: '#fff', textAlign: 'center' },
  noneText: { fontSize: 13, color: 'rgba(255,255,255,0.72)', textAlign: 'center', lineHeight: 19 },
  next: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#A5B4FC', backgroundColor: '#EEF2FF' },
  nextText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: Colors.primary },
  h2: { fontSize: 16, fontWeight: '800', color: Colors.text },
  h2sub: { marginTop: 2, fontSize: 12, color: Colors.textSecondary },
  groupLabel: { fontSize: 13, fontWeight: '800', color: Colors.text, marginBottom: 6, marginTop: 4 },
  hrow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, marginBottom: 8 },
  hrowOn: { borderColor: '#A5B4FC', backgroundColor: '#F7F7FF' },
  thumb: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  hnum: { fontSize: 14, fontWeight: '800', color: Colors.text, letterSpacing: 0.3 },
  hline: { marginTop: 3, fontSize: 12.5, color: Colors.text, fontWeight: '500' },
  hwhen: { marginTop: 2, fontSize: 11.5, color: Colors.textSecondary },
  help: { marginTop: 16, fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },
  present: { flex: 1, backgroundColor: '#100E2C', alignItems: 'center', paddingHorizontal: 20 },
  presentSchool: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 1.2, textAlign: 'center' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.1)' },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#22C55E' },
  liveText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
  presentDate: { marginTop: 6, fontSize: 12.5, color: 'rgba(255,255,255,0.6)' },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(34,197,94,0.16)', borderWidth: 1, borderColor: 'rgba(134,239,172,0.3)' },
  verdictVoid: { backgroundColor: 'rgba(248,113,113,0.16)', borderColor: 'rgba(252,165,165,0.3)' },
  verdictText: { fontSize: 15, fontWeight: '800', color: '#BBF7D0' },
  presentTip: { marginTop: 10, fontSize: 12.5, color: 'rgba(255,255,255,0.62)' },
  done: { marginTop: 14, height: 44, paddingHorizontal: 28, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center' },
  doneText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
