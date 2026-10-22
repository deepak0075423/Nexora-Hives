/**
 * When the school has changed its privacy notice since the family agreed to
 * it, the family reads and agrees again before carrying on — the server
 * refuses changes until they do (school-backend services/admission/access.js).
 *
 * Wraps the applicant screens. "Your data" is left outside it on purpose: a
 * family that does not agree can still download what is held or ask for it
 * to be erased.
 */
import React, { useState } from 'react';
import { Text, ScrollView, View, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { portal } from '@/api/admission.api';
import { Page, Btn, Muted, Tick, useApi, errMsg, say } from '../parts';

export default function ConsentRequired({ children }: { children: React.ReactNode }) {
  const { data, reload } = useApi<any>(() => portal.privacy(), []);
  const c = data?.consent;
  if (c && Number(c.agreedVersion || 0) < Number(c.currentVersion || 1)) {
    return <ConsentGate notice={c.notice} version={c.currentVersion} onAgreed={reload} />;
  }
  return <>{children}</>;
}

function ConsentGate({ notice, version, onAgreed }: { notice: string; version: number; onAgreed: () => void }) {
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const agree = async () => {
    setBusy(true);
    try { await portal.consent(version); onAgreed(); } catch (e) { say('Not saved', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Page title="Privacy notice" options={{ headerBackVisible: false }}>
      <Text style={st.title}>The privacy notice has changed</Text>
      <Muted>Please read the school’s updated privacy notice. You can carry on with your applications once you agree to it.</Muted>
      <ScrollView style={st.notice} nestedScrollEnabled>
        <Text style={st.noticeText}>{notice}</Text>
      </ScrollView>
      <Tick on={read} onChange={setRead} label="I have read the privacy notice and agree to my information being used as it describes." />
      <View style={{ marginTop: 10 }}><Btn kind="primary" block disabled={!read || busy} onPress={agree}>Agree and continue</Btn></View>
    </Page>
  );
}

const st = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', color: Colors.text, marginBottom: 6 },
  notice: { maxHeight: 360, marginVertical: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#fff' },
  noticeText: { fontSize: 13, color: Colors.text, lineHeight: 19 },
});
