import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import * as inv from '@/api/inventory.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Colors, Spacing } from '@/constants/theme';
import {
  unwrap, LoaderView, Empty, Badge, Card, StatRow, StatTile, SegTabs, RowItem, fmtMoney,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

// Lists come back either as { data:[…] } or { items:[…] } depending on endpoint.
const listOf = (res: any) => { const d = unwrap(res); return d?.data ?? d?.items ?? (Array.isArray(d) ? d : []); };

export default function AdminInventoryScreen() {
  const { user } = useAuth();
  const [dash, setDash] = useState<any>(undefined);
  const [items, setItems] = useState<any[]>([]);
  const [reqs, setReqs] = useState<any[]>([]);
  const [tab, setTab] = useState('overview');
  const [disabled, setDisabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setDash(unwrap(await inv.getDashboard()));
      const [it, rq] = await Promise.all([inv.getItems({ limit: 50 }), inv.getRequests({ limit: 50 })]);
      setItems(listOf(it)); setReqs(listOf(rq));
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true); else setDash(null);
    } finally { setRefreshing(false); }
  }, []);
  useEffect(() => { if (user?.role) load(); }, [user?.role]); // eslint-disable-line

  if (disabled) return <><Stack.Screen options={{ title: 'Inventory' }} /><ModuleDisabled /></>;
  if (dash === undefined) return <><Stack.Screen options={{ title: 'Inventory' }} /><LoaderView /></>;
  const d = dash || {};

  return (
    <>
      <Stack.Screen options={{ title: 'Inventory' }} />
      <ScrollView style={s.root} contentContainerStyle={{ padding: Spacing.md, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>

        <StatRow>
          <StatTile label="Items" value={d.totalItems ?? 0} icon="cube" tone="info" />
          <StatTile label="Assets" value={d.totalAssets ?? 0} icon="hardware-chip" tone="neutral" />
          <StatTile label="Stock Value" value={fmtMoney(d.stockValue)} icon="cash" tone="success" />
        </StatRow>
        <StatRow>
          <StatTile label="Pending PR" value={d.pendingRequests ?? 0} icon="document-text" tone={d.pendingRequests ? 'warning' : 'neutral'} />
          <StatTile label="Open PO" value={d.pendingPOs ?? 0} icon="receipt" tone="info" />
          <StatTile label="Low Stock" value={d.lowStockCount ?? 0} icon="alert-circle" tone={d.lowStockCount ? 'danger' : 'neutral'} />
        </StatRow>

        <SegTabs active={tab} onChange={setTab} tabs={[
          { key: 'overview', label: 'Overview' }, { key: 'items', label: 'Items' }, { key: 'requests', label: 'Requests' }]} />

        {tab === 'overview' && (
          <>
            <Card>
              <Text style={s.h}>Reorder suggestions</Text>
              {(d.aiRecommendations || []).length === 0
                ? <Text style={s.muted}>Stock levels look healthy — nothing to reorder.</Text>
                : d.aiRecommendations.map((r: any) => (
                  <View key={r.item} style={s.line}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.lineTitle}>{r.name}</Text>
                      <Text style={s.muted}>On hand {r.current} · reorder {r.reorderLevel}</Text>
                    </View>
                    <Badge label={`Order ${r.suggestedQty}`} tone="warning" />
                  </View>
                ))}
            </Card>
            {(d.departmentBudgets || []).length > 0 && (
              <Card>
                <Text style={s.h}>Department budgets</Text>
                {d.departmentBudgets.map((b: any) => (
                  <View key={b._id} style={{ marginBottom: 10 }}>
                    <View style={s.budRow}>
                      <Text style={s.lineTitle}>{b.name}</Text>
                      <Text style={s.muted}>{fmtMoney(b.usedBudget)} / {fmtMoney(b.annualBudget)}</Text>
                    </View>
                    <View style={s.track}>
                      <View style={[s.fill, { width: `${Math.min(100, b.utilization || 0)}%`,
                        backgroundColor: b.utilization >= 90 ? Colors.danger : b.utilization >= 70 ? Colors.warning : Colors.success }]} />
                    </View>
                  </View>
                ))}
              </Card>
            )}
          </>
        )}

        {tab === 'items' && (items.length === 0 ? <Empty icon="cube-outline" text="No items." />
          : items.map((it) => (
            <RowItem key={it._id} icon="cube" title={it.name}
              sub={`${it.itemCode || ''}${it.brand ? ' · ' + it.brand : ''}`}
              right={<Badge label={`${it.onHand ?? 0} ${it.unit || ''}`} tone={(it.onHand ?? 0) <= 0 ? 'danger' : (it.reorderLevel > 0 && it.onHand <= it.reorderLevel) ? 'warning' : 'success'} />} />
          )))}

        {tab === 'requests' && (reqs.length === 0 ? <Empty icon="document-text-outline" text="No purchase requests." />
          : reqs.map((r) => (
            <RowItem key={r._id} icon="document-text" title={r.requestNumber || 'Request'}
              sub={`${r.items?.length || 0} item(s) · ${fmtMoney(r.estimatedTotal)}`}
              right={<Badge label={r.status?.replace(/_/g, ' ')} />} />
          )))}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  h: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  muted: { fontSize: 12, color: Colors.textSecondary },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  lineTitle: { fontSize: 13, fontWeight: '600', color: Colors.text },
  budRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});
