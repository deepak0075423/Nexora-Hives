/**
 * An admission applicant signed in on the phone (Oct 2026).
 *
 * An applicant (role "guest") is not yet a student or parent of the school,
 * and the server refuses them every other screen of the app. Here they follow
 * their applications — tap one for all of it (app/modules/applicant-application.tsx):
 * answering an offer, uploading documents, choosing an interview time, paying,
 * appealing — and see what the school has told them lately; book a campus
 * visit; see and ask about what the school holds about them; and, where the
 * school is one branch of a group, put their applications at the branches in
 * the order they prefer. Starting a new application (the form) and online
 * exams happen on the school's admission portal, one tap away.
 *
 * When the school changes its privacy notice, the family reads and agrees to
 * it before anything else — the server refuses changes until they do.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Radius } from '@/constants/theme';
import { portal } from '@/api/admission.api';
import {
  Page, Panel, Line, Tag, Note, Btn, Row, Muted, BRAND, useApi, fmtDateTime, errMsg, say, unwrapList,
} from '@/components/admission/parts';
import ConsentRequired from '@/components/admission/family/ConsentGate';

const ROLE_WORD: Record<string, string> = { school_admin: 'School admin', teacher: 'Teacher', student: 'Student', parent: 'Parent', guest: 'Applicant' };

export default function ApplicantScreen() {
  const { user, signOut, switchPost } = useAuth();
  const router = useRouter();
  const me = useApi<any>(() => portal.me(), []);
  const apps = useApi<any[]>(() => portal.list(), []);
  const news = useApi<any[]>(() => portal.updates(), []);
  const reload = async () => { await Promise.all([me.reload(), apps.reload(), news.reload()]); };

  const m = me.data;
  const others = (user?.accounts || []).filter((a: any) => !a.current);
  const open = (path: string) => { if (m?.portal?.url) Linking.openURL(`${m.portal.url}${path}`).catch(() => {}); };
  const help = m?.portal?.help || {};
  const phone = help.phone || m?.portal?.contact?.phone;
  const email = help.email || m?.portal?.contact?.email;

  return (
    <ConsentRequired>
    <Page title="Admissions" loading={me.loading && !m} error={!m ? me.error : ''} onRetry={reload} onRefresh={reload} options={{ headerBackVisible: false }}>
      {m ? (
        <>
          <View style={st.hero}>
            <Ionicons name="school" size={26} color="#fff" />
            <Text style={st.heroTitle}>{m.portal.title || 'Admissions'}</Text>
            <Text style={st.heroSchool}>{m.portal.schoolName}</Text>
            <Text style={st.heroText}>Answer offers, upload documents, choose interview times, pay fees and book a visit — here. A new application form and online exams are on the school’s admission portal.</Text>
            {m.portal.status === 'open' ? (
              <TouchableOpacity style={st.heroBtn} onPress={() => open('/dashboard')} accessibilityRole="link">
                <Ionicons name="open-outline" size={17} color={Colors.primary} />
                <Text style={st.heroBtnText}>Start an application on the portal</Text>
              </TouchableOpacity>
            ) : <Text style={st.heroNote}>{m.portal.status === 'maintenance' ? 'The portal is being updated — try again shortly.' : 'The school is not taking new applications just now.'}</Text>}
          </View>

          <View style={st.quick}>
            {m.portal.visits ? <Quick icon="calendar-outline" label="Book a campus visit" onPress={() => router.push('/modules/applicant-visits' as any)} /> : null}
            <Quick icon="shield-checkmark-outline" label="Your data" onPress={() => router.push('/modules/applicant-privacy' as any)} />
          </View>

          {unwrapList(apps.data).length ? (
            <Panel icon="document-text-outline" title="Your applications">
              {unwrapList(apps.data).map((a, i, all) => (
                <Line key={a._id} last={i === all.length - 1} onPress={() => router.push({ pathname: '/modules/applicant-application' as any, params: { id: a._id } })}
                  title={a.studentName || 'New application'}
                  sub={[[a.className, a.roundName, a.applicationNumber].filter(Boolean).join(' · '), a.statusText].filter(Boolean).join('\n')}
                  right={<Tag value={a.status} />} />
              ))}
            </Panel>
          ) : apps.data ? <Note tone="indigo" icon="document-text-outline">No applications yet. Start one on the school’s admission portal; it appears here as soon as it is saved.</Note> : null}

          <BranchOrder />

          {unwrapList(news.data).length ? (
            <Panel icon="megaphone-outline" tone="violet" title="Latest from the school">
              {unwrapList(news.data).slice(0, 8).map((u, i, all) => (
                <Line key={u._id} last={i === all.length - 1}
                  title={<Text style={st.newsText}><Text style={{ fontWeight: '700', color: Colors.text }}>{u.studentName || u.applicationNumber || 'Application'}</Text> — {u.message}</Text>}
                  sub={fmtDateTime(u.createdAt)} />
              ))}
            </Panel>
          ) : null}

          {phone || email ? (
            <Panel icon="call-outline" tone="teal" title={help.name || 'Admission office'}>
              {help.text ? <Muted>{help.text}</Muted> : null}
              {phone ? <Line icon="call-outline" tone="teal" title={phone} sub="Call the admission office" onPress={() => Linking.openURL(`tel:${phone}`).catch(() => {})} /> : null}
              {email ? <Line icon="mail-outline" tone="teal" title={email} sub="Write to the admission office" onPress={() => Linking.openURL(`mailto:${email}`).catch(() => {})} last={!m.portal.contact?.hours} /> : null}
              {m.portal.contact?.hours ? <Muted>Office hours: {m.portal.contact.hours}</Muted> : null}
            </Panel>
          ) : null}

          <Panel icon="person-circle-outline" tone="slate" title="Your account">
            <Line title={m.user.name} sub={m.user.email} last={!others.length} />
            {others.map((a: any, i: number) => (
              <Line key={a.id} icon="swap-horizontal-outline" tone="slate" last={i === others.length - 1} onPress={() => { switchPost(a.id).catch(() => {}); }}
                title={a.school?.name || a.name} sub={`${ROLE_WORD[a.role] || a.role} — ${a.email}`} />
            ))}
          </Panel>

          <TouchableOpacity style={st.signOut} onPress={() => { signOut(); }} accessibilityRole="button">
            <Ionicons name="log-out-outline" size={18} color={Colors.textSecondary} />
            <Text style={st.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </Page>
    </ConsentRequired>
  );
}

function Quick({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={st.quickBtn} onPress={onPress} accessibilityRole="button" activeOpacity={0.8}>
      <Ionicons name={icon} size={18} color={BRAND} />
      <Text style={st.quickText}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * Applications at the branches of a group of schools, in the order the family
 * prefers — each branch sees the order (and, where the group shares it, where
 * the family stands at the others).
 */
function BranchOrder() {
  const { data, reload } = useApi<any>(() => portal.group(), []);
  const [order, setOrder] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const list = unwrapList(data?.applications);
  if (list.length < 2) return null;
  const openApps = list.filter((a) => a.open);
  const shown = order ? order.map((id) => openApps.find((a) => String(a._id) === id)).filter(Boolean) : openApps;
  const move = (i: number, d: number) => {
    const ids = shown.map((a: any) => String(a._id));
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder(ids);
  };
  const save = async () => {
    setBusy(true);
    try { await portal.groupOrder(shown.map((a: any) => String(a._id))); setOrder(null); say('Saved', 'Your order of preference is saved.'); reload(); }
    catch (e) { say('Not saved', errMsg(e)); } finally { setBusy(false); }
  };
  const closed = list.filter((a) => !a.open);
  return (
    <Panel icon="git-branch-outline" tone="violet" title={`Your applications at ${data.name}`}
      subtitle={data.shareStatus ? 'Put the branches in the order you prefer — each branch sees your order and where you stand elsewhere.' : 'Put the branches in the order you prefer.'}>
      {shown.map((a: any, i: number) => (
        <View key={a._id} style={st.branch}>
          <Text style={st.branchN}>{i + 1}</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.branchName}>{a.schoolName}</Text>
            <Muted>{[a.className, a.studentName, a.statusLabel].filter(Boolean).join(' · ')}</Muted>
          </View>
          <TouchableOpacity onPress={() => move(i, -1)} disabled={i === 0} style={[st.arrow, i === 0 && { opacity: 0.3 }]} accessibilityLabel={`Move ${a.schoolName} up`}>
            <Ionicons name="arrow-up" size={16} color={Colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => move(i, 1)} disabled={i === shown.length - 1} style={[st.arrow, i === shown.length - 1 && { opacity: 0.3 }]} accessibilityLabel={`Move ${a.schoolName} down`}>
            <Ionicons name="arrow-down" size={16} color={Colors.text} />
          </TouchableOpacity>
        </View>
      ))}
      {order ? <Row><Btn kind="primary" icon="checkmark-outline" disabled={busy} onPress={save}>Save the order</Btn><Btn onPress={() => setOrder(null)}>Undo</Btn></Row> : null}
      {closed.length ? <Muted>Closed: {closed.map((a) => `${a.schoolName} (${a.statusLabel})`).join(', ')}.</Muted> : null}
    </Panel>
  );
}

const st = StyleSheet.create({
  hero: { backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: 18, marginBottom: 12, gap: 5 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginTop: 6 },
  heroSchool: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  heroText: { fontSize: 13, color: 'rgba(255,255,255,0.92)', lineHeight: 19, marginTop: 4 },
  heroNote: { fontSize: 12.5, color: 'rgba(255,255,255,0.8)', marginTop: 6 },
  heroBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 10, paddingVertical: 11, marginTop: 10 },
  heroBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  quick: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  quickBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 13, borderRadius: Radius.lg, backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.border },
  quickText: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.text },
  newsText: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
  branch: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  branchN: { width: 22, fontSize: 15, fontWeight: '800', color: BRAND },
  branchName: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  arrow: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  signOutText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
});
