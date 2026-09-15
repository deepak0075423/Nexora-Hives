import React, { useEffect, useState } from 'react';
import { ScrollView, Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as superApi from '@/api/superadmin.api';
import { unwrap, LoaderView, Input, Select, ActionBtn, SectionTitle } from '@/components/ui/kit';

const SCHOOL_BOARDS = ['CBSE', 'ICSE', 'State Board', 'IB', 'Cambridge (IGCSE)', 'NIOS', 'Other'];

// "State Board" and "Other" do not say which board — the school names it.
// Same rule as the server (superAdmin.controller NAMED_BOARDS).
const NAMED_BOARDS: Record<string, { label: string; placeholder: string }> = {
  'State Board': { label: 'State Board Name', placeholder: 'e.g. Maharashtra State Board (MSBSHSE)' },
  'Other':       { label: 'Board Name',       placeholder: 'e.g. Bihar Sanskrit Shiksha Board' },
};

const EMPTY = {
  name: '', code: '', board: '', boardName: '', email: '', phone: '', address: '', city: '', state: '',
  country: 'India', pincode: '', website: '',
};

export default function SuperSchoolFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const editing = !!id;
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(EMPTY);

  useEffect(() => {
    if (!id) return;
    superApi.getSchool(id)
      .then((res: any) => {
        const d = unwrap(res) ?? {};
        setForm({
          name: d.name ?? '', code: d.code ?? '', board: d.board ?? '', boardName: d.boardName ?? '', email: d.email ?? '', phone: d.phone ?? '',
          address: d.address ?? '', city: d.city ?? '', state: d.state ?? '',
          country: d.country ?? 'India', pincode: d.pincode ?? '', website: d.website ?? '',
        });
      })
      .catch((err: any) => Alert.alert('Error', err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const set = (key: string) => (v: string) => setForm(f => ({ ...f, [key]: v }));

  const save = async () => {
    for (const [key, label] of Object.entries({ name: 'Name', code: 'Code', board: 'Board', email: 'Email', phone: 'Phone', address: 'Address', city: 'City', state: 'State', country: 'Country' })) {
      if (!form[key]?.trim()) return Alert.alert('Required', `${label} is required`);
    }
    const named = NAMED_BOARDS[form.board];
    if (named) {
      const bn = (form.boardName ?? '').trim();
      if (!bn) return Alert.alert('Required', `${named.label} is required`);
      if (bn.length < 2 || bn.length > 100) return Alert.alert('Invalid', `${named.label} must be 2-100 characters`);
    }
    if (form.name.trim().length < 3) return Alert.alert('Invalid', 'School name must be at least 3 characters');
    if (!/^[A-Za-z0-9_-]{2,20}$/.test(form.code.trim())) return Alert.alert('Invalid', 'Code must be 2-20 letters, numbers, hyphens or underscores');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return Alert.alert('Invalid', 'Please enter a valid email address');
    if (!/^\+?[\d\s\-()]{7,15}$/.test(form.phone)) return Alert.alert('Invalid', 'Please enter a valid phone number');
    if (form.pincode && !/^\d{4,10}$/.test(form.pincode.trim())) return Alert.alert('Invalid', 'Pincode must be 4-10 digits');
    if (form.website && !/^https?:\/\/.+\..+/.test(form.website)) return Alert.alert('Invalid', 'Website must be a valid URL starting with http:// or https://');
    setSaving(true);
    try {
      // A name left behind by switching away from State Board / Other is not sent.
      const body = { ...form, boardName: named ? form.boardName.trim() : '' };
      if (editing) await superApi.updateSchool(id!, body);
      else await superApi.createSchool(body);
      Alert.alert('Saved', editing ? 'School updated' : 'School created');
      router.back();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Stack.Screen options={{ title: editing ? 'Edit School' : 'New School' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? <LoaderView /> : (
          <>
            <SectionTitle>School</SectionTitle>
            <Input label="School Name *" value={form.name} onChange={set('name')} placeholder="e.g. Sunrise Public School" />
            <Input label="School Code *" value={form.code} onChange={set('code')} placeholder="e.g. SPS01" editable={!editing} />
            <Select label="School Board *" value={form.board} onChange={set('board')} placeholder="Select board…"
              options={SCHOOL_BOARDS.map(b => ({ label: b, value: b }))} />
            {NAMED_BOARDS[form.board] && (
              <Input label={`${NAMED_BOARDS[form.board].label} *`} value={form.boardName} onChange={set('boardName')}
                placeholder={NAMED_BOARDS[form.board].placeholder} />
            )}
            <Input label="Email *" value={form.email} onChange={set('email')} keyboardType="email-address" />
            <Input label="Phone *" value={form.phone} onChange={set('phone')} keyboardType="phone-pad" />
            <Input label="Website" value={form.website} onChange={set('website')} placeholder="https://…" />

            <SectionTitle>Address</SectionTitle>
            <Input label="Address *" value={form.address} onChange={set('address')} multiline />
            <Input label="City *" value={form.city} onChange={set('city')} />
            <Input label="State *" value={form.state} onChange={set('state')} />
            <Input label="Country *" value={form.country} onChange={set('country')} />
            <Input label="Pincode" value={form.pincode} onChange={set('pincode')} keyboardType="numeric" />

            <ActionBtn label={saving ? 'Saving…' : editing ? 'Update School' : 'Create School'} tone="success" onPress={save} />
          </>
        )}
      </ScrollView>
    </>
  );
}
