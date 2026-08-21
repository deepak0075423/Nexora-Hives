import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, ActionBtn, FormModal, Input, Select, Toggle, FAB,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

// Leave types are the entitlement figures only — every rule (accrual, carry
// forward, day limits, approvals) lives in Leave → Policies, so there is one
// place to look and nothing silently overrides.

const EMPTY: any = { name: '', code: '', category: 'general', annualAllocation: '12', isActive: true };

export default function AdminLeaveTypesScreen() {
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);

  // Deleting a type wipes every teacher's allocation of it, so the confirm asks
  // the server what would go first and lists it before anything is removed.
  const [delTarget, setDelTarget] = useState<any>(null);
  const [impact, setImpact] = useState<any>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    try {
      const res: any = await adminApi.getLeaveTypes();
      setTypes(unwrap(res) ?? []);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else Alert.alert('Error', err?.data?.message ?? err.message);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setEditOpen(true); };
  const openEdit = (t: any) => {
    setEditing(t);
    setForm({
      name: t.name, code: t.code, category: t.category ?? 'general',
      annualAllocation: String(t.annualAllocation ?? 0), isActive: t.isActive !== false,
    });
    setEditOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { Alert.alert('Name required', 'Give the leave type a name.'); return; }
    if (!form.code.trim()) { Alert.alert('Code required', 'Give the leave type a short code, e.g. CL.'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        category: form.category,
        annualAllocation: Number(form.annualAllocation) || 0,
        isActive: form.isActive,
      };
      if (editing) await adminApi.updateLeaveType(editing._id, payload);
      else         await adminApi.createLeaveType(payload);
      setEditOpen(false);
      load();
    } catch (err: any) { Alert.alert('Error', err?.data?.message ?? err.message); }
    finally { setSaving(false); }
  };

  const openDelete = async (t: any) => {
    setDelTarget(t); setImpact(null); setImpactLoading(true);
    try {
      const res: any = await adminApi.getLeaveTypeImpact(t._id);
      setImpact(unwrap(res));
    } catch (err: any) {
      Alert.alert('Error', err?.data?.message ?? err.message);
      setDelTarget(null);
    } finally { setImpactLoading(false); }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const res: any = await adminApi.deleteLeaveType(delTarget._id);
      const wiped = (res as any)?.deleted?.allocations ?? 0;
      setDelTarget(null); setImpact(null);
      load();
      Alert.alert('Deleted', wiped
        ? `Leave type deleted — ${wiped} allocation(s) removed`
        : 'Leave type deleted');
    } catch (err: any) { Alert.alert('Error', err?.data?.message ?? err.message); }
    finally { setDeleting(false); }
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Leave Types' }} /><ModuleDisabled /></>);

  return (
    <>
      <Stack.Screen options={{ title: 'Leave Types' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : types.length === 0 ? (
          <Empty icon="pricetags-outline" text="No leave types yet" />
        ) : types.map((t: any) => (
          <Card key={t._id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={s.name}>{t.name}</Text>
              <Badge label={t.isActive ? 'Active' : 'Inactive'} tone={t.isActive ? 'success' : 'neutral'} />
            </View>
            <KV label="Code" value={t.code} />
            <KV label="Annual" value={t.category === 'compoff' ? 'earned on approval' : `${t.annualAllocation} day(s)`} />
            {t.monthlyAccrual?.enabled ? (
              <KV label="Accrual" value={`${t.monthlyAccrual.daysPerMonth}/month`} />
            ) : null}
            {t.category === 'compoff' ? <KV label="Category" value="Comp Off" /> : null}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <View style={{ flex: 1 }}><ActionBtn label="Edit" tone="neutral" onPress={() => openEdit(t)} /></View>
              <View style={{ flex: 1 }}><ActionBtn label="Delete" tone="danger" onPress={() => openDelete(t)} /></View>
            </View>
          </Card>
        ))}
      </ScrollView>

      {!loading && <FAB icon="add" onPress={openCreate} />}

      {/* ── Create / edit ── */}
      <FormModal
        visible={editOpen}
        title={editing ? 'Edit Leave Type' : 'New Leave Type'}
        onClose={() => setEditOpen(false)}
        onSubmit={save}
        submitting={saving}
      >
        <Input label="Name" value={form.name}
          onChange={(v: string) => setForm((f: any) => ({ ...f, name: v }))} placeholder="e.g. Casual Leave" />
        <Input label="Code" value={form.code}
          onChange={(v: string) => setForm((f: any) => ({ ...f, code: v.toUpperCase() }))} placeholder="e.g. CL" />
        <Select label="Category" value={form.category}
          onChange={(v: string) => setForm((f: any) => ({ ...f, category: v }))}
          options={[
            { label: 'General leave', value: 'general' },
            { label: 'Comp Off (compensatory)', value: 'compoff' },
          ]} />
        <Input label="Annual allocation (days)" value={form.annualAllocation} keyboardType="numeric"
          editable={form.category !== 'compoff'}
          onChange={(v: string) => setForm((f: any) => ({ ...f, annualAllocation: v }))} />
        {form.category === 'compoff' ? (
          <Text style={s.note}>
            Not applicable — Comp Off days are credited only when a Comp Off request is approved.
          </Text>
        ) : null}
        <Toggle label="Accepting applications" value={form.isActive}
          onChange={(v: boolean) => setForm((f: any) => ({ ...f, isActive: v }))} />
        <Text style={s.note}>
          Monthly accrual, carry forward, encashment, day limits, document rules and the approval
          workflow are configured per leave type under Leave Policies.
        </Text>
      </FormModal>

      {/* ── Delete, with the full impact spelled out ── */}
      <FormModal
        visible={!!delTarget}
        title="Delete Leave Type"
        onClose={() => { setDelTarget(null); setImpact(null); }}
        onSubmit={impact?.canDelete ? confirmDelete : undefined}
        submitting={deleting}
        submitLabel={impact?.allocations?.length
          ? `Delete type & ${impact.allocations.length} allocation(s)`
          : 'Delete'}
      >
        {impactLoading ? <LoaderView /> : !impact ? null : (
          <>
            <Text style={s.note}>
              Delete <Text style={{ fontWeight: '700' }}>{impact.leaveType?.name}</Text> ({impact.leaveType?.code})?
            </Text>

            {!impact.canDelete ? (
              <View style={[s.alert, { backgroundColor: Colors.dangerLight }]}>
                <Text style={[s.alertText, { color: Colors.danger }]}>
                  Cannot be deleted — it already has history:
                  {impact.blockers?.applications > 0 ? `\n· ${impact.blockers.applications} leave application(s)` : ''}
                  {impact.blockers?.compOffRequests > 0 ? `\n· ${impact.blockers.compOffRequests} comp off request(s)` : ''}
                  {'\n\n'}Mark it inactive instead — it stops accepting new applications and the records stay intact.
                </Text>
              </View>
            ) : null}

            {impact.allocations?.length > 0 ? (
              <>
                <View style={[s.alert, { backgroundColor: Colors.warningLight }]}>
                  <Text style={[s.alertText, { color: Colors.warning }]}>
                    {impact.teacherCount} teacher(s) hold days of this type — {impact.totals?.remaining} day(s)
                    still available out of {impact.totals?.allocated} allocated. Deleting the type
                    permanently removes these allocations.
                  </Text>
                </View>
                {impact.allocations.map((a: any) => (
                  <View key={a._id} style={s.allocRow}>
                    <Text style={s.allocName} numberOfLines={1}>
                      {a.teacher?.name ?? 'Removed employee'}
                    </Text>
                    <Text style={s.allocNums}>
                      {a.totalAllocated + a.carriedForward} alloc · {a.used} used · {a.pending} pend · {a.remaining} left
                    </Text>
                  </View>
                ))}
              </>
            ) : (
              <View style={[s.alert, { backgroundColor: Colors.infoLight }]}>
                <Text style={[s.alertText, { color: Colors.info }]}>
                  No teacher holds an allocation for this leave type.
                </Text>
              </View>
            )}

            {impact.canDelete ? (
              <Text style={s.note}>
                Also removed: this type&rsquo;s policy rules
                {impact.ledgerEntries > 0 ? ` and ${impact.ledgerEntries} ledger entry(s)` : ''}. This cannot be undone.
              </Text>
            ) : null}
          </>
        )}
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  name: { ...Typography.label, color: Colors.text, fontWeight: '700', flex: 1 },
  note: { ...Typography.bodySmall, color: Colors.textSecondary, marginVertical: 8, lineHeight: 18 },
  alert: { borderRadius: Radius.md, padding: Spacing.sm, marginVertical: 8 },
  alertText: { ...Typography.bodySmall, lineHeight: 18 },
  allocRow: {
    borderTopWidth: 1, borderTopColor: Colors.border, paddingVertical: 6,
  },
  allocName: { ...Typography.bodySmall, color: Colors.text, fontWeight: '600' },
  allocNums: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
});
