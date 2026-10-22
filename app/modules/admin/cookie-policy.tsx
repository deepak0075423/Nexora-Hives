/**
 * School settings → Privacy & cookies, on the phone (Oct 2026) — the school
 * admin's own cookie policy: whether the school's admission portal shows a
 * consent banner and what it says, which optional categories exist (and the
 * Google Analytics or Meta Pixel ID behind them — an ID, never a script), what
 * is stored and why, the policy's own words, and the answers visitors gave.
 *
 * The server checks everything again and decides when a change is big enough
 * that visitors must be asked again (a new version)
 * (school-backend controllers/cookiePolicy.controller.js).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import api from '@/api/axios';
import { confirmAsync } from '@/components/ui/kit';
import { openAdmissionFile } from '@/components/admission/files';
import { Page, Panel, Btn, Row, Note, Muted, Field, Box, Pick, Tick, Pill, Facts, Fact, BRAND, useApi, errMsg, say, unwrapList } from '@/components/admission/parts';

const CATS = [{ key: 'preferences', label: 'Preferences' }, { key: 'analytics', label: 'Analytics' }, { key: 'marketing', label: 'Advertising' }];
const CAT_LABEL: Record<string, string> = { essential: 'Essential', preferences: 'Preferences', analytics: 'Analytics', marketing: 'Advertising' };
const TYPES = [['cookie', 'Cookie'], ['local_storage', 'Local storage'], ['session_storage', 'Session storage']];
const ACTION_LABEL: Record<string, string> = { accept_all: 'Accepted all', reject_all: 'Rejected optional', custom: 'Chose some', withdraw: 'Withdrew' };

const editable = (p: any) => ({
  enabled: p.enabled !== false,
  bannerTitle: p.bannerTitle || '',
  bannerText: p.bannerText || '',
  essentialDescription: p.essentialDescription || '',
  categories: Object.fromEntries(CATS.map(({ key }) => [key, { enabled: !!p.categories?.[key]?.enabled, description: p.categories?.[key]?.description || '' }])),
  integrations: { ga4MeasurementId: p.integrations?.ga4MeasurementId || '', metaPixelId: p.integrations?.metaPixelId || '' },
  items: unwrapList(p.items).map((x: any) => ({ ...x })),
  sections: unwrapList(p.sections).map((x: any) => ({ ...x })),
  contactEmail: p.contactEmail || '',
  consentDays: p.consentDays || 180,
});

export default function CookiePolicyScreen() {
  const { data, loading, error, reload, setData } = useApi<any>(() => api.get('/admin/cookie-policy'), []);
  const stats = useApi<any>(() => api.get('/admin/cookie-policy/consents?days=30'), []);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data?.policy) setForm(editable(data.policy)); }, [data]);
  const saved = useMemo(() => (data?.policy ? JSON.stringify(editable(data.policy)) : ''), [data]);
  const dirty = !!form && JSON.stringify(form) !== saved;
  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));
  const setCat = (key: string, patch: any) => setForm((f: any) => ({ ...f, categories: { ...f.categories, [key]: { ...f.categories[key], ...patch } } }));
  const setItem = (i: number, patch: any) => setForm((f: any) => ({ ...f, items: f.items.map((x: any, j: number) => (j === i ? { ...x, ...patch } : x)) }));
  const setSec = (i: number, patch: any) => setForm((f: any) => ({ ...f, sections: f.sections.map((x: any, j: number) => (j === i ? { ...x, ...patch } : x)) }));
  const save = async () => {
    setSaving(true);
    const before = data.policy.version;
    try {
      const r: any = await api.put('/admin/cookie-policy', { ...form, consentDays: Number(form.consentDays) || 180 });
      setData(r?.data);
      say(r?.data?.policy?.version > before ? 'Saved — visitors will be asked for their choice again' : 'Cookie policy saved');
    } catch (e) { say('Not saved', errMsg(e)); } finally { setSaving(false); }
  };
  const reset = async () => {
    if (!(await confirmAsync('Reset the cookie policy?', 'Put it back to the platform\'s default wording and switch every optional category off.', 'Reset'))) return;
    setSaving(true);
    try { const r: any = await api.post('/admin/cookie-policy/reset'); setData(r?.data); say('Back to the default cookie policy'); } catch (e) { say('Not reset', errMsg(e)); } finally { setSaving(false); }
  };
  if (!form || !data) return <Page title="Privacy & cookies" loading={loading} error={error} onRetry={reload} />;
  const anyOptional = CATS.some(({ key }) => form.categories[key].enabled);
  const autoItems = unwrapList(data.page?.items).filter((x: any) => !form.items.some((y: any) => y.name === x.name && y.provider === x.provider))
    .filter((x: any) => !unwrapList(data.policy.items).some((y: any) => y.name === x.name && y.provider === x.provider));
  const preview = {
    title: form.bannerTitle || 'Cookies on this site',
    text: form.bannerText || (anyOptional
      ? 'We use essential storage to keep the site working. With your permission we would also like to use optional cookies — choose which, or accept or reject them all. You can change your mind at any time.'
      : 'This site uses only essential storage, to keep you signed in and remember your choices. No tracking or advertising cookies are used.'),
  };
  const s = stats.data;
  return (
    <Page title="Privacy & cookies" onRefresh={reload}>
      <Panel icon="shield-outline" tone="indigo" title="Cookie banner" subtitle="Shown at the foot of the school's admission portal until a visitor answers it" right={<Pill tone="slate">{`Version ${data.policy.version}`}</Pill>}>
        <Tick on={form.enabled} onChange={(v) => set({ enabled: v })} label="Show the cookie banner on the admission portal (off: the portal still links to the policy, asks nothing, and optional cookies never run)" />
        <Field label="Heading"><Box value={form.bannerTitle} onChange={(v) => set({ bannerTitle: v })} maxLength={80} text="title" placeholder="Cookies on this site" /></Field>
        <Field label="Text" hint="Leave empty to use wording that matches the categories switched on"><Box value={form.bannerText} onChange={(v) => set({ bannerText: v })} multiline maxLength={600} /></Field>
        <Field label="Remember a visitor's choice for (days)" hint="30 to 365. After that the banner asks again."><Box value={String(form.consentDays)} onChange={(v) => set({ consentDays: v })} text="digits" keyboardType="number-pad" /></Field>
        <View style={st.preview} accessibilityLabel="Banner preview">
          <Text style={st.pvTitle}>{preview.title}</Text>
          <Text style={st.pvText}>{preview.text} <Text style={{ color: BRAND, fontWeight: '700' }}>Read the cookie policy</Text></Text>
          <Row>{anyOptional ? <><Pill tone="slate">Choose</Pill><Pill tone="indigo">Reject optional</Pill><Pill tone="indigo">Accept all</Pill></> : <Pill tone="indigo">OK</Pill>}</Row>
        </View>
      </Panel>

      <Panel icon="options-outline" tone="violet" title="Categories" subtitle="Essential storage is always on. Switch an optional one on only when something on the portal really uses it.">
        <Text style={st.h}>Essential — always on</Text>
        <Box value={form.essentialDescription} onChange={(v) => set({ essentialDescription: v })} multiline maxLength={600} />
        {CATS.map(({ key, label }) => (
          <View key={key} style={st.cat}>
            <Tick on={form.categories[key].enabled} onChange={(v) => setCat(key, { enabled: v })} label={label} />
            <Box value={form.categories[key].description} onChange={(v) => setCat(key, { description: v })} multiline maxLength={600} />
            {key === 'analytics' && form.categories.analytics.enabled ? (
              <Field label="Google Analytics 4 measurement ID"><Box value={form.integrations.ga4MeasurementId} onChange={(v) => set({ integrations: { ...form.integrations, ga4MeasurementId: v.toUpperCase() } })} text="token" placeholder="G-XXXXXXXXXX" /></Field>
            ) : null}
            {key === 'marketing' && form.categories.marketing.enabled ? (
              <Field label="Meta Pixel ID"><Box value={form.integrations.metaPixelId} onChange={(v) => set({ integrations: { ...form.integrations, metaPixelId: v.replace(/\D/g, '') } })} text="digits" keyboardType="number-pad" placeholder="Digits only" /></Field>
            ) : null}
          </View>
        ))}
        <Note tone="slate">Analytics and advertising tags load only on the portal’s public pages, only after a visitor agrees, and never on a page with an applicant’s own details. Do not use them to target children.</Note>
      </Panel>

      <Panel icon="layers-outline" tone="teal" title="What is stored" subtitle="Listed on the policy page. The platform's own items and your tags' cookies are added for you.">
        {autoItems.map((x: any) => (
          <View key={`auto-${x.name}`} style={st.item}>
            <Text style={st.itemName}>{x.name}</Text>
            <Muted>{`${x.provider} · ${x.categoryLabel} · ${TYPES.find((t) => t[0] === x.type)?.[1] || x.type} · ${x.duration}\n${x.purpose}`}</Muted>
            <Pill tone="slate">Added for you</Pill>
          </View>
        ))}
        {form.items.map((x: any, i: number) => (
          <View key={`own-${i}`} style={st.item}>
            <Row>
              <View style={{ flex: 1, minWidth: 140 }}><Field label="Name"><Box value={x.name} onChange={(v) => setItem(i, { name: v })} maxLength={80} text="token" /></Field></View>
              <TouchableOpacity onPress={() => set({ items: form.items.filter((_: any, j: number) => j !== i) })} accessibilityLabel={`Remove item ${i + 1}`}><Ionicons name="trash-outline" size={19} color={Colors.danger} /></TouchableOpacity>
            </Row>
            <Field label="Set by"><Box value={x.provider} onChange={(v) => setItem(i, { provider: v })} maxLength={80} text="title" /></Field>
            <Field label="Category"><Pick label="Category" value={x.category} onChange={(v) => setItem(i, { category: v })} options={Object.entries(CAT_LABEL).filter(([k]) => k === 'essential' || form.categories[k]?.enabled).map(([k, l]) => ({ value: k, label: l }))} /></Field>
            <Field label="Kind"><Pick label="Kind" value={x.type} onChange={(v) => setItem(i, { type: v })} options={TYPES.map(([k, l]) => ({ value: k, label: l }))} /></Field>
            <Field label="Kept for"><Box value={x.duration} onChange={(v) => setItem(i, { duration: v })} maxLength={60} text="title" placeholder="1 year" /></Field>
            <Field label="Why"><Box value={x.purpose} onChange={(v) => setItem(i, { purpose: v })} maxLength={300} /></Field>
          </View>
        ))}
        {form.items.length < 40 ? <Btn icon="add" onPress={() => set({ items: [...form.items, { name: '', provider: '', category: 'essential', type: 'cookie', duration: '', purpose: '' }] })}>Add an item</Btn> : null}
      </Panel>

      <Panel icon="document-text-outline" tone="amber" title="The policy's words" subtitle="Each section becomes a heading and its text on the policy page. A blank line starts a new paragraph.">
        {form.sections.map((x: any, i: number) => (
          <View key={i} style={st.item}>
            <Row>
              <View style={{ flex: 1, minWidth: 140 }}><Box value={x.title} onChange={(v) => setSec(i, { title: v })} maxLength={120} text="title" /></View>
              <TouchableOpacity disabled={i === 0} onPress={() => set({ sections: form.sections.map((y: any, j: number, a: any[]) => (j === i - 1 ? a[i] : j === i ? a[i - 1] : y)) })} accessibilityLabel="Move up"><Ionicons name="arrow-up" size={19} color={i === 0 ? Colors.textLight : Colors.text} /></TouchableOpacity>
              <TouchableOpacity disabled={form.sections.length <= 1} onPress={() => set({ sections: form.sections.filter((_: any, j: number) => j !== i) })} accessibilityLabel="Remove section"><Ionicons name="trash-outline" size={19} color={Colors.danger} /></TouchableOpacity>
            </Row>
            <View style={{ height: 6 }} />
            <Box value={x.body} onChange={(v) => setSec(i, { body: v })} multiline maxLength={4000} />
          </View>
        ))}
        {form.sections.length < 20 ? <Btn icon="add" onPress={() => set({ sections: [...form.sections, { title: '', body: '' }] })}>Add a section</Btn> : null}
        <Field label="Questions about privacy go to"><Box value={form.contactEmail} onChange={(v) => set({ contactEmail: v })} maxLength={200} text="email" keyboardType="email-address" placeholder="office@school.example" /></Field>
      </Panel>

      <Row>
        <Btn disabled={saving} onPress={reset}>Reset to default</Btn>
        {dirty ? <Btn disabled={saving} onPress={() => setForm(editable(data.policy))}>Discard</Btn> : null}
        <Btn kind="primary" disabled={!dirty || saving} onPress={save}>{saving ? 'Saving…' : 'Save cookie policy'}</Btn>
      </Row>
      <View style={{ height: 6 }} />
      <Muted>{dirty ? 'Unsaved changes to the cookie policy.' : 'Everything here is saved.'}</Muted>
      {data.portalUrl ? <Btn icon="open-outline" onPress={() => Linking.openURL(data.portalUrl).catch(() => {})}>Open it on the portal</Btn> : null}
      <View style={{ height: 12 }} />

      <Panel icon="bar-chart-outline" tone="green" title="Answers to the banner" subtitle="The last 30 days. Each answer is kept with the policy version it was given for; addresses only as a one-way hash."
        right={<Btn icon="download-outline" onPress={() => openAdmissionFile('/admin/cookie-policy/consents?days=365&format=csv', 'cookie-consents.csv').catch((e) => say('Could not download', errMsg(e)))}>A year</Btn>}>
        {s ? (
          <Facts>{['accept_all', 'reject_all', 'custom', 'withdraw'].map((a) => <Fact key={a} k={ACTION_LABEL[a]} v={String(s.byAction?.[a] || 0)} />)}</Facts>
        ) : <Muted>No answers recorded yet.</Muted>}
      </Panel>
    </Page>
  );
}

const st = StyleSheet.create({
  preview: { marginTop: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#fff', gap: 6 },
  pvTitle: { fontSize: 14, fontWeight: '800', color: Colors.text },
  pvText: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
  h: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  cat: { marginTop: 12, gap: 6 },
  item: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: 4 },
  itemName: { fontSize: 13, fontWeight: '700', color: Colors.text },
});
