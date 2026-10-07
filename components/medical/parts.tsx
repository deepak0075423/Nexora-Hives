/**
 * The Medical Room on the phone (Oct 2026) — the pieces its screens share.
 *
 * The page shapes (head, tiles, panels, pills, sheets, fields) are the
 * inventory kit's, re-exported here, so the app reads as one app. What is
 * here is the medical part of it:
 *   • every status in the web's words and tones (pages/medical/mdMeta.js);
 *   • the student a record is about — identity only;
 *   • the alert card: what anyone looking after a child must not miss,
 *     critical first and in red;
 *   • a teacher's request as a progress line;
 *   • the emergency card, every number on it one tap from a call;
 *   • the student picker.
 */
import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Image, Linking, Platform, Switch,
} from 'react-native';
import { TextInput } from '@/components/ui/TextInput';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius } from '@/constants/theme';
import { TINT, BRAND, Pill, Blank, Spinner, type Tone } from '@/components/inventory/parts';
import { photoUrl } from '@/api/medical.api';

export {
  Head, Tiles, Tile, Tabs, Panel, Pill, Facts, Fact, Note, Blank, Muted, Btn, Sheet, Field, Box, Pick, Spinner,
  TINT, BRAND, count, plural, ago, words,
} from '@/components/inventory/parts';
export type { Tone } from '@/components/inventory/parts';

// ── Vocabulary ────────────────────────────────────────────────────────────────

type Def = { label: string; tone: Tone };
const d = (label: string, tone: Tone): Def => ({ label, tone });

export const VISIT_STATUS: Record<string, Def> = {
  in_room: d('In Medical Room', 'blue'), observation: d('Under Observation', 'amber'), emergency: d('Emergency', 'red'),
  returned: d('Returned to Class', 'green'), sent_home: d('Sent Home', 'orange'), referred: d('Referred to Hospital', 'red'),
  closed: d('Closed', 'slate'),
};
export const IN_ROOM = ['in_room', 'observation', 'emergency'];
/** Where a visit may go next — the server's VISIT_NEXT. */
export const VISIT_NEXT: Record<string, string[]> = {
  in_room: ['observation', 'emergency', 'returned', 'sent_home', 'referred'],
  observation: ['in_room', 'emergency', 'returned', 'sent_home', 'referred'],
  emergency: ['in_room', 'observation', 'returned', 'sent_home', 'referred'],
  returned: ['sent_home', 'referred', 'closed'],
  sent_home: ['returned', 'referred', 'closed'],
  referred: ['returned', 'sent_home', 'closed'],
  closed: [],
};

export const REQUEST_STATUS: Record<string, Def> = {
  requested: d('Requested', 'amber'), accepted: d('Accepted', 'indigo'), arrived: d('Student Arrived', 'blue'),
  treatment: d('Under Treatment', 'violet'), returned: d('Returned to Class', 'green'), sent_home: d('Sent Home', 'orange'),
  referred: d('Referred to Hospital', 'red'), closed: d('Closed', 'slate'), cancelled: d('Cancelled', 'slate'),
};
export const URGENCY: Record<string, Def> = {
  low: d('Low', 'slate'), normal: d('Normal', 'blue'), high: d('High', 'orange'), emergency: d('Emergency', 'red'),
};

export const INCIDENT_TYPE: Record<string, string> = {
  playground: 'Playground injury', sports: 'Sports injury', fall: 'Fall', cut: 'Cut / Wound', fracture: 'Fracture',
  fainting: 'Fainting', fever: 'Fever', allergic: 'Allergic reaction', breathing: 'Breathing problem', accident: 'Accident', other: 'Other',
};
export const INCIDENT_SEVERITY: Record<string, Def> = {
  minor: d('Minor', 'green'), moderate: d('Moderate', 'amber'), serious: d('Serious', 'orange'), critical: d('Critical', 'red'),
};
export const INCIDENT_STATUS: Record<string, Def> = {
  reported: d('Reported', 'amber'), in_progress: d('In Progress', 'blue'), resolved: d('Resolved', 'green'), closed: d('Closed', 'slate'),
};

export const ALLERGY_CATEGORY: Record<string, string> = { food: 'Food', medicine: 'Medicine', environmental: 'Environmental', insect: 'Insect', other: 'Other' };
export const ALLERGY_SEVERITY: Record<string, Def> = {
  mild: d('Mild', 'green'), moderate: d('Moderate', 'amber'), severe: d('Severe', 'orange'), life_threatening: d('Life-threatening', 'red'),
};
export const CONDITION_TYPE: Record<string, string> = {
  asthma: 'Asthma', diabetes: 'Diabetes', epilepsy: 'Epilepsy', heart: 'Heart condition', vision: 'Vision problem',
  hearing: 'Hearing problem', orthopedic: 'Orthopedic condition', chronic: 'Chronic illness', other: 'Other',
};
export const CONDITION_SEVERITY: Record<string, Def> = {
  mild: d('Mild', 'green'), moderate: d('Moderate', 'amber'), severe: d('Severe', 'orange'), critical: d('Critical', 'red'),
};
export const CONDITION_STATUS: Record<string, Def> = { active: d('Active', 'red'), managed: d('Managed', 'blue'), resolved: d('Resolved', 'slate') };

export const DOSE_STATUS: Record<string, Def> = {
  scheduled: d('Scheduled', 'indigo'), given: d('Given', 'green'), missed: d('Missed', 'red'), refused: d('Refused', 'orange'), cancelled: d('Cancelled', 'slate'),
};
export const PLAN_FREQUENCY: Record<string, string> = { once: 'Once a day', twice: 'Twice a day', thrice: 'Three times a day', as_needed: 'As needed', custom: 'Custom times' };
export const PLAN_STATUS: Record<string, Def> = { active: d('Active', 'green'), paused: d('Paused', 'amber'), completed: d('Completed', 'slate'), cancelled: d('Cancelled', 'slate') };

export const VACCINATION_STATUS: Record<string, Def> = {
  completed: d('Completed', 'green'), pending: d('Pending', 'slate'), due_soon: d('Due Soon', 'amber'), overdue: d('Overdue', 'red'),
};
export const CHECKUP_TYPE: Record<string, string> = {
  general: 'General health', vision: 'Vision', dental: 'Dental', hearing: 'Hearing', height: 'Height', weight: 'Weight',
  bmi: 'BMI', bp: 'Blood pressure', physical: 'Physical examination',
};
export const CHECKUP_OUTCOME: Record<string, Def> = { normal: d('Normal', 'green'), attention: d('Needs attention', 'amber'), referred: d('Referred', 'red') };

export const DOC_TYPE: Record<string, string> = {
  prescription: 'Prescription', medical_certificate: 'Medical certificate', fitness_certificate: 'Fitness certificate',
  vaccination_certificate: 'Vaccination certificate', lab_report: 'Lab report', doctor_report: 'Doctor report',
  hospital_document: 'Hospital document', history: 'Medical history document', incident_photo: 'Incident photo', other: 'Other',
};
export const CHANGE_KIND: Record<string, string> = {
  allergy: 'Allergy', condition: 'Medical condition', contact: 'Emergency contact', doctor: 'Family doctor',
  hospital: 'Preferred hospital', profile: 'Medical profile', vaccination: 'Vaccination', document: 'Medical document',
};
export const CHANGE_STATUS: Record<string, Def> = {
  pending: d('Waiting for review', 'amber'), approved: d('Accepted', 'green'), rejected: d('Not accepted', 'red'), withdrawn: d('Withdrawn', 'slate'),
};
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const labelOf = (map: Record<string, any>, key?: string | null) => {
  const v = map?.[String(key ?? '')];
  return (typeof v === 'string' ? v : v?.label) || String(key ?? '');
};
export const optionsOf = (map: Record<string, any>) => Object.entries(map).map(([value, v]) => ({ value, label: typeof v === 'string' ? v : v.label }));

/** A status in the web's words and colour. */
export function Status({ map, value, icon }: { map: Record<string, Def>; value?: string | null; icon?: any }) {
  const s = map[String(value ?? '')];
  return <Pill tone={s?.tone || 'slate'} icon={icon}>{s?.label || String(value ?? '—')}</Pill>;
}

// ── Dates ─────────────────────────────────────────────────────────────────────

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const valid = (v: any) => { if (!v) return null; const x = new Date(v); return Number.isNaN(x.getTime()) ? null : x; };

/** A stored DAY — '04 Oct 2026'. Days are kept as the UTC midnight of the day meant. */
export function fmtDay(v: any) {
  const x = valid(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : v);
  return x ? `${pad(x.getUTCDate())} ${MON[x.getUTCMonth()]} ${x.getUTCFullYear()}` : '';
}
/** The day an instant falls on, on this phone's clock — '04 Oct 2026' (fmtDay is for stored days). */
export function fmtDate(v: any) {
  const x = valid(v);
  return x ? `${pad(x.getDate())} ${MON[x.getMonth()]} ${x.getFullYear()}` : '';
}
/** An instant on this phone's clock — '3:41 pm'. */
export function fmtTime(v: any) {
  const x = valid(v);
  if (!x) return '';
  const h = x.getHours();
  return `${h % 12 || 12}:${pad(x.getMinutes())} ${h < 12 ? 'am' : 'pm'}`;
}
/** 'Today, 3:41 pm' · 'Yesterday, 9:05 am' · '28 Sep, 3:41 pm' · '28 Sep 2025'. */
export function fmtStamp(v: any) {
  const x = valid(v);
  if (!x) return '';
  const now = new Date();
  const day = (a: Date) => `${a.getFullYear()}-${a.getMonth()}-${a.getDate()}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (day(x) === day(now)) return `Today, ${fmtTime(x)}`;
  if (day(x) === day(y)) return `Yesterday, ${fmtTime(x)}`;
  if (x.getFullYear() !== now.getFullYear()) return `${pad(x.getDate())} ${MON[x.getMonth()]} ${x.getFullYear()}`;
  return `${pad(x.getDate())} ${MON[x.getMonth()]}, ${fmtTime(x)}`;
}
/** How long since — '45 min', '2 h 38 min'. */
export function since(v: any) {
  const x = valid(v);
  if (!x) return '';
  const m = Math.max(0, Math.round((Date.now() - x.getTime()) / 60000));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}
/** Today on this phone's clock, as 'YYYY-MM-DD'. */
export const todayStr = () => { const n = new Date(); return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`; };
/** 'YYYY-MM-DD' of a stored day (kept at midnight UTC), for a date box. */
export const dayInput = (v: any) => {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const x = valid(v);
  return x ? `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}` : '';
};

// ── People ────────────────────────────────────────────────────────────────────

export const initials = (name?: string) => String(name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
/** "Class VIII – B · APM2017001" */
export const studentLine = (r: any) => [
  r?.classLabel || [r?.className, r?.sectionName].filter(Boolean).join(' – '),
  r?.admissionNumber,
].filter(Boolean).join(' · ');

export function Avatar({ name, photo, size = 38, tone = 'indigo' }: { name?: string; photo?: string; size?: number; tone?: Tone }) {
  const t = TINT[tone];
  const uri = photoUrl(photo);
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.soft }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: t.fg, fontWeight: '800', fontSize: Math.round(size * 0.36) }}>{initials(name)}</Text>
    </View>
  );
}

/** The student a record is about: face, name, class line — and whatever the row adds on the right. */
export function Person({ name, photo, sub, right, size = 38, critical }: {
  name?: string; photo?: string; sub?: string; right?: React.ReactNode; size?: number; critical?: boolean;
}) {
  return (
    <View style={s.person}>
      <View>
        <Avatar name={name} photo={photo} size={size} />
        {critical ? <View style={s.flag}><Ionicons name="warning" size={10} color={Colors.danger} /></View> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.personName} numberOfLines={1}>{name || '—'}</Text>
        {sub ? <Text style={s.personSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** A white card that holds one record. */
export function Card({ children, onPress, critical, style }: { children: React.ReactNode; onPress?: () => void; critical?: boolean; style?: any }) {
  const Wrap: any = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={[s.card, critical && s.cardCritical, style]} onPress={onPress} activeOpacity={0.8} accessibilityRole={onPress ? 'button' : undefined}>
      {children}
    </Wrap>
  );
}

/** A heading inside a panel or a tab. */
export const Sub = ({ icon, children }: { icon?: any; children: React.ReactNode }) => (
  <View style={s.sub}>
    {icon ? <Ionicons name={icon} size={15} color={BRAND} /> : null}
    <Text style={s.subText}>{children}</Text>
  </View>
);

/** A line of muted text, wrapping — never cut mid-word. */
export const Line = ({ children, tone, strong }: { children: React.ReactNode; tone?: Tone; strong?: boolean }) => (
  <Text style={[s.line, tone && { color: TINT[tone].fg }, strong && { fontWeight: '700' }]}>{children}</Text>
);

/** A label over its value — for facts that need the whole width. */
export function KV({ k, v }: { k: string; v?: React.ReactNode }) {
  if (v === null || v === undefined || v === '') return null;
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={s.kvK}>{k.toUpperCase()}</Text>
      {typeof v === 'string' || typeof v === 'number' ? <Text style={s.kvV}>{v}</Text> : v}
    </View>
  );
}

// ── Calling ───────────────────────────────────────────────────────────────────

/**
 * The number to dial: what comes before an extension or a note. Keeping every
 * digit turned "+91 20 2543 1199 (ext. 12)" into +91202543119912. A bracket or
 * a slash starts a note only once the number has its digits, so
 * "(020) 2543 1199" and "+1 (555) 123-4567" stay whole.
 */
export const telOf = (p?: string) => {
  const text = String(p || '');
  const note = /\s*(?:\(|\bext\b\.?|\bextn\b\.?|\bextension\b|\bx(?=\s*\d)|[,;/])/gi;
  for (let m = note.exec(text); m; m = note.exec(text)) {
    const before = text.slice(0, m.index).replace(/[^\d+]/g, '');
    if (before.replace(/\D/g, '').length >= 7) return before;
  }
  return text.replace(/[^\d+]/g, '');
};
export const call = (p?: string) => { const t = telOf(p); if (t) Linking.openURL(`tel:${t}`).catch(() => {}); };

/** A phone number that dials when tapped. */
export function Phone({ value, label }: { value?: string; label?: string }) {
  if (!value) return null;
  return (
    <TouchableOpacity style={s.phone} onPress={() => call(value)} accessibilityRole="link" accessibilityLabel={`Call ${label || value}`}>
      <Ionicons name="call" size={13} color={BRAND} />
      <Text style={s.phoneText}>{value}</Text>
    </TouchableOpacity>
  );
}

// ── Alerts ────────────────────────────────────────────────────────────────────

const ALERT_ICON: Record<string, any> = {
  allergy: 'warning', condition: 'heart', emergency_medication: 'medkit', medication: 'medical',
  diet: 'restaurant-outline', instructions: 'information-circle-outline',
};
const LEVEL_TONE: Record<string, Tone> = { critical: 'red', warning: 'amber', info: 'blue' };

/**
 * The alerts anyone looking after this child must see: each one says what it
 * is, what happens, what to do and with which medicine. Critical ones first.
 */
export function AlertCards({ alerts = [], instructions, title = true }: { alerts?: any[]; instructions?: string; title?: boolean }) {
  const list = [...alerts].sort((a, b) => (a.level === 'critical' ? 0 : 1) - (b.level === 'critical' ? 0 : 1));
  const critical = list.filter((a) => a.level === 'critical').length;
  if (!list.length && !instructions) return null;
  return (
    <View style={[s.alertBox, critical ? s.alertBoxCritical : null]}>
      {title ? (
        <View style={s.alertHead}>
          <Ionicons name={critical ? 'warning' : 'information-circle'} size={16} color={critical ? Colors.danger : TINT.amber.fg} />
          <Text style={[s.alertHeadText, { color: critical ? '#B91C1C' : '#92400E' }]}>
            {critical ? `${critical} critical medical alert${critical === 1 ? '' : 's'}` : 'Medical information'}
          </Text>
        </View>
      ) : null}
      {list.map((a, i) => {
        const tone = LEVEL_TONE[a.level] || 'slate';
        return (
          <View key={`${a.kind}:${a.label}:${i}`} style={[s.alert, a.level === 'critical' && { borderColor: '#FBD0D0' }]}>
            <View style={[s.alertIcon, { backgroundColor: TINT[tone].soft }]}><Ionicons name={ALERT_ICON[a.kind] || 'alert-circle-outline'} size={15} color={TINT[tone].fg} /></View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text style={s.alertLabel}>{a.label}</Text>
              {a.detail ? <Text style={s.alertDetail}>{a.detail}</Text> : null}
              {a.instructions ? (
                <View style={s.alertDo}><Ionicons name="alert-circle-outline" size={13} color="#B91C1C" style={{ marginTop: 1 }} /><Text style={s.alertDoText}>{a.instructions}</Text></View>
              ) : null}
              {a.medication ? (
                <View style={s.alertDo}><Ionicons name="medkit-outline" size={13} color={BRAND} style={{ marginTop: 1 }} /><Text style={[s.alertDoText, { color: BRAND }]}>{a.medication}</Text></View>
              ) : null}
            </View>
          </View>
        );
      })}
      {instructions ? (
        <View style={s.alertNote}><Ionicons name="document-text-outline" size={13} color={Colors.textSecondary} style={{ marginTop: 1 }} /><Text style={s.alertNoteText}>{instructions}</Text></View>
      ) : null}
    </View>
  );
}

/** Alerts as small chips, for a row in a list. Words wrap inside a chip — they are never cut. */
export function AlertChips({ alerts = [], max = 3 }: { alerts?: any[]; max?: number }) {
  if (!alerts.length) return null;
  const shown = alerts.slice(0, max);
  return (
    <View style={s.chips}>
      {shown.map((a, i) => {
        const tone = LEVEL_TONE[a.level] || 'slate';
        return (
          <View key={`${a.kind}:${a.label}:${i}`} style={[s.achip, { backgroundColor: TINT[tone].soft }]}>
            <Ionicons name={ALERT_ICON[a.kind] || 'alert-circle-outline'} size={11} color={TINT[tone].fg} />
            <Text style={[s.achipText, { color: TINT[tone].fg }]}>{a.label}</Text>
          </View>
        );
      })}
      {alerts.length > max ? <View style={[s.achip, { backgroundColor: TINT.slate.soft }]}><Text style={[s.achipText, { color: TINT.slate.fg }]}>+{alerts.length - max}</Text></View> : null}
    </View>
  );
}

// ── Choosing ──────────────────────────────────────────────────────────────────

/** One of several, as chips that wrap. Tapping the chosen one again clears it when `clearable`. */
export function Chips({ options, value, onChange, clearable }: {
  options: { value: string; label: string }[]; value?: string; onChange: (v: string) => void; clearable?: boolean;
}) {
  return (
    <View style={s.chips}>
      {options.map((o) => {
        const on = String(o.value) === String(value ?? '');
        return (
          <TouchableOpacity key={o.value} style={[s.chip, on && s.chipOn]} onPress={() => onChange(on && clearable ? '' : o.value)}
            accessibilityRole="button" accessibilityState={{ selected: on }}>
            <Text style={[s.chipText, on && { color: '#fff' }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** A few choices side by side. Colours follow the option's tone when it has one. */
export function Seg({ options, value, onChange }: {
  options: { value: string; label: string; tone?: Tone }[]; value?: string; onChange: (v: string) => void;
}) {
  return (
    <View style={s.seg}>
      {options.map((o) => {
        const on = o.value === value;
        const t = o.tone ? TINT[o.tone] : null;
        return (
          <TouchableOpacity key={o.value} style={[s.segItem, on && s.segOn, on && t && { backgroundColor: t.soft, borderColor: t.fg }]}
            onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: on }}>
            <Text style={[s.segText, on && { color: t ? t.fg : BRAND, fontWeight: '700' }]} numberOfLines={1}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function SwitchRow({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.switchRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.switchLabel}>{label}</Text>
        {sub ? <Text style={s.switchSub}>{sub}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: BRAND, false: '#D7D3E6' }} thumbColor="#fff" accessibilityLabel={label} />
    </View>
  );
}

// ── A teacher's request, as a progress line ───────────────────────────────────

const STEP_OF: Record<string, number> = { requested: 0, accepted: 1, arrived: 2, treatment: 3, returned: 4, sent_home: 4, referred: 4, closed: 4 };
const STEP_LABEL = ['Requested', 'Accepted', 'Arrived', 'Treatment', 'Outcome'];

export function Progress({ status }: { status: string }) {
  if (status === 'cancelled') return <Line tone="slate">Withdrawn — the Medical Room is no longer expecting the student.</Line>;
  const at = STEP_OF[status] ?? 0;
  const end = at === 4;
  const endTone = status === 'referred' ? Colors.danger : status === 'sent_home' ? TINT.orange.fg : '#16A34A';
  return (
    <View style={{ gap: 6 }}>
      <View style={s.steps}>
        {STEP_LABEL.map((l, i) => (
          <View key={l} style={[s.step, { backgroundColor: i < at ? '#22C55E' : i === at ? (end ? endTone : BRAND) : '#E5E7EB' }]} />
        ))}
      </View>
      <Text style={s.stepNow}>Now: {labelOf(REQUEST_STATUS, status)}</Text>
    </View>
  );
}

// ── Emergency card ────────────────────────────────────────────────────────────

/**
 * Everything someone needs in an emergency, in the order they need it:
 * who, blood group, what could kill them and what to do, the medicine and
 * where it is, then who to call — each number dials.
 */
// Rescue medicines and care plans (server services/medicalCare).
export const RESCUE_PLACE: Record<string, string> = {
  bag: 'School bag', medical_room: 'Medical Room', classroom: 'Classroom', bus: 'School bus',
  staff_room: 'Staff room', hostel: 'Hostel', sports: 'Sports room', other: 'Other',
};
export const CARE_PLAN_KIND: Record<string, string> = {
  anaphylaxis: 'Anaphylaxis', asthma: 'Asthma', seizure: 'Seizures / epilepsy', diabetes: 'Diabetes (low blood sugar)', cardiac: 'Heart condition', other: 'Other',
};
export const placesOf = (m: any) => (m?.locations || []).map((l: any) => `${RESCUE_PLACE[l.place] || l.place}${l.note ? ` (${l.note})` : ''}`).join(', ');
/** 'expired' | 'expiring' | 'ok' | '' for a rescue medicine. */
export const rescueState = (m: any, days = 30) => {
  const exp = m?.expiresOn ? String(m.expiresOn).slice(0, 10) : '';
  if (!exp) return '';
  const t = todayStr();
  if (exp < t) return 'expired';
  return (Date.parse(`${exp}T00:00:00Z`) - Date.parse(`${t}T00:00:00Z`)) / 86400000 <= days ? 'expiring' : 'ok';
};

export function EmergencyCard({ e }: { e: any }) {
  if (!e) return null;
  const st = e.student || {};
  const allergies = e.allergies || [];
  const conditions = e.conditions || [];
  const med = e.emergencyMedication;
  const plans = e.carePlans || [];
  const rescue = e.rescueMeds || [];
  return (
    <View>
      <View style={s.emBand}>
        <Avatar name={st.name} photo={st.photo} size={52} tone="red" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.emName}>{st.name}</Text>
          <Text style={s.emSub}>{[st.classLabel, st.admissionNumber].filter(Boolean).join(' · ')}</Text>
          <Text style={s.emSub}>{[st.age != null ? `${st.age} years` : '', st.gender].filter(Boolean).join(' · ')}</Text>
        </View>
        <View style={s.emBlood}>
          <Text style={s.emBloodK}>BLOOD</Text>
          <Text style={s.emBloodV}>{e.bloodGroup || '—'}</Text>
        </View>
      </View>

      {allergies.length ? (
        <View style={s.emSec}>
          <Sub icon="warning-outline">Allergies</Sub>
          {allergies.map((a: any) => (
            <View key={a._id} style={[s.emItem, a.critical && s.emItemCritical]}>
              <View style={s.emItemTop}>
                <Text style={s.emItemTitle}>{a.allergen}</Text>
                <Status map={ALLERGY_SEVERITY} value={a.severity} />
              </View>
              {a.reaction ? <Line>{a.reaction}</Line> : null}
              {a.emergencyInstructions ? <Line tone="red" strong>If exposed: {a.emergencyInstructions}</Line> : null}
              {a.medication ? <Line tone="indigo">Medicine: {a.medication}</Line> : null}
            </View>
          ))}
        </View>
      ) : null}

      {conditions.length ? (
        <View style={s.emSec}>
          <Sub icon="heart-outline">Medical conditions</Sub>
          {conditions.map((c: any) => (
            <View key={c._id} style={[s.emItem, c.critical && s.emItemCritical]}>
              <View style={s.emItemTop}>
                <Text style={s.emItemTitle}>{c.condition || labelOf(CONDITION_TYPE, c.type)}</Text>
                <Status map={CONDITION_SEVERITY} value={c.severity} />
              </View>
              {c.emergencyInstructions ? <Line tone="red" strong>In an emergency: {c.emergencyInstructions}</Line> : null}
              {c.medication ? <Line tone="indigo">Medicine: {c.medication}</Line> : null}
            </View>
          ))}
        </View>
      ) : null}

      {plans.length ? (
        <View style={s.emSec}>
          <Sub icon="heart-outline">What to do — care plan</Sub>
          {plans.map((c: any) => (
            <View key={c._id} style={[s.emItem, s.emItemCritical]}>
              <Text style={s.emItemTitle}>{c.title}</Text>
              {(c.signs || []).length ? <Line>{`Signs: ${c.signs.join('; ')}`}</Line> : null}
              {(c.steps || []).map((x: any, i: number) => (
                <Line key={i} tone={x.critical ? 'red' : undefined} strong={!!x.critical}>{`${i + 1}. ${x.text}`}</Line>
              ))}
              {c.ambulanceWhen ? <Line tone="red" strong>{`Ambulance: ${c.ambulanceWhen}`}</Line> : null}
            </View>
          ))}
        </View>
      ) : null}

      {rescue.length ? (
        <View style={[s.emSec, s.emMed]}>
          <Sub icon="medkit-outline">Rescue medicine — reach for it here</Sub>
          {rescue.map((m: any) => (
            <View key={m._id} style={{ marginBottom: 8 }}>
              <Text style={s.emItemTitle}>{`${m.name}${m.dose ? ` — ${m.dose}` : ''}`}</Text>
              {placesOf(m) ? <Line>{`Kept: ${placesOf(m)}${m.selfCarry ? ' · the student carries one' : ''}`}</Line> : null}
              {m.expiresOn ? (m.expired
                ? <Line tone="red" strong>{`EXPIRED ${fmtDay(m.expiresOn)} — replace it. In an emergency an expired one is still better than none.`}</Line>
                : <Line>{`Expires ${fmtDay(m.expiresOn)}`}</Line>) : null}
              {m.instructions ? <Line tone="red" strong>{m.instructions}</Line> : null}
            </View>
          ))}
        </View>
      ) : null}

      {med?.required ? (
        <View style={[s.emSec, s.emMed]}>
          <Sub icon="medkit-outline">Emergency medicine</Sub>
          <Text style={s.emItemTitle}>{med.name}</Text>
          {med.location ? <Line>Kept: {med.location}</Line> : null}
          {med.instructions ? <Line tone="red" strong>{med.instructions}</Line> : null}
        </View>
      ) : null}

      {e.instructions ? <View style={s.emSec}><Sub icon="document-text-outline">Instructions</Sub><Line>{e.instructions}</Line></View> : null}
      {!allergies.length && !conditions.length && !med?.required && !plans.length && !rescue.length ? (
        <View style={s.emSec}><Line>No allergies, conditions or emergency medicine on record.</Line></View>
      ) : null}

      <View style={s.emSec}>
        <Sub icon="call-outline">Who to call</Sub>
        {(e.contacts || []).length ? (e.contacts || []).map((c: any, i: number) => (
          <View key={`${c.phone}:${i}`} style={s.emContact}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.emItemTitle}>{c.name || 'Contact'}</Text>
              <Text style={s.personSub}>{c.relation || ''}</Text>
            </View>
            {c.phone ? (
              <TouchableOpacity style={s.callBtn} onPress={() => call(c.phone)} accessibilityRole="button" accessibilityLabel={`Call ${c.name || c.phone}`}>
                <Ionicons name="call" size={14} color="#fff" />
                <Text style={s.callText}>{c.phone}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )) : <Line>No contact numbers on record — ask the school office.</Line>}
      </View>

      {e.doctor?.name || e.hospital?.name ? (
        <View style={s.emSec}>
          <Sub icon="medical-outline">Doctor and hospital</Sub>
          {e.doctor?.name ? (
            <View style={s.emContact}>
              <View style={{ flex: 1, minWidth: 0 }}><Text style={s.emItemTitle}>{e.doctor.name}</Text><Text style={s.personSub}>{e.doctor.clinic || 'Family doctor'}</Text></View>
              <Phone value={e.doctor.phone} label={e.doctor.name} />
            </View>
          ) : null}
          {e.hospital?.name ? (
            <View style={s.emContact}>
              <View style={{ flex: 1, minWidth: 0 }}><Text style={s.emItemTitle}>{e.hospital.name}</Text><Text style={s.personSub}>{e.hospital.address || 'Preferred hospital'}</Text></View>
              <Phone value={e.hospital.phone} label={e.hospital.name} />
            </View>
          ) : null}
        </View>
      ) : null}

      {e.room?.phone ? (
        <View style={[s.emSec, { borderBottomWidth: 0 }]}>
          <Sub icon="business-outline">{e.room.name || 'Medical Room'}</Sub>
          {e.room.location ? <Line>{e.room.location}</Line> : null}
          <Phone value={e.room.phone} label={e.room.name} />
        </View>
      ) : null}
    </View>
  );
}

// ── Picking a student ─────────────────────────────────────────────────────────

/**
 * A student, chosen by searching. `search(q)` returns identity rows only —
 * name, class, admission number — so nothing medical rides on a picker.
 * `extra` goes above the results (a teacher's "only my sections" switch).
 */
export function StudentPick({ value, onChange, search, placeholder = 'Search by name, admission no. or class', extra, deps = [] }: {
  value: any; onChange: (st: any) => void; search: (q: string) => Promise<any[]>;
  placeholder?: string; extra?: React.ReactNode; deps?: any[];
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [rows, setRows] = React.useState<any[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [fail, setFail] = React.useState('');

  React.useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await search(q.trim());
        if (live) { setRows(Array.isArray(r) ? r : []); setFail(''); }
      } catch (err: any) {
        if (live) setFail(err?.message || 'Students could not be loaded');
      } finally { if (live) setBusy(false); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [open, q, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <TouchableOpacity style={s.pickBox} onPress={() => setOpen(true)} activeOpacity={0.75}
        accessibilityRole="button" accessibilityLabel={value ? `Student: ${value.name}. Change` : 'Choose a student'}>
        {value ? (
          <Person name={value.name} photo={value.photo} sub={studentLine(value)} size={34}
            right={<Text style={s.change}>Change</Text>} />
        ) : (
          <View style={s.pickEmpty}>
            <Ionicons name="search" size={16} color={Colors.textSecondary} />
            <Text style={s.pickPlaceholder} numberOfLines={1}>{placeholder}</Text>
          </View>
        )}
      </TouchableOpacity>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)} presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}>
        <View style={[s.sheet, { paddingTop: Platform.OS === 'ios' ? 0 : insets.top }]}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>Choose a student</Text>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={22} color={Colors.textSecondary} /></TouchableOpacity>
          </View>
          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={Colors.textSecondary} />
            <TextInput style={s.search} value={q} onChangeText={setQ} autoFocus placeholder={placeholder} placeholderTextColor={Colors.textLight}
              autoCorrect={false} returnKeyType="search" accessibilityLabel="Search students" />
            {busy ? <Spinner /> : q ? <TouchableOpacity onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Clear"><Ionicons name="close-circle" size={17} color={Colors.textSecondary} /></TouchableOpacity> : null}
          </View>
          {extra ? <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>{extra}</View> : null}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 40 + insets.bottom }} keyboardShouldPersistTaps="handled">
            {fail ? <Blank icon="cloud-offline-outline" title="Students could not be loaded" body={fail} /> : null}
            {(rows || []).map((r) => (
              <TouchableOpacity key={r._id} style={s.pickRow} onPress={() => { onChange(r); setOpen(false); setQ(''); }} accessibilityRole="button">
                <Person name={r.name} photo={r.photo} sub={studentLine(r)} size={34}
                  right={String(r._id) === String(value?._id) ? <Ionicons name="checkmark" size={18} color={BRAND} /> : null} />
              </TouchableOpacity>
            ))}
            {rows && !rows.length && !busy && !fail ? <Blank icon="search-outline" title="No student found" body="Try a name, an admission number or a class such as 8 B." /> : null}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

// ── History ───────────────────────────────────────────────────────────────────

const KIND: Record<string, { label: string; icon: any; tone: Tone }> = {
  visit: { label: 'Medical Room visit', icon: 'medkit-outline', tone: 'blue' },
  incident: { label: 'Incident', icon: 'warning-outline', tone: 'orange' },
  first_aid: { label: 'First aid', icon: 'bandage-outline', tone: 'violet' },
  medicine: { label: 'Medicine', icon: 'medical-outline', tone: 'indigo' },
  referral: { label: 'Hospital referral', icon: 'business-outline', tone: 'red' },
  checkup: { label: 'Health checkup', icon: 'clipboard-outline', tone: 'teal' },
  vaccination: { label: 'Vaccination', icon: 'eyedrop-outline', tone: 'green' },
  document: { label: 'Document', icon: 'document-text-outline', tone: 'slate' },
  follow_up: { label: 'Follow-up', icon: 'calendar-outline', tone: 'amber' },
  record: { label: 'Record added', icon: 'heart-outline', tone: 'red' },
  hostel: { label: 'Hostel', icon: 'bed-outline', tone: 'violet' },
};
export const HISTORY_KINDS = Object.entries(KIND).map(([value, k]) => ({ value, label: k.label }));

/** A student's history, newest first — every entry a dated line that is never rewritten. */
export function Timeline({ items = [] }: { items?: any[] }) {
  return (
    <View>
      {items.map((it, i) => {
        const k = KIND[it.kind] || KIND.record;
        const t = TINT[k.tone];
        const last = i === items.length - 1;
        return (
          <View key={it.id || i} style={s.tl}>
            <View style={s.tlRail}>
              <View style={[s.tlDot, { backgroundColor: t.soft }]}><Ionicons name={k.icon} size={14} color={t.fg} /></View>
              {!last ? <View style={s.tlLine} /> : null}
            </View>
            <View style={[s.tlBody, last && { paddingBottom: 0 }]}>
              <Text style={s.tlWhen}>{it.day ? fmtDay(it.at) : fmtStamp(it.at)} · {k.label}</Text>
              <Text style={s.tlTitle}>{it.title}</Text>
              {it.status?.label ? <View style={{ marginTop: 4 }}><Pill tone={(TINT as any)[it.status.tone] ? it.status.tone : 'slate'}>{it.status.label}</Pill></View> : null}
              {(it.lines || []).map((l: string, j: number) => <Text key={j} style={s.tlLine2}>{l}</Text>)}
              {it.by ? <Text style={s.tlBy}>By {it.by}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  personName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  personSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 1 },
  flag: { position: 'absolute', right: -3, bottom: -3, width: 17, height: 17, borderRadius: 9, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FDE0E0' },

  card: { backgroundColor: '#fff', borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 10, gap: 8 },
  cardCritical: { borderColor: '#FBD0D0', backgroundColor: '#FFFAFA', borderLeftWidth: 3, borderLeftColor: Colors.danger },

  sub: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  subText: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  line: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
  kvK: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, color: Colors.textLight, marginBottom: 3 },
  kvV: { fontSize: 13, color: Colors.text, lineHeight: 19 },

  phone: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: 4 },
  phoneText: { fontSize: 13, fontWeight: '700', color: BRAND },

  alertBox: { borderRadius: Radius.lg, borderWidth: 1, borderColor: '#FDE7C2', backgroundColor: '#FFFCF5', padding: 10, gap: 8, marginBottom: 12 },
  alertBoxCritical: { borderColor: '#FBD0D0', backgroundColor: '#FFF7F7', borderLeftWidth: 3, borderLeftColor: Colors.danger },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  alertHeadText: { fontSize: 13.5, fontWeight: '800' },
  alert: { flexDirection: 'row', gap: 10, padding: 10, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#F1E6D0' },
  alertIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  alertLabel: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  alertDetail: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  alertDo: { flexDirection: 'row', gap: 5, alignItems: 'flex-start' },
  alertDoText: { flex: 1, fontSize: 12, fontWeight: '700', color: '#B91C1C', lineHeight: 17 },
  alertNote: { flexDirection: 'row', gap: 6, padding: 9, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.7)' },
  alertNoteText: { flex: 1, fontSize: 12, color: Colors.text, lineHeight: 17 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  achip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 7, maxWidth: '100%' },
  achipText: { fontSize: 11, fontWeight: '700', flexShrink: 1 },
  chip: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#fff' },
  chipOn: { backgroundColor: BRAND, borderColor: BRAND },
  chipText: { fontSize: 12.5, fontWeight: '600', color: Colors.text },

  seg: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  // Each choice is as wide as its words and the row shares out what is left; one that does
  // not fit goes to the next row rather than being cut to "Emerge…".
  segItem: { flexGrow: 1, alignItems: 'center', paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#fff' },
  segOn: { backgroundColor: TINT.indigo.soft, borderColor: BRAND },
  segText: { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, marginBottom: 6 },
  switchLabel: { fontSize: 13, fontWeight: '600', color: Colors.text },
  switchSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },

  steps: { flexDirection: 'row', gap: 4 },
  step: { flex: 1, height: 5, borderRadius: 3 },
  stepNow: { fontSize: 11.5, fontWeight: '700', color: BRAND },

  emBand: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: Radius.lg, backgroundColor: '#FFF1F2', borderWidth: 1, borderColor: '#FECDD3', marginBottom: 10 },
  emName: { fontSize: 17, fontWeight: '800', color: Colors.text },
  emSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  emBlood: { alignItems: 'center', justifyContent: 'center', minWidth: 62, paddingVertical: 8, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#FECDD3' },
  emBloodK: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8, color: '#BE123C' },
  emBloodV: { fontSize: 20, fontWeight: '800', color: '#BE123C' },
  emSec: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  emMed: { backgroundColor: '#FFFAFA', paddingHorizontal: 10, borderRadius: 12, borderBottomWidth: 0, marginVertical: 6, borderWidth: 1, borderColor: '#FBD0D0' },
  emItem: { padding: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#fff', gap: 3, marginBottom: 8 },
  emItemCritical: { borderColor: '#FBD0D0', backgroundColor: '#FFFAFA', borderLeftWidth: 3, borderLeftColor: Colors.danger },
  emItemTop: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  emItemTitle: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  emContact: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 11, borderRadius: 10, backgroundColor: '#16A34A' },
  callText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },

  pickBox: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.border, borderRadius: 10 },
  pickEmpty: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickPlaceholder: { flex: 1, fontSize: 13.5, color: Colors.textLight },
  change: { fontSize: 12.5, fontWeight: '700', color: BRAND },
  pickRow: { padding: 11, marginBottom: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.border, borderRadius: 12 },

  sheet: { flex: 1, backgroundColor: Colors.background },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.border },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, marginBottom: 0, paddingHorizontal: 12, height: 46, backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.border, borderRadius: 10 },
  search: { flex: 1, fontSize: 14, color: Colors.text },

  tl: { flexDirection: 'row', gap: 10 },
  tlRail: { alignItems: 'center', width: 28 },
  tlDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tlLine: { flex: 1, width: 2, backgroundColor: Colors.divider, marginVertical: 2 },
  tlBody: { flex: 1, minWidth: 0, paddingBottom: 16 },
  tlWhen: { fontSize: 11, color: Colors.textLight, fontWeight: '600' },
  tlTitle: { fontSize: 13.5, fontWeight: '700', color: Colors.text, marginTop: 2 },
  tlLine2: { fontSize: 12, color: Colors.textSecondary, marginTop: 3, lineHeight: 17 },
  tlBy: { fontSize: 11, color: Colors.textLight, marginTop: 4 },
});
