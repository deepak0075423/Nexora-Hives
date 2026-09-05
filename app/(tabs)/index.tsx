import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as studentApi from '@/api/student.api';
import * as teacherApi from '@/api/teacher.api';
import * as parentApi from '@/api/parent.api';
import * as adminApi from '@/api/admin.api';
import * as superApi from '@/api/superadmin.api';
import * as notifApi from '@/api/notifications.api';
import { useModules } from '@/hooks/useModules';
import AppHeader from '@/components/AppHeader';
import {
  Hero, Highlight, Panel, RowLink, RowSep, LabelledBars, Columns, MeterBar,
  Note, CardRow, BRAND, BRAND_SOFT, TONE, toneFor,
} from '@/components/dashboard/kit';

// ─── Module lists per role ────────────────────────────────────────────────────
// moduleFlag: the key in school.modules that must be true for this module to show.
// Modules with no moduleFlag are always visible (core features).

const STUDENT_MODULES = [
  { key: 'classes',    label: 'Classes',    icon: 'school',           route: '/modules/my-class' },
  { key: 'attendance', label: 'Attendance', icon: 'checkmark-circle', route: '/modules/attendance',  moduleFlag: 'attendance' },
  { key: 'timetable',  label: 'Timetable',  icon: 'calendar',         route: '/modules/timetable',   moduleFlag: 'timetable' },
  { key: 'results',    label: 'Results',    icon: 'bar-chart',        route: '/modules/results',     moduleFlag: 'result' },
  { key: 'library',    label: 'Library',    icon: 'library',          route: '/modules/library',     moduleFlag: 'library' },
  { key: 'documents',  label: 'Documents',  icon: 'folder',           route: '/modules/documents',   moduleFlag: 'document' },
  { key: 'holidays',   label: 'Holidays',   icon: 'sunny',            route: '/modules/holidays',    moduleFlag: 'holiday' },
  { key: 'aptitude',   label: 'Aptitude',   icon: 'bulb',             route: '/modules/exams',       moduleFlag: 'aptitudeExam' },
  { key: 'fees',       label: 'Fees',       icon: 'card',             route: '/modules/fees',        moduleFlag: 'fees' },
  { key: 'transport',  label: 'Transport',  icon: 'bus',              route: '/modules/transport',   moduleFlag: 'transport' },
  { key: 'hostel',     label: 'Hostel',     icon: 'business',         route: '/modules/hostel',      moduleFlag: 'hostel' },
  { key: 'videos',     label: 'Videos',     icon: 'play-circle',      route: '/modules/videos',      moduleFlag: 'videoLibrary' },
  { key: 'feedback',   label: 'Feedback',   icon: 'star',             route: '/modules/feedback',    moduleFlag: 'feedback' },
  { key: 'chat',       label: 'Chat',       icon: 'chatbubbles',      route: '/modules/chat',        moduleFlag: 'chat' },
  { key: 'alerts',     label: 'Alerts',     icon: 'notifications',    route: '/modules/alerts',      moduleFlag: 'notification' },
  { key: 'profile',    label: 'Profile',    icon: 'person-circle',    route: '/modules/profile' },
];

const TEACHER_MODULES = [
  { key: 'section',    label: 'My Sections', icon: 'people',          route: '/modules/my-section' },
  { key: 'analytics',  label: 'Analytics',  icon: 'compass',          route: '/modules/student-analytics' },
  { key: 'directory',  label: 'Staff',      icon: 'id-card',          route: '/modules/employee-directory', moduleFlag: 'employeeDirectory' },
  { key: 'attendance', label: 'Attendance', icon: 'checkmark-circle', route: '/modules/teacher-attendance', moduleFlag: 'attendance' },
  { key: 'timetable',  label: 'Timetable',  icon: 'calendar',         route: '/modules/timetable',   moduleFlag: 'timetable' },
  { key: 'substitutes', label: 'Substitutes', icon: 'repeat',         route: '/modules/my-substitutions', moduleFlag: 'timetable' },
  { key: 'exams',      label: 'Exams',      icon: 'document-text',    route: '/modules/exams',       moduleFlag: 'aptitudeExam' },
  { key: 'results',    label: 'Results',    icon: 'bar-chart',        route: '/modules/results',     moduleFlag: 'result' },
  { key: 'documents',  label: 'Documents',  icon: 'folder',           route: '/modules/documents',   moduleFlag: 'document' },
  { key: 'holidays',   label: 'Holidays',   icon: 'sunny',            route: '/modules/holidays',    moduleFlag: 'holiday' },
  { key: 'leave',      label: 'Leave',      icon: 'airplane',         route: '/modules/leave',       moduleFlag: 'leave' },
  { key: 'payroll',    label: 'Payroll',    icon: 'cash',             route: '/modules/teacher-payroll', moduleFlag: 'payroll' },
  { key: 'library',    label: 'Library',    icon: 'library',          route: '/modules/library',     moduleFlag: 'library' },
  { key: 'manageLib',  label: 'Manage Lib', icon: 'albums',           route: '/modules/library-admin', moduleFlag: 'library', requires: 'isLibrarian' },
  { key: 'inventory',  label: 'Inventory',  icon: 'cube',             route: '/modules/inventory-requests', moduleFlag: 'inventory' },
  { key: 'videos',     label: 'Videos',     icon: 'play-circle',      route: '/modules/teacher-videos', moduleFlag: 'videoLibrary' },
  { key: 'feedback',   label: 'My Feedback',icon: 'star',             route: '/modules/teacher-feedback', moduleFlag: 'feedback' },
  { key: 'fbReview',   label: 'Fb Review',  icon: 'school',           route: '/modules/feedback-review',  moduleFlag: 'feedback', requires: 'isPrincipal' },
  { key: 'chat',       label: 'Chat',       icon: 'chatbubbles',      route: '/modules/chat',        moduleFlag: 'chat' },
  { key: 'alerts',     label: 'Alerts',     icon: 'notifications',    route: '/modules/alerts',      moduleFlag: 'notification' },
  { key: 'profile',    label: 'Profile',    icon: 'person-circle',    route: '/modules/profile' },
];

const ADMIN_MODULES = [
  { key: 'students',   label: 'Students',   icon: 'school',           route: '/modules/admin/students' },
  { key: 'analytics',  label: 'Analytics',  icon: 'compass',          route: '/modules/student-analytics' },
  { key: 'teachers',   label: 'Teachers',   icon: 'people',           route: '/modules/admin/teachers' },
  { key: 'directory',  label: 'Staff',      icon: 'id-card',          route: '/modules/employee-directory', moduleFlag: 'employeeDirectory' },
  { key: 'verify',     label: 'Verify',     icon: 'shield-checkmark', route: '/modules/employee-verification', moduleFlag: 'employeeDirectory' },
  { key: 'admins',     label: 'Admins',     icon: 'shield-checkmark', route: '/modules/admin/admins' },
  { key: 'classes',    label: 'Classes',    icon: 'business',         route: '/modules/admin/classes' },
  { key: 'subjects',   label: 'Subjects',   icon: 'book',             route: '/modules/admin/subjects' },
  { key: 'years',      label: 'Years',      icon: 'calendar-number',  route: '/modules/admin/academic-years' },
  { key: 'attendance', label: 'Attendance', icon: 'checkmark-circle', route: '/modules/admin/attendance',  moduleFlag: 'attendance' },
  { key: 'timetable',  label: 'Timetable',  icon: 'calendar',         route: '/modules/admin/timetable',   moduleFlag: 'timetable' },
  { key: 'exams',      label: 'Aptitude',   icon: 'bulb',             route: '/modules/admin/exams',       moduleFlag: 'aptitudeExam' },
  { key: 'results',    label: 'Results',    icon: 'bar-chart',        route: '/modules/admin/results',     moduleFlag: 'result' },
  { key: 'fees',       label: 'Fees',       icon: 'card',             route: '/modules/admin/fees',        moduleFlag: 'fees' },
  { key: 'payroll',    label: 'Payroll',    icon: 'cash',             route: '/modules/admin/payroll',     moduleFlag: 'payroll' },
  { key: 'library',    label: 'Library',    icon: 'library',          route: '/modules/library-admin',     moduleFlag: 'library' },
  { key: 'inventory',  label: 'Inventory',  icon: 'cube',             route: '/modules/admin/inventory',   moduleFlag: 'inventory' },
  { key: 'transport',  label: 'Transport',  icon: 'bus',              route: '/modules/admin/transport',   moduleFlag: 'transport' },
  { key: 'hostel',     label: 'Hostel',     icon: 'business',         route: '/modules/admin/hostel',      moduleFlag: 'hostel' },
  { key: 'videos',     label: 'Videos',     icon: 'play-circle',      route: '/modules/admin-videos',      moduleFlag: 'videoLibrary' },
  { key: 'feedback',   label: 'Feedback',   icon: 'star',             route: '/modules/admin/feedback',    moduleFlag: 'feedback' },
  { key: 'leave',      label: 'Leave',      icon: 'airplane',         route: '/modules/admin/leave',       moduleFlag: 'leave' },
  { key: 'documents',  label: 'Documents',  icon: 'folder',           route: '/modules/admin/documents',   moduleFlag: 'document' },
  { key: 'holidays',   label: 'Holidays',   icon: 'sunny',            route: '/modules/admin/holidays',    moduleFlag: 'holiday' },
  { key: 'sendAlert',  label: 'Send Alert', icon: 'megaphone',        route: '/modules/send-notification', moduleFlag: 'notification' },
  { key: 'alerts',     label: 'Alerts',     icon: 'notifications',    route: '/modules/alerts',            moduleFlag: 'notification' },
  { key: 'chat',       label: 'Chat',       icon: 'chatbubbles',      route: '/modules/chat',              moduleFlag: 'chat' },
  { key: 'reports',    label: 'Reports',    icon: 'stats-chart',      route: '/modules/admin/reports' },
  { key: 'settings',   label: 'Settings',   icon: 'settings',         route: '/modules/admin/school-settings' },
  { key: 'profile',    label: 'Profile',    icon: 'person-circle',    route: '/modules/profile' },
];

const SUPER_ADMIN_MODULES = [
  { key: 'schools',    label: 'Schools',    icon: 'business',         route: '/modules/super/schools' },
  { key: 'users',      label: 'Users',      icon: 'people',           route: '/modules/super/users' },
  { key: 'permissions',label: 'Permissions',icon: 'key',              route: '/modules/super/permissions' },
  { key: 'logs',       label: 'Logs',       icon: 'list',             route: '/modules/super/logs' },
  { key: 'sendAlert',  label: 'Send Alert', icon: 'megaphone',        route: '/modules/send-notification' },
  { key: 'alerts',     label: 'Alerts',     icon: 'notifications',    route: '/modules/alerts' },
  { key: 'profile',    label: 'Profile',    icon: 'person-circle',    route: '/modules/profile' },
];

const PARENT_MODULES = [
  { key: 'classes',    label: 'My Child',   icon: 'school',           route: '/modules/child-class' },
  { key: 'attendance', label: 'Attendance', icon: 'checkmark-circle', route: '/modules/attendance',  moduleFlag: 'attendance' },
  { key: 'exams',      label: 'Exams',      icon: 'document-text',    route: '/modules/exams',       moduleFlag: 'aptitudeExam' },
  { key: 'results',    label: 'Results',    icon: 'bar-chart',        route: '/modules/results',     moduleFlag: 'result' },
  { key: 'documents',  label: 'Documents',  icon: 'folder',           route: '/modules/documents',   moduleFlag: 'document' },
  { key: 'holidays',   label: 'Holidays',   icon: 'sunny',            route: '/modules/holidays',    moduleFlag: 'holiday' },
  { key: 'fees',       label: 'Fees',       icon: 'card',             route: '/modules/fees',        moduleFlag: 'fees' },
  { key: 'library',    label: 'Library',    icon: 'library',          route: '/modules/library-parent',   moduleFlag: 'library' },
  { key: 'transport',  label: 'Transport',  icon: 'bus',              route: '/modules/transport-parent', moduleFlag: 'transport' },
  { key: 'hostel',     label: 'Hostel',     icon: 'business',         route: '/modules/hostel-parent',    moduleFlag: 'hostel' },
  { key: 'alerts',     label: 'Alerts',     icon: 'notifications',    route: '/modules/alerts',      moduleFlag: 'notification' },
  { key: 'profile',    label: 'Profile',    icon: 'person-circle',    route: '/modules/profile' },
];


// A teacher whose designation grants ADMIN access to a module gets that module's
// admin screens too. library and feedback are absent on purpose — TEACHER_MODULES
// already carries "Manage Lib" and "Fb Review" for them, gated on the same
// permission through isLibrarian / isPrincipal.
const TEACHER_ADMIN_MODULES = [
  { key: 'attendance', label: 'Attendance*', icon: 'checkmark-done', route: '/modules/admin/attendance', adminOf: 'attendance' },
  { key: 'timetable',  label: 'Timetable*',  icon: 'calendar-number', route: '/modules/admin/timetable',  adminOf: 'timetable' },
  { key: 'exams',      label: 'Aptitude*',   icon: 'bulb',            route: '/modules/admin/exams',      adminOf: 'aptitudeExam' },
  { key: 'results',    label: 'Results*',    icon: 'stats-chart',     route: '/modules/admin/results',    adminOf: 'result' },
  { key: 'fees',       label: 'Fees*',       icon: 'card',            route: '/modules/admin/fees',       adminOf: 'fees' },
  { key: 'payroll',    label: 'Payroll*',    icon: 'cash',            route: '/modules/admin/payroll',    adminOf: 'payroll' },
  { key: 'inventory',  label: 'Inventory*',  icon: 'cube',            route: '/modules/admin/inventory',  adminOf: 'inventory' },
  { key: 'transport',  label: 'Transport*',  icon: 'bus',             route: '/modules/admin/transport',  adminOf: 'transport' },
  { key: 'hostel',     label: 'Hostel*',     icon: 'business',        route: '/modules/admin/hostel',     adminOf: 'hostel' },
  { key: 'videos',     label: 'Videos*',     icon: 'film',            route: '/modules/admin-videos',     adminOf: 'videoLibrary' },
  { key: 'leave',      label: 'Leave*',      icon: 'airplane',        route: '/modules/admin/leave',      adminOf: 'leave' },
  { key: 'documents',  label: 'Documents*',  icon: 'folder-open',     route: '/modules/admin/documents',  adminOf: 'document' },
  { key: 'holidays',   label: 'Holidays*',   icon: 'sunny',           route: '/modules/admin/holidays',   adminOf: 'holiday' },
  { key: 'sendAlert',  label: 'Send Alert',  icon: 'megaphone',       route: '/modules/send-notification', adminOf: 'notification' },
];

// Returns only modules that are enabled for the school (or have no flag = always on).
// `requires` gates on extra flags like isLibrarian which must be explicitly true.
function filterModules(
  list: { key: string; label: string; icon: string; route: string; moduleFlag?: string; requires?: string }[],
  schoolModules: Record<string, boolean> | undefined,
) {
  if (!schoolModules) return list.filter(m => !m.requires); // no config = show all except designation-gated
  return list.filter(m =>
    (!m.moduleFlag || schoolModules[m.moduleFlag] === true) &&
    (!m.requires || schoolModules[m.requires] === true));
}

function moduleColor(key: string) {
  const map = Colors.modules as Record<string, { bg: string; icon: string }>;
  return map[key] ?? { bg: '#EDE9FE', icon: '#7C3AED' };
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
function dayLabel() {
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
}
function dateLabel() {
  return new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Shared components ────────────────────────────────────────────────────────

function ModuleGrid({ modules, onPress }: { modules: typeof STUDENT_MODULES; onPress: (r: string) => void }) {
  return (
    <View style={grid.wrap}>
      {modules.map((m) => {
        const { bg, icon } = moduleColor(m.key);
        return (
          <TouchableOpacity key={m.key} style={grid.item} onPress={() => onPress(m.route)} activeOpacity={0.7}>
            <View style={[grid.iconBox, { backgroundColor: bg }]}>
              <Ionicons name={m.icon as any} size={24} color={icon} />
            </View>
            <Text style={grid.label}>{m.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const grid = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  item: { width: '22%', alignItems: 'center', marginBottom: 4 },
  iconBox: {
    width: 56, height: 56, borderRadius: Radius.lg,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  label: { fontSize: 10, fontWeight: '500', color: Colors.textSecondary, textAlign: 'center' },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const money = (n?: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** "09:00" → "9:00 AM". Times are plain HH:MM strings; some seeds carry "010:00". */
function prettyTime(t?: string) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  if (Number.isNaN(h)) return t;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** A UTC-midnight date from the server, read as the local calendar day it means. */
function serverDay(iso: string) {
  const d = new Date(iso);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function relTime(iso?: string) {
  if (!iso) return '';
  const mins = Math.floor(Math.max(0, Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Holidays that have not finished yet, nearest first. */
function upcomingFrom(holidays: any[], limit = 3) {
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  return (holidays || [])
    .filter((x) => x?.startDate)
    .map((x) => ({ ...x, _start: serverDay(x.startDate), _end: serverDay(x.endDate || x.startDate) }))
    .filter((x) => x._end >= midnight)
    .sort((a, b) => +a._start - +b._start)
    .slice(0, limit);
}

function EverythingSection({ modules, onPress, title = 'Quick Access' }: {
  modules: any[]; onPress: (r: string) => void; title?: string;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionRow}>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={s.sectionMeta}>{modules.length} modules</Text>
      </View>
      <ModuleGrid modules={modules} onPress={onPress} />
    </View>
  );
}

// ─── Student content ──────────────────────────────────────────────────────────
//  Reads GET /student/dashboard exactly as the controller returns it:
//  { profile, attendance, attendancePrev, upcomingExams, feeBalance, performance }.

function StudentContent({ data, schoolModules, holidays }: {
  data: any; schoolModules?: Record<string, boolean>; holidays: any[];
}) {
  const router = useRouter();
  const modules = filterModules(STUDENT_MODULES, schoolModules);
  const on = (flag: string) => !schoolModules || schoolModules[flag] === true;

  const att     = data?.attendance;
  const prev    = data?.attendancePrev;
  const exams   = data?.upcomingExams ?? [];
  const balance = data?.feeBalance ?? 0;
  const perf    = data?.performance;
  const delta   = (att?.percentage != null && prev?.percentage != null)
    ? att.percentage - prev.percentage : null;

  const section   = data?.profile?.currentSection;
  const classLine = section
    ? [section.class?.className, section.sectionName].filter(Boolean).join(' — ')
    : '';

  const events = upcomingFrom(holidays);

  return (
    <>
      <CardRow>
        {on('attendance') && (
          <Highlight
            icon="checkmark-circle" tint={BRAND} tintBg={BRAND_SOFT}
            label="Attendance (This Month)"
            value={att?.percentage != null ? `${att.percentage}%` : '—'}
            valueColor={att?.percentage != null ? toneFor(att.percentage) : undefined}
            caption={att ? `${att.present} of ${att.total} classes attended` : 'Nothing marked this month yet'}
            meter={att?.percentage ?? null}
            delta={delta}
            onPress={() => router.push('/modules/attendance' as any)}
            actionLabel="View attendance"
          />
        )}
        {on('aptitudeExam') && (
          <Highlight
            icon="document-text" tint="#7C3AED" tintBg="#F3E8FF"
            label="Upcoming Exams"
            value={String(exams.length)}
            caption={exams.length
              ? exams.map((e: any) => e.title).join(', ')
              : 'Nothing scheduled right now'}
            onPress={() => router.push('/modules/exams' as any)}
            actionLabel="View exams"
          />
        )}
        {on('fees') && (
          <Highlight
            icon="card" tint={balance > 0 ? TONE.warn : TONE.good}
            tintBg={balance > 0 ? '#FEF3C7' : '#DCFCE7'}
            label="Fees Due"
            value={balance > 0 ? money(balance) : '✓ Clear'}
            valueColor={balance > 0 ? TONE.bad : TONE.good}
            caption={balance > 0 ? 'Payable now' : 'Nothing outstanding'}
            onPress={() => router.push('/modules/fees' as any)}
            actionLabel={balance > 0 ? 'Pay now' : 'View receipt'}
            wide={!on('attendance') || !on('aptitudeExam')}
          />
        )}
      </CardRow>

      {!!classLine && (
        <Panel padded={false}>
          <RowLink icon="school" tint={BRAND} tintBg={BRAND_SOFT}
            title={classLine}
            sub={data?.profile?.rollNumber ? `Roll ${data.profile.rollNumber}` : 'My class'}
            onPress={() => router.push('/modules/my-class' as any)} />
        </Panel>
      )}

      <EverythingSection modules={modules} onPress={(r) => router.push(r as any)} />

      {on('result') && (
        <Panel title="Subject Wise Marks" subtitle={perf?.latest?.title}
          actionLabel="Results" onAction={() => router.push('/modules/results' as any)}>
          {perf?.subjects?.length
            ? <LabelledBars rows={perf.subjects.map((x: any) => ({
                key: x.name, label: x.name, value: x.percentage,
                note: `${x.marksObtained} / ${x.maxMarks}${x.grade ? ` · ${x.grade}` : ''}`,
              }))} />
            : <Note icon="book">No subject marks published yet.</Note>}
        </Panel>
      )}

      {events.length > 0 && (
        <Panel title="Upcoming Events" padded={false}>
          {events.map((ev, i) => (
            <React.Fragment key={ev._id ?? i}>
              {i > 0 && <RowSep />}
              <RowLink icon="calendar" tint="#0D9488" tintBg="#CCFBF1"
                title={ev.name}
                sub={ev._start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                onPress={() => router.push('/modules/holidays' as any)} />
            </React.Fragment>
          ))}
        </Panel>
      )}
    </>
  );
}

// ─── Teacher content ──────────────────────────────────────────────────────────
//  Reads GET /teacher/dashboard: { profile, mySection, todayPeriods,
//  substitutions, classPerformance, pending, leaveRemaining }.

function TeacherContent({ data, schoolModules, holidays }: {
  data: any; schoolModules?: Record<string, boolean>; holidays: any[];
}) {
  const router = useRouter();
  const modules = filterModules(TEACHER_MODULES, schoolModules);
  const moduleAdmin = (schoolModules as any)?.moduleAdmin as Record<string, boolean> | undefined;
  const adminModules = moduleAdmin
    ? TEACHER_ADMIN_MODULES.filter((m) => moduleAdmin[m.adminOf] === true)
    : [];
  const on = (flag: string) => !schoolModules || schoolModules[flag] === true;

  const section  = data?.mySection;
  const periods  = data?.todayPeriods ?? [];
  const subs     = data?.substitutions ?? [];
  const pending  = data?.pending ?? {};
  const classes  = data?.classPerformance ?? [];
  const total    = periods.length + subs.length;

  // Own periods and cover duties are one day — sorted together by period number.
  const day = [...periods.map((x: any) => ({ ...x, cover: false })),
               ...subs.map((x: any) => ({ ...x, cover: true }))]
    .sort((a, b) => (a.periodNumber || 0) - (b.periodNumber || 0));

  const attention = [
    on('attendance') && pending.corrections > 0 && {
      key: 'corrections', icon: 'person-circle', tint: '#DB2777', bg: '#FCE7F3',
      title: `${pending.corrections} attendance correction request${pending.corrections === 1 ? '' : 's'}`,
      sub: 'Awaiting your review', route: '/modules/teacher-attendance',
    },
    on('result') && pending.validation > 0 && {
      key: 'validation', icon: 'bar-chart', tint: BRAND, bg: BRAND_SOFT,
      title: `${pending.validation} exam${pending.validation === 1 ? '' : 's'} awaiting marks validation`,
      sub: 'Action required', route: '/modules/results',
    },
  ].filter(Boolean) as any[];

  const events = upcomingFrom(holidays);

  return (
    <>
      <CardRow>
        <Highlight
          icon="time" tint="#D97706" tintBg="#FEF3C7"
          label="Classes Today"
          value={String(total)}
          caption={subs.length
            ? `${periods.length} of your own · ${subs.length} covering`
            : total ? 'On your timetable today' : 'Nothing scheduled today'}
          onPress={() => router.push('/modules/timetable' as any)}
          actionLabel="View timetable"
        />
        {on('leave') && (
          <Highlight
            icon="airplane" tint={TONE.good} tintBg="#DCFCE7"
            label="Leave Balance"
            value={String(data?.leaveRemaining ?? 0)}
            caption={`day${(data?.leaveRemaining ?? 0) === 1 ? '' : 's'} remaining across all types`}
            onPress={() => router.push('/modules/leave' as any)}
            actionLabel="Apply for leave"
          />
        )}
      </CardRow>

      {!!section && (
        <Panel padded={false}>
          <RowLink icon="people" tint={BRAND} tintBg={BRAND_SOFT}
            title={[section.className, section.sectionName].filter(Boolean).join(' — ') || section.sectionName}
            sub={`${section.studentCount} student${section.studentCount === 1 ? '' : 's'} in your care`}
            onPress={() => router.push('/modules/my-section' as any)} />
        </Panel>
      )}

      <Panel title="Today's Classes"
        subtitle={day.length
          ? `${day.length} period${day.length === 1 ? '' : 's'}${subs.length ? ` · ${subs.length} covering` : ''}`
          : undefined}
        actionLabel={on('timetable') ? 'Timetable' : undefined}
        onAction={() => router.push('/modules/timetable' as any)}
        padded={false}>
        {day.length === 0
          ? <Note icon="time">No classes scheduled for today.</Note>
          : day.map((pd, i) => (
            <React.Fragment key={`${pd.cover ? 's' : 'p'}-${pd.periodNumber}-${i}`}>
              {i > 0 && <RowSep />}
              <RowLink
                icon={pd.cover ? 'repeat' : 'book'}
                tint={pd.cover ? '#C2410C' : BRAND}
                tintBg={pd.cover ? '#FFEDD5' : BRAND_SOFT}
                title={`P${pd.periodNumber} · ${pd.subject || 'Class'}${pd.cover ? '  (covering)' : ''}`}
                sub={[[pd.className, pd.section].filter(Boolean).join(' — '),
                      pd.startTime ? `${prettyTime(pd.startTime)}${pd.endTime ? `–${prettyTime(pd.endTime)}` : ''}` : '']
                      .filter(Boolean).join(' · ') || undefined}
              />
            </React.Fragment>
          ))}
      </Panel>

      {attention.length > 0 && (
        <Panel title="Needs your attention" padded={false}>
          {attention.map((a, i) => (
            <React.Fragment key={a.key}>
              {i > 0 && <RowSep />}
              <RowLink icon={a.icon} tint={a.tint} tintBg={a.bg} title={a.title} sub={a.sub}
                onPress={() => router.push(a.route as any)} />
            </React.Fragment>
          ))}
        </Panel>
      )}

      {on('result') && (
        <Panel title="Student Performance"
          subtitle={classes.length
            ? `My classes · ${Math.round(classes.reduce((t: number, c: any) => t + c.percentage, 0) / classes.length)}% average`
            : undefined}
          padded={false}>
          {classes.length
            ? <View style={{ paddingVertical: 10 }}>
                <Columns rows={classes.map((c: any) => ({
                  key: c.sectionId, label: c.className || c.sectionName || 'Class', value: c.percentage,
                }))} />
              </View>
            : <Note icon="bar-chart">No published results yet.</Note>}
        </Panel>
      )}

      <EverythingSection modules={modules} onPress={(r) => router.push(r as any)} />

      {adminModules.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionRow}>
            <Text style={s.sectionTitle}>Module Admin</Text>
            <Text style={s.sectionMeta}>{(schoolModules as any)?.designation || 'your designation'}</Text>
          </View>
          <ModuleGrid modules={adminModules as any} onPress={(r) => router.push(r as any)} />
        </View>
      )}

      {events.length > 0 && (
        <Panel title="Upcoming Events" padded={false}>
          {events.map((ev, i) => (
            <React.Fragment key={ev._id ?? i}>
              {i > 0 && <RowSep />}
              <RowLink icon="calendar" tint="#0D9488" tintBg="#CCFBF1"
                title={ev.name}
                sub={ev._start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                onPress={() => router.push('/modules/holidays' as any)} />
            </React.Fragment>
          ))}
        </Panel>
      )}
    </>
  );
}

// ─── Parent content ───────────────────────────────────────────────────────────
//  Reads GET /parent/dashboard: { parent, children[], child }. `child` carries
//  the selected student's detail block; older builds return summary rows only,
//  so it falls back to the first of `children`.

function ParentContent({ data, schoolModules, holidays, childId, onPickChild }: {
  data: any; schoolModules?: Record<string, boolean>; holidays: any[];
  childId: string; onPickChild: (id: string) => void;
}) {
  const router = useRouter();
  const modules = filterModules(PARENT_MODULES, schoolModules);
  const on = (flag: string) => !schoolModules || schoolModules[flag] === true;

  const children = data?.children ?? [];
  const child = data?.child
    ?? children.find((c: any) => String(c._id) === String(childId))
    ?? children[0]
    ?? null;

  const att = child?.attendance
    ?? (child?.attendancePercentage != null ? { percentage: child.attendancePercentage } : null);
  const prev    = child?.attendancePrev;
  const exams   = child?.upcomingExams ?? [];
  const balance = child?.feeBalance ?? 0;
  const perf    = child?.performance;
  const delta   = (att?.percentage != null && prev?.percentage != null)
    ? att.percentage - prev.percentage : null;

  const events = upcomingFrom(holidays);

  return (
    <>
      {children.length > 1 && (
        <View style={kid.row}>
          {children.map((c: any) => {
            const active = String(c._id) === String(child?._id);
            return (
              <TouchableOpacity key={c._id} style={[kid.btn, active && kid.btnOn]}
                onPress={() => onPickChild(c._id)} activeOpacity={0.75}>
                <View style={[kid.avatar, active && { backgroundColor: BRAND }]}>
                  <Text style={kid.avatarText}>{(c.name ?? '?')[0]?.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={kid.name} numberOfLines={1}>{c.name}</Text>
                  <Text style={kid.sub} numberOfLines={1}>
                    {[c.className, c.sectionName].filter(Boolean).join(' — ') || 'No section'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {!child ? (
        <Panel title="No child linked">
          <Note icon="alert-circle">
            No student is linked to this account yet — your school office can connect one.
          </Note>
        </Panel>
      ) : (
        <>
          <CardRow>
            {on('attendance') && (
              <Highlight
                icon="checkmark-circle" tint={BRAND} tintBg={BRAND_SOFT}
                label="Attendance (This Month)"
                value={att?.percentage != null ? `${att.percentage}%` : '—'}
                valueColor={att?.percentage != null ? toneFor(att.percentage) : undefined}
                caption={att?.total != null
                  ? `${att.present} of ${att.total} days attended`
                  : att ? 'Recorded this month' : 'Nothing marked this month yet'}
                meter={att?.percentage ?? null}
                delta={delta}
                onPress={() => router.push('/modules/attendance' as any)}
                actionLabel="View attendance"
              />
            )}
            {on('aptitudeExam') && (
              <Highlight
                icon="document-text" tint="#7C3AED" tintBg="#F3E8FF"
                label="Upcoming Exams"
                value={String(exams.length)}
                caption={exams.length ? exams.map((e: any) => e.title).join(', ') : 'Nothing scheduled right now'}
                onPress={() => router.push('/modules/exams' as any)}
                actionLabel="View exams"
              />
            )}
            {on('fees') && (
              <Highlight
                icon="card" tint={balance > 0 ? TONE.warn : TONE.good}
                tintBg={balance > 0 ? '#FEF3C7' : '#DCFCE7'}
                label="Fees Due"
                value={balance > 0 ? money(balance) : '✓ Clear'}
                valueColor={balance > 0 ? TONE.bad : TONE.good}
                caption={balance > 0 ? 'Payable now' : 'Nothing outstanding'}
                onPress={() => router.push('/modules/fees' as any)}
                actionLabel={balance > 0 ? 'Pay now' : 'View receipt'}
                wide={!on('attendance') || !on('aptitudeExam')}
              />
            )}
          </CardRow>

          <EverythingSection modules={modules} onPress={(r) => router.push(r as any)} />

          {on('result') && (
            <Panel title="Subject Wise Marks" subtitle={perf?.latest?.title}
              actionLabel="Results" onAction={() => router.push('/modules/results' as any)}>
              {perf?.subjects?.length
                ? <LabelledBars rows={perf.subjects.map((x: any) => ({
                    key: x.name, label: x.name, value: x.percentage,
                    note: `${x.marksObtained} / ${x.maxMarks}${x.grade ? ` · ${x.grade}` : ''}`,
                  }))} />
                : <Note icon="book">No subject marks published yet.</Note>}
            </Panel>
          )}
        </>
      )}

      {events.length > 0 && (
        <Panel title="Upcoming Events" padded={false}>
          {events.map((ev, i) => (
            <React.Fragment key={ev._id ?? i}>
              {i > 0 && <RowSep />}
              <RowLink icon="calendar" tint="#0D9488" tintBg="#CCFBF1"
                title={ev.name}
                sub={ev._start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                onPress={() => router.push('/modules/holidays' as any)} />
            </React.Fragment>
          ))}
        </Panel>
      )}
    </>
  );
}

const kid = StyleSheet.create({
  row: { gap: 8, marginBottom: Spacing.md },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: Colors.surface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, padding: 8, paddingRight: 16,
  },
  btnOn: { borderColor: BRAND, backgroundColor: '#F5F3FF' },
  avatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.textLight,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  name: { fontSize: 13, fontWeight: '700', color: Colors.text },
  sub:  { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
});

// ─── Admin content ────────────────────────────────────────────────────────────
//  Reads GET /admin/dashboard: { teachers, students, parents, sections, pending,
//  recentNotifications, academicYear, growth, attendance{trend,today} }.

function AdminContent({ data, schoolModules, holidays }: {
  data: any; schoolModules?: Record<string, boolean>; holidays: any[];
}) {
  const router = useRouter();
  const modules = filterModules(ADMIN_MODULES, schoolModules);
  const pending = data?.pending ?? {};
  const growth  = data?.growth;
  const today   = data?.attendance?.today;
  const notices = data?.recentNotifications ?? [];

  const pendingItems = [
    { key: 'regularizations', one: 'attendance regularization', many: 'attendance regularizations',
      count: pending.regularizations,
      route: '/modules/admin/attendance', flag: 'attendance', icon: 'person-circle', tint: '#DB2777', bg: '#FCE7F3' },
    { key: 'leaves', one: 'leave request', many: 'leave requests', count: pending.leaves,
      route: '/modules/admin/leave', flag: 'leave', icon: 'airplane', tint: '#D97706', bg: '#FEF3C7' },
    { key: 'examsToPublish', one: 'result to publish', many: 'results to publish',
      count: pending.examsToPublish,
      route: '/modules/admin/results', flag: 'result', icon: 'bar-chart', tint: BRAND, bg: BRAND_SOFT },
    { key: 'payments', one: 'fee payment to verify', many: 'fee payments to verify', count: pending.payments,
      route: '/modules/admin/fees-payments', flag: 'fees', icon: 'card', tint: '#0284C7', bg: '#E0F2FE' },
  ].filter((x) => x.count > 0 && (!schoolModules || schoolModules[x.flag] === true));
  const pendingTotal = pendingItems.reduce((t, x) => t + x.count, 0);

  const events = upcomingFrom(holidays);

  return (
    <>
      <CardRow>
        <Highlight icon="people" tint={BRAND} tintBg={BRAND_SOFT}
          label="Teachers" value={data?.teachers != null ? String(data.teachers) : '—'}
          caption="Active teachers" delta={growth?.teachers ?? null} deltaSuffix="this month" deltaUnit=""
          onPress={() => router.push('/modules/admin/teachers' as any)} actionLabel="Manage" />
        <Highlight icon="school" tint={TONE.good} tintBg="#DCFCE7"
          label="Students" value={data?.students != null ? String(data.students) : '—'}
          caption="Enrolled students" delta={growth?.students ?? null} deltaSuffix="this month" deltaUnit=""
          onPress={() => router.push('/modules/admin/students' as any)} actionLabel="Manage" />
        <Highlight icon="people-circle" tint="#D97706" tintBg="#FEF3C7"
          label="Parents" value={data?.parents != null ? String(data.parents) : '—'}
          caption="Registered parents" delta={growth?.parents ?? null} deltaSuffix="this month" deltaUnit="" />
        <Highlight icon="business" tint="#7C3AED" tintBg="#F3E8FF"
          label="Sections" value={data?.sections != null ? String(data.sections) : '—'}
          caption="Total sections" delta={growth?.sections ?? null} deltaSuffix="this month" deltaUnit=""
          onPress={() => router.push('/modules/admin/classes' as any)} actionLabel="Manage" />
      </CardRow>

      {(!schoolModules || schoolModules.attendance === true) && (
        <Panel title="Attendance Overview"
          subtitle={today?.marked ? "Today, across every section" : undefined}
          actionLabel="Open" onAction={() => router.push('/modules/admin/attendance' as any)}>
          {today?.marked ? (
            <View style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
              <Text style={ad.big}>{today.percentage}%</Text>
              <Text style={ad.bigSub}>present today</Text>
              <MeterBar value={today.percentage} height={8} color={toneFor(today.percentage)} />
              <View style={ad.legend}>
                <Text style={ad.legendItem}>
                  <Text style={{ color: TONE.good, fontWeight: '700' }}>{today.present + (today.late || 0)}</Text> present
                </Text>
                <Text style={ad.legendItem}>
                  <Text style={{ color: TONE.bad, fontWeight: '700' }}>{today.absent}</Text> absent
                </Text>
                <Text style={ad.legendItem}>
                  <Text style={{ fontWeight: '700', color: Colors.text }}>{today.total}</Text> marked
                </Text>
              </View>
            </View>
          ) : (
            <Note icon="checkmark-circle">No attendance marked today yet.</Note>
          )}
        </Panel>
      )}

      <Panel title="Needs your attention"
        actionLabel={pendingTotal > 0 ? `${pendingTotal} pending` : undefined}
        padded={false}>
        {pendingItems.length === 0
          ? <Note>Nothing is waiting on you right now.</Note>
          : pendingItems.map((x, i) => (
            <React.Fragment key={x.key}>
              {i > 0 && <RowSep />}
              <RowLink icon={x.icon} tint={x.tint} tintBg={x.bg}
                title={`${x.count} ${x.count === 1 ? x.one : x.many}`} sub="Tap to review"
                onPress={() => router.push(x.route as any)} />
            </React.Fragment>
          ))}
      </Panel>

      <EverythingSection modules={modules} onPress={(r) => router.push(r as any)} />

      {events.length > 0 && (
        <Panel title="Upcoming Events" padded={false}>
          {events.map((ev, i) => (
            <React.Fragment key={ev._id ?? i}>
              {i > 0 && <RowSep />}
              <RowLink icon="calendar" tint="#0D9488" tintBg="#CCFBF1"
                title={ev.name}
                sub={ev._start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                onPress={() => router.push('/modules/admin/holidays' as any)} />
            </React.Fragment>
          ))}
        </Panel>
      )}

      {notices.length > 0 && (
        <Panel title="Announcements" actionLabel="View all"
          onAction={() => router.push('/modules/alerts' as any)} padded={false}>
          {notices.slice(0, 4).map((n: any, i: number) => (
            <React.Fragment key={n._id ?? i}>
              {i > 0 && <RowSep />}
              <RowLink icon="megaphone" tint={BRAND} tintBg={BRAND_SOFT}
                title={n.title}
                sub={`${n.recipientCount ?? 0} recipient${n.recipientCount === 1 ? '' : 's'} · ${relTime(n.createdAt)}`} />
            </React.Fragment>
          ))}
        </Panel>
      )}
    </>
  );
}

const ad = StyleSheet.create({
  big:    { fontSize: 30, fontWeight: '700', color: Colors.text, letterSpacing: -1 },
  bigSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  legendItem: { fontSize: 11, color: Colors.textSecondary },
});

// ─── Super admin content ──────────────────────────────────────────────────────

function SuperAdminContent({ data }: { data: any }) {
  const router = useRouter();
  const roles = data?.roles ?? {};
  return (
    <>
      <CardRow>
        <Highlight icon="business" tint={BRAND} tintBg={BRAND_SOFT}
          label="Schools" value={data?.schoolCount != null ? String(data.schoolCount) : '—'}
          caption="On the platform"
          onPress={() => router.push('/modules/super/schools' as any)} actionLabel="Manage" />
        <Highlight icon="people" tint={TONE.good} tintBg="#DCFCE7"
          label="Users" value={data?.userCount != null ? String(data.userCount) : '—'}
          caption="Across every school"
          onPress={() => router.push('/modules/super/users' as any)} actionLabel="Manage" />
        <Highlight icon="school" tint="#D97706" tintBg="#FEF3C7"
          label="Students" value={roles.students != null ? String(roles.students) : '—'}
          caption="Enrolled overall" wide />
      </CardRow>

      <EverythingSection modules={SUPER_ADMIN_MODULES as any} onPress={(r) => router.push(r as any)} />

      {Array.isArray(data?.recentSchools) && data.recentSchools.length > 0 && (
        <Panel title="Recent schools" padded={false}>
          {data.recentSchools.map((sc: any, i: number) => (
            <React.Fragment key={sc._id}>
              {i > 0 && <RowSep />}
              <RowLink icon="business" tint={BRAND} tintBg={BRAND_SOFT}
                title={sc.name}
                sub={`${sc.code ?? ''}${sc.isActive === false ? ' · inactive' : ''}`.trim() || undefined}
                onPress={() => router.push({ pathname: '/modules/super/school-form', params: { id: sc._id } } as any)} />
            </React.Fragment>
          ))}
        </Panel>
      )}
    </>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { user, reload } = useAuth();
  const { modules: fetchedModules } = useModules();
  // Prefer live module flags (includes isLibrarian); fall back to school config from getMe
  const moduleFlags = (fetchedModules ?? user?.school?.modules) as Record<string, boolean> | undefined;
  const [data, setData] = useState<any>(null);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  // Which child a parent is looking at. Empty means "whichever the server picks".
  const [childId, setChildId] = useState('');

  const fetchDashboard = useCallback(async () => {
    if (!user?.role) return; // wait for the user record — role decides which dashboard to call
    try {
      // Refresh user to get latest school.modules state
      await reload().catch(() => {});
      let res: any;
      if (user?.role === 'teacher') res = await teacherApi.getDashboard();
      else if (user?.role === 'parent') res = await parentApi.getDashboard(childId || undefined);
      else if (user?.role === 'admin') res = await adminApi.getDashboard();
      else if (user?.role === 'super-admin') res = await superApi.getDashboard();
      else res = await studentApi.getDashboard();
      setData((res as any)?.data ?? res);
    } catch {
      // show empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.role, childId]);

  // Upcoming events come from the role's own holiday endpoint; a failure here
  // must not cost the rest of the dashboard, so it degrades to no events.
  useEffect(() => {
    if (!user?.role) return;
    const get = user.role === 'teacher' ? teacherApi.getHolidays
      : user.role === 'parent' ? parentApi.getHolidays
      : user.role === 'admin' ? adminApi.getHolidays
      : user.role === 'super-admin' ? null
      : studentApi.getHolidays;
    if (!get) { setHolidays([]); return; }
    (get as any)()
      .then((r: any) => setHolidays((r?.data ?? r ?? []) as any[]))
      .catch(() => setHolidays([]));
  }, [user?.role]);

  useEffect(() => {
    if (!user) return;
    notifApi.getUnreadCount()
      .then((r: any) => setUnreadCount(r?.count ?? 0))
      .catch(() => {});
  }, [user?._id]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const onRefresh = () => { setRefreshing(true); fetchDashboard(); };

  const firstName = user?.name?.split(' ')[0] ?? 'User';
  const yearChip  = data?.academicYear?.yearName ? `${data.academicYear.yearName}` : '';
  const heroLine  = user?.role === 'parent'
    ? (data?.child?.name ? `Here's what's happening with ${data.child.name} today.` : "Here's what's happening today.")
    : user?.role === 'teacher'
      ? (((data?.todayPeriods?.length ?? 0) + (data?.substitutions?.length ?? 0)) > 0
          ? `You have ${(data.todayPeriods?.length ?? 0) + (data.substitutions?.length ?? 0)} classes today.`
          : "Here's what's happening today.")
      : user?.role === 'admin'
        ? `Here's what's happening at ${user?.school?.name ?? 'your school'} today.`
        : "Here's what's happening today.";

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <AppHeader unreadCount={unreadCount} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Greeting */}
        <Hero
          title={`${greeting()}, ${firstName}!`}
          subtitle={heroLine}
          chips={[{ icon: 'calendar-outline', text: `${dayLabel()} · ${dateLabel()}` },
                  ...(yearChip ? [{ icon: 'school-outline', text: yearChip }] : [])]}
        />

        {loading ? (
          <View style={s.loader}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : user?.role === 'teacher' ? (
          <TeacherContent data={data} schoolModules={moduleFlags} holidays={holidays} />
        ) : user?.role === 'parent' ? (
          <ParentContent data={data} schoolModules={moduleFlags} holidays={holidays}
            childId={childId} onPickChild={setChildId} />
        ) : user?.role === 'admin' ? (
          <AdminContent data={data} schoolModules={moduleFlags} holidays={holidays} />
        ) : user?.role === 'super-admin' ? (
          <SuperAdminContent data={data} />
        ) : (
          <StudentContent data={data} schoolModules={moduleFlags} holidays={holidays} />
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.md },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: Spacing.md,
  },
  dateText: { fontSize: 11, color: Colors.textSecondary, marginBottom: 2 },
  greeting: { fontSize: 22, fontWeight: '700', color: Colors.text },
  iconBtn: {
    width: 38, height: 38, borderRadius: Radius.md,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  badge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3, borderWidth: 1.5, borderColor: Colors.background,
  },
  badgeText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  row: { flexDirection: 'row', marginBottom: Spacing.md },
  section: { marginBottom: Spacing.lg },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: Colors.text },
  sectionMeta: { fontSize: 11, color: Colors.textSecondary },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
});
