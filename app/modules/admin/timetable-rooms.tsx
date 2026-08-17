import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as ttApi from '@/api/timetable.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Card, Select, Input, Toggle, FAB, FormModal, Badge, confirmAsync, ActionBtn, SearchBar,
} from '@/components/ui/kit';
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

  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [rRes, mRes] = await Promise.all([
        ttApi.getRooms({ active: 'all' }),
        meta ? null : ttApi.getMeta(),
      ]);
      setRooms(unwrap(rRes) ?? []);
      if (mRes) setMeta(unwrap(mRes));
      setError('');
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
      else setError(err?.message ?? 'Failed to load rooms');
    } finally { setLoading(false); setRefreshing(false); }
  }, [meta]);

  useEffect(() => { load(); }, []); // eslint-disable-line

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
        <SearchBar value={search} onChange={setSearch} placeholder="Search rooms…" />
        {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}
        <Text style={tk.hint}>Labs let the generator place practicals automatically and prevent double-booking.</Text>

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
            {r.unavailable?.length ? (
              <Text style={s.blocked}>{r.unavailable.length} blocked slot(s)</Text>
            ) : null}
            <View style={s.actions}>
              <ActionBtn label="Edit" tone="info" small onPress={() => openForm(r)} />
              <ActionBtn label="Delete" tone="danger" small onPress={() => remove(r)} />
            </View>
          </Card>
        ))}
      </ScrollView>

      <FAB onPress={() => openForm()} />

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
  actions: { flexDirection: 'row', gap: 6, marginTop: 10 },

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
