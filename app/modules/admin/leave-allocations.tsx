import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Card, KV, ActionBtn, FormModal, Input, Select, SegTabs,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

// Allocation is the one-time act of putting days on an employee's balance.
// Everything else here maintains those balances: clearing them, rolling them
// into the next year, and the monthly accrual top-up.

type Mode = 'all' | 'select' | 'except';

const EMPTY_ALLOC = {
  leaveTypeId: '', teacherMode: 'all' as Mode, checked: [] as string[],
  amount: 'full' as 'full' | 'prorated' | 'accrue', overrideDays: '',
};
const EMPTY_CLEAR = { leaveTypeId: '', teacherMode: 'all' as Mode, checked: [] as string[] };

/** Mirrors the server's proration in adminAllocate. */
function computeProration(annual: number, ay: any) {
  if (!ay?.startDate || !ay?.endDate || !annual) return annual;
  const now = Date.now();
  const end = new Date(ay.endDate).getTime();
  const start = new Date(ay.startDate).getTime();
  if (now <= start) return annual;
  if (now >= end) return 0;
  return Math.max(1, Math.ceil(annual * (end - now) / (end - start)));
}

export default function AdminLeaveAllocationsScreen() {
  const [tab, setTab] = useState('balances');
  const [balances, setBalances] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [years, setYears] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const [allocOpen, setAllocOpen] = useState(false);
  const [alloc, setAlloc] = useState(EMPTY_ALLOC);
  const [clearOpen, setClearOpen] = useState(false);
  const [clear, setClear] = useState(EMPTY_CLEAR);
  const [cfOpen, setCfOpen] = useState(false);
  const [cf, setCf] = useState({ fromYear: '', toYear: '' });

  const load = async () => {
    try {
      const [aRes, tRes]: [any, any] = await Promise.all([
        adminApi.getLeaveAllocations(),
        adminApi.getTeachers({ limit: 500, status: 'active' }).catch(() => null),
      ]);
      // The allocations payload carries the year list and the policy-merged
      // types, so this screen never needs the general-admin academic-year
      // endpoint that a designation-scoped leave admin cannot reach.
      setBalances((aRes as any)?.data ?? []);
      setTypes(((aRes as any)?.leaveTypes ?? []).filter((t: any) => t.isActive));
      setYears((aRes as any)?.academicYears ?? []);
      setTeachers(unwrap(tRes)?.data ?? unwrap(tRes) ?? []);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else Alert.alert('Error', err?.data?.message ?? err.message);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const activeAY = years.find((y: any) => y.status === 'active');

  // ── Teacher-set resolution, identical on both forms ────────────────────────
  const resolveIds = (mode: Mode, checked: string[]) =>
    mode === 'select' ? checked
      : mode === 'except' ? teachers.filter(t => !checked.includes(t._id)).map(t => t._id)
      : teachers.map(t => t._id);
  const countFor = (mode: Mode, checked: string[]) => resolveIds(mode, checked).length;

  // ── Allocate ───────────────────────────────────────────────────────────────
  const allocType = types.find((t: any) => t._id === alloc.leaveTypeId);
  const isMonthly = !!allocType?.monthlyAccrual?.enabled;
  const prorated  = computeProration(allocType?.annualAllocation ?? 0, activeAY);
  const isMidYear = prorated !== allocType?.annualAllocation && prorated !== 0;
  const allocDays = alloc.overrideDays !== ''
    ? Number(alloc.overrideDays) || 0
    : alloc.amount === 'accrue' ? 0
    : alloc.amount === 'prorated' ? prorated
    : (allocType?.annualAllocation ?? 0);

  const submitAllocate = async () => {
    if (!alloc.leaveTypeId) { Alert.alert('Leave type required', 'Pick a leave type.'); return; }
    if (alloc.teacherMode === 'select' && !alloc.checked.length) {
      Alert.alert('No teachers', 'Select at least one teacher.'); return;
    }
    setBusy(true);
    try {
      const res: any = await adminApi.allocateLeave({
        teacherIds: alloc.teacherMode === 'select' ? alloc.checked : 'all',
        excludeIds: alloc.teacherMode === 'except' ? alloc.checked : [],
        leaveTypeId: alloc.leaveTypeId,
        giveFullAllocation: alloc.amount !== 'accrue',
        useProration: alloc.amount === 'prorated',
        ...(alloc.overrideDays !== '' ? { overrideDays: Number(alloc.overrideDays) } : {}),
      });
      setAllocOpen(false); setAlloc(EMPTY_ALLOC); load();
      Alert.alert('Allocated', (res as any)?.message ?? 'Leave allocated');
    } catch (err: any) { Alert.alert('Error', err?.data?.message ?? err.message); }
    finally { setBusy(false); }
  };

  // ── Clear ──────────────────────────────────────────────────────────────────
  const clearTargets = new Set(resolveIds(clear.teacherMode, clear.checked).map(String));
  const clearAffected = balances.filter((b: any) =>
    String(b.leaveType?._id) === String(clear.leaveTypeId)
    && clearTargets.has(String(b.teacher?._id))
    && ((b.totalAllocated ?? 0) + (b.carriedForward ?? 0)) > 0);
  const clearDays = clearAffected.reduce((n, b: any) => n + (b.totalAllocated ?? 0) + (b.carriedForward ?? 0), 0);
  const clearPending = clearAffected.reduce((n, b: any) => n + (b.pending ?? 0), 0);

  const submitClear = async () => {
    setBusy(true);
    try {
      const res: any = await adminApi.clearLeaveAllocations({
        teacherIds: clear.teacherMode === 'select' ? clear.checked : 'all',
        excludeIds: clear.teacherMode === 'except' ? clear.checked : [],
        leaveTypeId: clear.leaveTypeId,
      });
      setClearOpen(false); setClear(EMPTY_CLEAR); load();
      Alert.alert('Cleared', (res as any)?.message ?? 'Allocation cleared');
    } catch (err: any) { Alert.alert('Error', err?.data?.message ?? err.message); }
    finally { setBusy(false); }
  };

  // ── Carry forward ──────────────────────────────────────────────────────────
  const startOf = (label: string) => years.find((y: any) => y.label === label)?.startDate;
  // Sorted oldest first, so the last year has nothing after it to feed.
  const cfFromOptions = years.slice(0, -1);
  const cfToOptions = cf.fromYear
    ? years.filter((y: any) => new Date(y.startDate) > new Date(startOf(cf.fromYear)))
    : years;
  const cfValid = !!cf.fromYear && !!cf.toYear
    && new Date(startOf(cf.fromYear)) < new Date(startOf(cf.toYear));

  const openCf = () => {
    const activeIdx = years.findIndex((y: any) => y.status === 'active');
    const toIdx = activeIdx > 0 ? activeIdx : years.length - 1;
    setCf({
      fromYear: toIdx > 0 ? years[toIdx - 1].label : '',
      toYear:   years[toIdx]?.label ?? '',
    });
    setCfOpen(true);
  };

  const submitCf = async () => {
    setBusy(true);
    try {
      const res: any = await adminApi.runCarryForward(cf);
      setCfOpen(false); load();
      Alert.alert('Carry-forward complete', `${(res as any)?.processed ?? 0} balance(s) updated`);
    } catch (err: any) { Alert.alert('Error', err?.data?.message ?? err.message); }
    finally { setBusy(false); }
  };

  const runAccrual = async () => {
    setBusy(true);
    try {
      const res: any = await adminApi.runLeaveAccrual();
      load();
      Alert.alert('Accrual complete', (res as any)?.message ?? `${(res as any)?.credited ?? 0} balance(s) credited`);
    } catch (err: any) { Alert.alert('Error', err?.data?.message ?? err.message); }
    finally { setBusy(false); }
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Allocations' }} /><ModuleDisabled /></>);

  // One card per teacher, their types inline
  const grouped: any[] = [];
  const byTeacher: Record<string, any> = {};
  for (const b of balances) {
    const id = String(b.teacher?._id ?? 'unknown');
    if (!byTeacher[id]) { byTeacher[id] = { teacher: b.teacher, ay: b.academicYear, rows: [] }; grouped.push(byTeacher[id]); }
    byTeacher[id].rows.push(b);
  }

  const teacherPicker = (mode: Mode, checked: string[], onMode: (m: Mode) => void, onToggle: (id: string) => void) => (
    <>
      <SegTabs
        tabs={[{ key: 'all', label: 'All' }, { key: 'select', label: 'Select' }, { key: 'except', label: 'Except' }]}
        active={mode}
        onChange={(k: string) => onMode(k as Mode)}
      />
      {mode === 'all' ? (
        <Text style={s.note}>All {teachers.length} active teacher(s).</Text>
      ) : (
        <View style={s.pickList}>
          {teachers.map((t: any) => (
            <TouchableOpacity key={t._id} style={s.pickRow} onPress={() => onToggle(t._id)} activeOpacity={0.7}>
              <Ionicons
                name={checked.includes(t._id) ? 'checkbox' : 'square-outline'}
                size={18}
                color={checked.includes(t._id) ? Colors.primary : Colors.textLight}
              />
              <Text style={s.pickName} numberOfLines={1}>{t.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Allocations' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
          <View style={{ flex: 1 }}><ActionBtn label="Allocate" tone="success" onPress={() => { setAlloc(EMPTY_ALLOC); setAllocOpen(true); }} disabled={busy} /></View>
          <View style={{ flex: 1 }}><ActionBtn label="Clear" tone="danger" onPress={() => { setClear(EMPTY_CLEAR); setClearOpen(true); }} disabled={busy} /></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          <View style={{ flex: 1 }}><ActionBtn label="Carry Forward" tone="neutral" onPress={openCf} disabled={busy} /></View>
          <View style={{ flex: 1 }}><ActionBtn label="Run Accrual" tone="neutral" onPress={runAccrual} disabled={busy} /></View>
        </View>

        <SegTabs
          tabs={[{ key: 'balances', label: `Balances (${grouped.length})` }, { key: 'types', label: `Types (${types.length})` }]}
          active={tab} onChange={setTab}
        />

        {loading ? <LoaderView /> : tab === 'types' ? (
          types.length === 0 ? <Empty icon="pricetags-outline" text="No active leave types" /> :
          types.map((t: any) => (
            <Card key={t._id}>
              <Text style={s.name}>{t.name} ({t.code})</Text>
              <KV label="Annual" value={`${t.annualAllocation} day(s)`} />
              <KV label="Accrual" value={t.monthlyAccrual?.enabled ? `${t.monthlyAccrual.daysPerMonth}/month` : 'Allocated up front'} />
              <KV label="Carry forward" value={t.carryForward?.enabled
                ? (t.carryForward.maxDays > 0 ? `up to ${t.carryForward.maxDays} day(s)` : 'everything remaining')
                : 'No'} />
            </Card>
          ))
        ) : grouped.length === 0 ? (
          <Empty icon="wallet-outline" text="No allocations yet" />
        ) : grouped.map((g: any, i: number) => (
          <Card key={i}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={s.name}>{g.teacher?.name ?? 'Removed employee'}</Text>
              <Text style={s.muted}>{g.ay}</Text>
            </View>
            {g.rows.map((b: any) => {
              const rem = Math.max(0, (b.totalAllocated ?? 0) + (b.carriedForward ?? 0) - (b.used ?? 0) - (b.pending ?? 0) - (b.expired ?? 0));
              return (
                <View key={b._id} style={s.balRow}>
                  <Text style={s.balCode}>{b.leaveType?.code}</Text>
                  <Text style={s.balNums}>
                    {(b.totalAllocated ?? 0) + (b.carriedForward ?? 0)} alloc · {b.used ?? 0} used · {b.pending ?? 0} pend
                  </Text>
                  <Text style={[s.balLeft, { color: rem > 0 ? Colors.success : Colors.danger }]}>{rem}</Text>
                </View>
              );
            })}
          </Card>
        ))}
      </ScrollView>

      {/* ── Allocate ── */}
      <FormModal visible={allocOpen} title="Allocate Leave" onClose={() => setAllocOpen(false)}
        onSubmit={submitAllocate} submitting={busy} submitLabel="Allocate">
        <Select label="Leave Type" value={alloc.leaveTypeId} placeholder="Select type…"
          onChange={(v: string) => {
            const next = types.find((t: any) => t._id === v);
            // An accruing type defaults to the accrual path — that is the whole
            // point of marking it as accruing.
            setAlloc(a => ({ ...a, leaveTypeId: v, amount: next?.monthlyAccrual?.enabled ? 'accrue' : 'full', overrideDays: '' }));
          }}
          options={types.map((t: any) => ({
            label: `${t.name} (${t.code}) — ${t.annualAllocation}/yr${t.monthlyAccrual?.enabled ? ' · monthly' : ''}`,
            value: t._id,
          }))} />

        <Text style={s.fieldLabel}>Teachers</Text>
        {teacherPicker(alloc.teacherMode, alloc.checked,
          (m) => setAlloc(a => ({ ...a, teacherMode: m, checked: [] })),
          (id) => setAlloc(a => ({ ...a, checked: a.checked.includes(id) ? a.checked.filter(x => x !== id) : [...a.checked, id] })))}

        {allocType ? (
          <>
            <Text style={s.fieldLabel}>Amount</Text>
            {isMonthly ? (
              <TouchableOpacity style={s.radioRow} onPress={() => setAlloc(a => ({ ...a, amount: 'accrue', overrideDays: '' }))} activeOpacity={0.7}>
                <Ionicons name={alloc.amount === 'accrue' && alloc.overrideDays === '' ? 'radio-button-on' : 'radio-button-off'} size={18} color={Colors.primary} />
                <Text style={s.radioText}>Start at 0 (auto-credit {allocType.monthlyAccrual.daysPerMonth}/month)</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={s.radioRow} onPress={() => setAlloc(a => ({ ...a, amount: 'full', overrideDays: '' }))} activeOpacity={0.7}>
              <Ionicons name={alloc.amount === 'full' && alloc.overrideDays === '' ? 'radio-button-on' : 'radio-button-off'} size={18} color={Colors.primary} />
              <Text style={s.radioText}>{isMonthly ? `Give all ${allocType.annualAllocation} days now` : `Full (${allocType.annualAllocation} days)`}</Text>
            </TouchableOpacity>
            {isMidYear ? (
              <TouchableOpacity style={s.radioRow} onPress={() => setAlloc(a => ({ ...a, amount: 'prorated', overrideDays: '' }))} activeOpacity={0.7}>
                <Ionicons name={alloc.amount === 'prorated' && alloc.overrideDays === '' ? 'radio-button-on' : 'radio-button-off'} size={18} color={Colors.primary} />
                <Text style={s.radioText}>Prorated ({prorated} days — based on remaining months)</Text>
              </TouchableOpacity>
            ) : null}

            <Input label="Custom override (days, optional)" value={alloc.overrideDays} keyboardType="numeric"
              placeholder={String(allocDays)}
              onChange={(v: string) => setAlloc(a => ({ ...a, overrideDays: v }))} />

            <View style={[s.alert, { backgroundColor: Colors.infoLight }]}>
              <Text style={[s.alertText, { color: Colors.info, fontWeight: '600' }]}>
                {isMonthly && allocDays === 0
                  ? `Will enrol ${countFor(alloc.teacherMode, alloc.checked)} teacher(s) at 0 days, then credit ${allocType.monthlyAccrual.daysPerMonth} day(s) each month`
                  : `Will allocate ${allocDays} day(s) to ${countFor(alloc.teacherMode, alloc.checked)} teacher(s)${alloc.amount === 'prorated' && alloc.overrideDays === '' ? ` (prorated from ${allocType.annualAllocation})` : ''}`}
              </Text>
            </View>
          </>
        ) : null}
      </FormModal>

      {/* ── Clear ── */}
      <FormModal visible={clearOpen} title="Clear Allocation" onClose={() => setClearOpen(false)}
        onSubmit={clearAffected.length ? submitClear : undefined} submitting={busy}
        submitLabel={clearAffected.length ? `Clear ${clearAffected.length} allocation(s)` : 'Clear'}>
        <Select label="Leave Type" value={clear.leaveTypeId} placeholder="Select type…"
          onChange={(v: string) => setClear(c => ({ ...c, leaveTypeId: v }))}
          options={types.map((t: any) => ({ label: `${t.name} (${t.code})`, value: t._id }))} />

        <Text style={s.fieldLabel}>Teachers</Text>
        {teacherPicker(clear.teacherMode, clear.checked,
          (m) => setClear(c => ({ ...c, teacherMode: m, checked: [] })),
          (id) => setClear(c => ({ ...c, checked: c.checked.includes(id) ? c.checked.filter(x => x !== id) : [...c.checked, id] })))}

        {clear.leaveTypeId ? (clearAffected.length === 0 ? (
          <View style={[s.alert, { backgroundColor: Colors.infoLight }]}>
            <Text style={[s.alertText, { color: Colors.info }]}>
              None of the selected teachers hold any days of this type to clear.
            </Text>
          </View>
        ) : (
          <>
            <View style={[s.alert, { backgroundColor: Colors.warningLight }]}>
              <Text style={[s.alertText, { color: Colors.warning }]}>
                {clearDays} day(s) will be removed from {clearAffected.length} teacher(s). Days already
                used stay on the record — only the allocated and carried-forward figures go to 0.
              </Text>
            </View>
            {clearPending > 0 ? (
              <View style={[s.alert, { backgroundColor: Colors.dangerLight }]}>
                <Text style={[s.alertText, { color: Colors.danger }]}>
                  {clearPending} day(s) are awaiting approval against this allocation. Clearing it leaves
                  those requests with no balance behind them — approve or reject them first.
                </Text>
              </View>
            ) : null}
            {clearAffected.map((a: any) => (
              <View key={a._id} style={s.balRow}>
                <Text style={s.balCode} numberOfLines={1}>{a.teacher?.name ?? '—'}</Text>
                <Text style={s.balNums}>
                  {(a.totalAllocated ?? 0) + (a.carriedForward ?? 0)} → 0 · {a.used ?? 0} used
                </Text>
              </View>
            ))}
          </>
        )) : null}
      </FormModal>

      {/* ── Carry forward ── */}
      <FormModal visible={cfOpen} title="Run Carry-Forward" onClose={() => setCfOpen(false)}
        onSubmit={cfValid ? submitCf : undefined} submitting={busy} submitLabel="Run">
        <Text style={s.note}>
          Carry forward unused leave from one academic year to the next, for the types whose policy
          allows it.
        </Text>
        {years.length < 2 ? (
          <View style={[s.alert, { backgroundColor: Colors.warningLight }]}>
            <Text style={[s.alertText, { color: Colors.warning }]}>
              Carry-forward needs at least two academic years — this school has
              {years.length === 1 ? ' only one' : ' none'}. Add the next year first.
            </Text>
          </View>
        ) : (
          <>
            <Select label="From Year" value={cf.fromYear} placeholder="Select year…"
              onChange={(v: string) => setCf(c => ({
                ...c, fromYear: v,
                // Drop a To year that is no longer later than From
                toYear: c.toYear && new Date(startOf(c.toYear)) > new Date(startOf(v)) ? c.toYear : '',
              }))}
              options={cfFromOptions.map((y: any) => ({ label: `${y.label}${y.status === 'active' ? ' (active)' : ''}`, value: y.label }))} />
            <Select label="To Year" value={cf.toYear}
              placeholder={cf.fromYear ? 'Select year…' : 'Pick a From year first'}
              onChange={(v: string) => setCf(c => ({ ...c, toYear: v }))}
              options={cfToOptions.map((y: any) => ({ label: `${y.label}${y.status === 'active' ? ' (active)' : ''}`, value: y.label }))} />
            {cf.fromYear && cfToOptions.length === 0 ? (
              <Text style={s.err}>No academic year starts after {cf.fromYear}.</Text>
            ) : null}
          </>
        )}
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  name: { ...Typography.label, color: Colors.text, fontWeight: '700', flex: 1 },
  muted: { ...Typography.bodySmall, color: Colors.textSecondary },
  note: { ...Typography.bodySmall, color: Colors.textSecondary, marginVertical: 8, lineHeight: 18 },
  err: { ...Typography.bodySmall, color: Colors.danger, marginTop: 4, lineHeight: 18 },
  fieldLabel: { ...Typography.label, color: Colors.text, marginTop: 10, marginBottom: 4 },
  alert: { borderRadius: Radius.md, padding: Spacing.sm, marginVertical: 8 },
  alertText: { ...Typography.bodySmall, lineHeight: 18 },
  balRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderTopWidth: 1, borderTopColor: Colors.border, paddingVertical: 6,
  },
  balCode: { ...Typography.bodySmall, color: Colors.text, fontWeight: '700', minWidth: 52 },
  balNums: { fontSize: 11, color: Colors.textSecondary, flex: 1 },
  balLeft: { ...Typography.label, fontWeight: '700' },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  radioText: { ...Typography.bodySmall, color: Colors.text, flex: 1, lineHeight: 18 },
  pickList: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, maxHeight: 190 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 10 },
  pickName: { ...Typography.bodySmall, color: Colors.text, flex: 1 },
});
