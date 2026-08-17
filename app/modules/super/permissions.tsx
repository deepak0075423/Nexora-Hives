import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as superApi from '@/api/superadmin.api';
import {
  unwrap, LoaderView, Empty, Select, Toggle, ActionBtn,
} from '@/components/ui/kit';

// Module flags on the School model — what each school's users are allowed to see
const MODULES: { key: string; label: string; desc: string }[] = [
  { key: 'attendance',   label: 'Attendance',     desc: 'Student & staff attendance, regularization' },
  { key: 'notification', label: 'Notifications',  desc: 'In-app alerts and announcements' },
  { key: 'aptitudeExam', label: 'Aptitude Exams', desc: 'Teacher-created timed MCQ exams' },
  { key: 'result',       label: 'Results',        desc: 'Formal exams, marks entry and report cards' },
  { key: 'timetable',    label: 'Timetable',      desc: 'Period schedules per section' },
  { key: 'holiday',      label: 'Holidays',       desc: 'Holiday calendar' },
  { key: 'leave',        label: 'Leave',          desc: 'Teacher leave applications and balances' },
  { key: 'document',     label: 'Documents',      desc: 'Document sharing and submissions' },
  { key: 'library',      label: 'Library',        desc: 'Catalogue, circulation and fines' },
  { key: 'payroll',      label: 'Payroll',        desc: 'Salary structures, runs and payslips' },
  { key: 'fees',         label: 'Fees',           desc: 'Fee structures, payments and receipts' },
  { key: 'inventory',    label: 'Inventory',      desc: 'Stock, assets, procurement & purchase requests' },
  { key: 'transport',    label: 'Transport',      desc: 'Fleet, routes, trips, tracking & transport fees' },
  { key: 'chat',         label: 'Chat',           desc: 'Real-time messaging' },
  { key: 'feedback',     label: 'Teacher Feedback', desc: 'Student feedback campaigns, analytics & reports' },
];

export default function SuperPermissionsScreen() {
  const [schools, setSchools] = useState<any[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const d = unwrap(await superApi.getPermissions());
      setSchools(d ?? []);
      // Keep the current selection; refresh its flags from server
      if (schoolId) {
        const cur = (d ?? []).find((s: any) => s._id === schoolId);
        if (cur) setFlags({ ...(cur.modules ?? {}) });
      }
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const pickSchool = (id: string) => {
    setSchoolId(id);
    const sc = schools.find((s: any) => s._id === id);
    setFlags({ ...(sc?.modules ?? {}) });
    setDirty(false);
  };

  const toggleFlag = (key: string, value: boolean) => {
    setFlags(f => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const save = async () => {
    if (!schoolId) return;
    setSaving(true);
    try {
      // Send the full modules map so unset flags are explicitly false
      const modules: Record<string, boolean> = {};
      MODULES.forEach(m => { modules[m.key] = !!flags[m.key]; });
      await superApi.updatePermissions({ schoolId, modules });
      setDirty(false);
      load();
      Alert.alert('Saved', 'Module permissions updated for this school.');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  const enabledCount = MODULES.filter(m => flags[m.key]).length;

  return (
    <>
      <Stack.Screen options={{ title: 'Permissions' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : (
          <>
            <Select label="School" value={schoolId} onChange={pickSchool}
              options={schools.map((s: any) => ({ label: s.name, value: s._id }))}
              placeholder="Pick a school to manage" />

            {!schoolId ? (
              <Empty icon="key-outline" text="Select a school to manage which modules its users can access" />
            ) : (
              <>
                <View style={ps.summary}>
                  <Text style={ps.summaryText}>{enabledCount} of {MODULES.length} modules enabled</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <ActionBtn label="All On" tone="success" small onPress={() => { const f: Record<string, boolean> = {}; MODULES.forEach(m => f[m.key] = true); setFlags(f); setDirty(true); }} />
                    <ActionBtn label="All Off" tone="danger" small onPress={() => { setFlags({}); setDirty(true); }} />
                  </View>
                </View>

                {MODULES.map(m => (
                  <Toggle key={m.key} label={m.label} sub={m.desc}
                    value={!!flags[m.key]} onChange={v => toggleFlag(m.key, v)} />
                ))}

                <ActionBtn label={saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'} tone={dirty ? 'success' : 'neutral'} onPress={save} />
              </>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const ps = StyleSheet.create({
  summary: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.border,
  },
  summaryText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
});
