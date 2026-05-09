import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Switch, Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as adminApi     from '@/api/admin.api';
import * as teacherApi   from '@/api/teacher.api';
import * as superAdminApi from '@/api/superadmin.api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TargetOption { value: string; label: string; needsClass?: boolean; needsSection?: boolean; needsSchools?: boolean; }
interface ClassItem  { _id: string; classNumber: number; sections: { _id: string; name?: string }[] }
interface SchoolItem { _id: string; name: string; }

// ── Target options per role ───────────────────────────────────────────────────

const ADMIN_TARGETS: TargetOption[] = [
  { value: 'all',              label: 'Everyone in School' },
  { value: 'all_teachers',     label: 'All Teachers' },
  { value: 'all_students',     label: 'All Students' },
  { value: 'all_parents',      label: 'All Parents' },
  { value: 'class_students',   label: 'Class — Students',  needsClass: true },
  { value: 'class_parents',    label: 'Class — Parents',   needsClass: true },
  { value: 'section_students', label: 'Section — Students', needsClass: true, needsSection: true },
  { value: 'section_parents',  label: 'Section — Parents',  needsClass: true, needsSection: true },
  { value: 'section_all',      label: 'Section — Everyone', needsClass: true, needsSection: true },
];

const TEACHER_TARGETS: TargetOption[] = [
  { value: 'section_students', label: 'My Section — Students' },
  { value: 'section_parents',  label: 'My Section — Parents'  },
  { value: 'section_all',      label: 'My Section — Everyone' },
];

const SUPERADMIN_TARGETS: TargetOption[] = [
  { value: 'all_schools',     label: 'All School Admins' },
  { value: 'specific_school', label: 'Specific School(s)', needsSchools: true },
];

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SendNotificationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const role = user?.role ?? 'student';

  // form state
  const [title, setTitle]     = useState('');
  const [body, setBody]       = useState('');
  const [targetType, setTargetType] = useState('');
  const [inApp, setInApp]     = useState(true);
  const [email, setEmail]     = useState(false);
  const [sending, setSending] = useState(false);

  // class/section (admin)
  const [classes, setClasses]       = useState<ClassItem[]>([]);
  const [classId, setClassId]       = useState('');
  const [sectionId, setSectionId]   = useState('');
  const [classesLoading, setClassesLoading] = useState(false);

  // schools (super_admin)
  const [schools, setSchools]             = useState<SchoolItem[]>([]);
  const [targetSchools, setTargetSchools] = useState<string[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);

  // teacher section (auto-loaded)
  const [teacherSectionId, setTeacherSectionId] = useState('');
  const [teacherSectionLabel, setTeacherSectionLabel] = useState('');

  // targets for current role
  const targets: TargetOption[] =
    role === 'admin'        ? ADMIN_TARGETS :
    role === 'teacher'      ? TEACHER_TARGETS :
    role === 'super-admin'  ? SUPERADMIN_TARGETS : [];

  const currentTarget = targets.find(t => t.value === targetType);

  // ── Load role-specific data on mount ──────────────────────────────────────

  useEffect(() => {
    if (role === 'admin') loadClasses();
    if (role === 'super-admin') loadSchools();
    if (role === 'teacher') loadTeacherSection();
  }, [role]);

  const loadClasses = async () => {
    setClassesLoading(true);
    try {
      const res: any = await adminApi.getClassesWithSections();
      setClasses((res as any)?.data ?? res ?? []);
    } catch { /* empty */ }
    finally { setClassesLoading(false); }
  };

  const loadSchools = async () => {
    setSchoolsLoading(true);
    try {
      const res: any = await superAdminApi.getSchools();
      const list = (res as any)?.data?.data ?? (res as any)?.data?.schools ?? (res as any)?.data ?? res ?? [];
      setSchools(Array.isArray(list) ? list : []);
    } catch { /* empty */ }
    finally { setSchoolsLoading(false); }
  };

  const loadTeacherSection = async () => {
    try {
      const res: any = await teacherApi.getMySection();
      const section = (res as any)?.data?.section;
      if (section) {
        setTeacherSectionId(section._id);
        const classNum = section.class?.classNumber ?? section.classNumber ?? '';
        setTeacherSectionLabel(`Class ${classNum}`);
      }
    } catch { /* empty */ }
  };

  // reset section when class changes
  useEffect(() => { setSectionId(''); }, [classId]);

  // reset class+section when target type changes
  useEffect(() => {
    setClassId(''); setSectionId(''); setTargetSchools([]);
  }, [targetType]);

  // ── Send ──────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!title.trim())    { Alert.alert('Required', 'Please enter a title.'); return; }
    if (!body.trim())     { Alert.alert('Required', 'Please enter a message body.'); return; }
    if (!targetType)      { Alert.alert('Required', 'Please select a recipient group.'); return; }
    if (!inApp && !email) { Alert.alert('Required', 'Select at least one channel (In-App or Email).'); return; }
    if (role === 'teacher' && !teacherSectionId) { Alert.alert('No Section', 'You are not assigned to any section.'); return; }
    if (currentTarget?.needsClass && !classId)          { Alert.alert('Required', 'Please select a class.'); return; }
    if (currentTarget?.needsSection && !sectionId)      { Alert.alert('Required', 'Please select a section.'); return; }
    if (currentTarget?.needsSchools && targetSchools.length === 0) { Alert.alert('Required', 'Please select at least one school.'); return; }

    const payload: Record<string, any> = {
      title: title.trim(),
      body: body.trim(),
      targetType,
      channels: { inApp, email },
    };

    if (role === 'teacher') {
      payload.sectionId = teacherSectionId;
    } else {
      if (currentTarget?.needsClass)   payload.classId   = classId;
      if (currentTarget?.needsSection) payload.sectionId = sectionId;
      if (currentTarget?.needsSchools) payload.targetSchools = targetSchools;
    }

    setSending(true);
    try {
      if (role === 'admin')       await adminApi.sendNotification(payload);
      else if (role === 'teacher') await teacherApi.sendNotification(payload);
      else                        await superAdminApi.sendNotification(payload);

      Alert.alert('Sent!', 'Notification delivered successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Failed', err?.message ?? 'Could not send notification.');
    } finally {
      setSending(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const selectedClass = classes.find(c => c._id === classId);
  const sections = selectedClass?.sections ?? [];

  const toggleSchool = (id: string) =>
    setTargetSchools(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Stack.Screen options={{ title: 'Send Notification' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* Title */}
        <SectionLabel label="Title" required />
        <TextInput
          style={s.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Notification title"
          placeholderTextColor={Colors.textLight}
          maxLength={100}
        />

        {/* Body */}
        <SectionLabel label="Message" required />
        <TextInput
          style={[s.input, s.textarea]}
          value={body}
          onChangeText={setBody}
          placeholder="Write your message here..."
          placeholderTextColor={Colors.textLight}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          maxLength={1000}
        />
        <Text style={s.charCount}>{body.length}/1000</Text>

        {/* Target type */}
        <SectionLabel label="Send To" required />
        <View style={s.optionGroup}>
          {targets.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[s.option, targetType === t.value && s.optionActive]}
              onPress={() => setTargetType(t.value)}
              activeOpacity={0.75}
            >
              <View style={[s.optionRadio, targetType === t.value && s.optionRadioActive]}>
                {targetType === t.value && <View style={s.optionRadioInner} />}
              </View>
              <Text style={[s.optionLabel, targetType === t.value && s.optionLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Teacher auto-section info */}
        {role === 'teacher' && teacherSectionLabel !== '' && targetType !== '' && (
          <View style={s.infoBox}>
            <Ionicons name="information-circle" size={16} color={Colors.info} />
            <Text style={s.infoText}>Sending to your assigned section ({teacherSectionLabel})</Text>
          </View>
        )}

        {/* Admin: Class selector */}
        {role === 'admin' && currentTarget?.needsClass && (
          <>
            <SectionLabel label="Select Class" required />
            {classesLoading ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginBottom: 12 }} />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll}>
                {classes.map((c) => (
                  <TouchableOpacity
                    key={c._id}
                    style={[s.chip, classId === c._id && s.chipActive]}
                    onPress={() => setClassId(c._id)}
                  >
                    <Text style={[s.chipText, classId === c._id && s.chipTextActive]}>
                      Class {c.classNumber}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        )}

        {/* Admin: Section selector */}
        {role === 'admin' && currentTarget?.needsSection && classId !== '' && (
          <>
            <SectionLabel label="Select Section" required />
            {sections.length === 0 ? (
              <Text style={s.noData}>No sections found for this class.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll}>
                {sections.map((sec, i) => (
                  <TouchableOpacity
                    key={sec._id}
                    style={[s.chip, sectionId === sec._id && s.chipActive]}
                    onPress={() => setSectionId(sec._id)}
                  >
                    <Text style={[s.chipText, sectionId === sec._id && s.chipTextActive]}>
                      {sec.name ?? `Section ${i + 1}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        )}

        {/* Super admin: Schools multi-select */}
        {role === 'super-admin' && currentTarget?.needsSchools && (
          <>
            <SectionLabel label="Select Schools" required />
            {schoolsLoading ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginBottom: 12 }} />
            ) : schools.length === 0 ? (
              <Text style={s.noData}>No schools found.</Text>
            ) : (
              <View style={s.schoolList}>
                {schools.map((sc) => {
                  const checked = targetSchools.includes(sc._id);
                  return (
                    <TouchableOpacity
                      key={sc._id}
                      style={[s.schoolItem, checked && s.schoolItemActive]}
                      onPress={() => toggleSchool(sc._id)}
                      activeOpacity={0.75}
                    >
                      <View style={[s.checkbox, checked && s.checkboxActive]}>
                        {checked && <Ionicons name="checkmark" size={12} color="#fff" />}
                      </View>
                      <Text style={[s.schoolName, checked && s.schoolNameActive]} numberOfLines={1}>{sc.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {targetSchools.length > 0 && (
              <Text style={s.selectedCount}>{targetSchools.length} school(s) selected</Text>
            )}
          </>
        )}

        {/* Channels */}
        <SectionLabel label="Delivery Channels" />
        <View style={s.channelRow}>
          <View style={s.channelItem}>
            <View style={s.channelLeft}>
              <View style={[s.channelIcon, { backgroundColor: Colors.infoLight }]}>
                <Ionicons name="phone-portrait" size={16} color={Colors.info} />
              </View>
              <View>
                <Text style={s.channelLabel}>In-App</Text>
                <Text style={s.channelSub}>Push notification in the app</Text>
              </View>
            </View>
            <Switch
              value={inApp}
              onValueChange={setInApp}
              trackColor={{ false: Colors.border, true: Colors.primary + '60' }}
              thumbColor={inApp ? Colors.primary : Colors.textLight}
            />
          </View>
          <View style={[s.channelItem, { borderTopWidth: 1, borderTopColor: Colors.divider }]}>
            <View style={s.channelLeft}>
              <View style={[s.channelIcon, { backgroundColor: Colors.warningLight }]}>
                <Ionicons name="mail" size={16} color={Colors.warning} />
              </View>
              <View>
                <Text style={s.channelLabel}>Email</Text>
                <Text style={s.channelSub}>Send to registered email address</Text>
              </View>
            </View>
            <Switch
              value={email}
              onValueChange={setEmail}
              trackColor={{ false: Colors.border, true: Colors.primary + '60' }}
              thumbColor={email ? Colors.primary : Colors.textLight}
            />
          </View>
        </View>

      </ScrollView>

      {/* Send button — fixed at bottom */}
      <View style={s.footer}>
        <TouchableOpacity style={s.sendBtn} onPress={handleSend} disabled={sending} activeOpacity={0.85}>
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="paper-plane" size={18} color="#fff" />
              <Text style={s.sendBtnText}>Send Notification</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </>
  );
}

// ── SectionLabel ──────────────────────────────────────────────────────────────

function SectionLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginTop: 4 }}>
      <Text style={sl.label}>{label}</Text>
      {required && <Text style={sl.req}> *</Text>}
    </View>
  );
}

const sl = StyleSheet.create({
  label: { ...Typography.label, color: Colors.textSecondary },
  req:   { fontSize: 13, color: Colors.danger, fontWeight: '700' },
});

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  input: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    ...Typography.body, color: Colors.text,
    marginBottom: Spacing.md,
  },
  textarea: { minHeight: 100, paddingTop: 12 },
  charCount: { fontSize: 10, color: Colors.textLight, textAlign: 'right', marginTop: -12, marginBottom: Spacing.md },

  optionGroup: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  option: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 13,
    paddingHorizontal: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  optionActive: { backgroundColor: '#EEF2FF' },
  optionRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  optionRadioActive: { borderColor: Colors.primary },
  optionRadioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  optionLabel: { flex: 1, fontSize: 14, color: Colors.text },
  optionLabelActive: { fontWeight: '600', color: Colors.primary },

  infoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.infoLight, borderRadius: Radius.md,
    padding: Spacing.sm, marginBottom: Spacing.md,
  },
  infoText: { flex: 1, fontSize: 12, color: Colors.info },

  chipScroll: { marginBottom: Spacing.md },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
    marginRight: 8,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  schoolList: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
    marginBottom: 6,
  },
  schoolItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    paddingHorizontal: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  schoolItemActive: { backgroundColor: '#EEF2FF' },
  checkbox: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  schoolName: { flex: 1, fontSize: 14, color: Colors.text },
  schoolNameActive: { fontWeight: '600', color: Colors.primary },
  selectedCount: { fontSize: 11, color: Colors.primary, fontWeight: '500', marginBottom: Spacing.md },

  channelRow: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  channelItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  channelLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  channelIcon: { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  channelLabel: { fontSize: 14, fontWeight: '600', color: Colors.text },
  channelSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  noData: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.md, fontStyle: 'italic' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: Spacing.md, backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 14,
  },
  sendBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
