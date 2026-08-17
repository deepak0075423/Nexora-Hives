import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing, Typography } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, ActionBtn, SegTabs,
  FormModal, Input, StatTile, StatRow, fmtDate,
} from '@/components/ui/kit';

// Admin Comp Off queue — the approval step that is the ONLY thing which credits
// an employee's Comp Off balance.

const DAY_LABEL: Record<string, string> = {
  holiday: '🎉 Holiday', weekly_off: '🗓️ Weekly Off', sunday: '☀️ Sunday',
  working_day: '💼 Working Day', unknown: '❔ Unclassified',
};

const TABS = [
  { key: 'pending',  label: 'Pending' },
  { key: 'draft',    label: 'Ready to apply' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: '',         label: 'All' },
];

export default function AdminCompOffScreen() {
  const [view, setView] = useState<'requests' | 'balances'>('requests');
  const [status, setStatus] = useState('pending');
  const [list, setList] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [balances, setBalances] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = async (st = status) => {
    try {
      const res: any = await adminApi.getCompOffRequests({ ...(st ? { status: st } : {}), page: 1, limit: 50 });
      const d = unwrap(res);
      setMeta(d);
      setList(d?.items ?? []);
      const b: any = await adminApi.getCompOffBalances().catch(() => null);
      setBalances(unwrap(b));
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);
  const changeTab = (st: string) => { setStatus(st); setLoading(true); load(st); };

  // ── Approve / reject / withdraw ────────────────────────────────────────────
  const [action, setAction] = useState<any>(null);   // { type, request }
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const run = async () => {
    setSaving(true);
    try {
      const { type, request } = action;
      if (type === 'approve') {
        const res: any = await adminApi.approveCompOff(request._id, { adminComment: comment });
        const d = unwrap(res);
        Alert.alert('Done', d?.pendingLevels > 0
          ? `Approval recorded — ${d.pendingLevels} more sign-off needed before any balance is credited`
          : `Approved — ${d?.credited ?? 0} day(s) credited`);
      } else if (type === 'reject') {
        await adminApi.rejectCompOff(request._id, { adminComment: comment });
        Alert.alert('Done', 'Rejected — no balance credited');
      } else {
        const res: any = await adminApi.cancelCompOff(request._id, { adminComment: comment });
        Alert.alert('Done', `Withdrawn — ${unwrap(res)?.reversed ?? 0} day(s) removed`);
      }
      setAction(null); setComment('');
      load();
    } catch (err: any) { Alert.alert('Error', err?.data?.message ?? err.message); }
    finally { setSaving(false); }
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Comp Off' }} /><ModuleDisabled /></>);

  if (!loading && meta?.enabled === false) {
    return (
      <>
        <Stack.Screen options={{ title: 'Comp Off' }} />
        <View style={{ flex: 1, backgroundColor: Colors.background, padding: Spacing.md }}>
          <Empty icon="time-outline" text={meta?.reason ?? 'Comp Off is not available'} />
          <Text style={s.hint}>
            Create a leave type with category "Comp Off" from the web admin to switch it on.
          </Text>
        </View>
      </>
    );
  }

  const totals = balances?.totals ?? {};

  return (
    <>
      <Stack.Screen options={{ title: 'Comp Off' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <SegTabs
          tabs={[{ key: 'requests', label: 'Requests' }, { key: 'balances', label: 'Balances' }]}
          active={view}
          onChange={(v) => setView(v as any)}
        />

        {view === 'requests' && (
          <>
            <SegTabs tabs={TABS} active={status} onChange={changeTab} />
            {loading ? <LoaderView /> : list.length === 0 ? (
              <Empty icon="time-outline" text="No Comp Off requests" />
            ) : list.map((r: any) => (
              <Card key={r._id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text style={s.cardTitle}>{r.teacher?.name ?? '—'}</Text>
                  <Badge label={r.status === 'draft' ? 'ready to apply' : r.status} />
                </View>
                <KV label="Work date" value={fmtDate(r.workDate)} />
                <KV label="Day" value={`${DAY_LABEL[r.dayCategory] ?? r.dayCategory}${r.dayLabel ? ` · ${r.dayLabel}` : ''}`} />
                {r.workedHours ? <KV label="Worked" value={`${r.checkIn || '—'} → ${r.checkOut || '—'} (${r.workedHours}h)`} /> : null}
                <KV label="Claimed" value={`${r.compOffDays} day(s) · ${r.source === 'attendance' ? 'from attendance' : 'manual'}`} />
                <KV label="Credited" value={r.creditedDays > 0
                  ? `${r.creditedDays} day(s)${r.expiresAt ? ` · expires ${fmtDate(r.expiresAt)}` : ''}`
                  : 'Not credited'} />
                {r.approvalsRequired > 1 && r.status === 'pending'
                  ? <KV label="Sign-off" value={`${r.approvalLevel ?? 0} of ${r.approvalsRequired}`} /> : null}
                {r.reason ? <KV label="Reason" value={r.reason} /> : null}

                {r.status === 'pending' && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <View style={{ flex: 1 }}>
                      <ActionBtn label="Approve" tone="success" onPress={() => { setComment(''); setAction({ type: 'approve', request: r }); }} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ActionBtn label="Reject" tone="danger" onPress={() => { setComment(''); setAction({ type: 'reject', request: r }); }} />
                    </View>
                  </View>
                )}
                {r.status === 'approved' && (
                  <View style={{ marginTop: 10 }}>
                    <ActionBtn label="Withdraw credit" tone="danger" onPress={() => { setComment(''); setAction({ type: 'cancel', request: r }); }} />
                  </View>
                )}
                {r.status === 'draft' && (
                  <Text style={s.hint}>Waiting for the employee to review and apply. Nothing is credited yet.</Text>
                )}
              </Card>
            ))}
          </>
        )}

        {view === 'balances' && (
          loading ? <LoaderView /> : (
            <>
              <StatRow>
                <StatTile label="Earned"    value={totals.earned    ?? 0} icon="add-circle-outline"    tone="info" />
                <StatTile label="Used"      value={totals.used      ?? 0} icon="remove-circle-outline" tone="neutral" />
                <StatTile label="Expired"   value={totals.expired   ?? 0} icon="alert-circle-outline"  tone="danger" />
                <StatTile label="Remaining" value={totals.remaining ?? 0} icon="wallet-outline"        tone="success" />
              </StatRow>
              {(balances?.items ?? []).length === 0
                ? <Empty icon="stats-chart-outline" text="No Comp Off balances yet" />
                : (balances.items as any[]).map((b: any, i: number) => (
                  <Card key={i}>
                    <Text style={s.cardTitle}>{b.teacher?.name ?? '—'}</Text>
                    <KV label="Earned"    value={String(b.earned)} />
                    <KV label="Used"      value={String(b.used)} />
                    <KV label="Pending"   value={String(b.pending)} />
                    <KV label="Expired"   value={String(b.expired)} />
                    <KV label="Remaining" value={String(b.remaining)} />
                  </Card>
                ))}
            </>
          )
        )}
      </ScrollView>

      <FormModal
        visible={!!action}
        title={action?.type === 'approve' ? 'Approve Comp Off'
             : action?.type === 'reject'  ? 'Reject Comp Off'
             : 'Withdraw Comp Off'}
        onClose={() => setAction(null)}
        onSubmit={run}
        submitting={saving}
        submitLabel={action?.type === 'approve' ? 'Approve' : action?.type === 'reject' ? 'Reject' : 'Withdraw'}
      >
        {action && (
          <>
            <KV label="Employee" value={action.request.teacher?.name ?? '—'} />
            <KV label="Work date" value={fmtDate(action.request.workDate)} />
            <KV label="Comp Off" value={`${action.request.compOffDays} day(s)`} />
            {action.type === 'approve' ? (
              <Text style={s.hint}>
                {action.request.approvalsRequired > 1 && (action.request.approvalLevel ?? 0) + 1 < action.request.approvalsRequired
                  ? 'This is the first of two sign-offs — no balance is credited until the second one.'
                  : `Approving credits ${action.request.compOffDays} day(s) to this employee's Comp Off balance.`}
              </Text>
            ) : null}
            {action.type === 'cancel' ? (
              <Text style={s.hint}>
                Removes the credited days. Refused if they have already been used — reverse the leave first.
              </Text>
            ) : null}
            <Input label="Comment" value={comment} onChange={setComment} placeholder="Optional note" multiline />
          </>
        )}
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  cardTitle: { ...Typography.label, color: Colors.text },
  hint: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: 8, lineHeight: 18 },
});
