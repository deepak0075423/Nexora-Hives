import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Alert, TouchableOpacity, StyleSheet, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import { isEmail, isPhone } from '@/utils/validators';
import { STATES_AND_UTS, isPincode } from '@/utils/indiaStates';
import {
  FormModal, Input, Select, SectionTitle, ActionBtn, Toggle, SegTabs, RowItem, unwrap,
} from '@/components/ui/kit';

// Mirrors school-frontend/src/pages/admin/StudentForm.jsx and
// validateStudentProfile() / resolveNewParent() in the backend controller.
const AADHAAR_RE = /^\d{12}$/;
const PAN_RE     = /^[A-Z]{5}\d{4}[A-Z]$/i;

const BLOOD_GROUPS = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'];
const CATEGORIES   = ['General', 'OBC', 'SC', 'ST', 'EWS'];
const BOARDS       = ['CBSE', 'ICSE', 'State Board', 'IB', 'Cambridge (IGCSE)', 'NIOS', 'Other'];
const MEDIUMS      = ['English', 'Hindi', 'Marathi', 'Gujarati', 'Bengali', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Urdu', 'Other'];

const STEPS = ['Basic', 'Personal', 'Address', 'Documents', 'Previous School', 'Enrolment', 'Parents'];

const EMPTY_PARENT_BLOCK = {
  name: '', email: '', phone: '', occupation: '', organization: '', designation: '',
  qualification: '', annualIncome: '', aadhaarNumber: '', panNumber: '',
};

const EMPTY_NEW_PARENT: any = {
  accountFor: 'Father',
  father:   { ...EMPTY_PARENT_BLOCK },
  mother:   { ...EMPTY_PARENT_BLOCK },
  guardian: { ...EMPTY_PARENT_BLOCK, relation: '' },
};

export const EMPTY_STUDENT: any = {
  name: '', email: '', phone: '', password: '',
  dob: '', gender: '', bloodGroup: '', category: '', religion: '', nationality: 'Indian',
  emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '',
  address: '', city: '', state: '', pincode: '', country: 'India',
  permanentAddress: '', permanentCity: '', permanentState: '', permanentPincode: '', permanentCountry: 'India',
  sameAsCurrent: true,
  aadhaarNumber: '',
  isTransferStudent: false,
  previousSchoolName: '', previousSchoolContact: '',
  previousSchoolAddress: '', previousSchoolCity: '', previousSchoolState: '',
  previousSchoolPincode: '', previousSchoolCountry: 'India',
  previousSchoolMedium: '', previousSchoolMediumOther: '',
  previousSchoolBoard: '', previousSchoolBoardOther: '', previousSchoolStateBoardName: '',
  previousClass: '', previousAcademicYear: '', previousSchoolLeavingDate: '',
  tcNumber: '', tcDate: '',
  classId: '', currentSection: '', rollNumber: '', admissionNumber: '',
};

type Picked = { uri: string; name: string; type: string } | null;

/** Photo capture / library pick for a certificate or ID scan. */
function DocField({ label, required, value, existing, onChange, hint }: {
  label: string; required?: boolean; value: Picked; existing?: string;
  onChange: (f: Picked) => void; hint?: string;
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
          <Text style={s.docBtnText}>{existing ? 'Replace image' : 'Choose image'}</Text>
        </TouchableOpacity>
      )}
      {!value && existing ? <Text style={s.docOnFile}>✓ A file is already on record</Text> : null}
      {hint ? <Text style={s.docHint}>{hint}</Text> : null}
    </View>
  );
}

/** Select whose "Other" choice reveals a free-text field. */
function SelectOrOther({ label, options, value, otherValue, onChange, onOtherChange }: {
  label: string; options: string[]; value: string; otherValue: string;
  onChange: (v: string) => void; onOtherChange: (v: string) => void;
}) {
  return (
    <>
      <Select label={`${label} *`} value={value} onChange={onChange}
        options={options.map(o => ({ label: o, value: o }))} />
      {value === 'Other' && (
        <Input label={`${label} — please specify *`} value={otherValue} onChange={onOtherChange} />
      )}
    </>
  );
}

/**
 * Seven-step student intake, matching the web wizard. Documents are picked from
 * the photo library (a certificate on a phone is a photo); the payload posts as
 * multipart and is re-validated server-side.
 */
export default function StudentFormModal({ visible, student, onClose, onSaved }: {
  visible: boolean; student?: any; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!student;

  const [step, setStep]     = useState(1);
  const [form, setForm]     = useState<any>(EMPTY_STUDENT);
  const [files, setFiles]   = useState<Record<string, Picked>>({});
  const [saving, setSaving] = useState(false);
  const [pinBusy, setPinBusy] = useState('');
  const [classes, setClasses] = useState<any[]>([]);
  const [docs, setDocs]       = useState<any>(null);        // files already on record
  const [existingParent, setEP] = useState<any>(null);

  // Parent step
  const [parentMode, setParentMode] = useState<'search' | 'create'>('search');
  const [parentQ, setParentQ]       = useState('');
  const [parentResults, setPR]      = useState<any[]>([]);
  const [parentId, setParentId]     = useState('');
  const [parentName, setParentName] = useState('');
  const [newParent, setNewParent]   = useState<any>(EMPTY_NEW_PARENT);

  const set     = (key: string) => (v: string) => setForm((f: any) => ({ ...f, [key]: v }));
  const setFile = (key: string) => (f: Picked) => setFiles(prev => ({ ...prev, [key]: f }));
  const setBlock = (role: string, key: string, v: string) =>
    setNewParent((p: any) => ({ ...p, [role]: { ...p[role], [key]: v } }));

  const reset = () => {
    setStep(1); setForm(EMPTY_STUDENT); setFiles({}); setDocs(null); setEP(null);
    setParentMode('search'); setParentQ(''); setPR([]); setParentId(''); setParentName('');
    setNewParent(EMPTY_NEW_PARENT);
  };
  const close = () => { reset(); onClose(); };

  useEffect(() => {
    if (!visible) return;
    adminApi.getClassesWithSections()
      .then((res: any) => setClasses(unwrap(res) ?? []))
      .catch(() => {});
  }, [visible]);

  // Prefill on edit
  useEffect(() => {
    if (!visible) return;
    if (!student) { reset(); return; }
    setStep(1); setFiles({});
    setForm({ ...EMPTY_STUDENT, name: student.name ?? '', email: student.email ?? '', phone: student.phone ?? '' });
    adminApi.getStudent(student._id).then((res: any) => {
      const d  = unwrap(res) ?? {};
      const p  = d.profile ?? {};
      const pp = d.parentProfile ?? null;
      setDocs(p);
      setEP(pp);
      // A stored value that is not one of the presets came from "Other"
      const orOther = (value: string, options: string[]): [string, string] =>
        (value && !options.includes(value) ? ['Other', value] : [value || '', '']);
      const [medium, mediumOther] = orOther(p.previousSchoolMedium, MEDIUMS);
      const [board, boardOther]   = orOther(p.previousSchoolBoard, BOARDS);
      setForm((f: any) => ({
        ...f,
        dob: p.dob ? String(p.dob).slice(0, 10) : '',
        gender: p.gender ?? '', bloodGroup: p.bloodGroup ?? '', category: p.category ?? '',
        religion: p.religion ?? '', nationality: p.nationality || 'Indian',
        emergencyContactName: p.emergencyContactName ?? '',
        emergencyContactPhone: p.emergencyContactPhone ?? '',
        emergencyContactRelation: p.emergencyContactRelation ?? '',
        address: p.address ?? '', city: p.city ?? '', state: p.state ?? '',
        pincode: p.pincode ?? '', country: p.country || 'India',
        permanentAddress: p.permanentAddress ?? '', permanentCity: p.permanentCity ?? '',
        permanentState: p.permanentState ?? '', permanentPincode: p.permanentPincode ?? '',
        permanentCountry: p.permanentCountry || 'India',
        sameAsCurrent: !!p.sameAsCurrent,
        aadhaarNumber: p.aadhaarNumber ?? '',
        isTransferStudent: !!p.isTransferStudent,
        previousSchoolName: p.previousSchoolName ?? '', previousSchoolContact: p.previousSchoolContact ?? '',
        previousSchoolAddress: p.previousSchoolAddress ?? '', previousSchoolCity: p.previousSchoolCity ?? '',
        previousSchoolState: p.previousSchoolState ?? '', previousSchoolPincode: p.previousSchoolPincode ?? '',
        previousSchoolCountry: p.previousSchoolCountry || 'India',
        previousSchoolMedium: medium, previousSchoolMediumOther: mediumOther,
        previousSchoolBoard: board, previousSchoolBoardOther: boardOther,
        previousSchoolStateBoardName: p.previousSchoolStateBoardName ?? '',
        previousClass: p.previousClass ?? '', previousAcademicYear: p.previousAcademicYear ?? '',
        previousSchoolLeavingDate: p.previousSchoolLeavingDate ? String(p.previousSchoolLeavingDate).slice(0, 10) : '',
        tcNumber: p.tcNumber ?? '', tcDate: p.tcDate ? String(p.tcDate).slice(0, 10) : '',
        classId: p.currentSection?.class?._id ?? p.currentClass ?? '',
        currentSection: p.currentSection?._id ?? '',
        rollNumber: p.rollNumber ?? '', admissionNumber: p.admissionNumber ?? '',
      }));
      setParentMode('search');
      setParentId(p.parent?._id ?? '');
      setParentName(p.parent ? `${p.parent.name} (${p.parent.email})` : '');
      const block = (role: string) => ({
        ...EMPTY_PARENT_BLOCK,
        ...(role === 'guardian' ? { relation: '' } : {}),
        ...Object.fromEntries(Object.entries(pp?.[role] ?? {})
          .filter(([k]) => k in EMPTY_PARENT_BLOCK || k === 'relation')),
      });
      setNewParent({
        accountFor: pp?.relationship || 'Father',
        father: block('father'), mother: block('mother'), guardian: block('guardian'),
      });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, student?._id]);

  const stateOptions = useMemo(() => STATES_AND_UTS.map(st => ({ label: st, value: st })), []);
  const classOptions = useMemo(
    () => (classes ?? []).map((c: any) => ({ label: c.className ?? c.name, value: c._id })),
    [classes],
  );
  const sectionOptions = useMemo(() => {
    const chosen = (classes ?? []).find((c: any) => c._id === form.classId);
    return (chosen?.sections ?? []).map((sec: any) => ({ label: sec.sectionName ?? sec.name, value: sec._id }));
  }, [classes, form.classId]);

  // PIN code fills in country/state/city, matching the web form
  const onPincode = (prefix: '' | 'permanent' | 'previousSchool') => async (val: string) => {
    const k = (base: string) => (prefix ? prefix + base[0].toUpperCase() + base.slice(1) : base);
    const pin = val.replace(/\D/g, '').slice(0, 6);
    setForm((f: any) => ({ ...f, [k('pincode')]: pin }));
    if (!isPincode(pin)) return;
    setPinBusy(prefix || 'current');
    try {
      const res: any = await adminApi.pincodeLookup(pin);
      const d = unwrap(res) ?? {};
      setForm((f: any) => ({
        ...f,
        [k('country')]: d.country || 'India',
        [k('state')]:   d.state   || f[k('state')],
        [k('city')]:    d.city    || f[k('city')],
      }));
    } catch { /* offline — the admin fills city/state by hand */ }
    finally { setPinBusy(''); }
  };

  /** First problem on this step, or null. */
  const stepError = (n: number): string | null => {
    const need = (key: string, label: string) => (!String(form[key] ?? '').trim() ? `${label} is required` : null);
    const address = (prefix: '' | 'permanent' | 'previousSchool', label: string) => {
      const k = (base: string) => (prefix ? prefix + base[0].toUpperCase() + base.slice(1) : base);
      return need(k('address'), `${label} address`)
        || (!isPincode(form[k('pincode')]) ? `${label} PIN code must be 6 digits` : null)
        || need(k('city'), `${label} city`)
        || need(k('state'), `${label} state`);
    };

    if (n === 1) {
      return need('name', 'Full name')
        || (!isEdit ? (need('email', 'Email') || (!isEmail(form.email) ? 'Email address is not valid' : null)) : null)
        || (form.phone && !isPhone(form.phone) ? 'Phone number is not valid' : null)
        || (isEdit && form.password && form.password.length < 6 ? 'Password must be at least 6 characters' : null);
    }
    if (n === 2) {
      return need('dob', 'Date of birth')
        || (!/^\d{4}-\d{2}-\d{2}$/.test(form.dob) ? 'Date of birth must be YYYY-MM-DD' : null)
        || need('gender', 'Gender') || need('bloodGroup', 'Blood group')
        || need('category', 'Category') || need('nationality', 'Nationality')
        || need('emergencyContactName', 'Emergency contact name')
        || need('emergencyContactPhone', 'Emergency contact phone')
        || (!isPhone(form.emergencyContactPhone) ? 'Emergency contact phone is not valid' : null)
        || need('emergencyContactRelation', 'Emergency contact relation');
    }
    if (n === 3) {
      return address('', 'Current')
        || (!form.sameAsCurrent ? address('permanent', 'Permanent') : null);
    }
    if (n === 4) {
      return (!files.photo && !docs?.photoFile ? "Student's passport size photo is required" : null)
        || need('aadhaarNumber', 'Aadhaar number')
        || (!AADHAAR_RE.test(String(form.aadhaarNumber).replace(/\s/g, '')) ? 'Aadhaar number must be 12 digits' : null)
        || (!files.aadhaarFront && !docs?.aadhaarFrontFile ? 'Aadhaar front image is required' : null)
        || (!files.aadhaarBack && !docs?.aadhaarBackFile ? 'Aadhaar back image is required' : null)
        || (!files.birthCertificate && !docs?.birthCertificateFile ? 'Birth certificate is required' : null);
    }
    if (n === 5 && form.isTransferStudent) {
      return need('previousSchoolName', 'Previous school name')
        || address('previousSchool', 'Previous school')
        || need('previousSchoolMedium', 'Previous school medium')
        || (form.previousSchoolMedium === 'Other' && !String(form.previousSchoolMediumOther).trim() ? 'Please type the medium' : null)
        || need('previousSchoolBoard', 'Previous school board')
        || (form.previousSchoolBoard === 'Other' && !String(form.previousSchoolBoardOther).trim() ? 'Please type the board' : null)
        || (form.previousSchoolBoard === 'State Board' && !String(form.previousSchoolStateBoardName).trim() ? 'Name of the state board is required' : null)
        || need('previousClass', 'Previous class')
        || need('previousAcademicYear', 'Previous academic year')
        || need('previousSchoolLeavingDate', 'School leaving date')
        || (!/^\d{4}-\d{2}-\d{2}$/.test(form.previousSchoolLeavingDate) ? 'Leaving date must be YYYY-MM-DD' : null)
        || need('previousSchoolContact', 'Previous school contact')
        || (!isPhone(form.previousSchoolContact) ? 'Previous school contact is not valid' : null)
        || need('tcNumber', 'TC number')
        || need('tcDate', 'TC date')
        || (!/^\d{4}-\d{2}-\d{2}$/.test(form.tcDate) ? 'TC date must be YYYY-MM-DD' : null)
        || (!files.tc && !docs?.tcFile ? 'Transfer Certificate upload is required' : null);
    }
    if (n === 6) return need('classId', 'Class');
    if (n === 7) {
      if (parentMode === 'search') return parentId ? null : 'Link a parent, or switch to entering their details';
      const roles = newParent.accountFor === 'Guardian' ? ['father', 'mother', 'guardian'] : ['father', 'mother'];
      for (const role of roles) {
        const label = role[0].toUpperCase() + role.slice(1);
        const b = newParent[role];
        if (!String(b.name).trim())       return `${label}'s name is required`;
        if (!String(b.phone).trim())      return `${label}'s phone is required`;
        if (!isPhone(b.phone))            return `${label}'s phone is not valid`;
        if (!String(b.occupation).trim()) return `${label}'s occupation is required`;
        if (!String(b.aadhaarNumber).trim()) return `${label}'s Aadhaar number is required`;
        if (!AADHAAR_RE.test(String(b.aadhaarNumber).replace(/\s/g, ''))) return `${label}'s Aadhaar must be 12 digits`;
        if (String(b.panNumber).trim() && !PAN_RE.test(String(b.panNumber).trim())) return `${label}'s PAN looks invalid`;
        if (role === 'guardian' && !String(b.relation).trim()) return "Guardian's relation to the student is required";
        const isOwner = newParent.accountFor === (role === 'guardian' ? 'Guardian' : label);
        if (isOwner && !isEmail(b.email)) return `${label}'s email is required for the login account`;
        if (!isOwner && b.email && !isEmail(b.email)) return `${label}'s email is not valid`;
      }
      return null;
    }
    return null;
  };

  const next = async () => {
    const problem = stepError(step);
    if (problem) return Alert.alert('Required', problem);
    // Catch a duplicate email before the remaining six steps are filled in
    if (step === 1 && !isEdit) {
      try {
        const res: any = await adminApi.checkEmail(form.email.trim());
        if (res?.exists) return Alert.alert('Already registered', 'This email is already registered');
      } catch { /* the server re-checks on submit */ }
    }
    setStep(s => s + 1);
  };

  const searchParent = async () => {
    if (!parentQ.trim()) return;
    try {
      const res: any = await adminApi.parentLookup(parentQ.trim());
      setPR(unwrap(res) ?? []);
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  const submit = async () => {
    // Every step is re-checked so a jumped-over problem cannot slip through
    for (let n = 1; n <= STEPS.length; n++) {
      const problem = stepError(n);
      if (problem) { setStep(n); return Alert.alert('Required', problem); }
    }

    const pick = (value: string, other: string) => (value === 'Other' ? String(other || '').trim() : String(value || '').trim());
    const profile = {
      dob: form.dob, gender: form.gender, bloodGroup: form.bloodGroup, category: form.category,
      religion: form.religion, nationality: form.nationality,
      emergencyContactName: form.emergencyContactName,
      emergencyContactPhone: form.emergencyContactPhone,
      emergencyContactRelation: form.emergencyContactRelation,
      address: form.address, city: form.city, state: form.state,
      pincode: form.pincode, country: form.country || 'India',
      permanentAddress: form.permanentAddress, permanentCity: form.permanentCity,
      permanentState: form.permanentState, permanentPincode: form.permanentPincode,
      permanentCountry: form.permanentCountry || 'India',
      sameAsCurrent: form.sameAsCurrent,
      aadhaarNumber: form.aadhaarNumber,
      isTransferStudent: form.isTransferStudent,
      previousSchoolName: form.previousSchoolName,
      previousSchoolAddress: form.previousSchoolAddress,
      previousSchoolCity: form.previousSchoolCity,
      previousSchoolState: form.previousSchoolState,
      previousSchoolPincode: form.previousSchoolPincode,
      previousSchoolCountry: form.previousSchoolCountry || 'India',
      previousSchoolContact: form.previousSchoolContact,
      previousSchoolMedium: pick(form.previousSchoolMedium, form.previousSchoolMediumOther),
      previousSchoolBoard:  pick(form.previousSchoolBoard, form.previousSchoolBoardOther),
      previousSchoolStateBoardName: form.previousSchoolStateBoardName,
      previousClass: form.previousClass,
      previousAcademicYear: form.previousAcademicYear,
      previousSchoolLeavingDate: form.previousSchoolLeavingDate,
      tcNumber: form.tcNumber, tcDate: form.tcDate,
      currentClass: form.classId,
      currentSection: form.currentSection || '',
      rollNumber: form.rollNumber, admissionNumber: form.admissionNumber,
    };

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('name', form.name.trim());
      fd.append('phone', String(form.phone ?? '').trim());
      if (!isEdit) fd.append('email', form.email.trim());
      if (isEdit && form.password) fd.append('password', form.password);
      fd.append('rollNumber', form.rollNumber);
      fd.append('admissionNumber', form.admissionNumber);
      fd.append('currentClass', form.classId);
      fd.append('currentSection', form.currentSection || '');
      fd.append('profile', JSON.stringify(profile));
      if (parentMode === 'search') fd.append('parentId', parentId || '');
      else fd.append('newParent', JSON.stringify(newParent));
      Object.entries(files).forEach(([k, f]) => {
        if (f) fd.append(k, { uri: f.uri, name: f.name, type: f.type } as any);
      });

      if (isEdit) await adminApi.updateStudentForm(student._id, fd);
      else        await adminApi.createStudentForm(fd);
      reset();
      onSaved();
      onClose();
      Alert.alert('Success', isEdit ? 'Student updated' : 'Student created. Login OTP has been emailed.');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  const isLast = step === STEPS.length;
  const roles: string[] = newParent.accountFor === 'Guardian' ? ['father', 'mother', 'guardian'] : ['father', 'mother'];

  return (
    <FormModal
      visible={visible}
      title={`${isEdit ? 'Edit' : 'Add'} Student — ${step}/${STEPS.length} ${STEPS[step - 1]}`}
      onClose={close}
      onSubmit={isLast ? submit : next}
      submitting={saving}
      submitLabel={isLast ? (isEdit ? 'Save Changes' : 'Create Student') : 'Next →'}
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
          <Input label="Full Name *" value={form.name} onChange={set('name')} placeholder="Aarav Sharma" />
          <Input label={isEdit ? 'Email' : 'Email *'} value={form.email} onChange={set('email')}
            keyboardType="email-address" placeholder="student@school.com" editable={!isEdit} />
          <Input label="Phone" value={form.phone} onChange={set('phone')} keyboardType="phone-pad" placeholder="Optional" />
          {isEdit ? (
            <Input label="New Password" value={form.password} onChange={set('password')} secure
              placeholder="Leave blank to keep current" />
          ) : (
            <Text style={s.note}>A one-time password is emailed to the student. They set a new one on first login.</Text>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <Input label="Date of Birth *" value={form.dob} onChange={set('dob')} placeholder="YYYY-MM-DD" />
          <Select label="Gender *" value={form.gender} onChange={set('gender')}
            options={['Male', 'Female', 'Other'].map(g => ({ label: g, value: g }))} />
          <Select label="Blood Group *" value={form.bloodGroup} onChange={set('bloodGroup')}
            options={BLOOD_GROUPS.map(g => ({ label: g, value: g }))} />
          <Select label="Category *" value={form.category} onChange={set('category')}
            options={CATEGORIES.map(c => ({ label: c, value: c }))} />
          <Input label="Religion" value={form.religion} onChange={set('religion')} placeholder="Optional" />
          <Input label="Nationality *" value={form.nationality} onChange={set('nationality')} placeholder="Indian" />

          <SectionTitle>Emergency Contact</SectionTitle>
          <Input label="Contact Name *" value={form.emergencyContactName} onChange={set('emergencyContactName')}
            placeholder="Who should the school call first?" />
          <Input label="Contact Phone *" value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')}
            keyboardType="phone-pad" placeholder="+91 98765 43210" />
          <Input label="Relation with the Student *" value={form.emergencyContactRelation}
            onChange={set('emergencyContactRelation')} placeholder="e.g. Uncle, Neighbour" />
        </>
      )}

      {step === 3 && (
        <>
          <SectionTitle>Current Address</SectionTitle>
          <Input label="Address *" value={form.address} onChange={set('address')} multiline placeholder="House / street / locality" />
          <Input label={pinBusy === 'current' ? 'PIN Code * (looking up…)' : 'PIN Code *'}
            value={form.pincode} onChange={onPincode('')} keyboardType="numeric" placeholder="411001" />
          <Input label="City / District *" value={form.city} onChange={set('city')} placeholder="Pune" />
          <Select label="State / UT *" value={form.state} onChange={set('state')} options={stateOptions} />
          <Input label="Country *" value={form.country} onChange={set('country')} placeholder="India" />

          <Toggle label="Permanent address is the same as current" value={form.sameAsCurrent}
            onChange={(v: boolean) => setForm((f: any) => ({
              ...f,
              sameAsCurrent: v,
              // Copy the whole block, not just the street line
              ...(v ? {
                permanentAddress: f.address, permanentCity: f.city,
                permanentState: f.state, permanentPincode: f.pincode, permanentCountry: f.country,
              } : {}),
            }))} />

          {!form.sameAsCurrent && (
            <>
              <SectionTitle>Permanent Address</SectionTitle>
              <Input label="Address *" value={form.permanentAddress} onChange={set('permanentAddress')} multiline />
              <Input label={pinBusy === 'permanent' ? 'PIN Code * (looking up…)' : 'PIN Code *'}
                value={form.permanentPincode} onChange={onPincode('permanent')} keyboardType="numeric" />
              <Input label="City / District *" value={form.permanentCity} onChange={set('permanentCity')} />
              <Select label="State / UT *" value={form.permanentState} onChange={set('permanentState')} options={stateOptions} />
              <Input label="Country *" value={form.permanentCountry} onChange={set('permanentCountry')} placeholder="India" />
            </>
          )}
        </>
      )}

      {step === 4 && (
        <>
          <DocField label="Student Passport Size Photo" required value={files.photo}
            existing={docs?.photoFile} onChange={setFile('photo')}
            hint="Also used as the student's profile picture" />
          <Input label="Aadhaar Card Number *" value={form.aadhaarNumber}
            onChange={v => set('aadhaarNumber')(v.replace(/[^\d\s]/g, ''))}
            keyboardType="numeric" placeholder="12 digits" />
          <DocField label="Aadhaar — Front" required value={files.aadhaarFront}
            existing={docs?.aadhaarFrontFile} onChange={setFile('aadhaarFront')} />
          <DocField label="Aadhaar — Back" required value={files.aadhaarBack}
            existing={docs?.aadhaarBackFile} onChange={setFile('aadhaarBack')} />
          <DocField label="Birth Certificate" required value={files.birthCertificate}
            existing={docs?.birthCertificateFile} onChange={setFile('birthCertificate')} />
          <DocField label="Caste Certificate" hint="Optional — if applicable" value={files.casteCertificate}
            existing={docs?.casteCertificateFile} onChange={setFile('casteCertificate')} />
          <DocField label="Disability Certificate" hint="Optional — if applicable" value={files.disabilityCertificate}
            existing={docs?.disabilityCertificateFile} onChange={setFile('disabilityCertificate')} />
          <DocField label="Medical Certificate" hint="Optional" value={files.medicalCertificate}
            existing={docs?.medicalCertificateFile} onChange={setFile('medicalCertificate')} />
        </>
      )}

      {step === 5 && (
        <>
          <Toggle label="Transferring in from another school" value={form.isTransferStudent}
            onChange={(v: boolean) => setForm((f: any) => ({ ...f, isTransferStudent: v }))} />
          {!form.isTransferStudent ? (
            <Text style={s.note}>
              Turn this on for a transfer admission to record the previous school, Transfer Certificate
              and migration certificate.
            </Text>
          ) : (
            <>
              <Input label="Previous School Name *" value={form.previousSchoolName} onChange={set('previousSchoolName')} />

              <SectionTitle>Previous School Address</SectionTitle>
              <Input label="Address *" value={form.previousSchoolAddress}
                onChange={set('previousSchoolAddress')} multiline placeholder="Building / street / locality" />
              <Input label={pinBusy === 'previousSchool' ? 'PIN Code * (looking up…)' : 'PIN Code *'}
                value={form.previousSchoolPincode} onChange={onPincode('previousSchool')} keyboardType="numeric" />
              <Input label="City / District *" value={form.previousSchoolCity} onChange={set('previousSchoolCity')} />
              <Select label="State / UT *" value={form.previousSchoolState} onChange={set('previousSchoolState')} options={stateOptions} />
              <Input label="Country *" value={form.previousSchoolCountry} onChange={set('previousSchoolCountry')} placeholder="India" />
              <SelectOrOther label="Previous School Medium" options={MEDIUMS}
                value={form.previousSchoolMedium} otherValue={form.previousSchoolMediumOther}
                onChange={set('previousSchoolMedium')} onOtherChange={set('previousSchoolMediumOther')} />
              <SelectOrOther label="Previous School Board" options={BOARDS}
                value={form.previousSchoolBoard} otherValue={form.previousSchoolBoardOther}
                onChange={set('previousSchoolBoard')} onOtherChange={set('previousSchoolBoardOther')} />
              {form.previousSchoolBoard === 'State Board' && (
                <Input label="Name of the State Board *" value={form.previousSchoolStateBoardName}
                  onChange={set('previousSchoolStateBoardName')}
                  placeholder="e.g. Maharashtra State Board of Secondary and Higher Secondary Education" />
              )}
              <Input label="Previous Class *" value={form.previousClass} onChange={set('previousClass')} placeholder="e.g. Class 5" />
              <Input label="Previous Academic Year *" value={form.previousAcademicYear}
                onChange={set('previousAcademicYear')} placeholder="e.g. 2025-26" />
              <Input label="School Leaving Date *" value={form.previousSchoolLeavingDate}
                onChange={set('previousSchoolLeavingDate')} placeholder="YYYY-MM-DD" />
              <Input label="Previous School Contact *" value={form.previousSchoolContact}
                onChange={set('previousSchoolContact')} keyboardType="phone-pad" />

              <SectionTitle>Transfer Certificate</SectionTitle>
              <Input label="TC Number *" value={form.tcNumber} onChange={set('tcNumber')} />
              <Input label="TC Date *" value={form.tcDate} onChange={set('tcDate')} placeholder="YYYY-MM-DD" />
              <DocField label="Transfer Certificate (TC)" required value={files.tc}
                existing={docs?.tcFile} onChange={setFile('tc')} />
              <DocField label="Migration Certificate" hint="Optional — usually only on a board change"
                value={files.migrationCertificate} existing={docs?.migrationCertificateFile}
                onChange={setFile('migrationCertificate')} />
            </>
          )}
        </>
      )}

      {step === 6 && (
        <>
          <Select label="Class *" value={form.classId}
            onChange={v => setForm((f: any) => ({ ...f, classId: v, currentSection: '' }))} options={classOptions} />
          <Select label="Section" value={form.currentSection} onChange={set('currentSection')}
            options={sectionOptions} placeholder="Assign later" />
          <Input label="Roll Number" value={form.rollNumber} onChange={set('rollNumber')}
            placeholder="Assigned from the section later" />
          <Input label="Admission Number" value={form.admissionNumber} onChange={set('admissionNumber')}
            placeholder="Auto-generated if left blank" />
        </>
      )}

      {step === 7 && (
        <>
          <SegTabs
            tabs={[{ key: 'search', label: 'Link existing' }, { key: 'create', label: 'Enter details' }]}
            active={parentMode}
            onChange={(k: string) => { setParentMode(k as 'search' | 'create'); setPR([]); }}
          />

          {parentMode === 'search' ? (
            parentId ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={s.linked}>✅ Parent linked — {parentName}</Text>
                <ActionBtn label="Remove" tone="neutral" small onPress={() => { setParentId(''); setParentName(''); }} />
              </View>
            ) : (
              <>
                <Input label="Search parent by name, email or phone" value={parentQ} onChange={setParentQ}
                  placeholder="e.g. rahul@…" />
                <ActionBtn label="Search Parent" tone="info" onPress={searchParent} />
                {parentResults.map((pr: any) => (
                  <RowItem key={pr._id} title={pr.name}
                    sub={`${pr.email}${pr.children?.length ? ` · ${pr.children.length} child${pr.children.length !== 1 ? 'ren' : ''}` : ''}`}
                    right={<ActionBtn label="Link" tone="info" small
                      onPress={() => { setParentId(pr._id); setParentName(`${pr.name} (${pr.email})`); setPR([]); }} />} />
                ))}
              </>
            )
          ) : (
            <>
              <Select label="Who is the student's guardian? *" value={newParent.accountFor}
                onChange={v => setNewParent((p: any) => ({ ...p, accountFor: v }))}
                options={[
                  { label: 'Father', value: 'Father' },
                  { label: 'Mother', value: 'Mother' },
                  { label: 'Someone else', value: 'Guardian' },
                ]} />
              <Text style={s.note}>
                Father's and mother's details are always recorded. The guardian gets the login account —
                they are the only one who needs an email address.
              </Text>

              {roles.map(role => {
                const label   = role[0].toUpperCase() + role.slice(1);
                const isOwner = newParent.accountFor === (role === 'guardian' ? 'Guardian' : label);
                return (
                  <View key={role} style={{ marginBottom: 6 }}>
                    <SectionTitle>{label}{isOwner ? ' — guardian / login account' : ''}</SectionTitle>
                    <Input label={`${label}'s Name *`} value={newParent[role].name} onChange={v => setBlock(role, 'name', v)} />
                    {role === 'guardian' && (
                      <Input label="Relation with the Student *" value={newParent[role].relation ?? ''}
                        onChange={v => setBlock(role, 'relation', v)} placeholder="e.g. Uncle, Grandmother" />
                    )}
                    <Input label={`Email${isOwner ? ' *' : ''}`} value={newParent[role].email}
                      onChange={v => setBlock(role, 'email', v)} keyboardType="email-address"
                      placeholder={isOwner ? 'name@email.com' : 'Optional'} />
                    <Input label="Mobile Number *" value={newParent[role].phone}
                      onChange={v => setBlock(role, 'phone', v)} keyboardType="phone-pad" />
                    <Input label="Occupation *" value={newParent[role].occupation} onChange={v => setBlock(role, 'occupation', v)} />
                    <Input label="Organization" value={newParent[role].organization} onChange={v => setBlock(role, 'organization', v)}
                      placeholder="Company / employer" />
                    <Input label="Designation" value={newParent[role].designation} onChange={v => setBlock(role, 'designation', v)} />
                    <Input label="Qualification" value={newParent[role].qualification} onChange={v => setBlock(role, 'qualification', v)}
                      placeholder="e.g. B.Com." />
                    <Input label="Annual Income" value={newParent[role].annualIncome} onChange={v => setBlock(role, 'annualIncome', v)}
                      keyboardType="numeric" placeholder="e.g. 600000" />
                    <Input label="Aadhaar Card Number *" value={newParent[role].aadhaarNumber}
                      onChange={v => setBlock(role, 'aadhaarNumber', v.replace(/[^\d\s]/g, ''))} keyboardType="numeric"
                      placeholder="12 digits" />
                    <Input label="PAN Card Number" value={newParent[role].panNumber}
                      onChange={v => setBlock(role, 'panNumber', v.toUpperCase())} placeholder="ABCDE1234F" />
                    <DocField label="Aadhaar — Front" hint="Optional" value={files[`${role}AadhaarFront`]}
                      existing={existingParent?.[role]?.aadhaarFrontFile} onChange={setFile(`${role}AadhaarFront`)} />
                    <DocField label="Aadhaar — Back" hint="Optional" value={files[`${role}AadhaarBack`]}
                      existing={existingParent?.[role]?.aadhaarBackFile} onChange={setFile(`${role}AadhaarBack`)} />
                    <DocField label="PAN Card" hint="Optional" value={files[`${role}PanCard`]}
                      existing={existingParent?.[role]?.panCardFile} onChange={setFile(`${role}PanCard`)} />
                    <DocField label="Passport Size Photo" hint="Optional" value={files[`${role}Photo`]}
                      existing={existingParent?.[role]?.photoFile} onChange={setFile(`${role}Photo`)} />
                  </View>
                );
              })}
            </>
          )}
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
  docOnFile: { fontSize: 11, color: Colors.success, marginTop: 4 },
  note: { fontSize: 11, color: Colors.textSecondary, marginTop: 4, marginBottom: 10, lineHeight: 16 },
  linked: { fontSize: 13, color: Colors.success, fontWeight: '600', marginBottom: 8 },
});
