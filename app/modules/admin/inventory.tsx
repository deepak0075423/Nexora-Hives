/**
 * Inventory (admin), on the phone.
 *
 * The web dashboard's four questions, at phone width: what the stock is worth,
 * what is running out, what is about to expire, and what has been moving. It
 * reads the same `/inventory/admin/overview` read model the web screen does —
 * the old screen called `/admin/dashboard` and drew `departmentBudgets` off
 * `annualBudget`/`usedBudget`, which were fields on InventoryDepartment until
 * the two budget systems were collapsed into one. Spend is now summed from the
 * purchase orders themselves and lives on the Budgets screen.
 *
 * No chart library exists in this app, so the stock split is drawn as a bar
 * made of Views — the same figures the web draws as a donut.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import * as inv from '@/api/inventory.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Colors, Spacing } from '@/constants/theme';
import { unwrap, LoaderView, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import {
  Head, Tiles, Tile, Tabs, Panel, Pill, Thumb, Rec, Blank, Muted, Note,
  TINT, count, money, plural, fmtDay, ago,
} from '@/components/inventory/parts';
import type { Tone } from '@/components/inventory/parts';

/** The five buckets, in the order the web lists them. */
const STATE_TONE: Record<string, Tone> = {
  in_stock: 'green', low_stock: 'amber', out_of_stock: 'red', under_repair: 'blue', not_tracked: 'slate',
};
const toneOf = (k: string): Tone => STATE_TONE[k] || 'slate';

export default function AdminInventoryScreen() {
  const { user } = useAuth();
  const [d, setD] = useState<any>(undefined);
  const [tab, setTab] = useState('overview');
  const [disabled, setDisabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setD(unwrap(await inv.getOverview()) || {});
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true); else setD(null);
    } finally { setRefreshing(false); }
  }, []);
  useEffect(() => { if (user?.role) load(); }, [user?.role]); // eslint-disable-line

  if (disabled) return <><Stack.Screen options={{ title: 'Inventory' }} /><ModuleDisabled /></>;
  if (d === undefined) return <><Stack.Screen options={{ title: 'Inventory' }} /><LoaderView /></>;

  const t = d?.tiles || {};
  const split = d?.stockStatus || { total: 0, slices: [] };
  const low: any[] = d?.lowStock || [];
  const expiring: any[] = d?.expiring || [];
  const moved: any[] = d?.topConsumed || [];
  const activity: any[] = d?.activity || [];
  const max = Number(d?.topConsumedMax) || 1;

  return (
    <>
      <Stack.Screen options={{ title: 'Inventory' }} />
      <ScrollView style={s.root} contentContainerStyle={{ padding: Spacing.md, paddingBottom: 70 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>

        <Head title="Inventory" subtitle="What the school holds, what it is worth, and what needs attention." />

        <Tiles>
          <Tile icon="cube-outline" tone="indigo" value={count(t.totalItems?.value)} label="Items in the catalogue" />
          <Tile icon="cash-outline" tone="green" value={money(t.stockValue?.value)} label="Stock value" />
          <Tile icon="document-text-outline" tone="amber" value={count(t.pendingRequests?.value)} label="Requests waiting"
            caption={t.pendingRequests?.added ? `${count(t.pendingRequests.added)} this month` : undefined} />
          <Tile icon="alert-circle-outline" tone="red" value={count(t.lowStock?.value)} label="Low or out of stock" />
          <Tile icon="hourglass-outline" tone="orange" value={count(t.expiringSoon?.value)} label="Expiring soon" />
          <Tile icon="business-outline" tone="blue" value={count(t.warehouses?.value)} label="Active stores"
            caption={t.warehouses?.total ? `of ${count(t.warehouses.total)}` : undefined} />
        </Tiles>

        <Tabs value={tab} onChange={setTab} items={[
          { key: 'overview', label: 'Overview' },
          { key: 'reorder', label: 'Reorder', count: low.length },
          { key: 'expiring', label: 'Expiring', count: expiring.length },
          { key: 'moving', label: 'Moving', count: moved.length },
        ]} />

        <View style={{ height: 12 }} />

        {tab === 'overview' ? (
          <>
            <Panel icon="pie-chart-outline" tone="indigo" title="Where the catalogue stands"
              subtitle={`${plural(split.total, 'item')} across five states`}>
              {split.slices?.length ? (
                <>
                  <View style={s.bar}>
                    {split.slices.filter((x: any) => x.value > 0).map((x: any) => (
                      <View key={x.key} style={{ flex: x.value, backgroundColor: TINT[toneOf(x.key)].fg }} />
                    ))}
                  </View>
                  <View style={s.legend}>
                    {split.slices.map((x: any) => (
                      <View key={x.key} style={s.legendItem}>
                        <View style={[s.dot, { backgroundColor: TINT[toneOf(x.key)].fg }]} />
                        <Text style={s.legendText} numberOfLines={1}>{x.label}</Text>
                        <Text style={s.legendVal}>{count(x.value)}</Text>
                        <Text style={s.legendPct}>{x.pct}%</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : <Muted>Nothing in the catalogue yet.</Muted>}
            </Panel>

            <Panel icon="time-outline" tone="teal" title="Recent activity"
              subtitle="Every write the module has recorded">
              {activity.length ? activity.map((a) => (
                <View key={a._id} style={s.act}>
                  <View style={[s.actDot, { backgroundColor: TINT.teal.soft }]}>
                    <Ionicons name="ellipse" size={7} color={TINT.teal.fg} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.actTitle} numberOfLines={2}>{a.title}</Text>
                    <Text style={s.actSub} numberOfLines={1}>
                      {a.module} · {a.by?.name || 'Somebody'} · {ago(a.at)}
                    </Text>
                  </View>
                </View>
              )) : <Muted>Nothing has happened yet.</Muted>}
            </Panel>
          </>
        ) : null}

        {tab === 'reorder' ? (
          low.length ? (
            <>
              <Note tone="amber" icon="alert-circle-outline" title="What to buy">
                Counted on what is FREE, not what is on the shelf — stock already promised to an
                approved request cannot meet the next one.
              </Note>
              {low.map((r) => (
                <Rec key={r._id} image={r.image} icon={r.category?.icon}
                  title={r.name}
                  sub={`${r.itemCode}${r.warehouse?.name ? ` · ${r.warehouse.name}` : ''}`}
                  right={<Pill tone={r.state === 'out_of_stock' ? 'red' : 'amber'}>
                    {r.state === 'out_of_stock' ? 'Out of stock' : 'Low'}
                  </Pill>}
                  meta={
                    <>
                      <Muted>{count(r.current)} {r.unit} free</Muted>
                      <Muted>·</Muted>
                      <Muted>reorder at {count(r.reorderLevel)}</Muted>
                      <View style={{ flex: 1 }} />
                      <Pill tone="indigo">Order {count(r.suggested)}</Pill>
                    </>
                  }
                />
              ))}
            </>
          ) : <Blank icon="checkmark-circle-outline" title="Nothing needs reordering" body="Every item is above its reorder level." />
        ) : null}

        {tab === 'expiring' ? (
          expiring.length ? (
            <>
              <Note tone="orange" icon="hourglass-outline" title="Use or move these first">
                Worked out from the stock ledger by earliest expiry — a batch that has already been
                used up is not counted.
              </Note>
              {expiring.map((r) => (
                <Rec key={r._id} image={r.image} icon="flask"
                  title={r.name} sub={r.itemCode}
                  right={<Pill tone={r.daysLeft < 0 ? 'red' : 'orange'}>
                    {r.daysLeft < 0 ? `${Math.abs(r.daysLeft)}d overdue` : `${r.daysLeft}d left`}
                  </Pill>}
                  meta={
                    <>
                      {r.batchNumber ? <Muted>Batch {r.batchNumber}</Muted> : <Muted>No batch</Muted>}
                      <View style={{ flex: 1 }} />
                      <Muted>{fmtDay(r.expiryDate)}</Muted>
                    </>
                  }
                />
              ))}
            </>
          ) : <Blank icon="checkmark-circle-outline" title="Nothing is close to expiry" />
        ) : null}

        {tab === 'moving' ? (
          moved.length ? (
            <Panel icon="trending-up-outline" tone="violet" title="What moves"
              subtitle={`Issued over the last ${count(d.consumedDays)} days`}>
              {moved.map((r) => (
                <View key={r._id} style={s.moveRow}>
                  <Thumb image={r.image} icon={r.category?.icon} size={32} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.moveTitle} numberOfLines={1}>{r.name}</Text>
                    <View style={s.track}>
                      <View style={[s.fill, { width: `${Math.max(3, Math.round((r.consumed / max) * 100))}%` }]} />
                    </View>
                  </View>
                  <Text style={s.moveVal}>{count(r.consumed)} {r.unit}</Text>
                </View>
              ))}
            </Panel>
          ) : <Blank icon="trending-up-outline" title="Nothing has been issued yet" />
        ) : null}

        <Note tone="slate" icon="phone-portrait-outline" title="The rest of the module">
          Items, stock, orders, issues, assets, vendors, budgets and the reports live on the web
          admin panel — they are wide tables and forms that do not belong on a phone.
        </Note>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  bar: { flexDirection: 'row', height: 10, borderRadius: 999, overflow: 'hidden', backgroundColor: Colors.border, marginBottom: 12 },
  legend: { gap: 7 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 999 },
  legendText: { flex: 1, fontSize: 12, color: Colors.text },
  legendVal: { fontSize: 12, fontWeight: '700', color: Colors.text },
  legendPct: { fontSize: 11, color: Colors.textSecondary, width: 34, textAlign: 'right' },

  act: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  actDot: { width: 22, height: 22, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  actTitle: { fontSize: 12.5, fontWeight: '600', color: Colors.text, lineHeight: 17 },
  actSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  moveRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  moveTitle: { fontSize: 12.5, fontWeight: '600', color: Colors.text, marginBottom: 5 },
  track: { height: 7, borderRadius: 999, backgroundColor: Colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999, backgroundColor: TINT.violet.fg },
  moveVal: { fontSize: 12, fontWeight: '700', color: Colors.text },
});
