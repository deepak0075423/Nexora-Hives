import React, { useMemo, useState } from 'react';
import { View, Text, Alert, TouchableOpacity, StyleSheet, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import { isEmail, isPhone } from '@/utils/validators';
import { STATES_AND_UTS, isPincode } from '@/utils/indiaStates';
import { FormModal, Input, Select, SectionTitle, ActionBtn } from '@/components/ui/kit';

// Mirrors school-frontend/src/pages/admin/TeacherForm.jsx and
// validateTeacherIntake() in the backend controller.
const AADHAAR_RE = /^\d{12}$/;
const PAN_RE     = /^[A-Z]{5}\d{4}[A-Z]$/i;
const IFSC_RE    = /^[A-Z]{4}0[A-Z0-9]{6}$/i;

const BLOOD_GROUPS     = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'];
const QUALIFICATIONS   = ['B.A.', 'B.Sc.', 'B.Com.', 'M.A.', 'M.Sc.', 'M.Com.', 'B.Tech.', 'M.Tech.', 'Ph.D.', 'Other'];
const TEACHING_DEGREES = ['B.Ed.', 'D.El.Ed.', 'M.Ed.', 'NTT', 'Other'];

const STEPS = ['Personal', 'Contact', 'Govt ID', 'Education', 'Experience', 'Bank', 'School'];

export const EMPTY_TEACHER = {
  name: '', dob: '', gender: '', bloodGroup: '',
  fatherOrHusbandName: '', emergencyContactName: '', emergencyContactPhone: '',
  phone: '', alternatePhone: '', email: '',
  currentAddress: '', currentCity: '', currentState: '', currentPincode: '', currentCountry: 'India',
  permanentAddress: '', permanentCity: '', permanentState: '', permanentPincode: '', permanentCountry: 'India',
  sameAsCurrent: false,
  aadhaarNumber: '', panNumber: '', uanNumber: '',
  qualification: '', qualificationOther: '', teachingDegree: '', teachingDegreeOther: '',
  employmentType: '', totalExperience: '', previousSchool: '', lastDesignation: '',
  bankAccountHolder: '', bankAccountNumber: '', bankIfsc: '', bankBranch: '',
  joiningDate: '', employeeId: '', designation: '',
};

type Picked = { uri: string; name: string; type: string } | null;

/** Photo capture / library pick for an ID scan or letter. */
function DocField({ label, required, value, onChange, hint }: {
  label: string; required?: boolean; value: Picked; onChange: (f: Picked) => void; hint?: string;
}) {
  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access to attach documents');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets?.length) return;
    const a = result.assets[0];
    onChange({
      uri: a.uri,
      name: a.fileName || `${label.replace(/\W+/g, '-').toLowerCase()}-${Date.now()}.jpg`,
      type: a.mimeType || 'image/jpeg',
    });
  };

  return (
    <View style={s.docField}>
      <Text style={s.docLabel}>{label}{required ? ' *' : ''}</Text>
      {value ? (
        <View style={s.docPreviewRow}>
          <Image source={{ uri: value.uri }} style={s.docThumb} />
          <Text style={s.docName} numberOfLines={1}>{value.name}</Text>
          <TouchableOpacity onPress={() => onChange(null)}>
            <Ionicons name="close-circle" size={20} color={Colors.danger} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={s.docBtn} onPress={pick}>
          <Ionicons name="cloud-upload-outline" size={15} color={Colors.accent} />
          <Text style={s.docBtnText}>Choose image</Text>
        </TouchableOpacity>
      )}
      {hint ? <Text style={s.docHint}>{hint}</Text> : null}
    </View>
  );
}

/**
 * Seven-step teacher intake, matching the web wizard. Documents are picked from
 * the photo library (an Aadhaar/PAN scan on a phone is a photo); the payload is
 * posted as multipart and re-validated server-side.
 */
export default function TeacherFormModal({ visible, onClose, onCreated, designations = [] }: {
  visible: boolean; onClose: () => void; onCreated: () => void; designations?: string[];
}) {
  const [step, setStep]   = useState(1);
  const [form, setForm]   = useState<any>(EMPTY_TEACHER);
  const [files, setFiles] = useState<Record<string, Picked>>({});
  const [saving, setSaving] = useState(false);
  const [pinBusy, setPinBusy] = useState('');

  const set  = (key: string) => (v: string) => setForm((f: any) => ({ ...f, [key]: v }));
  const file = (key: string) => (f: Picked) => setFiles(prev => ({ ...prev, [key]: f }));

  const reset = () => { setStep(1); setForm(EMPTY_TEACHER); setFiles({}); };
  const close = () => { reset(); onClose(); };

  const stateOptions = useMemo(() => STATES_AND_UTS.map(st => ({ label: st, value: st })), []);

  // PIN code fills city/state, same as the student and web teacher forms
  const onPincode = (prefix: 'current' | 'permanent') => async (val: string) => {
    const pin = val.replace(/\D/g, '').slice(0, 6);
    setForm((f: any) => ({ ...f, [`${prefix}Pincode`]: pin }));
    if (!isPincode(pin)) return;
    setPinBusy(prefix);
    try {
      const res: any = await adminApi.pincodeLookup(pin);
      const d = (res as any)?.data ?? res ?? {};
      setForm((f: any) => ({
        ...f,
        [`${prefix}Country`]: d.country || 'India',
        [`${prefix}State`]:   d.state   || f[`${prefix}State`],
        [`${prefix}City`]:    d.city    || f[`${prefix}City`],
      }));
    } catch { /* offline — typed by hand */ }
    finally { setPinBusy(''); }
  };

  /** First problem on this step, or null. */
  const stepError = (n: number): string | null => {
    const need = (key: string, label: string) => (!String(form[key] ?? '').trim() ? `${label} is required` : null);
    const address = (prefix: string, label: string) =>
      need(`${prefix}Address`, `${label} address`)
      || (!isPincode(form[`${prefix}Pincode`]) ? `${label} PIN code must be 6 digits` : null)
      || need(`${prefix}City`, `${label} city`)
      || need(`${prefix}State`, `${label} state`);

    if (n === 1) {
      return need('name', 'Full name') || need('dob', 'Date of birth') || need('gender', 'Gender')
        || need('bloodGroup', 'Blood group') || need('fatherOrHusbandName', "Father's / husband's name")
        || need('emergencyContactName', 'Emergency contact name')
        || need('emergencyContactPhone', 'Emergency contact phone')
        || (!isPhone(form.emergencyContactPhone) ? 'Emergency contact phone is not valid' : null)
        || (!/^\d{4}-\d{2}-\d{2}$/.test(form.dob) ? 'Date of birth must be YYYY-MM-DD' : null);
    }
    if (n === 2) {
      return need('phone', 'Mobile number')
        || (!isPhone(form.phone) ? 'Mobile number is not valid' : null)
        || (form.alternatePhone && !isPhone(form.alternatePhone) ? 'Secondary phone is not valid' : null)
        || need('email', 'Email address')
        || (!isEmail(form.email) ? 'Email address is not valid' : null)
        || address('current', 'Current')
        || (!form.sameAsCurrent ? address('permanent', 'Permanent') : null);
    }
    if (n === 3) {
      return need('aadhaarNumber', 'Aadhaar number')
        || (!AADHAAR_RE.test(String(form.aadhaarNumber).replace(/\s/g, '')) ? 'Aadhaar number must be 12 digits' : null)
        || need('panNumber', 'PAN number')
        || (!PAN_RE.test(String(form.panNumber).trim()) ? 'PAN looks invalid (e.g. ABCDE1234F)' : null)
        || (!files.aadhaarFront ? 'Aadhaar front image is required' : null)
        || (!files.aadhaarBack ? 'Aadhaar back image is required' : null)
        || (!files.panCard ? 'PAN card upload is required' : null);
    }
    if (n === 4) {
      return need('qualification', 'Highest qualification')
        || (form.qualification === 'Other' && !String(form.qualificationOther).trim() ? 'Please type the other qualification' : null)
        || (form.teachingDegree === 'Other' && !String(form.teachingDegreeOther).trim() ? 'Please type the other teaching degree' : null);
    }
    if (n === 5) {
      if (!form.employmentType) return 'Select fresher or experienced';
      if (form.employmentType === 'experienced') {
        return need('totalExperience', 'Total years of experience')
          || need('previousSchool', 'Name of previous school')
          || need('lastDesignation', 'Last job designation')
          || (!files.resignationLetter ? 'Resignation letter is required' : null);
      }
      return null;
    }
    if (n === 6) {
      return need('bankAccountHolder', 'Account holder name')
        || need('bankAccountNumber', 'Account number')
        || (!/^\d{6,20}$/.test(String(form.bankAccountNumber).replace(/\s/g, '')) ? 'Account number must be 6–20 digits' : null)
        || need('bankIfsc', 'IFSC code')
        || (!IFSC_RE.test(String(form.bankIfsc).trim()) ? 'IFSC looks invalid (e.g. HDFC0001234)' : null)
        || need('bankBranch', 'Branch name');
    }
    if (n === 7) {
      return need('joiningDate', 'Date of joining')
        || (!/^\d{4}-\d{2}-\d{2}$/.test(form.joiningDate) ? 'Date of joining must be YYYY-MM-DD' : null);
    }
    return null;
  };

  const next = async () => {
    const problem = stepError(step);
    if (problem) return Alert.alert('Required', problem);
    // Catch a duplicate email before the remaining five steps are filled in
    if (step === 2) {
      try {
        const res: any = await adminApi.checkEmail(form.email.trim());
        if (res?.exists) return Alert.alert('Already registered', 'This email is already registered');
      } catch { /* the server re-checks on submit */ }
    }
    setStep(s => s + 1);
  };

  const submit = async () => {
    const problem = stepError(7);
    if (problem) return Alert.alert('Required', problem);
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v === true ? 'true' : String(v ?? '')));
      Object.entries(files).forEach(([k, f]) => { if (f) fd.append(k, { uri: f.uri, name: f.name, type: f.type } as any); });

      const res: any = await adminApi.createTeacherForm(fd);
      const employeeId = ((res as any)?.data ?? res)?.employeeId;
      reset();
      onCreated();
      onClose();
      Alert.alert('Success', `Teacher created${employeeId ? ` — Employee ID ${employeeId}` : ''}. Login OTP has been emailed.`);
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  const isLast = step === STEPS.length;

  return (
    <FormModal
      visible={visible}
      title={`Add Teacher — ${step}/${STEPS.length} ${STEPS[step - 1]}`}
      onClose={close}
      onSubmit={isLast ? submit : next}
      submitting={saving}
      submitLabel={isLast ? 'Create Teacher' : 'Next →'}
    >
      {/* progress dots */}
      <View style={s.dots}>
        {STEPS.map((label, i) => (
          <View key={label} style={[
            s.dot,
            i + 1 === step && { backgroundColor: Colors.primary, width: 18 },
            i + 1 < step && { backgroundColor: Colors.success },
          ]} />
        ))}
      </View>

      {step === 1 && (
        <>
          <Input label="Full Name *" value={form.name} onChange={set('name')} placeholder="Anita Sharma" />
          <Input label="Date of Birth *" value={form.dob} onChange={set('dob')} placeholder="YYYY-MM-DD" />
          <Select label="Gender *" value={form.gender} onChange={set('gender')}
            options={['Male', 'Female', 'Other'].map(g => ({ label: g, value: g }))} />
          <Select label="Blood Group *" value={form.bloodGroup} onChange={set('bloodGroup')}
            options={BLOOD_GROUPS.map(g => ({ label: g, value: g }))} />
          <Input label="Father's / Husband's Name *" value={form.fatherOrHusbandName} onChange={set('fatherOrHusbandName')} />
          <Input label="Emergency Contact Name *" value={form.emergencyContactName} onChange={set('emergencyContactName')} />
          <Input label="Emergency Contact Phone *" value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')} keyboardType="phone-pad" />
        </>
      )}

      {step === 2 && (
        <>
          <Input label="Mobile Number *" value={form.phone} onChange={set('phone')} keyboardType="phone-pad" />
          <Input label="Secondary Phone" value={form.alternatePhone} onChange={set('alternatePhone')} placeholder="Optional" keyboardType="phone-pad" />
          <Input label="Email *" value={form.email} onChange={set('email')} keyboardType="email-address" />

          <SectionTitle>Current Residential Address</SectionTitle>
          <Input label="Address *" value={form.currentAddress} onChange={set('currentAddress')} multiline />
          <Input label={pinBusy === 'current' ? 'PIN Code * (looking up…)' : 'PIN Code *'}
            value={form.currentPincode} onChange={onPincode('current')} keyboardType="numeric" />
          <Input label="City / District *" value={form.currentCity} onChange={set('currentCity')} />
          <Select label="State / UT *" value={form.currentState} onChange={set('currentState')} options={stateOptions} />

          <View style={s.sameRow}>
            <TouchableOpacity
              style={[s.checkbox, form.sameAsCurrent && s.checkboxOn]}
              onPress={() => setForm((f: any) => ({
                ...f,
                sameAsCurrent: !f.sameAsCurrent,
                ...(!f.sameAsCurrent ? {
                  permanentAddress: f.currentAddress, permanentCity: f.currentCity,
                  permanentState: f.currentState, permanentPincode: f.currentPincode,
                  permanentCountry: f.currentCountry,
                } : {}),
              }))}>
              {form.sameAsCurrent && <Ionicons name="checkmark" size={13} color="#fff" />}
            </TouchableOpacity>
            <Text style={s.sameLabel}>Permanent address is the same as current</Text>
          </View>

          {!form.sameAsCurrent && (
            <>
              <SectionTitle>Permanent Home Address</SectionTitle>
              <Input label="Address *" value={form.permanentAddress} onChange={set('permanentAddress')} multiline />
              <Input label={pinBusy === 'permanent' ? 'PIN Code * (looking up…)' : 'PIN Code *'}
                value={form.permanentPincode} onChange={onPincode('permanent')} keyboardType="numeric" />
              <Input label="City / District *" value={form.permanentCity} onChange={set('permanentCity')} />
              <Select label="State / UT *" value={form.permanentState} onChange={set('permanentState')} options={stateOptions} />
            </>
          )}
        </>
      )}

      {step === 3 && (
        <>
          <Input label="Aadhaar Card Number *" value={form.aadhaarNumber} onChange={set('aadhaarNumber')} keyboardType="numeric" placeholder="12 digits" />
          <DocField label="Aadhaar — Front" required value={files.aadhaarFront} onChange={file('aadhaarFront')} />
          <DocField label="Aadhaar — Back" required value={files.aadhaarBack} onChange={file('aadhaarBack')} />
          <Input label="PAN Card Number *" value={form.panNumber} onChange={v => set('panNumber')(v.toUpperCase())} placeholder="ABCDE1234F" />
          <DocField label="PAN Card" required value={files.panCard} onChange={file('panCard')} />
          <Input label="UAN / PF Account Number" value={form.uanNumber} onChange={set('uanNumber')} placeholder="Optional" />
        </>
      )}

      {step === 4 && (
        <>
          <Select label="Highest Qualification *" value={form.qualification} onChange={set('qualification')}
            options={QUALIFICATIONS.map(q => ({ label: q, value: q }))} />
          {form.qualification === 'Other' && (
            <Input label="Other Qualification *" value={form.qualificationOther} onChange={set('qualificationOther')} />
          )}
          <Select label="Professional Teaching Degree" value={form.teachingDegree} onChange={set('teachingDegree')}
            options={TEACHING_DEGREES.map(d => ({ label: d, value: d }))} placeholder="None / not applicable" />
          {form.teachingDegree === 'Other' && (
            <Input label="Other Teaching Degree *" value={form.teachingDegreeOther} onChange={set('teachingDegreeOther')} />
          )}
        </>
      )}

      {step === 5 && (
        <>
          <Select label="Fresher or Experienced *" value={form.employmentType} onChange={set('employmentType')}
            options={[{ label: 'Fresher', value: 'fresher' }, { label: 'Experienced', value: 'experienced' }]} />
          {form.employmentType === 'experienced' && (
            <>
              <Input label="Total Years of Experience *" value={form.totalExperience} onChange={set('totalExperience')} placeholder="e.g. 5 years" />
              <Input label="Name of Previous School *" value={form.previousSchool} onChange={set('previousSchool')} />
              <Input label="Last Job Designation *" value={form.lastDesignation} onChange={set('lastDesignation')} />
              <DocField label="Resignation Letter" required value={files.resignationLetter} onChange={file('resignationLetter')} />
              <DocField label="Experience Certificate" hint="Optional" value={files.experienceCertificate} onChange={file('experienceCertificate')} />
              <DocField label="Joining Letter" hint="Optional" value={files.joiningLetter} onChange={file('joiningLetter')} />
            </>
          )}
        </>
      )}

      {step === 6 && (
        <>
          <Input label="Bank Account Holder Name *" value={form.bankAccountHolder} onChange={set('bankAccountHolder')} />
          <Input label="Bank Account Number *" value={form.bankAccountNumber} onChange={set('bankAccountNumber')} keyboardType="numeric" />
          <Input label="IFSC Code *" value={form.bankIfsc} onChange={v => set('bankIfsc')(v.toUpperCase())} placeholder="HDFC0001234" />
          <Input label="Bank Branch Name *" value={form.bankBranch} onChange={set('bankBranch')} />
        </>
      )}

      {step === 7 && (
        <>
          <Input label="Date of Joining *" value={form.joiningDate} onChange={set('joiningDate')} placeholder="YYYY-MM-DD" />
          <Select label="Designation" value={form.designation} onChange={set('designation')}
            options={designations.map(d => ({ label: d, value: d }))} placeholder="Select designation" />
          <Input label="Employee ID / Teacher ID" value={form.employeeId} onChange={set('employeeId')}
            placeholder="Auto-generated if left blank" />
          <Text style={s.note}>
            Follows the Employee ID format set in School Settings. A one-time password is emailed to the teacher.
          </Text>
        </>
      )}

      {step > 1 && (
        <View style={{ marginTop: Spacing.md }}>
          <ActionBtn label="← Back" tone="neutral" onPress={() => setStep(s => s - 1)} />
        </View>
      )}
    </FormModal>
  );
}

const s = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: Spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  docField: { marginBottom: 14 },
  docLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  docBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 9,
  },
  docBtnText: { fontSize: 12, fontWeight: '600', color: Colors.accent },
  docPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  docThumb: { width: 40, height: 40, borderRadius: 6, backgroundColor: Colors.border },
  docName: { flex: 1, fontSize: 12, color: Colors.text },
  docHint: { fontSize: 11, color: Colors.textLight, marginTop: 4 },
  sameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  checkbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  sameLabel: { fontSize: 13, color: Colors.text, flex: 1 },
  note: { fontSize: 11, color: Colors.textSecondary, marginTop: 4, lineHeight: 16 },
});
