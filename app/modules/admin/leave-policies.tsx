import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing, Typography } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Badge, Card, SegTabs, Toggle, Input, Select, ActionBtn,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

// Per-leave-type policy editor. Every leave type carries its own rule set; pick
// a type from the tabs and edit its rules. An unedited type runs on defaults
// seeded from the leave type itself, so nothing changes until it is saved.

const GENDERS = [
  { label: 'Any', value: 'any' },
  { label: 'Female only', value: 'Female' },
  { label: 'Male only', value: 'Male' },
];

const APPROVAL_MODES = [
  { label: 'School admins only', value: 'admin' },
  { label: 'Specific designations only', value: 'designation' },
  { label: 'Admins or specific designations', value: 'both' },
];

export default function AdminLeavePoliciesScreen() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [designations, setDesignations] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [form, setForm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async (keep = selected) => {
    try {
      const res: any = await adminApi.getLeavePolicies();
      const d = unwrap(res);
      setPolicies(d?.policies ?? []);
      setDesignations(d?.designations ?? []);
      const list = d?.policies ?? [];
      const id = keep && list.some((p: any) => p.leaveType._id === keep) ? keep : list[0]?.leaveType?._id;
      setSelected(id ?? '');
      setForm(list.find((p: any) => p.leaveType._id === id) ?? null);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else Alert.alert('Error', err?.data?.message ?? err.message);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const pick = (id: string) => {
    setSelected(id);
    setForm(policies.find((p) => p.leaveType._id === id) ?? null);
  };

  const set   = (patch: object) => setForm((f: any) => ({ ...f, ...patch }));
  const setIn = (key: string, patch: object) => setForm((f: any) => ({ ...f, [key]: { ...f[key], ...patch } }));
  // Numeric fields round-trip through text inputs on mobile
  const numSet = (key: string) => (v: string) => set({ [key]: v === '' ? 0 : Number(v) || 0 });
  const numVal = (key: string) => String(form?.[key] ?? 0);

  const toggleIn = (list: string[] = [], value: string) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.updateLeavePolicy(selected, form);
      Alert.alert('Saved', `${form.leaveType?.name} policy updated`);
      load(selected);
    } catch (err: any) { Alert.alert('Error', err?.data?.message ?? err.message); }
    finally { setSaving(false); }
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Leave Policies' }} /><ModuleDisabled /></>);

  // The server refuses accrual that credits nothing, so the form does not offer
  // to submit it.
  const accrualInvalid = !!form?.monthlyAccrual?.enabled && !(form.monthlyAccrual.daysPerMonth > 0);
  const isCompOff = form?.leaveType?.category === 'compoff';

  return (
    <>
      <Stack.Screen options={{ title: 'Leave Policies' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : policies.length === 0 ? (
          <Empty icon="document-text-outline" text="No leave types yet — create one first" />
        ) : (
          <>
            <SegTabs
              tabs={policies.map((p) => ({ key: p.leaveType._id, label: p.leaveType.code || p.leaveType.name }))}
              active={selected}
              onChange={pick}
            />

            {form && (
              <>
                <Card>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={s.title}>{form.leaveType?.name}</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {!form.saved   ? <Badge label="default" /> : null}
                      {!form.isActive ? <Badge label="off" tone="danger" /> : null}
                    </View>
                  </View>
                  <Text style={s.note}>
                    {form.saved
                      ? 'These rules apply to every application for this leave type.'
                      : 'Running on defaults — saving pins these rules for this leave type.'}
                  </Text>
                  {isCompOff ? (
                    <Text style={s.note}>
                      These rules govern applying for Comp Off leave. How comp off is earned is under Leave → Comp Off.
                    </Text>
                  ) : null}
                </Card>

                <Text style={s.group}>Who may apply</Text>
                <Card>
                  <Text style={s.label}>Eligible designations</Text>
                  <Text style={s.hint}>None selected = everyone</Text>
                  {designations.map((d) => (
                    <Toggle key={d} label={d}
                      value={(form.eligibleDesignations ?? []).includes(d)}
                      onChange={() => set({ eligibleDesignations: toggleIn(form.eligibleDesignations, d) })} />
                  ))}
                  <Toggle label="Teachers" value={(form.eligibleRoles ?? []).includes('teacher')}
                    onChange={() => set({ eligibleRoles: toggleIn(form.eligibleRoles, 'teacher') })} />
                  <Toggle label="School Admins" value={(form.eligibleRoles ?? []).includes('school_admin')}
                    onChange={() => set({ eligibleRoles: toggleIn(form.eligibleRoles, 'school_admin') })} />
                  <Select label="Gender restriction" value={form.gender ?? 'any'}
                    options={GENDERS} onChange={(v: string) => set({ gender: v })} />
                  <Input label="Minimum service (days)" value={numVal('minServiceDays')}
                    onChange={numSet('minServiceDays')} keyboardType="numeric" />
                </Card>

                <Text style={s.group}>Shape of an application</Text>
                <Card>
                  <Text style={s.hint}>0 means no limit</Text>
                  <Input label="Minimum days per application" value={numVal('minDaysPerApplication')}
                    onChange={numSet('minDaysPerApplication')} keyboardType="numeric" />
                  <Input label="Max consecutive days" value={numVal('maxConsecutiveDays')}
                    onChange={numSet('maxConsecutiveDays')} keyboardType="numeric" />
                  <Input label="Advance notice (days)" value={numVal('advanceNoticeDays')}
                    onChange={numSet('advanceNoticeDays')} keyboardType="numeric" />
                  <Toggle label="Allow back-dated applications" value={form.allowBackdated}
                    onChange={(v: boolean) => set({ allowBackdated: v })} />
                  {form.allowBackdated ? (
                    <Input label="Back-dated within (days, 0 = no limit)" value={numVal('backdatedWithinDays')}
                      onChange={numSet('backdatedWithinDays')} keyboardType="numeric" />
                  ) : null}
                </Card>

                <Text style={s.group}>How often</Text>
                <Card>
                  <Input label="Max applications per month" value={numVal('maxApplicationsPerMonth')}
                    onChange={numSet('maxApplicationsPerMonth')} keyboardType="numeric" />
                  <Input label="Max days per month" value={numVal('maxDaysPerMonth')}
                    onChange={numSet('maxDaysPerMonth')} keyboardType="numeric" />
                  <Input label="Max applications per year" value={numVal('maxApplicationsPerYear')}
                    onChange={numSet('maxApplicationsPerYear')} keyboardType="numeric" />
                </Card>

                <Text style={s.group}>Day counting</Text>
                <Card>
                  <Toggle label="Half-day allowed" value={form.halfDayAllowed}
                    onChange={(v: boolean) => set({ halfDayAllowed: v })} />
                  <Toggle label="Sandwich rule" value={form.sandwichRule}
                    onChange={(v: boolean) => set({ sandwichRule: v })}
                    sub="Charges holidays and weekly offs falling inside the leave" />
                </Card>

                <Text style={s.group}>Supporting document</Text>
                <Card>
                  <Toggle label="Requires a supporting document" value={form.requiresDocument}
                    onChange={(v: boolean) => set({ requiresDocument: v })} />
                  {form.requiresDocument ? (
                    <Input label="Required beyond (days, 0 = always)" value={numVal('documentRequiredAfterDays')}
                      onChange={numSet('documentRequiredAfterDays')} keyboardType="numeric" />
                  ) : null}
                </Card>

                <Text style={s.group}>Balance</Text>
                <Card>
                  <Toggle label="Allow applying beyond the balance" value={form.allowNegativeBalance}
                    onChange={(v: boolean) => set({ allowNegativeBalance: v })}
                    sub="For leave-without-pay style types" />
                  {form.allowNegativeBalance ? (
                    <Input label="Maximum overdraft (days, 0 = unlimited)" value={numVal('maxNegativeDays')}
                      onChange={numSet('maxNegativeDays')} keyboardType="numeric" />
                  ) : null}

                  {/* Without this the only answer to "no balance left but the
                      day must be taken" was to refuse the application. */}
                  <Toggle label="Allow applying beyond the balance as loss of pay"
                    value={form.allowLopBeyondBalance}
                    onChange={(v: boolean) => set({ allowLopBeyondBalance: v })}
                    sub="Days past the balance are accepted and marked unpaid instead of refused. Payroll deducts them automatically." />
                  {form.allowLopBeyondBalance ? (
                    <Input label="Max loss-of-pay days per application (0 = no limit)"
                      value={numVal('maxLopDaysPerApplication')}
                      onChange={numSet('maxLopDaysPerApplication')} keyboardType="numeric" />
                  ) : null}
                </Card>

                <Text style={s.group}>Entitlement mechanics</Text>
                <Card>
                  {isCompOff ? (
                    <Text style={s.note}>
                      Comp Off is earned per approved request, so it never accrues on a clock. Carry forward
                      still applies to whatever is left unused.
                    </Text>
                  ) : (
                    <>
                      <Toggle label="Accrue monthly instead of allocating up front"
                        value={form.monthlyAccrual?.enabled}
                        onChange={(v: boolean) => setIn('monthlyAccrual', {
                          enabled: v,
                          // Accrual crediting 0 days a month adds nothing and looks
                          // exactly like a broken engine, so seed a figure from the
                          // annual entitlement instead of leaving a silent no-op.
                          daysPerMonth: v && !(form.monthlyAccrual?.daysPerMonth > 0)
                            ? Math.round(((form.leaveType?.annualAllocation || 0) / 12) * 2) / 2
                            : form.monthlyAccrual?.daysPerMonth,
                        })}
                        sub="Balance starts at 0 and is topped up each month, capped at the annual allocation" />
                      {form.monthlyAccrual?.enabled ? (
                        <>
                          <Input label="Days accrued per month"
                            value={String(form.monthlyAccrual?.daysPerMonth ?? 0)}
                            onChange={(v: string) => setIn('monthlyAccrual', { daysPerMonth: v === '' ? 0 : Number(v) || 0 })}
                            keyboardType="numeric" />
                          {!(form.monthlyAccrual?.daysPerMonth > 0) ? (
                            <Text style={s.err}>
                              Must be greater than 0 — accrual crediting 0 days a month would never
                              add anything to the balance.
                            </Text>
                          ) : null}
                        </>
                      ) : null}
                    </>
                  )}
                  <Toggle label="Carry unused days into the next year"
                    value={form.carryForward?.enabled}
                    onChange={(v: boolean) => setIn('carryForward', { enabled: v })} />
                  {form.carryForward?.enabled ? (
                    <Input label="Max days to carry (0 = everything)"
                      value={String(form.carryForward?.maxDays ?? 0)}
                      onChange={(v: string) => setIn('carryForward', { maxDays: v === '' ? 0 : Number(v) || 0 })}
                      keyboardType="numeric" />
                  ) : null}
                  <Toggle label="Encashable" value={form.encashable}
                    onChange={(v: boolean) => set({ encashable: v })}
                    sub="Marks unused days as eligible for payout. They are listed on the employee's exit settlement for payroll to action — nothing is paid out automatically." />
                  {form.encashable ? (
                    <Input label="Max encashable days (0 = no limit)" value={numVal('maxEncashableDays')}
                      onChange={numSet('maxEncashableDays')} keyboardType="numeric" />
                  ) : null}
                </Card>

                <Text style={s.group}>Combining with other leave</Text>
                <Card>
                  <Toggle label="May be combined with other leave types"
                    value={form.allowCombineWithOtherLeaves}
                    onChange={(v: boolean) => set({ allowCombineWithOtherLeaves: v })}
                    sub="When off, this leave cannot sit next to any other type" />
                  {form.allowCombineWithOtherLeaves ? (
                    <>
                      <Text style={s.label}>…except these types</Text>
                      {policies
                        .filter((p) => p.leaveType._id !== selected)
                        .map((p) => (
                          <Toggle key={p.leaveType._id} label={`${p.leaveType.name} (${p.leaveType.code})`}
                            value={(form.blockedLeaveTypes ?? []).includes(p.leaveType._id)}
                            onChange={() => set({ blockedLeaveTypes: toggleIn(form.blockedLeaveTypes, p.leaveType._id) })} />
                        ))}
                    </>
                  ) : null}
                </Card>

                <Text style={s.group}>Approval workflow</Text>
                <Card>
                  <Select label="Who approves" value={form.approval?.mode ?? 'admin'}
                    options={APPROVAL_MODES} onChange={(v: string) => setIn('approval', { mode: v })} />
                  {form.approval?.mode !== 'admin' ? (
                    <>
                      <Text style={s.label}>Approver designations</Text>
                      {designations.map((d) => (
                        <Toggle key={d} label={d}
                          value={(form.approval?.approverDesignations ?? []).includes(d)}
                          onChange={() => setIn('approval', {
                            approverDesignations: toggleIn(form.approval?.approverDesignations, d),
                          })} />
                      ))}
                    </>
                  ) : null}
                </Card>

                <Text style={s.group}>Availability</Text>
                <Card>
                  <Toggle label="Accepting applications" value={form.isActive}
                    onChange={(v: boolean) => set({ isActive: v })}
                    sub="Turning this off suspends new applications without deleting the type" />
                </Card>

                <View style={{ marginTop: Spacing.md }}>
                  <ActionBtn label={saving ? 'Saving…' : 'Save Policy'} tone="success"
                    onPress={save} disabled={saving || accrualInvalid} />
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  title: { ...Typography.h4, color: Colors.text },
  group: { ...Typography.label, color: Colors.textSecondary, marginTop: Spacing.md, marginBottom: 6 },
  label: { ...Typography.label, color: Colors.text, marginTop: 8, marginBottom: 2 },
  note:  { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: 6, lineHeight: 18 },
  hint:  { fontSize: 11, color: Colors.textSecondary, marginBottom: 6 },
  err:   { ...Typography.bodySmall, color: Colors.danger, marginTop: 4, marginBottom: 6, lineHeight: 18 },
});
