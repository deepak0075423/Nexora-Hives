import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as studentApi from '@/api/student.api';
import * as teacherApi from '@/api/teacher.api';
import * as parentApi from '@/api/parent.api';
import * as adminApi from '@/api/admin.api';
import * as superApi from '@/api/superadmin.api';
import * as notifApi from '@/api/notifications.api';
import { useModules } from '@/hooks/useModules';
import AppHeader from '@/components/AppHeader';

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
  { key: 'videos',     label: 'Videos',     icon: 'play-circle',      route: '/modules/videos',      moduleFlag: 'videoLibrary' },
  { key: 'chat',       label: 'Chat',       icon: 'chatbubbles',      route: '/modules/chat',        moduleFlag: 'chat' },
  { key: 'alerts',     label: 'Alerts',     icon: 'notifications',    route: '/modules/alerts',      moduleFlag: 'notification' },
  { key: 'profile',    label: 'Profile',    icon: 'person-circle',    route: '/modules/profile' },
];

const TEACHER_MODULES = [
  { key: 'section',    label: 'My Sections', icon: 'people',          route: '/modules/my-section' },
  { key: 'attendance', label: 'Attendance', icon: 'checkmark-circle', route: '/modules/teacher-attendance', moduleFlag: 'attendance' },
  { key: 'timetable',  label: 'Timetable',  icon: 'calendar',         route: '/modules/timetable',   moduleFlag: 'timetable' },
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
  { key: 'chat',       label: 'Chat',       icon: 'chatbubbles',      route: '/modules/chat',        moduleFlag: 'chat' },
  { key: 'alerts',     label: 'Alerts',     icon: 'notifications',    route: '/modules/alerts',      moduleFlag: 'notification' },
  { key: 'profile',    label: 'Profile',    icon: 'person-circle',    route: '/modules/profile' },
];

const ADMIN_MODULES = [
  { key: 'students',   label: 'Students',   icon: 'school',           route: '/modules/admin/students' },
  { key: 'teachers',   label: 'Teachers',   icon: 'people',           route: '/modules/admin/teachers' },
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
  { key: 'videos',     label: 'Videos',     icon: 'play-circle',      route: '/modules/admin-videos',      moduleFlag: 'videoLibrary' },
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
  { key: 'transport',  label: 'Transport',  icon: 'bus',              route: '/modules/transport-parent', moduleFlag: 'transport' },
  { key: 'alerts',     label: 'Alerts',     icon: 'notifications',    route: '/modules/alerts',      moduleFlag: 'notification' },
  { key: 'profile',    label: 'Profile',    icon: 'person-circle',    route: '/modules/profile' },
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

function StatCard({ icon, iconColor, iconBg, label, value, sub, subColor }: {
  icon: string; iconColor: string; iconBg: string;
  label: string; value: string; sub?: string; subColor?: string;
}) {
  return (
    <View style={sc.card}>
      <View style={[sc.iconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={14} color={iconColor} />
      </View>
      <Text style={sc.label}>{label}</Text>
      <Text style={sc.value}>{value}</Text>
      {sub ? <Text style={[sc.sub, subColor ? { color: subColor } : null]}>{sub}</Text> : null}
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: 12, borderWidth: 1, borderColor: Colors.border,
  },
  iconBox: {
    width: 26, height: 26, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  label: { fontSize: 9, fontWeight: '600', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  value: { fontSize: 18, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 10, color: Colors.success, fontWeight: '500', marginTop: 2 },
});

// ─── Student content ──────────────────────────────────────────────────────────

function StudentContent({ data, schoolModules }: { data: any; schoolModules?: Record<string, boolean> }) {
  const router = useRouter();
  const modules = filterModules(STUDENT_MODULES, schoolModules);
  const liveClass = data?.liveClass;
  const attendance = data?.attendance;
  const avgScore = data?.avgScore;
  const fees = data?.fees;
  const drops: any[] = data?.recentActivity ?? [];

  // A module flag is "enabled" when: no schoolModules config (show all), or the flag is explicitly true
  const isEnabled = (flag: string) => !schoolModules || schoolModules[flag] === true;

  // Build only the stats whose module is enabled
  type StatDef = { key: string; el: React.ReactElement };
  const visibleStats: StatDef[] = [];
  if (isEnabled('attendance')) visibleStats.push({
    key: 'attendance',
    el: <StatCard icon="checkmark-circle" iconColor={Colors.success} iconBg={Colors.successLight}
          label="Attendance"
          value={attendance?.percentage != null ? `${attendance.percentage}%` : '--'}
          sub={attendance?.weekChange ? `+${attendance.weekChange} this wk` : undefined}
          subColor={Colors.success} />,
  });
  if (isEnabled('result')) visibleStats.push({
    key: 'result',
    el: <StatCard icon="star" iconColor="#D97706" iconBg="#FEF3C7"
          label="Avg Score"
          value={avgScore?.score != null ? String(avgScore.score) : '--'}
          sub={avgScore?.grade} />,
  });
  if (isEnabled('fees')) visibleStats.push({
    key: 'fees',
    el: <StatCard icon="card" iconColor={Colors.danger} iconBg={Colors.dangerLight}
          label="Fees Due"
          value={fees?.daysLeft != null ? `${fees.daysLeft}d` : '--'}
          sub={fees?.amount ? `₹${fees.amount.toLocaleString('en-IN')}` : undefined}
          subColor={Colors.danger} />,
  });

  return (
    <>
      {/* Live Class Banner */}
      <View style={bn.card}>
        <View style={bn.topRow}>
          <View style={bn.livePill}>
            <View style={bn.dot} />
            <Text style={bn.liveText}>Live now</Text>
          </View>
          {liveClass?.timeLeft != null && (
            <View>
              <Text style={bn.timer}>{liveClass.timeLeft}</Text>
              <Text style={bn.timerSub}>MIN LEFT</Text>
            </View>
          )}
        </View>
        <Text style={bn.subject}>{liveClass?.subject ?? 'No live class right now'}</Text>
        {liveClass?.chapter ? (
          <Text style={bn.detail}>
            {liveClass.chapter}{liveClass.room ? `  ·  Room ${liveClass.room}` : ''}
          </Text>
        ) : null}
        {liveClass && (
          <TouchableOpacity style={bn.joinBtn} onPress={() => router.push('/modules/my-class' as any)}>
            <Text style={bn.joinText}>Join class</Text>
            <Ionicons name="arrow-forward" size={14} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Stats — only renders cards whose module is enabled by super admin */}
      {visibleStats.length > 0 && (
        <View style={s.row}>
          {visibleStats.map((item, i) => (
            <React.Fragment key={item.key}>
              {i > 0 && <View style={{ width: 8 }} />}
              {item.el}
            </React.Fragment>
          ))}
        </View>
      )}

      {/* Modules */}
      <View style={s.section}>
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Everything</Text>
          <Text style={s.sectionMeta}>{modules.length} modules</Text>
        </View>
        <ModuleGrid modules={modules} onPress={(r) => router.push(r as any)} />
      </View>

      {/* Today's Drop */}
      {drops.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Today's drop</Text>
          {drops.map((item, i) => (
            <View key={i} style={dr.card}>
              <View style={dr.iconBox}>
                <Ionicons name="megaphone" size={18} color={Colors.accent} />
              </View>
              <View style={dr.body}>
                <Text style={dr.title}>{item.title}</Text>
                {item.sub && <Text style={dr.sub}>{item.sub}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
            </View>
          ))}
        </View>
      )}
    </>
  );
}

const bn = StyleSheet.create({
  card: {
    backgroundColor: Colors.primary, borderRadius: Radius.xl,
    padding: Spacing.md, marginBottom: Spacing.md,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF6B6B' },
  liveText: { fontSize: 11, color: '#fff', fontWeight: '600' },
  timer: { fontSize: 28, fontWeight: '700', color: Colors.accent, textAlign: 'right' },
  timerSub: { fontSize: 9, color: 'rgba(255,255,255,0.6)', letterSpacing: 1, textAlign: 'right' },
  subject: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 4 },
  detail: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 14 },
  joinBtn: {
    alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  joinText: { fontSize: 12, color: '#fff', fontWeight: '600' },
});

const dr = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: Spacing.sm + 4, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  iconBox: {
    width: 38, height: 38, borderRadius: Radius.md,
    backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  body: { flex: 1 },
  title: { ...Typography.label, color: Colors.text, marginBottom: 2 },
  sub: { fontSize: 11, color: Colors.textSecondary },
});

// ─── Teacher content ──────────────────────────────────────────────────────────

function TeacherContent({ data, schoolModules }: { data: any; schoolModules?: Record<string, boolean> }) {
  const router = useRouter();
  const modules = filterModules(TEACHER_MODULES, schoolModules);
  return (
    <>
      <View style={s.row}>
        <StatCard icon="people" iconColor={Colors.info} iconBg={Colors.infoLight}
          label="Students" value={data?.totalStudents != null ? String(data.totalStudents) : '--'} />
        <View style={{ width: 8 }} />
        <StatCard icon="calendar" iconColor={Colors.success} iconBg={Colors.successLight}
          label="Today" value={data?.todayClasses != null ? String(data.todayClasses) : '--'} sub="classes" />
        <View style={{ width: 8 }} />
        <StatCard icon="time" iconColor={Colors.warning} iconBg={Colors.warningLight}
          label="Pending" value={data?.pendingApprovals != null ? String(data.pendingApprovals) : '--'} />
      </View>
      <View style={s.section}>
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Everything</Text>
          <Text style={s.sectionMeta}>{modules.length} modules</Text>
        </View>
        <ModuleGrid modules={modules} onPress={(r) => router.push(r as any)} />
      </View>
    </>
  );
}

// ─── Parent content ───────────────────────────────────────────────────────────

function ParentContent({ data, schoolModules }: { data: any; schoolModules?: Record<string, boolean> }) {
  const router = useRouter();
  const child = data?.child;
  const modules = filterModules(PARENT_MODULES, schoolModules);
  return (
    <>
      {child && (
        <View style={pc.card}>
          <View style={pc.avatar}>
            <Text style={pc.avatarText}>{child.name?.[0] ?? 'C'}</Text>
          </View>
          <View>
            <Text style={pc.name}>{child.name}</Text>
            <Text style={pc.cls}>{child.className}{child.section ? ` · ${child.section}` : ''}</Text>
          </View>
        </View>
      )}
      <View style={s.row}>
        <StatCard icon="checkmark-circle" iconColor={Colors.success} iconBg={Colors.successLight}
          label="Attendance" value={data?.attendance?.percentage != null ? `${data.attendance.percentage}%` : '--'} />
        <View style={{ width: 8 }} />
        <StatCard icon="card" iconColor={Colors.danger} iconBg={Colors.dangerLight}
          label="Fees Due"
          value={data?.fees?.daysLeft != null ? `${data.fees.daysLeft}d` : '--'}
          sub={data?.fees?.amount ? `₹${data.fees.amount.toLocaleString('en-IN')}` : undefined}
          subColor={Colors.danger}
        />
      </View>
      <View style={s.section}>
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Everything</Text>
          <Text style={s.sectionMeta}>{modules.length} modules</Text>
        </View>
        <ModuleGrid modules={modules} onPress={(r) => router.push(r as any)} />
      </View>
    </>
  );
}

const pc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary,
    borderRadius: Radius.xl, padding: Spacing.md, marginBottom: Spacing.md, gap: 14,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '700', color: '#fff' },
  name: { fontSize: 16, fontWeight: '700', color: '#fff' },
  cls: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
});

// ─── Admin content ────────────────────────────────────────────────────────────

function AdminContent({ data, schoolModules }: { data: any; schoolModules?: Record<string, boolean> }) {
  const router = useRouter();
  const modules = filterModules(ADMIN_MODULES, schoolModules);
  const pending = data?.pending ?? {};
  const pendingItems = [
    { label: 'Leave requests',    count: pending.leaves,          route: '/modules/admin/leave',      flag: 'leave' },
    { label: 'Fee payments',      count: pending.payments,        route: '/modules/admin/fees-payments', flag: 'fees' },
    { label: 'Results to publish',count: pending.examsToPublish,  route: '/modules/admin/results',    flag: 'result' },
    { label: 'Regularizations',   count: pending.regularizations, route: '/modules/admin/attendance', flag: 'attendance' },
  ].filter(p => p.count > 0 && (!schoolModules || schoolModules[p.flag] === true));

  return (
    <>
      <View style={s.row}>
        <StatCard icon="people" iconColor={Colors.info} iconBg={Colors.infoLight}
          label="Teachers" value={data?.teachers != null ? String(data.teachers) : '--'} />
        <View style={{ width: 8 }} />
        <StatCard icon="school" iconColor={Colors.success} iconBg={Colors.successLight}
          label="Students" value={data?.students != null ? String(data.students) : '--'} />
        <View style={{ width: 8 }} />
        <StatCard icon="business" iconColor={Colors.warning} iconBg={Colors.warningLight}
          label="Sections" value={data?.sections != null ? String(data.sections) : '--'} />
      </View>

      {pendingItems.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Needs attention</Text>
          {pendingItems.map((p) => (
            <TouchableOpacity key={p.label} style={dr.card} onPress={() => router.push(p.route as any)} activeOpacity={0.7}>
              <View style={[dr.iconBox, { backgroundColor: Colors.warningLight }]}>
                <Ionicons name="alert-circle" size={18} color={Colors.warning} />
              </View>
              <View style={dr.body}>
                <Text style={dr.title}>{p.label}</Text>
                <Text style={dr.sub}>{p.count} pending</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={s.section}>
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Everything</Text>
          <Text style={s.sectionMeta}>{modules.length} modules</Text>
        </View>
        <ModuleGrid modules={modules} onPress={(r) => router.push(r as any)} />
      </View>
    </>
  );
}

// ─── Super admin content ──────────────────────────────────────────────────────

function SuperAdminContent({ data }: { data: any }) {
  const router = useRouter();
  const roles = data?.roles ?? {};
  return (
    <>
      <View style={s.row}>
        <StatCard icon="business" iconColor={Colors.info} iconBg={Colors.infoLight}
          label="Schools" value={data?.schoolCount != null ? String(data.schoolCount) : '--'} />
        <View style={{ width: 8 }} />
        <StatCard icon="people" iconColor={Colors.success} iconBg={Colors.successLight}
          label="Users" value={data?.userCount != null ? String(data.userCount) : '--'} />
        <View style={{ width: 8 }} />
        <StatCard icon="school" iconColor={Colors.warning} iconBg={Colors.warningLight}
          label="Students" value={roles.students != null ? String(roles.students) : '--'} />
      </View>

      <View style={s.section}>
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Everything</Text>
          <Text style={s.sectionMeta}>{SUPER_ADMIN_MODULES.length} modules</Text>
        </View>
        <ModuleGrid modules={SUPER_ADMIN_MODULES as any} onPress={(r) => router.push(r as any)} />
      </View>

      {Array.isArray(data?.recentSchools) && data.recentSchools.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Recent schools</Text>
          {data.recentSchools.map((sc: any) => (
            <TouchableOpacity key={sc._id} style={dr.card}
              onPress={() => router.push({ pathname: '/modules/super/school-form', params: { id: sc._id } } as any)}
              activeOpacity={0.7}>
              <View style={dr.iconBox}>
                <Ionicons name="business" size={18} color={Colors.accent} />
              </View>
              <View style={dr.body}>
                <Text style={dr.title}>{sc.name}</Text>
                <Text style={dr.sub}>{sc.code ?? ''}{sc.isActive === false ? ' · inactive' : ''}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { user, reload } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { modules: fetchedModules } = useModules();
  // Prefer live module flags (includes isLibrarian); fall back to school config from getMe
  const moduleFlags = (fetchedModules ?? user?.school?.modules) as Record<string, boolean> | undefined;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchDashboard = useCallback(async () => {
    if (!user?.role) return; // wait for the user record — role decides which dashboard to call
    try {
      // Refresh user to get latest school.modules state
      await reload().catch(() => {});
      let res: any;
      if (user?.role === 'teacher') res = await teacherApi.getDashboard();
      else if (user?.role === 'parent') res = await parentApi.getDashboard();
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
        <View style={s.topBar}>
          <View>
            <Text style={s.dateText}>{dayLabel()} · {dateLabel()}</Text>
            <Text style={s.greeting}>Hey, {firstName}</Text>
          </View>
        </View>

        {loading ? (
          <View style={s.loader}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : user?.role === 'teacher' ? (
          <TeacherContent data={data} schoolModules={moduleFlags} />
        ) : user?.role === 'parent' ? (
          <ParentContent data={data} schoolModules={moduleFlags} />
        ) : user?.role === 'admin' ? (
          <AdminContent data={data} schoolModules={moduleFlags} />
        ) : user?.role === 'super-admin' ? (
          <SuperAdminContent data={data} />
        ) : (
          <StudentContent data={data} schoolModules={moduleFlags} />
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
