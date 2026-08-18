import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, StyleSheet, TouchableOpacity } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import * as superApi from '@/api/superadmin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Badge, SectionTitle, FormModal, Input,
  ActionBtn, confirmAsync, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

/**
 * Designation → module access.
 *
 * Enforces one hierarchy: School module enablement → Designation permission →
 * User access. Only the modules the school has enabled can be granted here;
 * levels held for a module the Super Admin has switched off are kept and
 * reapplied when it comes back, which is why the screen never writes to them.
 *
 * Opened without params by a school admin (their own school), or with
 * ?schoolId=… by a super admin managing any school.
 */

type Level = 'admin' | 'user' | 'none';

interface ModuleMeta {
  key: string; label: string; icon: string; description: string;
  adminCapable: boolean; enabled: boolean;
}
interface Teacher {
  _id: string; employeeId: string; name: string; email: string; phone: string;
  department: string; gender: string; joiningDate: string; subjects: string;
  classes: string; isActive: boolean;
}
interface Row {
  _id: string; name: string; isActive: boolean;
  permissions: Record<string, Level>;
  effectivePermissions: Record<string, Level>;
  teacherCount: number;
}

const LEVELS: { value: Level; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'user',  label: 'Normal' },
  { value: 'none',  label: 'None' },
];

const LEVEL_TONE: Record<Level, { bg: string; fg: string }> = {
  admin: { bg: '#EDE9FE', fg: '#6D28D9' },
  user:  { bg: Colors.successLight, fg: Colors.success },
  none:  { bg: Colors.surfaceAlt,   fg: Colors.textLight },
};

function LevelPicker({ value, adminCapable, onChange }: {
  value: Level; adminCapable: boolean; onChange: (v: Level) => void;
}) {
  return (
    <View style={s.picker}>
      {LEVELS.map(lv => {
        const unavailable = lv.value === 'admin' && !adminCapable;
        const active = value === lv.value;
        const tone = LEVEL_TONE[lv.value];
        return (
          <TouchableOpacity
            key={lv.value}
            disabled={unavailable}
            onPress={() => onChange(lv.value)}
            style={[
              s.pickerBtn,
              active && { backgroundColor: tone.bg },
              unavailable && { opacity: 0.35 },
            ]}>
            <Text style={[
              s.pickerText,
              active && { color: tone.fg, fontWeight: '700' },
            ]}>{lv.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function AdminDesignationsScreen() {
  const { schoolId } = useLocalSearchParams<{ schoolId?: string }>();
  const scoped = !!schoolId;

  const api = useMemo(() => (scoped ? {
    load:   ()                            => superApi.getDesignationMatrix(schoolId!),
    save:   (rows: object[])              => superApi.saveDesignationMatrix(schoolId!, rows),
    create: (data: object)                => superApi.createDesignation(schoolId!, data),
    update: (id: string, patch: object)   => superApi.updateDesignation(schoolId!, id, patch),
    remove: (id: string)                  => superApi.deleteDesignation(schoolId!, id),
    teachers: (id: string)                => superApi.getDesignationTeachers(schoolId!, id),
  } : {
    load:   ()                            => adminApi.getDesignationMatrix(),
    save:   (rows: object[])              => adminApi.saveDesignationMatrix(rows),
    create: (data: object)                => adminApi.createDesignation(data),
    update: (id: string, patch: object)   => adminApi.updateDesignation(id, patch),
    remove: (id: string)                  => adminApi.deleteDesignation(id),
    teachers: (id: string)                => adminApi.getDesignationTeachers(id),
  }), [schoolId, scoped]);

  const [modules, setModules] = useState<ModuleMeta[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Record<string, Record<string, Level>>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  // Set when a delete is refused because teachers still hold the designation.
  const [blocked, setBlocked] = useState<{ name: string; message?: string; teachers: Teacher[] } | null>(null);
  const [renaming, setRenaming] = useState<Row | null>(null);
  const [renameText, setRenameText] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  const load = async () => {
    try {
      const d: any = unwrap(await api.load());
      setModules(d?.modules ?? []);
      setRows(d?.designations ?? []);
      setDraft({});
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else Alert.alert('Error', err.message);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [schoolId]);

  const enabled = useMemo(() => modules.filter(m => m.enabled), [modules]);
  const offList = useMemo(() => modules.filter(m => !m.enabled), [modules]);

  const permsOf = (row: Row) => draft[row._id] ?? row.permissions ?? {};
  const dirtyIds = Object.keys(draft);

  const setLevel = (row: Row, key: string, level: Level) =>
    setDraft(d => ({ ...d, [row._id]: { ...permsOf(row), [key]: level } }));

  const setAll = (row: Row, level: Level) => {
    const next: Record<string, Level> = { ...permsOf(row) };
    enabled.forEach(m => { next[m.key] = (level === 'admin' && !m.adminCapable) ? 'user' : level; });
    setDraft(d => ({ ...d, [row._id]: next }));
  };

  const save = async () => {
    if (!dirtyIds.length) return;
    setSaving(true);
    try {
      // Only the enabled modules travel, so a level stored for a disabled module
      // is never clobbered by a screen that cannot see it.
      const payload = dirtyIds.map(id => {
        const perms = draft[id];
        const scopedPerms: Record<string, Level> = {};
        enabled.forEach(m => { scopedPerms[m.key] = perms[m.key] ?? 'none'; });
        return { _id: id, permissions: scopedPerms };
      });
      await api.save(payload);
      await load();
      Alert.alert('Saved', 'Teachers inherit the new permissions immediately.');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return Alert.alert('Name required', 'Enter a designation name.');
    setAdding(true);
    try {
      await api.create({ name });
      setNewName(''); setAddOpen(false);
      await load();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setAdding(false); }
  };

  const rename = async () => {
    if (!renaming) return;
    const name = renameText.trim();
    if (!name) return;
    setRenameSaving(true);
    try {
      const res: any = unwrap(await api.update(renaming._id, { name }));
      const moved = res?.teachersRenamed ?? 0;
      setRenaming(null);
      await load();
      if (moved) Alert.alert('Renamed', `${moved} teacher${moved === 1 ? '' : 's'} moved to "${name}".`);
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setRenameSaving(false); }
  };

  const toggleActive = async (row: Row) => {
    try { await api.update(row._id, { isActive: !row.isActive }); await load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  // Teachers holding the designation block the delete. Show exactly who, rather
  // than an error string — the same list the server refuses the delete with.
  const showBlockers = async (row: Row, fromError?: any) => {
    if (fromError) {
      setBlocked({ name: fromError.designation || row.name, message: fromError.message, teachers: fromError.teachers || [] });
      return;
    }
    try {
      const d: any = unwrap(await api.teachers(row._id));
      setBlocked({ name: d?.designation || row.name, teachers: d?.teachers || [] });
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  const remove = async (row: Row) => {
    if (row.teacherCount) { await showBlockers(row); return; }
    if (!(await confirmAsync('Delete Designation',
      `Delete "${row.name}"? Its module permissions go with it.`, 'Delete'))) return;
    try { await api.remove(row._id); await load(); }
    catch (err: any) {
      if (err?.data?.code === 'DESIGNATION_IN_USE') { await load(); await showBlockers(row, err.data); }
      else Alert.alert('Error', err.message);
    }
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Designations' }} /><ModuleDisabled /></>);

  return (
    <>
      <Stack.Screen options={{ title: 'Designations' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          {loading ? <LoaderView /> : (
            <>
              <View style={s.note}>
                <Ionicons name="git-network-outline" size={16} color={Colors.info} />
                <Text style={s.noteText}>
                  School module enablement → Designation permission → User access. Only the {enabled.length} module
                  {enabled.length === 1 ? '' : 's'} enabled for this school can be granted, and every teacher on a
                  designation inherits it automatically.
                </Text>
              </View>

              {offList.length > 0 && (
                <View style={s.offNote}>
                  <Text style={s.offTitle}>Disabled at school level ({offList.length})</Text>
                  <Text style={s.offBody}>
                    {offList.map(m => m.label).join(' · ')} — revoked for every designation. Anything configured for
                    them is kept and reapplied if the Super Admin enables them again.
                  </Text>
                </View>
              )}

              <SectionTitle>Designations ({rows.length})</SectionTitle>

              {rows.length === 0 ? (
                <Empty icon="pricetags-outline" text="No designations yet" />
              ) : rows.map(row => {
                const perms = permsOf(row);
                const isOpen = open === row._id;
                const changed = !!draft[row._id];
                const nAdmin = enabled.filter(m => (perms[m.key] ?? 'none') === 'admin').length;
                const nUser  = enabled.filter(m => (perms[m.key] ?? 'none') === 'user').length;
                const nNone  = enabled.length - nAdmin - nUser;

                return (
                  <View key={row._id} style={[s.card, changed && { borderColor: Colors.accent }]}>
                    <TouchableOpacity style={s.cardHead} onPress={() => setOpen(isOpen ? null : row._id)} activeOpacity={0.7}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={s.cardTitle}>{row.name}</Text>
                          {!row.isActive && <Badge label="inactive" tone="neutral" />}
                          {changed && <Badge label="unsaved" tone="warning" />}
                        </View>
                        <Text style={s.cardSub}>
                          {row.teacherCount} teacher{row.teacherCount === 1 ? '' : 's'} · {nAdmin} admin · {nUser} normal · {nNone} none
                        </Text>
                      </View>
                      <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textLight} />
                    </TouchableOpacity>

                    {isOpen && (
                      <View style={s.cardBody}>
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                          <ActionBtn label="All Normal" tone="success" small onPress={() => setAll(row, 'user')} />
                          <ActionBtn label="All None" tone="neutral" small onPress={() => setAll(row, 'none')} />
                          <ActionBtn label="Rename" tone="info" small onPress={() => { setRenaming(row); setRenameText(row.name); }} />
                          <ActionBtn label={row.isActive ? 'Deactivate' : 'Activate'} tone="warning" small onPress={() => toggleActive(row)} />
                          <ActionBtn label="Delete" tone="danger" small onPress={() => remove(row)} />
                        </View>

                        {enabled.length === 0 ? (
                          <Empty icon="lock-closed-outline" text="No modules enabled for this school yet" />
                        ) : enabled.map(m => (
                          <View key={m.key} style={s.modRow}>
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <Text style={s.modLabel}>{m.icon} {m.label}</Text>
                              <Text style={s.modDesc} numberOfLines={2}>{m.description}</Text>
                            </View>
                            <LevelPicker
                              value={(perms[m.key] ?? 'none') as Level}
                              adminCapable={m.adminCapable}
                              onChange={lv => setLevel(row, m.key, lv)} />
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}

              <View style={{ marginTop: Spacing.md, gap: 8 }}>
                <ActionBtn label="+ Add Designation" tone="info" onPress={() => setAddOpen(true)} />
              </View>
            </>
          )}
        </ScrollView>

        {dirtyIds.length > 0 && (
          <View style={s.saveBar}>
            <Text style={s.saveText}>{dirtyIds.length} changed</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <ActionBtn label="Discard" tone="neutral" small onPress={() => setDraft({})} />
              <ActionBtn label={saving ? 'Saving…' : 'Save'} tone="success" small onPress={save} />
            </View>
          </View>
        )}
      </View>

      <FormModal visible={addOpen} title="Add Designation" onClose={() => setAddOpen(false)}
        onSubmit={add} submitting={adding} submitLabel="Add">
        <Text style={s.modalHint}>
          Starts with normal access to every enabled module. Open it in the list to grant admin access or withdraw modules.
        </Text>
        <Input label="Name" value={newName} onChange={setNewName} placeholder="e.g. Head of Science" />
      </FormModal>

      <FormModal visible={!!blocked} title="Cannot Delete Designation" onClose={() => setBlocked(null)}>
        <View style={s.blockNote}>
          <Ionicons name="alert-circle" size={16} color={Colors.danger} />
          <Text style={s.blockText}>
            {blocked?.message
              ?? `Cannot delete "${blocked?.name}" — ${blocked?.teachers.length} teacher${blocked?.teachers.length === 1 ? '' : 's'} still ${blocked?.teachers.length === 1 ? 'has' : 'have'} this designation. Reassign ${blocked?.teachers.length === 1 ? 'them' : 'them all'} to another designation first.`}
          </Text>
        </View>

        <SectionTitle>Teachers on this designation ({blocked?.teachers.length ?? 0})</SectionTitle>
        {(blocked?.teachers ?? []).map(t => (
          <View key={t._id} style={s.teacherRow}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.teacherName}>{t.name}</Text>
              <Text style={s.teacherMeta}>{t.email}</Text>
              <Text style={s.teacherMeta}>
                {[t.employeeId && `ID ${t.employeeId}`, t.phone, t.department, t.joiningDate && `joined ${t.joiningDate}`]
                  .filter(Boolean).join(' · ') || 'No further details on file'}
              </Text>
            </View>
            <Badge label={t.isActive ? 'active' : 'inactive'} />
          </View>
        ))}

        {/* No file-save capability in the app, so the spreadsheet lives on the web panel. */}
        <Text style={s.blockHint}>
          Reassign these teachers on the Teachers screen, then delete the designation.
          A downloadable Excel list of them is available on the web admin panel.
        </Text>
      </FormModal>

      <FormModal visible={!!renaming} title="Rename Designation" onClose={() => setRenaming(null)}
        onSubmit={rename} submitting={renameSaving} submitLabel="Save">
        <Text style={s.modalHint}>
          Every teacher holding this designation moves to the new name, so nobody loses their permissions.
        </Text>
        <Input label="Name" value={renameText} onChange={setRenameText} />
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  note: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: Colors.infoLight, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: 10,
  },
  noteText: { flex: 1, fontSize: 11, lineHeight: 16, color: Colors.textSecondary },
  offNote: {
    borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border,
    borderRadius: Radius.lg, padding: Spacing.md, marginBottom: 10,
    backgroundColor: Colors.surfaceAlt,
  },
  offTitle: { fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 3 },
  offBody: { fontSize: 11, lineHeight: 16, color: Colors.textSecondary },

  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 10, overflow: 'hidden',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: 8 },
  cardTitle: { ...Typography.body, fontWeight: '700', color: Colors.text },
  cardSub: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
  cardBody: {
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: Spacing.md,
  },

  modRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  modLabel: { fontSize: 13, fontWeight: '600', color: Colors.text },
  modDesc: { fontSize: 10, color: Colors.textLight, marginTop: 1 },

  picker: { flexDirection: 'row', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, overflow: 'hidden' },
  pickerBtn: { paddingVertical: 5, paddingHorizontal: 9, borderRightWidth: 1, borderRightColor: Colors.border },
  pickerText: { fontSize: 11, color: Colors.textLight, fontWeight: '500' },

  saveBar: {
    position: 'absolute', left: Spacing.md, right: Spacing.md, bottom: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.accent,
    padding: Spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  saveText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },

  blockNote: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: Colors.dangerLight, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: Spacing.md,
  },
  blockText: { flex: 1, fontSize: 12, lineHeight: 17, color: Colors.text },
  blockHint: { fontSize: 11, lineHeight: 16, color: Colors.textLight, marginTop: Spacing.md },
  teacherRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  teacherName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  teacherMeta: { fontSize: 11, color: Colors.textLight, marginTop: 1 },
  modalHint: { fontSize: 11, color: Colors.textLight, lineHeight: 16, marginBottom: 10 },
});
