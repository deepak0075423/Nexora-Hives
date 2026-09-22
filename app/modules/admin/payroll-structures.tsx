/**
 * Payroll → Salary Structures, on the phone.
 *
 * A structure is a rule set, not a list of amounts — "50% of CTC" rather than
 * "₹25,000" — so the list shows the rule and tapping a row shows what the rule
 * actually pays, priced by the server's own engine at a CTC you can change.
 *
 * Building one component by component is a desk job; the phone offers the
 * templates instead, which are the same starting points the web offers and
 * already add up to CTC.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as payrollApi from '@/api/payroll.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, FAB, FormModal, SegTabs, ActionBtn, Input, confirmAsync,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import {
  Figures, Panel, Facts, Pill, PersonRow, NoteBox, Blank, Ledger, NetBar,
  money, shortDate, STRUCTURE_TYPE,
} from '@/components/payroll/parts';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'default', label: 'Default' },
];

export default function AdminPayrollStructuresScreen() {
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const [detail, setDetail] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [sampleCtc, setSampleCtc] = useState('600000');

  const [templating, setTemplating] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const res: any = await payrollApi.getStructures({ tab, limit: 100 });
      setRows(res?.data ?? []);
      setSummary(res?.summary ?? {});
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  /** What the selected structure pays, priced by the server's engine. */
  const priceIt = useCallback(async (structureId: string, ctc: string) => {
    try {
      setPreview(unwrap(await payrollApi.previewStructure({ structureId, annualCtc: Number(ctc) || 600000 })));
    } catch { setPreview(null); }
  }, []);

  const openDetail = async (row: any) => {
    setDetail(row); setPreview(null);
    priceIt(row._id, sampleCtc);
  };

  const openTemplates = async () => {
    setTemplating(true);
    try { setTemplates(unwrap(await payrollApi.getLibrary())?.templates ?? []); }
    catch { setTemplates([]); }
  };

  const applyTemplate = async (key: string) => {
    setBusy(true);
    try {
      const res: any = await payrollApi.createFromTemplate({ template: key });
      setTemplating(false); load();
      Alert.alert('Created', `“${res?.data?.name}” is ready. Edit its components on the web when you need to.`);
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setBusy(false); }
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Salary Structures' }} /><ModuleDisabled /></>);

  const d = detail;

  return (
    <>
      <Stack.Screen options={{ title: 'Salary Structures' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          <Figures items={[
            { icon: 'layers', tone: 'indigo', label: 'Structures', value: summary.total ?? '--', caption: 'All pay structures' },
            { icon: 'checkmark-circle', tone: 'green', label: 'Active', value: summary.active ?? '--', caption: 'Currently in use' },
            { icon: 'pause-circle', tone: 'orange', label: 'Inactive', value: summary.inactive ?? '--', caption: 'Not in use' },
            { icon: 'people', tone: 'blue', label: 'Employees', value: summary.employees ?? '--', caption: 'Across all structures' },
          ]} />

          <View style={{ marginBottom: Spacing.sm }}>
            <SegTabs tabs={TABS} active={tab} onChange={setTab} />
          </View>

          {loading ? <LoaderView /> : rows.length === 0 ? (
            <Blank icon="git-network-outline" title="No salary structures"
              body="A structure turns an employee's CTC into earnings and deductions. Start from a template." >
              <ActionBtn label="Use a template" tone="primary" onPress={openTemplates} />
            </Blank>
          ) : (
            <Panel icon="git-network" tone="orange" title={`${rows.length} structure${rows.length === 1 ? '' : 's'}`}>
              {rows.map(r => (
                <PersonRow key={r._id} name={r.name} tone={STRUCTURE_TYPE[r.type]?.[0] || 'slate'}
                  sub={`${r.basic.label} ${r.basic.caption} · ${r.counts.total} components · ${r.employees} employee${r.employees === 1 ? '' : 's'}`}
                  right={<Pill label={r.isDefault ? 'Default' : r.isActive ? 'Active' : 'Inactive'}
                    tone={r.isDefault ? 'indigo' : r.isActive ? 'green' : 'slate'} />}
                  onPress={() => openDetail(r)} />
              ))}
            </Panel>
          )}
        </ScrollView>
        <FAB icon="albums" onPress={openTemplates} />
      </View>

      {/* ── One structure ──────────────────────────────────────────────── */}
      <FormModal visible={!!detail} title={d?.name || ''} onClose={() => { setDetail(null); setPreview(null); }}
        onSubmit={undefined as any} submitLabel="">
        {!!d && (
          <>
            <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', marginBottom: Spacing.sm }}>
              <Pill label={STRUCTURE_TYPE[d.type]?.[1] || 'General'} tone={STRUCTURE_TYPE[d.type]?.[0] || 'slate'} />
              <Pill label={d.isDefault ? 'Default' : d.isActive ? 'Active' : 'Inactive'}
                tone={d.isDefault ? 'indigo' : d.isActive ? 'green' : 'slate'} />
            </View>

            <Facts items={[
              ['Description', d.description || '—'],
              ['Basic salary', `${d.basic.label} ${d.basic.caption}`.trim()],
              ['Components', `${d.counts.total} (${d.counts.earnings} earnings + ${d.counts.deductions} deductions${d.counts.employer ? ` + ${d.counts.employer} employer` : ''})`],
              ['Employees assigned', String(d.employees)],
              ['Last updated', `${shortDate(d.updatedAt)}${d.updatedByName ? ` by ${d.updatedByName}` : ''}`],
            ] as [string, React.ReactNode][]} />

            {d.payBasis !== 'rate' && (
              <Input label="What it pays at this CTC" value={sampleCtc} keyboardType="numeric"
                onChange={(v: string) => { setSampleCtc(v); priceIt(d._id, v); }} />
            )}

            {!preview ? <LoaderView /> : (
              <View style={{ marginTop: Spacing.sm }}>
                <Ledger title="Earnings" rows={preview.earnings} total={preview.grossSalary} />
                {preview.deductions.length > 0 && (
                  <Ledger title="Deductions" tone="red" rows={preview.deductions} total={preview.totalDeductions} />
                )}
                <NetBar value={preview.netSalary} />
                {!preview.balances && (
                  <NoteBox tone="amber">
                    Earnings plus employer cost come to {money(preview.monthlyCost)}, not the {money(preview.monthlyCtc)} a
                    month this CTC implies. Add a “Balance of CTC” earning on the web.
                  </NoteBox>
                )}
              </View>
            )}

            <View style={st.actions}>
              <ActionBtn label="Duplicate" tone="neutral" small disabled={busy} onPress={async () => {
                setBusy(true);
                try { await payrollApi.duplicateStructure(d._id); setDetail(null); load(); }
                catch (e: any) { Alert.alert('Error', e.message); } finally { setBusy(false); }
              }} />
              {!d.isDefault && d.isActive && (
                <ActionBtn label="Make default" tone="neutral" small disabled={busy} onPress={async () => {
                  setBusy(true);
                  try { await payrollApi.setDefaultStructure(d._id); setDetail(null); load(); }
                  catch (e: any) { Alert.alert('Error', e.message); } finally { setBusy(false); }
                }} />
              )}
              <ActionBtn label={d.isActive ? 'Switch off' : 'Switch on'} tone={d.isActive ? 'danger' : 'success'} small
                disabled={busy} onPress={async () => {
                  if (d.isActive && d.employees > 0) {
                    const go = await confirmAsync('Switch this structure off?',
                      `${d.employees} employee${d.employees === 1 ? ' is' : 's are'} paid on “${d.name}”. While it is off, a payroll run will skip them.`,
                      'Switch off');
                    if (!go) return;
                  }
                  setBusy(true);
                  try { await payrollApi.toggleStructure(d._id, { isActive: !d.isActive, force: true }); setDetail(null); load(); }
                  catch (e: any) { Alert.alert('Error', e.message); } finally { setBusy(false); }
                }} />
            </View>

            <NoteBox tone="slate" icon="information-circle">
              Components are edited on the web: ordering rules, percentage bases and statutory ceilings need a wider
              screen than this to get right.
            </NoteBox>
          </>
        )}
      </FormModal>

      {/* ── Templates ──────────────────────────────────────────────────── */}
      <FormModal visible={templating} title="Start from a Template" onClose={() => setTemplating(false)}
        onSubmit={undefined as any} submitLabel="">
        <Text style={st.blurb}>Ready-made structures you can edit. Each one already adds up to CTC.</Text>
        {templates.length === 0 ? <LoaderView /> : templates.map(t => (
          <PersonRow key={t.key} name={t.name} tone={STRUCTURE_TYPE[t.type]?.[0] || 'slate'}
            sub={`${t.description} · ${t.components} components${t.payBasis === 'rate' ? ` · ${money(t.rate)} per class` : ''}`}
            right={<ActionBtn label="Use" tone="primary" small disabled={busy} onPress={() => applyTemplate(t.key)} />} />
        ))}
      </FormModal>
    </>
  );
}

const st = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md, marginBottom: Spacing.sm },
  blurb: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginBottom: Spacing.sm },
});
