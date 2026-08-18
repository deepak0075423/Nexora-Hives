import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet, Alert, Linking,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as dirApi from '@/api/employeeDirectory.api';
import { BASE_URL } from '@/api/axios';
import {
  unwrap, LoaderView, Empty, Badge, KV, SegTabs, Card, SectionTitle, RowItem,
  StatTile, StatRow, fmtDate, ActionBtn,
} from '@/components/ui/kit';
import { Avatar } from './employee-directory';

// One employee, assembled from the modules the school already runs. The tabs
// shown are decided by the payload: a block the caller has no permission for is
// absent from the response, so there is nothing on this screen to hide.

const UPLOADS_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');
const fileUrl = (p?: string) => (!p ? '' : /^https?:/.test(p) ? p : `${UPLOADS_ORIGIN}${p}`);

const STATUS_TONE: Record<string, any> = { active: 'success', on_leave: 'warning', inactive: 'neutral' };
const STATUS_LABEL: Record<string, string> = { active: 'Active', on_leave: 'On Leave', inactive: 'Inactive' };
const VERIFY_TONE: Record<string, any> = { verified: 'success', pending: 'warning', rejected: 'danger' };

const addr = (a: any) => (!a ? '' : [a.line, a.city, a.state, a.pincode, a.country].filter(Boolean).join(', '));
const dash = (v: any) => (v === '' || v == null ? '--' : String(v));

export default function EmployeeDirectoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Sub-resources are fetched only when their tab is opened.
  const [timetable, setTimetable] = useState<any>(null);
  const [attendance, setAttendance] = useState<any>(null);
  const [leave, setLeave] = useState<any>(null);
  const [subError, setSubError] = useState('');
  // Values unmasked by an explicit, audited action.
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!id) { setLoading(false); setError('No employee selected'); return; }
    try {
      setData(unwrap(await dirApi.getEmployee(String(id))));
      setError('');
    } catch (e: any) { setError(e?.message || 'Could not load this employee'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Timetable / attendance / leave are fetched the first time their tab is
  // opened, and cached until the screen is pulled to refresh. The setters are
  // read through a ref-free switch so this effect depends only on the tab.
  useEffect(() => {
    let alive = true;
    if (!id) return;
    const run = async (fetcher: () => Promise<any>, set: (v: any) => void, cached: any) => {
      if (cached) return;
      setSubError('');
      try { const r = await fetcher(); if (alive) set(unwrap(r)); }
      catch (e: any) { if (alive) setSubError(e?.message || 'Could not load this section'); }
    };
    if (tab === 'timetable')  run(() => dirApi.getTimetable(String(id)),  setTimetable,  timetable);
    if (tab === 'attendance') run(() => dirApi.getAttendance(String(id)), setAttendance, attendance);
    if (tab === 'leave')      run(() => dirApi.getLeave(String(id)),      setLeave,      leave);
    return () => { alive = false; };
    // The cached values are read, not tracked: re-running on their arrival
    // would only hit the `cached` guard and bounce straight back out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id]);

  // Memoised so the tab list below is not rebuilt on every render.
  const modules = useMemo(() => data?.modules ?? {}, [data]);
  const vis     = useMemo(() => data?.visibility ?? {}, [data]);
  const viewer  = data?.viewer ?? {};

  // A teacher looking a colleague up gets everything the payload carries on one
  // screen — there is only one page of information behind the tabs, and the
  // restricted blocks were never sent. Their own record, and any record an
  // administrator opens, keeps the full tabbed profile.
  const compact = !!data && !viewer.isAdmin && !viewer.isSelf;

  const tabs = useMemo(() => ([
    { key: 'overview',    label: 'Overview',   show: true },
    { key: 'personal',    label: 'Personal',   show: true },
    { key: 'contact',     label: 'Contact',    show: true },
    { key: 'employment',  label: 'Employment', show: true },
    { key: 'education',   label: 'Education',  show: true },
    { key: 'classes',     label: 'Subjects',   show: true },
    { key: 'responsibilities', label: 'Roles', show: true },
    { key: 'timetable',   label: 'Timetable',  show: !!modules.timetable },
    { key: 'attendance',  label: 'Attendance', show: !!modules.attendance && !!vis.attendance },
    { key: 'leave',       label: 'Leave',      show: !!modules.leave && !!vis.leave },
    { key: 'documents',   label: 'Documents',  show: !!vis.documents },
    { key: 'govtIds',     label: 'Govt IDs',   show: !!vis.governmentId },
    { key: 'bank',        label: 'Bank',       show: !!vis.bank || !!vis.payroll },
    { key: 'verification', label: 'Verify',    show: true },
  ].filter(t => t.show).map(({ key, label }) => ({ key, label }))), [modules, vis]);

  const reveal = async (field: string, label: string) => {
    try {
      const res: any = unwrap(await dirApi.revealField(String(id), field));
      setRevealed(r => ({ ...r, [field]: res.value }));
      Alert.alert(label, `${res.value}\n\nThis has been recorded in the audit log.`);
    } catch (e: any) {
      Alert.alert('Not permitted', e?.message || 'You cannot reveal this value.');
    }
  };

  if (loading) return (<><Stack.Screen options={{ title: 'Employee' }} /><LoaderView /></>);
  if (error || !data?.overview) {
    return (
      <>
        <Stack.Screen options={{ title: 'Employee' }} />
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <Empty icon="alert-circle-outline" text={error || 'Employee not found'} />
          <TouchableOpacity style={st.retry} onPress={() => { setLoading(true); load(); }}>
            <Text style={st.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  const o = data.overview;
  const comp = data.profileCompletion;

  const RevealRow = ({ label, masked, field, allowed }: { label: string; masked?: string; field: string; allowed: boolean }) => (
    <View style={st.revealRow}>
      <Text style={st.revealLabel}>{label}</Text>
      <Text style={st.revealValue}>{revealed[field] ?? (masked || '--')}</Text>
      {!!masked && allowed && !revealed[field] && (
        <TouchableOpacity style={st.revealBtn} onPress={() => reveal(field, label)}>
          <Ionicons name="eye-outline" size={14} color={Colors.primary} />
          <Text style={st.revealBtnText}>Reveal</Text>
        </TouchableOpacity>
      )}
      {!!revealed[field] && <Badge label="Logged" tone="warning" />}
    </View>
  );

  const Locked = ({ what }: { what: string }) => (
    <Empty icon="lock-closed-outline" text={`You do not have permission to view ${what}. Access comes from your designation's module permissions.`} />
  );

  if (compact) {
    const assignments = data.subjectsClasses?.assignments || [];
    const teaches = assignments.filter((a: any) => a.role === 'subject_teacher');
    return (
      <>
        <Stack.Screen options={{ title: o.name || 'Employee' }} />
        <ScrollView
          style={{ flex: 1, backgroundColor: Colors.background }}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          <View style={st.header}>
            <Avatar name={o.name} src={fileUrl(o.profileImage)} size={62} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.name} numberOfLines={2}>{o.name}</Text>
              <Text style={st.sub} numberOfLines={2}>
                {[o.designation, o.department].filter(Boolean).join(' · ') || 'No designation recorded'}
              </Text>
              {(o.classTeacherOf || []).length > 0 && (
                <View style={{ flexDirection: 'row', marginTop: 6 }}>
                  <Badge label={`Class Teacher · ${o.classTeacherOf.join(', ')}`} tone="info" />
                </View>
              )}
            </View>
          </View>

          <View style={st.actions}>
            <ActionBtn label="Email" tone="neutral" small onPress={() => Linking.openURL(`mailto:${o.officialEmail}`)} />
            {!!o.officialPhone && (
              <ActionBtn label="Call" tone="neutral" small
                onPress={() => Linking.openURL(`tel:${String(o.officialPhone).replace(/\s/g, '')}`)} />
            )}
            {!!modules.chat && <ActionBtn label="Chat" tone="info" small onPress={() => router.push('/modules/chat')} />}
          </View>

          <Card>
            <KV label="Employee ID" value={dash(o.employeeId)} />
            <KV label="Designation" value={dash(o.designation)} />
            <KV label="Department" value={dash(o.department)} />
            <KV label="Official Email" value={dash(o.officialEmail)} />
            <KV label="Official Phone" value={dash(o.officialPhone)} />
            <KV label="Qualification"
              value={dash((data.education?.qualifications || []).map((q: any) => q.qualification).join(', '))} />
            <KV label="Subjects" value={dash((o.subjects || []).join(', '))} />
            <KV label="Classes" value={dash((o.classes || []).map((c: any) => c.label).join(', '))} />
            <KV label="Responsibilities"
              value={dash((data.responsibilities || []).map((r: any) => r.label).join(', '))} />
          </Card>

          {teaches.length > 0 && (
            <>
              <SectionTitle>Teaches</SectionTitle>
              <Card>
                {teaches.map((a: any, i: number) => (
                  <RowItem key={i} title={a.subject}
                    sub={[a.className, a.sectionName].filter(Boolean).join(' ')} icon="book" />
                ))}
              </Card>
            </>
          )}

          <Text style={st.note}>
            🔒 Personal, contact, document and payroll details are visible only to the employee and to administrators.
          </Text>
        </ScrollView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: o.name || 'Employee' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setTimetable(null); setAttendance(null); setLeave(null); load(); }} />}
      >
        {/* Identity */}
        <View style={st.header}>
          <Avatar name={o.name} src={fileUrl(o.profileImage)} size={62} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.name} numberOfLines={2}>{o.name}</Text>
            <Text style={st.sub} numberOfLines={2}>
              {[o.employeeId, o.designation, o.department].filter(Boolean).join(' · ') || 'Employee'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <Badge label={STATUS_LABEL[o.employmentStatus]} tone={STATUS_TONE[o.employmentStatus]} />
              {viewer.isSelf && <Badge label="This is you" tone="info" />}
            </View>
          </View>
        </View>

        <View style={st.actions}>
          <ActionBtn label="Email" tone="neutral" small onPress={() => Linking.openURL(`mailto:${o.officialEmail}`)} />
          {!!o.officialPhone && <ActionBtn label="Call" tone="neutral" small onPress={() => Linking.openURL(`tel:${String(o.officialPhone).replace(/\s/g, '')}`)} />}
          {!!modules.chat && !viewer.isSelf && <ActionBtn label="Chat" tone="info" small onPress={() => router.push('/modules/chat')} />}
        </View>

        {!!comp && (
          <Card style={{ marginBottom: Spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={st.metaLabel}>Profile completion</Text>
              <Text style={st.metaStrong}>{comp.percent}%</Text>
            </View>
            <View style={st.bar}><View style={[st.barFill, { width: `${comp.percent}%` }]} /></View>
            {comp.missing?.length > 0 && (
              <Text style={st.missing} numberOfLines={3}>
                Missing: {comp.missing.slice(0, 6).map((m: any) => m.label).join(', ')}
                {comp.missing.length > 6 ? ` +${comp.missing.length - 6} more` : ''}
              </Text>
            )}
          </Card>
        )}

        <SegTabs tabs={tabs} active={tab} onChange={setTab} />

        {tab === 'overview' && (
          <Card>
            <KV label="Employee ID" value={dash(o.employeeId)} />
            <KV label="Teacher ID" value={dash(o.teacherId || o.employeeId)} />
            <KV label="Designation" value={dash(o.designation)} />
            <KV label="Department" value={dash(o.department)} />
            <KV label="Employee Type" value={o.staffType === 'teaching' ? 'Teaching' : 'Non-Teaching'} />
            <KV label="Status" value={<Badge label={STATUS_LABEL[o.employmentStatus]} tone={STATUS_TONE[o.employmentStatus]} />} />
            <KV label="Joined" value={fmtDate(o.joiningDate)} />
            <KV label="Official Email" value={dash(o.officialEmail)} />
            <KV label="Official Mobile" value={dash(o.officialPhone)} />
            <KV label="Subjects" value={dash((o.subjects || []).join(', '))} />
            <KV label="Classes" value={dash((o.classes || []).map((c: any) => c.label).join(', '))} />
            <KV label="Class Teacher of" value={dash((o.classTeacherOf || []).join(', '))} />
            <KV label="Reporting Manager" value={dash(o.reportingManager?.name)} />
          </Card>
        )}

        {tab === 'personal' && (vis.personal ? (
          <Card>
            <KV label="Full Name" value={dash(data.personal?.fullName)} />
            <KV label="Date of Birth" value={fmtDate(data.personal?.dob)} />
            <KV label="Gender" value={dash(data.personal?.gender)} />
            <KV label="Blood Group" value={dash(data.personal?.bloodGroup)} />
            <KV label="Father's / Husband's Name" value={dash(data.personal?.fatherOrHusbandName)} />
            <KV label="Emergency Contact" value={dash(data.personal?.emergencyContactName)} />
            <KV label="Emergency Phone" value={dash(data.personal?.emergencyContactPhone)} />
          </Card>
        ) : <Locked what="personal information" />)}

        {tab === 'contact' && (vis.contact ? (
          <Card>
            <KV label="Mobile Number" value={dash(data.contact?.phone)} />
            <KV label="Secondary Phone" value={dash(data.contact?.alternatePhone)} />
            <KV label="Email" value={dash(data.contact?.email)} />
            <KV label="Current Address" value={dash(addr(data.contact?.currentAddress))} />
            <KV label="Permanent Address" value={dash(addr(data.contact?.permanentAddress))} />
            <KV label="Emergency Contact" value={dash([data.contact?.emergencyContact?.name, data.contact?.emergencyContact?.phone].filter(Boolean).join(' · '))} />
          </Card>
        ) : (
          <Card>
            <KV label="Official Email" value={dash(o.officialEmail)} />
            <KV label="Official Mobile" value={dash(o.officialPhone)} />
            <Text style={st.note}>🔒 Home address, personal numbers and emergency contacts are restricted to administrators and the employee themselves.</Text>
          </Card>
        ))}

        {tab === 'employment' && (
          <Card>
            <KV label="Employee ID" value={dash(data.employment?.employeeId)} />
            <KV label="Joined" value={fmtDate(data.employment?.joiningDate)} />
            <KV label="Designation" value={dash(data.employment?.designation)} />
            <KV label="Department" value={dash(data.employment?.department)} />
            <KV label="Employee Type" value={data.employment?.staffType === 'teaching' ? 'Teaching' : 'Non-Teaching'} />
            <KV label="Status" value={STATUS_LABEL[data.employment?.employmentStatus] || '--'} />
            {data.employment?.employmentType !== undefined && (
              <KV label="Fresher / Experienced" value={dash(data.employment.employmentType === 'fresher' ? 'Fresher' : data.employment.employmentType ? 'Experienced' : '')} />
            )}
            {data.employment?.totalExperience !== undefined && <KV label="Total Experience" value={dash(data.employment.totalExperience)} />}
            {data.employment?.previousSchool !== undefined && <KV label="Previous School" value={dash(data.employment.previousSchool)} />}
            {data.employment?.lastDesignation !== undefined && <KV label="Previous Designation" value={dash(data.employment.lastDesignation)} />}
            <KV label="Reporting Manager" value={dash(data.employment?.reportingManager?.name)} />
            <KV label="Campus / Branch" value="Not configured in this ERP" />
          </Card>
        )}

        {tab === 'education' && (
          (data.education?.qualifications || []).length === 0
            ? <Empty icon="school-outline" text="No qualification on file" />
            : (data.education.qualifications).map((q: any, i: number) => (
              <Card key={i} style={{ marginBottom: Spacing.sm }}>
                <SectionTitle>{q.qualification}</SectionTitle>
                <KV label="Type" value={q.kind === 'teaching_degree' ? 'Teaching degree' : 'Highest qualification'} />
                <KV label="Specialization" value={dash(q.specialization)} />
                <KV label="Institution" value={dash(q.institution)} />
                <KV label="Passing Year" value={dash(q.passingYear)} />
                <KV label="Grade" value={dash(q.grade)} />
                <KV label="Verification" value={<Badge label={q.verificationStatus} tone={VERIFY_TONE[q.verificationStatus]} />} />
              </Card>
            ))
        )}

        {tab === 'classes' && (
          (data.subjectsClasses?.assignments || []).length === 0
            ? <Empty icon="library-outline" text="No academic assignments in the current year" />
            : (
              <Card>
                {data.subjectsClasses.assignments.map((a: any, i: number) => (
                  <RowItem
                    key={i}
                    title={a.subject || a.roleLabel}
                    sub={[a.roleLabel, [a.className, a.sectionName].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
                    icon={a.role === 'class_teacher' ? 'ribbon' : 'book'}
                  />
                ))}
              </Card>
            )
        )}

        {tab === 'responsibilities' && (
          (data.responsibilities || []).length === 0
            ? <Empty icon="medal-outline" text="No additional responsibilities. Class Teacher and Vice Class Teacher appear under Subjects." />
            : (
              <Card>
                {data.responsibilities.map((r: any) => (
                  <RowItem
                    key={r._id}
                    title={r.label}
                    sub={[r.department, r.className, r.sectionName, r.subjectName].filter(Boolean).join(' · ') || 'School-wide'}
                    icon="medal"
                  />
                ))}
              </Card>
            )
        )}

        {tab === 'timetable' && (
          subError ? <Empty icon="cloud-offline-outline" text={subError} />
            : !timetable ? <LoaderView />
              : (
                <>
                  <SectionTitle>Today — {timetable.today?.day || '--'}</SectionTitle>
                  {(timetable.today?.periods || []).length === 0
                    ? <Empty icon="calendar-outline" text="Nothing scheduled today" />
                    : (
                      <Card style={{ marginBottom: Spacing.md }}>
                        {timetable.today.periods.map((p: any) => (
                          <RowItem key={p.periodNumber} title={`P${p.periodNumber}  ${p.subject || '--'}`}
                            sub={[[p.className, p.sectionName].filter(Boolean).join(' '), p.room].filter(Boolean).join(' · ')}
                            icon="time" />
                        ))}
                      </Card>
                    )}
                  <SectionTitle>This week — {timetable.totalPeriodsPerWeek || 0} periods</SectionTitle>
                  {(timetable.days || []).map((d: string) => (
                    <Card key={d} style={{ marginBottom: Spacing.sm }}>
                      <Text style={st.day}>{d}</Text>
                      {(timetable.week?.[d] || []).length === 0
                        ? <Text style={st.note}>No periods</Text>
                        : timetable.week[d].map((p: any) => (
                          <Text key={p.periodNumber} style={st.period}>
                            P{p.periodNumber} · {p.subject || '--'} · {[p.className, p.sectionName].filter(Boolean).join(' ')}{p.room ? ` · ${p.room}` : ''}
                          </Text>
                        ))}
                      {(timetable.freePeriods?.[d] || []).length > 0 && (
                        <Text style={st.note}>Free: {timetable.freePeriods[d].map((n: number) => `P${n}`).join(', ')}</Text>
                      )}
                    </Card>
                  ))}
                </>
              )
        )}

        {tab === 'attendance' && (
          !vis.attendance ? <Locked what="attendance" />
            : subError ? <Empty icon="cloud-offline-outline" text={subError} />
              : !attendance ? <LoaderView />
                : (
                  <>
                    <StatRow>
                      <StatTile label="Attendance" value={attendance.percent == null ? '--' : `${attendance.percent}%`} icon="stats-chart" tone="info" />
                      <StatTile label="Present" value={attendance.present} icon="checkmark-circle" tone="success" />
                      <StatTile label="Absent" value={attendance.absent} icon="close-circle" tone="danger" />
                    </StatRow>
                    <StatRow>
                      <StatTile label="Half Day" value={attendance.halfDay} icon="contrast" tone="warning" />
                      <StatTile label="Leave" value={attendance.leave} icon="airplane" tone="neutral" />
                      <StatTile label="Marked" value={attendance.marked} icon="calendar" tone="info" />
                    </StatRow>
                    <Text style={st.note}>Summary only — the full register lives in the Attendance module.</Text>
                  </>
                )
        )}

        {tab === 'leave' && (
          !vis.leave ? <Locked what="leave" />
            : subError ? <Empty icon="cloud-offline-outline" text={subError} />
              : !leave ? <LoaderView />
                : (
                  <>
                    <StatRow>
                      <StatTile label="Days Taken" value={leave.taken} icon="airplane" tone="info" />
                      <StatTile label="Pending" value={leave.pendingRequests} icon="hourglass" tone="warning" />
                      <StatTile label="Approved" value={leave.approvedRequests} icon="checkmark-done" tone="success" />
                    </StatRow>
                    {(leave.balances || []).length === 0
                      ? <Empty icon="airplane-outline" text="No leave balances allocated" />
                      : (
                        <Card>
                          {leave.balances.map((b: any, i: number) => (
                            <KV key={i} label={b.leaveType} value={`${b.remaining} left · ${b.used} used`} />
                          ))}
                        </Card>
                      )}
                    {(leave.upcoming || []).length > 0 && (
                      <>
                        <SectionTitle>Upcoming</SectionTitle>
                        <Card>
                          {leave.upcoming.map((l: any, i: number) => (
                            <KV key={i} label={l.leaveType} value={`${fmtDate(l.fromDate)} → ${fmtDate(l.toDate)} · ${l.totalDays}d`} />
                          ))}
                        </Card>
                      </>
                    )}
                    <Text style={st.note}>Summary only — applications live in the Leave module.</Text>
                  </>
                )
        )}

        {tab === 'documents' && (
          !vis.documents ? <Locked what="employee documents" />
            : (data.documents || []).length === 0
              ? <Empty icon="document-outline" text="No documents on file" />
              : (
                <Card>
                  {data.documents.map((d: any) => (
                    <RowItem
                      key={d.key}
                      title={d.label}
                      sub={`${d.category} · ${d.verificationStatus}${d.verifiedBy ? ` by ${d.verifiedBy}` : ''}`}
                      icon={d.sensitive ? 'shield' : 'document-text'}
                      right={<Badge label={d.verificationStatus} tone={VERIFY_TONE[d.verificationStatus]} />}
                      onPress={d.url ? () => Linking.openURL(fileUrl(d.url)) : undefined}
                    />
                  ))}
                </Card>
              )
        )}

        {tab === 'govtIds' && (
          !vis.governmentId ? <Locked what="government ID information" />
            : (
              <Card>
                <Text style={st.note}>Values are masked. Revealing one is recorded in the audit log.</Text>
                <RevealRow label="Aadhaar Number" masked={data.governmentIds?.aadhaarNumber} field="aadhaarNumber" allowed={!!viewer.canReveal} />
                <RevealRow label="PAN Number" masked={data.governmentIds?.panNumber} field="panNumber" allowed={!!viewer.canReveal} />
                <RevealRow label="UAN / PF Number" masked={data.governmentIds?.uanNumber} field="uanNumber" allowed={!!viewer.canReveal} />
                <KV label="Verification" value={<Badge label={data.governmentIds?.verificationStatus} tone={VERIFY_TONE[data.governmentIds?.verificationStatus]} />} />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: Spacing.sm, flexWrap: 'wrap' }}>
                  {!!data.governmentIds?.aadhaarFront && <ActionBtn label="Aadhaar Front" small tone="neutral" onPress={() => Linking.openURL(fileUrl(data.governmentIds.aadhaarFront))} />}
                  {!!data.governmentIds?.aadhaarBack && <ActionBtn label="Aadhaar Back" small tone="neutral" onPress={() => Linking.openURL(fileUrl(data.governmentIds.aadhaarBack))} />}
                  {!!data.governmentIds?.panDocument && <ActionBtn label="PAN Card" small tone="neutral" onPress={() => Linking.openURL(fileUrl(data.governmentIds.panDocument))} />}
                </View>
              </Card>
            )
        )}

        {tab === 'bank' && (
          <>
            {data.bank ? (
              <Card style={{ marginBottom: Spacing.md }}>
                <SectionTitle>Bank</SectionTitle>
                <KV label="Account Holder" value={dash(data.bank.accountHolder)} />
                <RevealRow label="Account Number" masked={data.bank.accountNumber} field="bankAccountNumber"
                  allowed={!!viewer.canReveal && !!viewer.canViewPayroll} />
                <KV label="IFSC" value={dash(data.bank.ifsc)} />
                <KV label="Branch" value={dash(data.bank.branch)} />
                <KV label="Verification" value={<Badge label={data.bank.verificationStatus} tone={VERIFY_TONE[data.bank.verificationStatus]} />} />
              </Card>
            ) : <Locked what="bank details" />}
            {vis.payroll && (
              <Card>
                <SectionTitle>Payroll</SectionTitle>
                {data.payroll ? (
                  <>
                    <KV label="Annual CTC" value={`₹ ${Number(data.payroll.annualCtc || 0).toLocaleString('en-IN')}`} />
                    <KV label="Effective From" value={fmtDate(data.payroll.effectiveDate)} />
                    <KV label="Revisions" value={String(data.payroll.revisions)} />
                  </>
                ) : <Text style={st.note}>No active salary assignment in the Payroll module.</Text>}
              </Card>
            )}
          </>
        )}

        {tab === 'verification' && (
          <Card>
            {(data.verification || []).map((v: any) => (
              <RowItem
                key={v.section}
                title={v.label}
                sub={v.verifiedBy ? `by ${v.verifiedBy} · ${fmtDate(v.verifiedAt)}` : 'Not verified yet'}
                icon="shield-checkmark"
                right={<Badge label={v.status} tone={VERIFY_TONE[v.status]} />}
              />
            ))}
            {!viewer.isAdmin && <Text style={st.note}>Verification is signed off by your school administrator.</Text>}
          </Card>
        )}
      </ScrollView>
    </>
  );
}

const st = StyleSheet.create({
  header: {
    flexDirection: 'row', gap: Spacing.md, alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm,
  },
  name: { fontSize: 17, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 3 },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, flexWrap: 'wrap' },
  metaLabel: { fontSize: 12.5, color: Colors.textSecondary },
  metaStrong: { fontSize: 13, fontWeight: '700', color: Colors.text },
  bar: { height: 8, borderRadius: 999, backgroundColor: Colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: Colors.success, borderRadius: 999 },
  missing: { fontSize: 11.5, color: Colors.warning, marginTop: 8 },
  note: { fontSize: 11.5, color: Colors.textLight, marginTop: 8, lineHeight: 16 },
  day: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  period: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  revealRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap',
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  revealLabel: { fontSize: 12.5, color: Colors.textSecondary, flex: 1, minWidth: 110 },
  revealValue: { fontSize: 13, fontWeight: '700', color: Colors.text, letterSpacing: 1 },
  revealBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
  },
  revealBtnText: { fontSize: 11.5, color: Colors.primary, fontWeight: '600' },
  retry: {
    alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
  },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
