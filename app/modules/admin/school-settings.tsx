import React, { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, RefreshControl, Alert, Switch, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import { useAuth } from '@/contexts/AuthContext';
import { schoolLogoUrl } from '@/utils/branding';
import { isEmail, isPhone, isURL } from '@/utils/validators';
import {
  unwrap, LoaderView, Input, ActionBtn, SectionTitle, Card, KV, confirmAsync,
} from '@/components/ui/kit';

interface SmtpForm {
  enabled: boolean; host: string; port: string; secure: boolean;
  user: string; pass: string; fromName: string; fromEmail: string; hasPassword: boolean;
}

const EMPTY_SMTP: SmtpForm = {
  enabled: false, host: '', port: '587', secure: false,
  user: '', pass: '', fromName: '', fromEmail: '', hasPassword: false,
};

export default function AdminSchoolSettingsScreen() {
  const { user: me, reload } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [school, setSchool] = useState<any>(null);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', website: '',
    admissionNumberFormat: '{INITIALS}{YYYY}{####}',
    employeeIdFormat: '{INITIALS}{####}',
  });
  // Live previews of the next auto-generated identifiers
  const [admPreview, setAdmPreview] = useState<any>(null);
  const [empPreview, setEmpPreview] = useState<any>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const [smtp, setSmtp] = useState<SmtpForm>(EMPTY_SMTP);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);

  const load = async () => {
    try {
      const d = unwrap(await adminApi.getSchoolSettings());
      setSchool(d);
      setForm({
        name: d?.name ?? '', email: d?.email ?? '', phone: d?.phone ?? '', website: d?.website ?? '',
        admissionNumberFormat: d?.admissionNumberFormat ?? '{INITIALS}{YYYY}{####}',
        employeeIdFormat: d?.employeeIdFormat ?? '{INITIALS}{####}',
      });
      const s: any = unwrap(await adminApi.getSmtpSettings().catch(() => null)) ?? {};
      setSmtp({
        enabled: !!s.enabled, host: s.host ?? '', port: String(s.port ?? 587),
        secure: !!s.secure, user: s.user ?? '', pass: '',
        fromName: s.fromName ?? '', fromEmail: s.fromEmail ?? '', hasPassword: !!s.hasPassword,
      });
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  // Ask the server what the next number / ID would look like for these formats
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!form.admissionNumberFormat.trim()) return setAdmPreview(null);
      try { setAdmPreview(unwrap(await adminApi.previewAdmissionNumber(form.admissionNumberFormat.trim()))); }
      catch (err: any) { setAdmPreview({ error: err.message }); }
    }, 400);
    return () => clearTimeout(t);
  }, [form.admissionNumberFormat]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!form.employeeIdFormat.trim()) return setEmpPreview(null);
      try { setEmpPreview(unwrap(await adminApi.previewEmployeeId(form.employeeIdFormat.trim()))); }
      catch (err: any) { setEmpPreview({ error: err.message }); }
    }, 400);
    return () => clearTimeout(t);
  }, [form.employeeIdFormat]);

  const save = async () => {
    if (!form.name.trim()) return Alert.alert('Required', 'School name is required');
    if (form.email && !isEmail(form.email)) return Alert.alert('Invalid', 'Please enter a valid email address');
    if (form.phone && !isPhone(form.phone)) return Alert.alert('Invalid', 'Please enter a valid phone number');
    if (form.website && !isURL(form.website)) return Alert.alert('Invalid', 'Website must be a valid URL starting with http:// or https://');
    setSaving(true);
    try {
      await adminApi.updateSchoolSettings(form);
      Alert.alert('Saved', 'School settings updated');
      load();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  const pickLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access to pick a logo');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const name = asset.fileName || `logo-${Date.now()}.jpg`;
    const type = asset.mimeType || 'image/jpeg';

    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append('logo', { uri: asset.uri, name, type } as any);
      await adminApi.updateSchoolSettingsForm(fd);
      await reload();          // refresh user.school.logo so the app header updates
      await load();
      Alert.alert('Saved', 'School logo updated — it will now appear across the app and in emails.');
    } catch (err: any) { Alert.alert('Upload failed', err.message); }
    finally { setLogoUploading(false); }
  };

  const removeLogo = async () => {
    if (!(await confirmAsync('Remove Logo', 'The school logo will be deleted. The default icon is used until you upload a new one.', 'Remove'))) return;
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append('removeLogo', 'true');
      await adminApi.updateSchoolSettingsForm(fd);
      await reload();          // header/branding falls back to the default icon
      await load();
      Alert.alert('Removed', 'School logo removed.');
    } catch (err: any) { Alert.alert('Remove failed', err.message); }
    finally { setLogoUploading(false); }
  };

  const saveSmtp = async () => {
    if (smtp.enabled && (!smtp.host.trim() || !smtp.user.trim()))
      return Alert.alert('Required', 'Host and username are required to enable SMTP');
    if (smtp.enabled && !smtp.pass && !smtp.hasPassword)
      return Alert.alert('Required', 'Password is required to enable SMTP');
    const port = Number(smtp.port);
    if (smtp.port.trim() !== '' && (Number.isNaN(port) || port < 1 || port > 65535))
      return Alert.alert('Invalid', 'SMTP port must be a number between 1 and 65535');
    if (smtp.fromEmail && !isEmail(smtp.fromEmail))
      return Alert.alert('Invalid', 'From email must be a valid email address');
    setSmtpSaving(true);
    try {
      await adminApi.updateSmtpSettings({
        enabled: smtp.enabled, host: smtp.host, port: Number(smtp.port) || 587,
        secure: smtp.secure, user: smtp.user, pass: smtp.pass,   // blank = keep saved
        fromName: smtp.fromName, fromEmail: smtp.fromEmail,
      });
      if (smtp.pass) setSmtp(s => ({ ...s, pass: '', hasPassword: true }));
      Alert.alert('Saved', 'SMTP settings updated. All school emails will now use this mailbox.');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSmtpSaving(false); }
  };

  const testSmtp = async () => {
    setSmtpTesting(true);
    try {
      const d: any = unwrap(await adminApi.testSmtpSettings(me?.email));
      Alert.alert('Sent ✅', `Test email sent to ${d?.to ?? me?.email}`);
    } catch (err: any) { Alert.alert('Test failed', err.message); }
    finally { setSmtpTesting(false); }
  };

  const logoUri = schoolLogoUrl(school);

  return (
    <>
      <Stack.Screen options={{ title: 'School Settings' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : (
          <>
            <Card>
              <KV label="School Code" value={school?.code ?? '--'} />
            </Card>

            {/* ── Logo ── */}
            <SectionTitle>School Logo</SectionTitle>
            <Card>
              <View style={ls.logoRow}>
                {logoUri ? (
                  <Image source={{ uri: logoUri }} style={ls.logoImg} resizeMode="contain" />
                ) : (
                  <View style={ls.logoPlaceholder}>
                    <Ionicons name="business-outline" size={28} color={Colors.textLight} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={ls.logoHint}>
                    Your logo appears in the app, on the website and in every email sent to parents, students and staff.
                  </Text>
                  <View style={ls.logoActions}>
                    <TouchableOpacity style={ls.logoBtn} onPress={pickLogo} disabled={logoUploading}>
                      <Ionicons name="image-outline" size={15} color="#fff" />
                      <Text style={ls.logoBtnText}>{logoUploading ? 'Working…' : logoUri ? 'Change Logo' : 'Upload Logo'}</Text>
                    </TouchableOpacity>
                    {!!logoUri && (
                      <TouchableOpacity style={ls.logoRemoveBtn} onPress={removeLogo} disabled={logoUploading}>
                        <Ionicons name="trash-outline" size={15} color={Colors.danger} />
                        <Text style={ls.logoRemoveText}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            </Card>

            {/* ── Profile ── */}
            <SectionTitle>Profile</SectionTitle>
            <Input label="School Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
            <Input label="Email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} keyboardType="email-address" />
            <Input label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} keyboardType="phone-pad" />
            <Input label="Website" value={form.website} onChange={v => setForm(f => ({ ...f, website: v }))} placeholder="https://…" />

            {/* ── Admission number format ── */}
            <SectionTitle>Admission Number Format</SectionTitle>
            <Card>
              <Text style={ls.fmtHint}>
                Used when a student is added without an admission number. Numbers continue from the
                highest one already issued for the current year.
                {'\n\n'}
                {'{INITIALS}'} first letter of each word in the school name · {'{CODE}'} school code
                · {'{YYYY}'} academic year start (4-digit) · {'{YY}'} 2-digit year
                · {'{MM}'} month of admission · {'{DD}'} date of admission
                · {'{CLASS}'} class name without spaces (Class 5 → CLASS5)
                · {'{CLASSNO}'} class number (Class 5 → 5)
                · {'{####}'} running number, one digit per #
                {'\n\n'}
                "/", "-", spaces and any other characters you type are kept as-is. The running number
                continues per pattern, so {'{CLASS}'} numbers each class separately and {'{DD}'}
                {' '}restarts the count each day.
              </Text>
              <Input label="Format" value={form.admissionNumberFormat}
                onChange={v => setForm(f => ({ ...f, admissionNumberFormat: v }))} placeholder="{INITIALS}{YYYY}{####}" />
              {admPreview?.error
                ? <Text style={ls.fmtError}>{admPreview.error}</Text>
                : admPreview ? (
                  <Text style={ls.fmtPreview}>
                    Preview: {(admPreview.samples ?? []).join(', ')}
                    {admPreview.next ? `  ·  next: ${admPreview.next}` : ''}
                    {admPreview.sampleClass ? `  (using ${admPreview.sampleClass})` : ''}
                  </Text>
                ) : null}
            </Card>

            {/* ── Employee / teacher ID format ── */}
            <SectionTitle>Employee / Teacher ID Format</SectionTitle>
            <Card>
              <Text style={ls.fmtHint}>
                Used when a teacher is added without an ID. Kept separate from the admission-number
                format, and numbering continues from the highest ID already issued.
                {'\n\n'}
                {'{INITIALS}'} first letter of each word in the school name · {'{CODE}'} school code
                · {'{YYYY}'} academic year start (4-digit) · {'{YY}'} 2-digit year
                · {'{MM}'} month of joining · {'{DD}'} date of joining
                · {'{####}'} running number, one digit per #
                {'\n\n'}
                "/", "-", spaces and any other characters you type are kept as-is. The running number
                continues per pattern, so {'{YYYY}'} restarts the count each academic year and
                {' '}{'{DD}'} restarts it each day.
                {'\n\n'}
                {'{CLASS}'} and {'{CLASSNO}'} are not available here — they apply to admission numbers
                only, since a teacher isn't tied to a class.
              </Text>
              <Input label="Format" value={form.employeeIdFormat}
                onChange={v => setForm(f => ({ ...f, employeeIdFormat: v }))} placeholder="{INITIALS}{####}" />
              {empPreview?.error
                ? <Text style={ls.fmtError}>{empPreview.error}</Text>
                : empPreview ? (
                  <Text style={ls.fmtPreview}>
                    Preview: {(empPreview.samples ?? []).join(', ')}
                    {empPreview.next ? `  ·  next: ${empPreview.next}` : ''}
                  </Text>
                ) : null}
            </Card>

            {/* One button covers the profile fields and both ID formats above —
                they all live in the same school-settings payload. */}
            <ActionBtn label={saving ? 'Saving…' : 'Save Settings'} tone="success" onPress={save} />

            {/* ── SMTP ── */}
            <SectionTitle>Email (SMTP) Settings</SectionTitle>
            <Card>
              <View style={ls.switchRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={ls.switchLabel}>Use our school's SMTP server</Text>
                  <Text style={ls.switchHint}>School emails are sent from your own mailbox when enabled</Text>
                </View>
                <Switch
                  value={smtp.enabled}
                  onValueChange={v => setSmtp(s => ({ ...s, enabled: v }))}
                  trackColor={{ true: Colors.primary }}
                />
              </View>
            </Card>
            <Input label="SMTP Host" value={smtp.host} onChange={v => setSmtp(s => ({ ...s, host: v }))} placeholder="smtp.gmail.com" />
            <Input label="Port" value={smtp.port} onChange={v => setSmtp(s => ({ ...s, port: v }))} keyboardType="numeric" placeholder="587" />
            <Card>
              <View style={ls.switchRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={ls.switchLabel}>Use SSL/TLS</Text>
                  <Text style={ls.switchHint}>On for port 465, off for STARTTLS (587)</Text>
                </View>
                <Switch
                  value={smtp.secure}
                  onValueChange={v => setSmtp(s => ({ ...s, secure: v }))}
                  trackColor={{ true: Colors.primary }}
                />
              </View>
            </Card>
            <Input label="Username" value={smtp.user} onChange={v => setSmtp(s => ({ ...s, user: v }))} keyboardType="email-address" placeholder="mail@yourschool.edu" />
            <Input
              label={smtp.hasPassword && !smtp.pass ? 'Password (saved — leave blank to keep)' : 'Password'}
              value={smtp.pass}
              onChange={v => setSmtp(s => ({ ...s, pass: v }))}
              placeholder={smtp.hasPassword ? '••••••••' : 'App password'}
              secure
            />
            <Input label="From Name" value={smtp.fromName} onChange={v => setSmtp(s => ({ ...s, fromName: v }))} placeholder={form.name || 'School name'} />
            <Input label="From Email" value={smtp.fromEmail} onChange={v => setSmtp(s => ({ ...s, fromEmail: v }))} keyboardType="email-address" placeholder="Defaults to username" />
            <ActionBtn label={smtpSaving ? 'Saving…' : 'Save SMTP Settings'} tone="success" onPress={saveSmtp} />
            <View style={{ height: 8 }} />
            <ActionBtn label={smtpTesting ? 'Sending…' : `Send Test Email to ${me?.email ?? 'me'}`} onPress={testSmtp} />
            <View style={{ height: 8 }} />
          </>
        )}
      </ScrollView>
    </>
  );
}

const ls = StyleSheet.create({
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logoImg: {
    width: 64, height: 64, borderRadius: Radius.md,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.border,
  },
  logoPlaceholder: {
    width: 64, height: 64, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceAlt,
  },
  logoHint: { fontSize: 11, color: Colors.textSecondary, lineHeight: 15, marginBottom: 8 },
  logoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  logoBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  fmtHint: { fontSize: 11, color: Colors.textSecondary, lineHeight: 17, marginBottom: 10 },
  fmtPreview: { fontSize: 12, color: Colors.text, fontWeight: '600', marginTop: 2 },
  fmtError: { fontSize: 12, color: Colors.danger, marginTop: 2 },
  logoActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  logoRemoveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: Colors.danger, borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  logoRemoveText: { fontSize: 12, fontWeight: '600', color: Colors.danger },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  switchLabel: { fontSize: 13, fontWeight: '600', color: Colors.text },
  switchHint: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
});
