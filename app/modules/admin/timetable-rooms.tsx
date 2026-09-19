import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as ttApi from '@/api/timetable.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Card, Select, Input, Toggle, FAB, FormModal, Badge, confirmAsync, ActionBtn, SearchBar,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import { Tiles, plural } from '@/components/timetable/viewKit';
import { ROOM_TYPES, DAYS, DAY_SHORT, tk } from '@/components/timetable/ttKit';

const MAX_PERIODS = 10;

const empty = {
  _id: '', roomName: '', roomNumber: '', roomType: 'Classroom', capacity: '40',
  building: '', homeSection: '', unavailable: [] as any[], notes: '', isActive: true,
};

export default function TimetableRoomsScreen() {
  const [rooms, setRooms] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState<any>({});
  const [buildings, setBuildings] = useState<string[]>([]);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [building, setBuilding] = useState('');
  const [openId, setOpenId] = useState('');
  const [week, setWeek] = useState<Record<string, any>>({});
  const [importText, setImportText] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [rRes, mRes] = await Promise.all([
        ttApi.getRoomsOverview({
          ...(type ? { type } : {}), ...(status ? { status } : {}), ...(building ? { building } : {}),
        }),
        meta ? null : ttApi.getMeta(),
      ]);
      const d = unwrap(rRes) ?? {};
      setRooms(d.rooms ?? []);
      setSummary(d.summary ?? {});
      setBuildings(d.buildings ?? []);
      if (mRes) setMeta(unwrap(mRes));
      setError('');
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else setError(err?.message ?? 'Failed to load rooms');
    } finally { setLoading(false); setRefreshing(false); }
  }, [meta, type, status, building]);

  useEffect(() => { load(); }, [type, status, building]); // eslint-disable-line

  // A room's week is fetched on demand — most rooms are never expanded.
  const toggleWeek = async (id: string) => {
    if (openId === id) { setOpenId(''); return; }
    setOpenId(id);
    if (week[id]) return;
    try {
      const d = unwrap(await ttApi.getRoomSchedule(id));
      setWeek((w) => ({ ...w, [id]: d }));
    } catch { setWeek((w) => ({ ...w, [id]: { entries: [] } })); }
  };

  /** name, number, type, capacity, block — a header row is recognised, not required. */
  const runImport = async () => {
    const lines = String(importText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const first = (lines[0] || '').toLowerCase();
    const body = /name/.test(first) && /type|capacity|number/.test(first) ? lines.slice(1) : lines;
    const rows = body.map((line) => {
      const c = line.split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
      return {
        roomName: c[0] || '', roomNumber: c[1] || '',
        roomType: ROOM_TYPES.find((t) => t.toLowerCase() === String(c[2] || '').toLowerCase()) || 'Classroom',
        capacity: Number(c[3]) || 0, building: c[4] || '',
      };
    }).filter((r) => r.roomName);
    if (!rows.length) { setError('Nothing to import — one room per line: name, number, type, capacity, block'); return; }
    setImporting(true);
    try {
      const d = unwrap(await ttApi.importRooms(rows));
      setImportText(null);
      setError(d?.skipped?.length
        ? `${d.created} added, ${d.skipped.length} skipped (${d.skipped[0].reason}${d.skipped.length > 1 ? '…' : ''})`
        : '');
      await load();
    } catch (err: any) { setError(err?.message ?? 'Import failed'); }
    finally { setImporting(false); }
  };

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const openForm = (room?: any) => setForm(room ? {
    ...empty, ...room,
    capacity: String(room.capacity ?? 0),
    homeSection: room.homeSection?._id ?? room.homeSection ?? '',
    unavailable: room.unavailable ?? [],
  } : { ...empty });

  const save = async () => {
    if (!form.roomName.trim()) { setError('Room name is required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, capacity: Number(form.capacity) || 0, homeSection: form.homeSection || null };
      if (form._id) await ttApi.updateRoom(form._id, payload);
      else await ttApi.createRoom(payload);
      setForm(null);
      await load();
      setError('');
    } catch (err: any) { setError(err?.message ?? 'Failed to save'); }
    finally { setSaving(false); }
  };

  const remove = async (room: any) => {
    if (!(await confirmAsync('Delete room', `Delete "${room.roomName}"? If it is used by a timetable it will be deactivated instead.`, 'Delete'))) return;
    try { await ttApi.deleteRoom(room._id); await load(); }
    catch (err: any) { setError(err?.message ?? 'Failed to delete'); }
  };

  const toggleSlot = (day: string, period: number) => setForm((f: any) => {
    const has = f.unavailable.some((u: any) => u.dayOfWeek === day && u.periodNumber === period);
    return {
      ...f,
      unavailable: has
        ? f.unavailable.filter((u: any) => !(u.dayOfWeek === day && u.periodNumber === period))
        : [...f.unavailable, { dayOfWeek: day, periodNumber: period, reason: '' }],
    };
  });

  if (disabled) return (<><Stack.Screen options={{ title: 'Rooms & Labs' }} /><ModuleDisabled /></>);
  if (loading) return (<><Stack.Screen options={{ title: 'Rooms & Labs' }} /><LoaderView /></>);

  const sections = (meta?.classes ?? []).flatMap((c: any) =>
    (c.sections ?? []).map((s: any) => ({ label: `${c.className} · ${s.sectionName}`, value: s._id })));

  const filtered = rooms.filter((r) => !search
    || r.roomName?.toLowerCase().includes(search.toLowerCase())
    || r.roomType?.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <Stack.Screen options={{ title: 'Rooms & Labs' }} />
      <ScrollView
        style={s.screen}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <Tiles items={[
          { label: 'Rooms', value: summary.total ?? 0, icon: 'business', tone: 'info' },
          { label: 'Classrooms', value: summary.classrooms ?? 0, icon: 'school', tone: 'success' },
          { label: 'Labs', value: summary.labs ?? 0, icon: 'flask', tone: 'neutral' },
          { label: 'Available', value: summary.active ?? 0, icon: 'checkmark-circle', tone: 'success' },
        ]} />

        <View style={s.filters}>
          <View style={s.filter}>
            <Select label="Type" value={type} onChange={setType} placeholder="All types"
              options={[{ label: 'All types', value: '' }, ...ROOM_TYPES.map((t) => ({ label: t, value: t }))]} />
          </View>
          <View style={s.filter}>
            <Select label="Status" value={status} onChange={setStatus} placeholder="All"
              options={[{ label: 'All', value: '' }, { label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }]} />
          </View>
        </View>
        {buildings.length > 0 && (
          <Select label="Building / block" value={building} onChange={setBuilding} placeholder="All blocks"
            options={[{ label: 'All blocks', value: '' }, ...buildings.map((b) => ({ label: b, value: b }))]} />
        )}

        <SearchBar value={search} onChange={setSearch} placeholder="Search rooms…" />
        {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.sm }}>
          <Text style={[tk.hint, { flex: 1, marginBottom: 0 }]}>
            Labs let the generator place practicals automatically and prevent double-booking.
          </Text>
          <ActionBtn label="Import" small onPress={() => setImportText('')} />
        </View>

        {!filtered.length ? <Empty icon="business-outline" text="No rooms yet — add one to enable room allocation" /> : filtered.map((r) => (
          <Card key={r._id}>
            <View style={s.head}>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{r.roomName}</Text>
                <Text style={s.sub}>
                  {r.roomNumber ? `#${r.roomNumber} · ` : ''}{r.roomType} · seats {r.capacity || '—'}
                  {r.building ? ` · ${r.building}` : ''}
                </Text>
              </View>
              <Badge label={r.isActive ? 'Active' : 'Inactive'} tone={r.isActive ? 'success' : 'neutral'} />
            </View>
            {!!r.homeLabel && <Text style={s.sub}>Home class: {r.homeLabel}</Text>}
            {r.unavailable?.length ? (
              <Text style={s.blocked}>{plural(r.unavailable.length, 'blocked slot')}</Text>
            ) : null}
            <View style={s.useRow}>
              <View style={s.track}>
                <View style={[s.fill, {
                  width: `${Math.min(100, r.utilisation ?? 0)}%`,
                  backgroundColor: (r.utilisation ?? 0) > 85 ? Colors.danger : Colors.success,
                }]} />
              </View>
              <Text style={s.useText}>{r.utilisation ?? 0}% · {r.periodsUsed ?? 0} periods</Text>
            </View>

            {openId === r._id && (
              <View style={s.week}>
                {!week[r._id] ? <LoaderView /> : !(week[r._id].entries ?? []).length ? (
                  <Text style={s.sub}>Nothing is timetabled in this room.</Text>
                ) : (week[r._id].entries as any[]).map((e, i) => (
                  <Text key={i} style={s.weekRow} numberOfLines={1}>
                    {DAY_SHORT[e.dayOfWeek] || e.dayOfWeek} P{e.periodNumber} · {e.section} · {e.subject}
                    {e.teacher ? ` · ${e.teacher}` : ''}
                  </Text>
                ))}
              </View>
            )}

            <View style={s.actions}>
              <ActionBtn label={openId === r._id ? 'Hide week' : 'Its week'} small onPress={() => toggleWeek(r._id)} />
              <ActionBtn label="Edit" tone="info" small onPress={() => openForm(r)} />
              <ActionBtn label="Duplicate" small onPress={() => openForm({
                ...r, _id: '', roomName: `${r.roomName} (copy)`, roomNumber: '',
              })} />
              <ActionBtn label="Delete" tone="danger" small onPress={() => remove(r)} />
            </View>
          </Card>
        ))}
      </ScrollView>

      <FAB onPress={() => openForm()} />

      <FormModal visible={importText !== null} title="Import rooms" onClose={() => setImportText(null)}
        onSubmit={runImport} submitting={importing} submitLabel="Import">
        <Text style={tk.hint}>
          One room per line: name, number, type, capacity, block. A header row is fine; anything
          already here is skipped rather than duplicated.
        </Text>
        <Input label="Rooms" multiline value={importText ?? ''} onChange={(v) => setImportText(v)}
          placeholder={'Computer Lab, L-101, Computer Lab, 40, Main Block'} />
      </FormModal>

      <FormModal
        visible={!!form}
        title={form?._id ? 'Edit Room' : 'Add Room'}
        onClose={() => setForm(null)}
        onSubmit={save}
        submitting={saving}
      >
        {form && (
          <>
            <Input label="Room name" value={form.roomName} onChange={(v) => set('roomName', v)} placeholder="Computer Lab" />
            <Input label="Room number" value={form.roomNumber} onChange={(v) => set('roomNumber', v)} placeholder="L-101" />
            <Select label="Room type" value={form.roomType} options={ROOM_TYPES.map((t) => ({ label: t, value: t }))} onChange={(v) => set('roomType', v)} />
            <Input label="Capacity" value={form.capacity} onChange={(v) => set('capacity', v)} keyboardType="numeric" />
            <Input label="Building / Campus" value={form.building} onChange={(v) => set('building', v)} placeholder="Main Block" />
            <Select label="Home class (optional)" value={form.homeSection} placeholder="Not a dedicated classroom"
              options={[{ label: 'Not a dedicated classroom', value: '' }, ...sections]}
              onChange={(v) => set('homeSection', v)} />

            <Text style={s.fieldLabel}>Blocked slots</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator style={{ marginBottom: Spacing.md }}>
              <View>
                <View style={{ flexDirection: 'row' }}>
                  <View style={s.gridLabel} />
                  {Array.from({ length: MAX_PERIODS }, (_, i) => (
                    <Text key={i} style={s.gridHead}>P{i + 1}</Text>
                  ))}
                </View>
                {DAYS.map((day) => (
                  <View key={day} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={s.gridLabel}>{DAY_SHORT[day]}</Text>
                    {Array.from({ length: MAX_PERIODS }, (_, i) => {
                      const period = i + 1;
                      const off = form.unavailable.some((u: any) => u.dayOfWeek === day && u.periodNumber === period);
                      return (
                        <TouchableOpacity key={period} onPress={() => toggleSlot(day, period)}
                          style={[s.gridCell, off ? s.gridCellOff : s.gridCellOn]}>
                          <Text style={[s.gridCellText, { color: off ? Colors.danger : Colors.textLight }]}>{off ? '✕' : ''}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>

            <Input label="Notes" value={form.notes} onChange={(v) => set('notes', v)} />
            <Toggle label="Active" sub="Available to the generator" value={form.isActive} onChange={(v) => set('isActive', v)} />
          </>
        )}
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  blocked: { fontSize: 11, color: Colors.warning, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  filters: { flexDirection: 'row', gap: 8 },
  filter: { flex: 1 },
  useRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.divider, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  useText: { fontSize: 10.5, color: Colors.textSecondary },
  week: { marginTop: 8, padding: 8, borderRadius: Radius.sm, backgroundColor: Colors.surfaceAlt, gap: 4 },
  weekRow: { fontSize: 11.5, color: Colors.text },

  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  gridHead: { width: 30, fontSize: 9, fontWeight: '700', color: Colors.textSecondary, textAlign: 'center' },
  gridLabel: { width: 34, fontSize: 10, fontWeight: '700', color: Colors.textSecondary },
  gridCell: {
    width: 30, height: 24, margin: 1, borderRadius: 4, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  gridCellOn: { borderColor: Colors.border, backgroundColor: Colors.surfaceAlt },
  gridCellOff: { borderColor: Colors.danger, backgroundColor: Colors.dangerLight },
  gridCellText: { fontSize: 11, fontWeight: '700' },

  errorBox: { backgroundColor: Colors.dangerLight, borderRadius: Radius.md, padding: 10, marginBottom: 10 },
  errorText: { color: Colors.danger, fontSize: 12.5 },
});
