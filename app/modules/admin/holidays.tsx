import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { textError } from '@/utils/textRules';
import {
  unwrap, LoaderView, Empty, RowItem, FAB, FormModal, Input, Select,
  confirmAsync, Badge, fmtDate, ActionBtn,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';


export default function AdminHolidaysScreen() {
  const [everyYear, setEveryYear] = useState<any[]>([]);
  // Which academic year is listed (Nov 2026): this year to begin with, never all
  // of them at once. The server names the school's years and the current one.
  // `start`/`end`: each year's first and last day — a holiday of that year
  // must fall between them (Nov 24 2026).
  const [years, setYears] = useState<{ _id: string; name: string; start?: string; end?: string }[]>([]);
  const [currentYear, setCurrentYear] = useState('');
  // Which Saturdays the school works (School Settings): a holiday cannot
  // begin or end on a Sunday or a Saturday the school is closed (Nov 2026).
  const [week, setWeek] = useState<{ saturdayWorking?: boolean; saturdayMode?: string } | null>(null);
  const [year, setYear] = useState('current');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '', type: '', description: '', academicYear: '' });
  // Holiday types are school-managed, like teacher designations
  const [types, setTypes] = useState<string[]>([]);
  const [showTypes, setShowTypes] = useState(false);
  const [newType, setNewType] = useState('');
  const [typeSaving, setTypeSaving] = useState(false);

  const load = async () => {
    try {
      const res: any = await adminApi.getHolidays();
      const d = unwrap(res);
      setEveryYear(Array.isArray(d) ? d : d?.holidays ?? d?.data ?? []);
      setYears(Array.isArray(res?.years) ? res.years : []);
      setCurrentYear(res?.currentYear ?? '');
      setWeek(res?.week ?? null);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const yearId = year === 'current' ? currentYear : year;
  // A holiday written before holidays carried a year counts as this year's.
  const list = useMemo(() => (year === 'all' || !yearId ? everyYear : everyYear.filter((h: any) => {
    const id = String(h.academicYear?._id ?? h.academicYear ?? '');
    return id ? id === yearId : yearId === currentYear;
  })), [everyYear, year, yearId, currentYear]);

  const loadTypes = async () => {
    try { setTypes(unwrap(await adminApi.getHolidayTypes()) ?? []); } catch { /* defaults apply */ }
  };
  useEffect(() => { loadTypes(); }, []);

  const saveTypes = async (list: string[]) => {
    setTypeSaving(true);
    try { await adminApi.updateHolidayTypes(list); await loadTypes(); }
    catch (err: any) { Alert.alert('Error', err.message); }
    finally { setTypeSaving(false); }
  };

  const addType = async () => {
    const name = newType.trim();
    if (!name) return;
    if (types.some(t => t.toLowerCase() === name.toLowerCase())) return Alert.alert('Already exists', name);
    await saveTypes([...types, name]);
    setNewType('');
  };

  const removeType = async (name: string) => {
    if (types.length <= 1) return Alert.alert('Keep one', 'Keep at least one holiday type');
    if (!(await confirmAsync('Remove Type', `Remove "${name}" from the holiday type list?`, 'Remove'))) return;
    await saveTypes(types.filter(t => t !== name));
  };

  // A new holiday is for the year on screen ("All years": the current one); an
  // existing one opens on the year its first day falls in.
  const formYear = year === 'all' ? currentYear : yearId;
  const yearOfDay = (key: string) => years.find((y) => y.start && y.end && y.start <= key && key <= y.end);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', startDate: '', endDate: '', type: types[0] ?? '', description: '', academicYear: formYear });
    setShowForm(true);
  };

  const openEdit = (h: any) => {
    setEditing(h);
    const startDate = h.startDate ? new Date(h.startDate).toISOString().slice(0, 10) : '';
    setForm({
      name: h.name ?? '',
      startDate,
      endDate: h.endDate ? new Date(h.endDate).toISOString().slice(0, 10) : '',
      type: h.type ?? '',
      description: h.description ?? '',
      academicYear: yearOfDay(startDate)?._id || String(h.academicYear?._id ?? h.academicYear ?? '') || formYear,
    });
    setShowForm(true);
  };

  const handleDelete = async (h: any) => {
    if (!(await confirmAsync('Delete Holiday', `Delete ${h.name}?`, 'Delete'))) return;
    try { await adminApi.deleteHoliday(h._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const submit = async () => {
    if (!form.name.trim() || !form.startDate || !form.endDate)
      return Alert.alert('Required', 'Name, start and end dates are required (YYYY-MM-DD)');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(form.endDate))
      return Alert.alert('Invalid date', 'Use YYYY-MM-DD format');
    // Letters, numbers and . , ' - ( ) / & — never only a number. An old
    // holiday's text left as it was is not re-judged (the server agrees).
    const judge = (v: string, label: string, was?: string) =>
      (v.trim() && v.trim() !== String(was ?? '').trim() ? textError(v.trim(), label, 'phrase') : null);
    const badText = judge(form.name, 'Holiday name', editing?.name) || judge(form.description, 'Description', editing?.description);
    if (badText) return Alert.alert('Check the text', badText);
    // Inside the academic year it is for, first day to last.
    const fy = years.find((y) => y._id === form.academicYear);
    if (years.length && !fy) return Alert.alert('Academic year', 'Choose the academic year this holiday is for.');
    if (form.endDate < form.startDate) return Alert.alert('Invalid dates', 'The end date cannot be before the start date.');
    if (fy && ((fy.start && form.startDate < fy.start) || (fy.end && form.endDate > fy.end)))
      return Alert.alert('Outside the academic year', `A holiday of ${fy.name} must fall between ${fy.start} and ${fy.end}.`);
    const offDay = (key: string) => {
      const d = new Date(`${key}T00:00:00Z`);
      if (d.getUTCDay() === 0) return 'a Sunday';
      if (d.getUTCDay() === 6 && week) {
        const nth = Math.ceil(d.getUTCDate() / 7);
        const mode = week.saturdayMode || 'all';
        const works = week.saturdayWorking !== false && (mode === '1_3_5' ? nth % 2 === 1 : mode === '2_4' ? nth % 2 === 0 : true);
        if (!works) return 'a Saturday the school does not work';
      }
      return '';
    };
    const moved = !editing || new Date(editing.startDate).toISOString().slice(0, 10) !== form.startDate
      || new Date(editing.endDate).toISOString().slice(0, 10) !== form.endDate;
    const first = moved ? offDay(form.startDate) : '';
    const last = moved && form.endDate !== form.startDate ? offDay(form.endDate) : '';
    if (first || last) {
      return Alert.alert('School is closed that day',
        `${first ? `${form.startDate} is ${first}` : `${form.endDate} is ${last}`}. A holiday has to ${first ? (form.endDate === form.startDate ? 'fall on' : 'start on') : 'end on'} a working day.`);
    }
    setSaving(true);
    try {
      const body = { ...form, academicYear: fy?._id || undefined };
      if (editing) await adminApi.updateHoliday(editing._id, body);
      else await adminApi.createHoliday(body);
      setShowForm(false);
      // Listed under its own year: show that year.
      if (fy && year !== 'all' && fy._id !== yearId) setYear(fy._id);
      load();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Holidays' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Holidays' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          <TouchableOpacity style={{ alignSelf: 'flex-end', marginBottom: Spacing.sm }}
            onPress={() => setShowTypes(true)}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.accent }}>⚙️ Holiday Types</Text>
          </TouchableOpacity>

          {years.length > 0 && (
            <Select label="Academic year" value={yearId || 'all'} onChange={setYear}
              options={[
                ...years.map((y) => ({ label: y._id === currentYear ? `${y.name} (current)` : y.name, value: y._id })),
                { label: 'All years', value: 'all' },
              ]} />
          )}

          {loading ? <LoaderView /> : list.length === 0 ? (
            <Empty icon="sunny-outline" text="No holidays declared" />
          ) : (
            list.map((h: any) => (
              <RowItem
                key={h._id}
                icon="sunny" iconColor="#CA8A04" iconBg="#FEF9C3"
                title={h.name}
                sub={`${fmtDate(h.startDate)}${String(h.startDate) !== String(h.endDate) ? ` – ${fmtDate(h.endDate)}` : ''}${h.description ? `\n${h.description}` : ''}`}
                right={<Badge label={(h.type ?? '').replace('_', ' ')} tone="info" />}
                onPress={() => {
                  Alert.alert(h.name, undefined, [
                    { text: 'Close', style: 'cancel' },
                    { text: 'Edit', onPress: () => openEdit(h) },
                    { text: 'Delete', style: 'destructive', onPress: () => handleDelete(h) },
                  ]);
                }}
              />
            ))
          )}
        </ScrollView>
        <FAB onPress={openCreate} />
      </View>

      <FormModal visible={showTypes} title="Manage Holiday Types" onClose={() => setShowTypes(false)}>
        <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 10 }}>
          These options appear in the Type dropdown when adding or editing a holiday.
        </Text>
        <Input text="title" label="New type" value={newType} onChange={setNewType} placeholder="e.g. Regional Festival" />
        <ActionBtn label={typeSaving ? 'Saving…' : 'Add Type'} tone="success" onPress={addType} />
        <View style={{ marginTop: Spacing.md }}>
          {types.map(t => (
            <RowItem key={t} title={t}
              right={<ActionBtn label="Remove" tone="danger" small onPress={() => removeType(t)} />} />
          ))}
        </View>
      </FormModal>

      <FormModal visible={showForm} title={editing ? 'Edit Holiday' : 'Add Holiday'} onClose={() => setShowForm(false)} onSubmit={submit} submitting={saving}>
        <Input text="phrase" label="Holiday Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. Diwali" />
        {years.length > 0 && (
          <Select label="Academic year *" value={form.academicYear} onChange={v => setForm(f => ({ ...f, academicYear: v }))}
            options={years.map((y) => ({ label: y._id === currentYear ? `${y.name} (current)` : y.name, value: y._id }))} />
        )}
        {(() => {
          const fy = years.find((y) => y._id === form.academicYear);
          return fy?.start && fy?.end ? (
            <Text style={{ fontSize: 11, color: Colors.textSecondary, marginTop: -4, marginBottom: 8 }}>
              {fy.name} runs from {fy.start} to {fy.end} — pick days in between.
            </Text>
          ) : null;
        })()}
        <Input text="date" label="Start Date * (YYYY-MM-DD)" value={form.startDate} onChange={v => setForm(f => ({ ...f, startDate: v }))} placeholder={years.find((y) => y._id === form.academicYear)?.start || '2026-10-20'} />
        <Input text="date" label="End Date * (YYYY-MM-DD)" value={form.endDate} onChange={v => setForm(f => ({ ...f, endDate: v }))} placeholder={years.find((y) => y._id === form.academicYear)?.start || '2026-10-22'} />
        <Select label="Type *" value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))}
          options={types.map(t => ({ label: t, value: t }))} />
        <Input text="phrase" label="Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="Optional" multiline />
      </FormModal>
    </>
  );
}
