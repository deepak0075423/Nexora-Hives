import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet, Alert, Linking } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as dirApi from '@/api/employeeDirectory.api';
import { BASE_URL } from '@/api/axios';
import {
  unwrap, LoaderView, Empty, Badge, Card, SectionTitle, StatTile, StatRow, ActionBtn,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

// ─────────────────────────────────────────────────────────────────────────────
//  Profile verification.
//
//  Signing a section off means someone looked at the evidence, so Verify stays
//  disabled until they have. What counts as evidence depends on the section:
//
//    • Backed by uploads (Government ID, Employment Documents) — every document
//      on file must be opened. One of these with NOTHING uploaded cannot be
//      verified at all; the server refuses it too.
//    • Field-only (Personal, Contact, Education, Bank) — the employee's record
//      must be opened, which is where those values live.
//
//  "Reviewed" is per session on purpose: it records that THIS reviewer opened
//  the evidence before signing, not that anyone ever did.
// ─────────────────────────────────────────────────────────────────────────────

const UPLOADS_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');
const fileUrl = (p?: string) => (!p ? '' : /^https?:/.test(p) ? p : `${UPLOADS_ORIGIN}${p}`);

const TONE: Record<string, any> = { verified: 'success', pending: 'warning', rejected: 'danger' };

export default function EmployeeVerificationScreen() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fatal, setFatal] = useState<{ message: string; code?: string } | null>(null);
  const [open, setOpen] = useState('');
  const [busy, setBusy] = useState('');
  const [seen, setSeen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setData(unwrap(await dirApi.getVerificationQueue()));
      setFatal(null);
    } catch (e: any) {
      setFatal({ message: e?.message || 'Could not load verification', code: e?.data?.code });
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const mark = (k: string) => setSeen(s => new Set(s).add(k));
  const keysFor = (id: string, sec: any) => (
    sec.documents.length
      ? sec.documents.map((d: any) => `${id}:${sec.section}:${d.key}`)
      : [`${id}:${sec.section}:record`]
  );
  const reviewed = (id: string, sec: any) => keysFor(id, sec).every((k: string) => seen.has(k));

  const verify = async (id: string, section: string, status: string) => {
    setBusy(`${id}:${section}`);
    try {
      await dirApi.setVerification(id, { section, status });
      await load();
    } catch (e: any) { Alert.alert('Could not update', e?.message || 'Please try again'); }
    finally { setBusy(''); }
  };

  const openDoc = (url: string, key: string) => {
    mark(key);
    Linking.openURL(fileUrl(url)).catch(() => Alert.alert('Could not open', 'This document could not be opened.'));
  };

  if (loading) return (<><Stack.Screen options={{ title: 'Verification' }} /><LoaderView /></>);

  if (fatal) {
    const blocked = fatal.code && MODULE_BLOCKED_CODES.includes(fatal.code);
    return (
      <>
        <Stack.Screen options={{ title: 'Verification' }} />
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <Empty icon={blocked ? 'lock-closed-outline' : 'cloud-offline-outline'} text={fatal.message} />
        </View>
      </>
    );
  }

  const employees = data?.employees ?? [];

  return (
    <>
      <Stack.Screen options={{ title: 'Verification' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <StatRow>
          <StatTile label="Fully verified" value={data?.fullyVerified ?? 0} icon="shield-checkmark" tone="success" />
          <StatTile label="Employees" value={employees.length} icon="people" tone="info" />
          <StatTile
            label="Outstanding"
            value={Math.max(0, employees.length - (data?.fullyVerified ?? 0))}
            icon="hourglass" tone="warning"
          />
        </StatRow>

        {employees.length === 0 ? (
          <Empty icon="shield-outline" text="No employees to verify yet" />
        ) : employees.map((e: any) => (
          <Card key={e._id} style={{ marginBottom: Spacing.sm }}>
            <TouchableOpacity
              style={s.head}
              activeOpacity={0.75}
              onPress={() => setOpen(open === e._id ? '' : e._id)}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.name} numberOfLines={1}>{e.name}</Text>
                <Text style={s.sub} numberOfLines={1}>
                  {[e.employeeId, e.designation].filter(Boolean).join(' · ') || 'No designation'}
                </Text>
              </View>
              <Badge label={`${e.verifiedCount}/${e.totalSections}`} tone={e.verifiedCount === e.totalSections ? 'success' : 'warning'} />
              <Ionicons
                name={open === e._id ? 'chevron-up' : 'chevron-down'}
                size={16} color={Colors.textLight} style={{ marginLeft: 8 }}
              />
            </TouchableOpacity>

            {open === e._id && (
              <View style={{ marginTop: Spacing.sm }}>
                <Text style={s.hint}>Open the evidence for a section to unlock its Verify button.</Text>
                {e.sections.map((sec: any) => {
                  const done = reviewed(e._id, sec);
                  const blocked = sec.missingDocuments;
                  return (
                    <View key={sec.section} style={s.section}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={s.secName}>{sec.label}</Text>
                        <Badge label={sec.status} tone={TONE[sec.status]} />
                      </View>

                      <View style={s.evidence}>
                        {blocked && <Badge label="No document on file" tone="warning" />}

                        {sec.documents.map((d: any) => {
                          const k = `${e._id}:${sec.section}:${d.key}`;
                          return (
                            <TouchableOpacity
                              key={d.key}
                              style={[s.doc, seen.has(k) && s.docSeen]}
                              onPress={() => openDoc(d.url, k)}
                            >
                              <Ionicons
                                name={seen.has(k) ? 'checkmark-circle' : 'eye-outline'}
                                size={13} color={seen.has(k) ? Colors.success : Colors.primary}
                              />
                              <Text style={[s.docText, seen.has(k) && { color: Colors.textSecondary }]}>{d.label}</Text>
                            </TouchableOpacity>
                          );
                        })}

                        {!blocked && sec.documents.length === 0 && (
                          <TouchableOpacity
                            style={[s.doc, seen.has(`${e._id}:${sec.section}:record`) && s.docSeen]}
                            onPress={() => mark(`${e._id}:${sec.section}:record`)}
                          >
                            <Ionicons
                              name={seen.has(`${e._id}:${sec.section}:record`) ? 'checkmark-circle' : 'eye-outline'}
                              size={13} color={seen.has(`${e._id}:${sec.section}:record`) ? Colors.success : Colors.primary}
                            />
                            <Text style={[s.docText, seen.has(`${e._id}:${sec.section}:record`) && { color: Colors.textSecondary }]}>
                              Mark details reviewed
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <View style={{ flex: 1 }}>
                          {blocked ? (
                            <Text style={s.blockedNote}>Nothing uploaded for this section yet.</Text>
                          ) : !done ? (
                            <Text style={s.blockedNote}>Open the evidence above to enable Verify.</Text>
                          ) : sec.status !== 'verified' ? (
                            <ActionBtn
                              label={busy === `${e._id}:${sec.section}` ? 'Saving…' : 'Verify'}
                              tone="success" small
                              onPress={() => verify(e._id, sec.section, 'verified')}
                            />
                          ) : (
                            <ActionBtn label="Reset to pending" tone="neutral" small
                              onPress={() => verify(e._id, sec.section, 'pending')} />
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </Card>
        ))}

        <SectionTitle>By section</SectionTitle>
        <Card>
          {(data?.sectionTotals ?? []).map((t: any) => (
            <View key={t.section} style={s.totalRow}>
              <Text style={s.totalLabel}>{t.label}</Text>
              <Text style={s.totalValue}>{t.verified} / {t.verified + t.pending + t.rejected}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 14.5, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  hint: { fontSize: 11.5, color: Colors.textLight, marginBottom: 8 },
  section: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.divider },
  secName: { fontSize: 13, fontWeight: '600', color: Colors.text, flex: 1 },
  evidence: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  doc: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
  },
  docSeen: { backgroundColor: Colors.successLight, borderColor: Colors.successLight },
  docText: { fontSize: 11.5, fontWeight: '600', color: Colors.primary },
  blockedNote: { fontSize: 11.5, color: Colors.textLight, paddingVertical: 6 },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  totalLabel: { fontSize: 13, color: Colors.text },
  totalValue: { fontSize: 13, fontWeight: '700', color: Colors.text },
});
