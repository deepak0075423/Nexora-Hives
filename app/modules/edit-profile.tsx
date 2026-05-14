import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { getProfile, updateProfile } from '@/api/profile.api';

// ── Helpers ──────────────────────────────────────────────────────────────────

function isoToInput(iso?: string | null): string {
  if (!iso) return '';
  return iso.split('T')[0];
}

// ── Shared Field Components ───────────────────────────────────────────────────

function Block({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <View style={bl.wrap}>
      <View style={bl.header}>
        <Ionicons name={icon as any} size={15} color={Colors.primary} />
        <Text style={bl.title}>{title}</Text>
      </View>
      <View style={bl.card}>{children}</View>
    </View>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  locked?: boolean;
  multiline?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'email-address' | 'numeric';
  last?: boolean;
}

function Field({
  label, value, onChangeText, placeholder,
  locked, multiline, keyboardType = 'default', last,
}: FieldProps) {
  return (
    <View style={[fl.wrap, !last && fl.border]}>
      <Text style={fl.label}>{label}</Text>
      {locked ? (
        <View style={fl.lockRow}>
          <Text style={fl.lockVal} numberOfLines={2}>{value || '—'}</Text>
          <Ionicons name="lock-closed-outline" size={13} color={Colors.textLight} />
        </View>
      ) : (
        <TextInput
          style={[fl.input, multiline && fl.multiline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? ''}
          placeholderTextColor={Colors.textLight}
          multiline={multiline}
          keyboardType={keyboardType}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
          returnKeyType={multiline ? 'default' : 'next'}
        />
      )}
    </View>
  );
}

interface ChipProps {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  last?: boolean;
}

function ChipSelect({ label, options, value, onChange, last }: ChipProps) {
  return (
    <View style={[fl.wrap, !last && fl.border]}>
      <Text style={fl.label}>{label}</Text>
      <View style={cp.row}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[cp.chip, value === opt && cp.active]}
            onPress={() => onChange(value === opt ? '' : opt)}
            activeOpacity={0.75}
          >
            <Text style={[cp.text, value === opt && cp.textActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Role-specific blocks ──────────────────────────────────────────────────────

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS      = ['Male', 'Female', 'Other'];

function TeacherEditBlock({ form, set }: { form: FormState; set: Setter }) {
  return (
    <>
      <Block title="Professional" icon="briefcase-outline">
        <Field label="Department"    value={form.department}    onChangeText={v => set('department', v)}    placeholder="e.g. Science" />
        <Field label="Qualification" value={form.qualification} onChangeText={v => set('qualification', v)} placeholder="e.g. M.Sc, B.Ed" />
        <Field label="Experience"    value={form.experience}    onChangeText={v => set('experience', v)}    placeholder="e.g. 5 years" last />
      </Block>
      <Block title="Personal" icon="person-outline">
        <ChipSelect label="Gender" options={GENDERS} value={form.gender} onChange={v => set('gender', v)} />
        <Field label="Date of Birth" value={form.dob} onChangeText={v => set('dob', v)} placeholder="YYYY-MM-DD" keyboardType="numeric" last />
      </Block>
    </>
  );
}

function TeacherLockedBlock({ profile }: { profile: Record<string, any> }) {
  if (!profile.designation && !profile.employeeId) return null;
  return (
    <Block title="Admin Managed" icon="shield-checkmark-outline">
      <View style={lk.note}>
        <Ionicons name="information-circle-outline" size={13} color={Colors.info} />
        <Text style={lk.noteText}>Contact your school admin to change these fields.</Text>
      </View>
      {profile.designation && <Field label="Designation" value={profile.designation} locked last={!profile.employeeId} />}
      {profile.employeeId  && <Field label="Employee ID"  value={profile.employeeId}  locked last />}
    </Block>
  );
}

function StudentEditBlock({ form, set }: { form: FormState; set: Setter }) {
  return (
    <>
      <Block title="Personal" icon="person-outline">
        <ChipSelect label="Gender" options={GENDERS} value={form.gender} onChange={v => set('gender', v)} />
        <Field label="Date of Birth" value={form.dob} onChangeText={v => set('dob', v)} placeholder="YYYY-MM-DD" keyboardType="numeric" last />
      </Block>
      <Block title="Medical & Address" icon="medical-outline">
        <ChipSelect label="Blood Group" options={BLOOD_GROUPS} value={form.bloodGroup} onChange={v => set('bloodGroup', v)} />
        <Field label="Address" value={form.address} onChangeText={v => set('address', v)} placeholder="Street, City, State" multiline last />
      </Block>
    </>
  );
}

function StudentLockedBlock({ profile }: { profile: Record<string, any> }) {
  if (!profile.admissionNumber && !profile.rollNumber) return null;
  return (
    <Block title="Admin Managed" icon="shield-checkmark-outline">
      <View style={lk.note}>
        <Ionicons name="information-circle-outline" size={13} color={Colors.info} />
        <Text style={lk.noteText}>Contact your school admin to change these fields.</Text>
      </View>
      {profile.admissionNumber && <Field label="Admission No." value={profile.admissionNumber} locked last={!profile.rollNumber} />}
      {profile.rollNumber      && <Field label="Roll Number"    value={profile.rollNumber}      locked last />}
    </Block>
  );
}

function ParentEditBlock({ form, set }: { form: FormState; set: Setter }) {
  return (
    <Block title="Family Info" icon="people-outline">
      <Field label="Emergency Contact"    value={form.emergencyContact}  onChangeText={v => set('emergencyContact', v)}  keyboardType="phone-pad" placeholder="+91 xxxxxxxxxx" />
      <Field label="Father's Occupation"  value={form.fatherOccupation}  onChangeText={v => set('fatherOccupation', v)}  placeholder="e.g. Engineer" />
      <Field label="Mother's Occupation"  value={form.motherOccupation}  onChangeText={v => set('motherOccupation', v)}  placeholder="e.g. Teacher" />
      <Field label="Guardian's Occupation" value={form.guardianOccupation} onChangeText={v => set('guardianOccupation', v)} placeholder="If applicable" />
      <Field label="Annual Income"        value={form.annualIncome}      onChangeText={v => set('annualIncome', v)}      keyboardType="numeric" placeholder="e.g. 500000" last />
    </Block>
  );
}

function ParentLockedBlock({ profile }: { profile: Record<string, any> }) {
  if (!profile.relationship) return null;
  return (
    <Block title="Admin Managed" icon="shield-checkmark-outline">
      <View style={lk.note}>
        <Ionicons name="information-circle-outline" size={13} color={Colors.info} />
        <Text style={lk.noteText}>Contact your school admin to change these fields.</Text>
      </View>
      <Field label="Relationship" value={profile.relationship} locked last />
    </Block>
  );
}

// ── Form state & helpers ──────────────────────────────────────────────────────

interface FormState {
  name: string; phone: string;
  gender: string; dob: string;
  department: string; qualification: string; experience: string;
  bloodGroup: string; address: string;
  emergencyContact: string; fatherOccupation: string;
  motherOccupation: string; guardianOccupation: string; annualIncome: string;
}
type Setter = (k: keyof FormState, v: string) => void;

const EMPTY: FormState = {
  name: '', phone: '', gender: '', dob: '',
  department: '', qualification: '', experience: '',
  bloodGroup: '', address: '',
  emergencyContact: '', fatherOccupation: '', motherOccupation: '', guardianOccupation: '', annualIncome: '',
};

function formFromData(u: Record<string, any>, p: Record<string, any>): FormState {
  return {
    name:  u.name  ?? '',
    phone: u.phone ?? '',
    gender:        p.gender        ?? '',
    dob:           isoToInput(p.dob),
    department:    p.department    ?? '',
    qualification: p.qualification ?? '',
    experience:    p.experience    ?? '',
    bloodGroup:    p.bloodGroup    ?? '',
    address:       p.address       ?? '',
    emergencyContact:   p.emergencyContact   ?? '',
    fatherOccupation:   p.fatherOccupation   ?? '',
    motherOccupation:   p.motherOccupation   ?? '',
    guardianOccupation: p.guardianOccupation ?? '',
    annualIncome:       p.annualIncome       ?? '',
  };
}

function buildPayload(role: string, form: FormState): Record<string, string> {
  const base = { name: form.name.trim(), phone: form.phone.trim() };
  if (role === 'teacher') return { ...base, gender: form.gender, dob: form.dob, department: form.department, qualification: form.qualification, experience: form.experience };
  if (role === 'student') return { ...base, gender: form.gender, dob: form.dob, bloodGroup: form.bloodGroup, address: form.address };
  if (role === 'parent')  return { ...base, emergencyContact: form.emergencyContact, fatherOccupation: form.fatherOccupation, motherOccupation: form.motherOccupation, guardianOccupation: form.guardianOccupation, annualIncome: form.annualIncome };
  return base;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function EditProfileScreen() {
  const router       = useRouter();
  const { user, reload } = useAuth();
  const role         = user?.role ?? '';

  const [form, setForm]           = useState<FormState>({ ...EMPTY, name: user?.name ?? '' });
  const [rawProfile, setRawProfile] = useState<Record<string, any> | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);

  const set: Setter = useCallback((k, v) => setForm(prev => ({ ...prev, [k]: v })), []);

  // Load profile from DB and pre-fill form
  useEffect(() => {
    (async () => {
      try {
        const res: any = await getProfile();
        // axios interceptor already unwraps res.data, so res = { success, data: { user, profile } }
        const d = res.data ?? {};
        const u = d.user    ?? {};
        const p = d.profile ?? {};
        setRawProfile(p);
        setForm(formFromData(u, p));
      } catch {
        // Fall back to whatever AuthContext has
        setForm(prev => ({ ...prev, name: user?.name ?? '' }));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('Validation', 'Name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      await updateProfile(buildPayload(role, form));
      await reload();
      // Brief "Saved" state on button then navigate back
      setSaved(true);
      setTimeout(() => router.back(), 700);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  const initials = (form.name || user?.name || 'U')
    .split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Edit Profile', headerBackTitle: 'Profile' }} />
        <View style={s.loadWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={s.loadText}>Loading your profile…</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Edit Profile', headerBackTitle: 'Profile' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar */}
          <View style={s.heroBlock}>
            <View style={s.avatarRing}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{initials}</Text>
              </View>
            </View>
            <Text style={s.heroEmail}>{user?.email}</Text>
          </View>

          {/* Contact — all roles */}
          <Block title="Contact" icon="person-outline">
            <Field
              label="Full Name"
              value={form.name}
              onChangeText={v => set('name', v)}
              placeholder="Your full name"
            />
            <Field
              label="Phone"
              value={form.phone}
              onChangeText={v => set('phone', v)}
              placeholder="+91 9876543210"
              keyboardType="phone-pad"
            />
            <Field label="Email" value={user?.email ?? ''} locked last />
          </Block>

          {/* Role-specific editable */}
          {role === 'teacher' && <TeacherEditBlock form={form} set={set} />}
          {role === 'student' && <StudentEditBlock form={form} set={set} />}
          {role === 'parent'  && <ParentEditBlock  form={form} set={set} />}

          {/* Role-specific read-only (admin-managed) */}
          {role === 'teacher' && rawProfile && <TeacherLockedBlock profile={rawProfile} />}
          {role === 'student' && rawProfile && <StudentLockedBlock profile={rawProfile} />}
          {role === 'parent'  && rawProfile && <ParentLockedBlock  profile={rawProfile} />}

          {/* Save button */}
          <TouchableOpacity
            style={[s.saveBtn, saved && s.saveBtnDone, saving && s.saveBtnLoading]}
            onPress={handleSave}
            disabled={saving || saved}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : saved ? (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={s.saveBtnText}>Saved</Text>
              </>
            ) : (
              <>
                <Ionicons name="save-outline" size={18} color="#fff" />
                <Text style={s.saveBtnText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const bl = StyleSheet.create({
  wrap:   { marginBottom: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, paddingHorizontal: 2 },
  title:  { ...Typography.bodySmall, color: Colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  card:   { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, overflow: 'hidden' },
});

const fl = StyleSheet.create({
  wrap:     { paddingVertical: 12 },
  border:   { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  label:    { ...Typography.caption, color: Colors.textSecondary, marginBottom: 5 },
  input:    { ...Typography.body, color: Colors.text, paddingVertical: 2 },
  multiline:{ minHeight: 72, textAlignVertical: 'top' },
  lockRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lockVal:  { ...Typography.body, color: Colors.textLight, flex: 1 },
});

const cp = StyleSheet.create({
  row:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip:       { paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  active:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  text:       { ...Typography.bodySmall, color: Colors.textSecondary, fontWeight: '500' },
  textActive: { color: '#fff', fontWeight: '700' },
});

const lk = StyleSheet.create({
  note:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 10, marginBottom: 2, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  noteText: { ...Typography.caption, color: Colors.info, flex: 1, lineHeight: 16 },
});

const s = StyleSheet.create({
  loadWrap: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadText: { ...Typography.body, color: Colors.textSecondary },
  scroll:   { flex: 1, backgroundColor: Colors.background },
  content:  { padding: Spacing.md, paddingBottom: 120 },

  heroBlock: {
    alignItems: 'center', marginBottom: Spacing.lg,
    backgroundColor: Colors.primary,
    marginHorizontal: -Spacing.md, marginTop: -Spacing.md,
    paddingTop: Spacing.xl, paddingBottom: Spacing.xl,
  },
  avatarRing: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm,
  },
  avatar: {
    width: 86, height: 86, borderRadius: 43,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText:  { fontSize: 30, fontWeight: '800', color: '#fff' },
  heroEmail:   { ...Typography.bodySmall, color: 'rgba(255,255,255,0.7)' },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 15, marginTop: Spacing.sm,
  },
  saveBtnDone:    { backgroundColor: Colors.success },
  saveBtnLoading: { opacity: 0.7 },
  saveBtnText:    { fontSize: 15, fontWeight: '700', color: '#fff' },
});
