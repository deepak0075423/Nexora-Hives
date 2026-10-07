/**
 * One exam, for the office, on the phone (Oct 2026) — the web drawer's views
 * at phone width (GET /admin/results/exams/:id):
 *
 *   Overview   where it stands and what it waits for; the steps it may take
 *              now (`can`, from the server); the switches that take effect at
 *              once — the portal, the overall result, the rank, the notice, the
 *              timetable; the promotion, with decisions made by hand; results
 *              withheld from families
 *   Marks      each subject's sheet — entered or corrected by the office, or
 *              sent back to its teacher on its own
 *   Results    once published: the rank list; a mark corrected in place; a
 *              result withheld (or released), with the reason the family reads
 *   Activity   who did what, newest first
 *
 * Withdrawing published results, rejecting marks and reopening an exam each
 * ask for the reason the teachers read — the phone used to send a fixed one —
 * and withdrawing or reopening asks which subjects need correcting, so the
 * others stay as submitted.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { TextInput } from '@/components/ui/TextInput';
import { Stack, useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '@/constants/theme';
import * as R from '@/api/results.api';
import { Empty, LoaderView, SegTabs, Toggle, FormModal, Select, unwrap } from '@/components/ui/kit';
import { Pill, GradePill, PassPill, pct, fmtDay, fmtRange, classLine, plural } from '@/components/results/parts';
import { statusOf, ATTENTION, AskSheet, Ask, Figs, say, os } from '@/components/results/office';
import { saveAndShare } from '@/components/payroll/parts';

const FLOW = [['draft', 'Draft'], ['marks', 'Mark Entry'], ['validation', 'Validation'], ['published', 'Published']];
const SHEET: Record<string, { label: string; fg: string; bg: string }> = {
  NOT_STARTED: { label: 'Not started', fg: Colors.textSecondary, bg: Colors.surfaceAlt },
  DRAFT: { label: 'In progress', fg: Colors.warning, bg: Colors.warningLight },
  SUBMITTED: { label: 'Submitted', fg: Colors.success, bg: Colors.successLight },
};
/** The switches: [option, label, what it means now]. */
const LIVE: [string, string, (e: any, on: boolean) => string][] = [
  ['showInPortal', 'Show in the student portal', (e, on) => (on ? 'Students and parents see the results' : 'Hidden from students and parents')],
  ['includeInOverall', 'Include in the overall result', (e, on) => (on ? 'Counted in the year’s overall result' : 'Not counted')],
  ['showRank', 'Show the rank on the scorecard', (e, on) => (on ? 'Families see the student’s place' : 'Marks and grades, no rank')],
  ['notifyOnPublish', 'Notify on publishing', (e, on) => (e.options?.showInPortal === false ? 'Nobody is told while the exam is off the portal' : on ? 'Families get a notice when results are out' : 'Published without a notice')],
  ['timetableShared', 'Share the timetable with families', (e, on) => (on ? 'Families see the exam dates' : 'Kept from families until shared')],
];
const OUTCOME: Record<string, string> = {
  stay: 'Did not pass', noResult: 'No result', wait: 'Waiting', final: 'Passes out', passedOut: 'Passed out', skip: 'Not moved',
  promote: 'Moves up', promoted: 'Moved up', done: 'Moved up', repeat: 'Repeats the class', repeated: 'Repeats the class',
};

export default function ResultExamScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [exam, setExam] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState('');
  const [ask, setAsk] = useState<Ask | null>(null);
  const [flash, setFlash] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<any>(null);
  const [deciding, setDeciding] = useState(false);

  const load = useCallback(async () => {
    try {
      const e = unwrap(await R.office.exam(String(id)));
      setExam(e);
      if (e?.can?.results) setResults(await R.office.results(String(id)));
      else setResults(null);
      setError('');
    } catch (err: any) { setError(err?.message || 'The exam could not be loaded'); }
    finally { setRefreshing(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  // Back from a marks sheet or the re-exam: their saves show here.
  const seen = useRef(false);
  useFocusEffect(useCallback(() => { if (seen.current) load(); else seen.current = true; }, [load]));

  const done = (message: string) => { setAsk(null); if (message) setFlash(message); load(); };

  if (error && !exam) return (<><Stack.Screen options={{ title: 'Exam' }} /><Empty icon="alert-circle-outline" text={error} /></>);
  if (!exam) return (<><Stack.Screen options={{ title: 'Exam' }} /><LoaderView /></>);

  const can = exam.can || {};
  const st = statusOf(exam.status);
  const at = FLOW.findIndex(([k]) => k === exam.stage);
  const published = exam.status === 'FINAL_APPROVED';
  const opts = exam.options || {};
  const where = `${exam.title} (${classLine(exam)})`;
  const subjectChoices = (exam.subjects || []).map((x: any) => ({
    value: String(x.subject._id), label: x.subject.subjectName, note: x.sheet.status === 'SUBMITTED' ? '' : 'not submitted',
  }));

  /* ── steps ── */
  const step = (name: string) => {
    const S: Record<string, Ask> = {
      open: {
        title: 'Open Mark Entry', confirm: 'Open',
        lines: ['Subject teachers are told and can start entering marks.', 'The subjects and their maximum marks are fixed from here on.'],
        run: () => R.office.step(exam._id, 'open'), done: () => 'Mark entry is open — the teachers have been told',
      },
      draft: {
        title: 'Back to Draft', confirm: 'Move to Draft',
        lines: ['Mark entry closes and the exam is a draft again. No marks have been entered, so nothing is lost.'],
        run: () => R.office.step(exam._id, 'draft'), done: () => 'Moved back to draft',
      },
      validate: {
        title: 'Validate Marks', confirm: 'Validate',
        lines: [exam.hasClassTeacher ? `${exam.classTeacher || 'The class teacher'} would normally do this.` : 'This section has no class teacher, so only the office can.', 'Once validated, the results are ready to publish.'],
        run: () => R.office.step(exam._id, 'validate'), done: () => 'Marks validated — ready to publish',
      },
      approve: {
        title: 'Publish Results', confirm: 'Publish',
        lines: [
          'Every student’s total, percentage, grade and rank is worked out from the validated marks.',
          opts.showInPortal === false ? 'The exam is kept off the student portal: families will not see these results, and nobody is told.'
            : exam.releaseAhead ? `Families see them from ${fmtDay(exam.publishDate)}, the result date${opts.notifyOnPublish === false ? '' : ', and are told then'}.`
              : opts.notifyOnPublish === false ? 'Families can see them straight away. No notice is sent.' : 'Families are told and can see them straight away.',
          ...(exam.withheldCount ? [`${plural(exam.withheldCount, 'student')}’s results stay withheld.`] : []),
          ...(opts.promoteOnPass ? [`Students who pass move up${opts.promoteSection === 'none' ? ', without a section' : ', into the same section'}.`,
            opts.failedPlacement === 'repeat' ? 'Students who do not pass are placed to repeat the class next year.' : 'Students who do not pass stay where they are.'] : []),
        ],
        run: () => R.office.step(exam._id, 'approve'),
        done: (res: any) => `Results published for ${plural(res?.results ?? exam.roster, 'student')}${res?.promotion?.promoted ? ` — ${plural(res.promotion.promoted, 'student')} promoted` : ''}`,
      },
      reject: {
        title: 'Reject Marks', confirm: 'Reject', danger: true,
        lines: ['The exam stays rejected until it is reopened for the teachers to correct.'],
        reason: { label: 'What is wrong with the marks', required: true, placeholder: 'The teachers will see this' },
        run: (reason) => R.office.step(exam._id, 'reject', { reason }), done: () => 'Marks rejected',
      },
      reopen: published ? {
        title: 'Withdraw Published Results', confirm: 'Withdraw', danger: true,
        lines: [
          `Families stop seeing the results of ${where} at once${exam.resultsVisible ? ', and are told they are being corrected' : ''}.`,
          ...(exam.promotion && ['done', 'waiting'].includes(exam.promotion.state) ? ['The students this exam promoted go back to their class — unless moved again since.'] : []),
          'Mark entry reopens for the subjects ticked; the others stay as submitted. For one wrong mark, “Correct a mark” under Results changes it in place instead.',
        ],
        choices: { label: 'Which subjects need correcting?', options: subjectChoices, none: 'None ticked: every subject reopens.' },
        reason: { label: 'Why', required: true, placeholder: 'The teachers will see this' },
        run: (reason, subjects) => R.office.step(exam._id, 'reopen', { reason, subjects }), done: () => 'Results withdrawn — mark entry is open again',
      } : {
        title: 'Reopen for Correction', confirm: 'Reopen',
        lines: ['The ticked subjects’ sheets go back to draft, with the marks kept; their teachers are told.', ...(exam.rejectionReason ? [`Rejected because: “${exam.rejectionReason}”`] : [])],
        choices: { label: 'Which subjects need correcting?', options: subjectChoices, none: 'None ticked: every subject reopens.' },
        reason: { label: 'Note for the teachers', placeholder: 'Optional' },
        run: (reason, subjects) => R.office.step(exam._id, 'reopen', { reason, subjects }), done: () => 'Reopened — the teachers have been told',
      },
      archive: {
        title: 'Archive Exam', confirm: 'Archive',
        lines: ['It leaves the working tabs and every teacher’s queue, and can be restored at any time.', published ? 'Its published results stay visible to families.' : 'Restored, it is back at the step it had reached.'],
        run: () => R.office.step(exam._id, 'archive'), done: () => 'Exam archived',
      },
      restore: {
        title: 'Restore Exam', confirm: 'Restore', lines: ['It returns to the step it had reached.'],
        run: () => R.office.step(exam._id, 'restore'), done: () => 'Exam restored',
      },
      delete: {
        title: 'Delete Draft', confirm: 'Delete', danger: true, lines: [`Delete the draft ${where}? This cannot be undone.`],
        run: async () => { await R.office.remove(exam._id); router.back(); }, done: () => '',
      },
    };
    setAsk(S[name]);
  };

  const setOption = async (key: string, on: boolean) => {
    setSaving(key);
    try {
      await R.office.options(exam._id, { [key]: on });
      setExam((e: any) => (key === 'timetableShared' ? { ...e, timetableShared: on } : { ...e, options: { ...e.options, [key]: on } }));
    } catch (err: any) { say('Not changed', err?.message || 'The setting could not be changed'); }
    finally { setSaving(''); }
  };

  const sendBack = (x: any) => setAsk({
    title: published ? `Withdraw for ${x.subject.subjectName}` : `Send ${x.subject.subjectName} back`, confirm: published ? 'Withdraw' : 'Send Back', danger: published,
    lines: [
      'Only this subject’s sheet goes back to draft; the other subjects stay as submitted.',
      ...(published ? ['Families stop seeing the results until they are published again.'] : []),
      `${x.teachers?.length ? x.teachers.map((t: any) => t.name).join(', ') : 'Its teacher'} ${x.teachers?.length === 1 ? 'is' : 'are'} told.`,
    ],
    reason: { label: 'What is wrong', required: true, placeholder: 'The subject teacher reads this' },
    run: (reason) => R.office.returnSubject(exam._id, { subjectId: String(x.subject._id), reason }),
    done: () => (published ? 'Withdrawn for correction' : `${x.subject.subjectName} sent back`),
  });

  const withhold = async (only?: string) => {
    const rows = results?.data || [];
    const held = new Set((exam.withheld || []).map((w: any) => String(w.student)));
    let dues: Map<string, number> = new Map();
    try { dues = new Map(((await R.office.feeDues(exam._id)) as any)?.data?.map((x: any) => [String(x.student), x.due]) || []); } catch { /* none */ }
    const options = rows.filter((r: any) => !held.has(String(r.student._id)))
      .map((r: any) => ({ value: String(r.student._id), label: r.student.name, note: dues.has(String(r.student._id)) ? `owes ₹${Number(dues.get(String(r.student._id))).toLocaleString('en-IN')}` : (r.student.rollNumber ? `Roll ${r.student.rollNumber}` : '') }));
    setAsk({
      title: 'Withhold Results', confirm: 'Withhold',
      lines: ['The students and their parents see that the result is withheld, and why — not the marks. Nothing about the result itself changes.',
        ...(dues.size ? [`Students with an unpaid fee balance are ticked (${dues.size}).`] : [])],
      choices: { label: 'Whose results', options, ticked: only ? [only] : [...dues.keys()].filter((k) => options.some((o2: any) => o2.value === k)) },
      reason: { label: 'Reason the family reads', required: true, placeholder: 'e.g. Fees due — please contact the office' },
      run: (reason, students) => {
        if (!students.length) throw new Error('Tick at least one student');
        return R.office.withheld(exam._id, { students, withhold: true, reason });
      },
      done: (res: any) => `${plural(unwrap(res)?.changed ?? 0, 'result')} withheld`,
    });
  };
  const release = (only?: string) => {
    const held = exam.withheld || [];
    setAsk({
      title: 'Release Withheld Results', confirm: 'Release',
      lines: ['These families see the results again, and are told.'],
      choices: { label: 'Whose results', options: held.map((w: any) => ({ value: String(w.student), label: w.name, note: w.reason })), ticked: only ? [only] : held.map((w: any) => String(w.student)) },
      run: (_r, students) => {
        if (!students.length) throw new Error('Tick at least one student');
        return R.office.withheld(exam._id, { students, withhold: false });
      },
      done: (res: any) => `${plural(unwrap(res)?.changed ?? 0, 'result')} released`,
    });
  };

  const p = exam.promotion;
  const pstats = p ? (p.state === 'scheduled' || !p.state ? p.preview : p.stats) : null;
  const rows = results?.data || [];

  return (
    <>
      <Stack.Screen options={{ title: exam.title || 'Exam' }} />
      <ScrollView style={os.screen} contentContainerStyle={os.body} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        <View style={os.card}>
          <View style={os.rowTop}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={os.title}>{exam.title}</Text>
              <Text style={os.sub}>{[classLine(exam), exam.yearName, exam.examTypeLabel, exam.code, exam.termLabel].filter(Boolean).join(' · ')}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Pill label={exam.archived ? 'Archived' : st.label} fg={exam.archived ? Colors.textSecondary : st.fg} bg={exam.archived ? Colors.surfaceAlt : st.bg} />
              {exam.overdue ? <Pill label="Marks overdue" fg={Colors.danger} bg={Colors.dangerLight} /> : null}
            </View>
          </View>
          <View style={x.flow}>
            {FLOW.map(([k, label], i) => (
              <View key={k} style={x.flowStep}>
                <View style={[x.flowDot, i < at && x.flowDone, i === at && x.flowNow]}>
                  {i < at || (i === at && k === 'published') ? <Ionicons name="checkmark" size={11} color="#fff" /> : <Text style={[x.flowNum, i === at && { color: '#fff' }]}>{i + 1}</Text>}
                </View>
                <Text style={[x.flowLabel, i === at && { color: Colors.text, fontWeight: '700' }]} numberOfLines={1}>{label}</Text>
              </View>
            ))}
          </View>
          {!exam.archived && exam.attention ? <Text style={[os.warn, { marginTop: 10, marginBottom: 0 }]}>{ATTENTION[exam.attention]}</Text> : null}
          {exam.status === 'REJECTED' && exam.rejectionReason ? <Text style={[os.bad, { marginTop: 10, marginBottom: 0 }]}>Rejected: “{exam.rejectionReason}”</Text> : null}

          <View style={os.btnRow}>
            {can.open ? <Btn label="Open Mark Entry" onPress={() => step('open')} primary /> : null}
            {can.validate ? <Btn label="Validate Marks" onPress={() => step('validate')} primary /> : null}
            {can.publish ? <Btn label="Publish Results" onPress={() => step('approve')} primary /> : null}
            {can.reopen && exam.status === 'REJECTED' ? <Btn label="Reopen for Correction" onPress={() => step('reopen')} primary /> : null}
            {can.restore ? <Btn label="Restore" onPress={() => step('restore')} primary /> : null}
            {can.edit ? <Btn label="Edit" onPress={() => router.push({ pathname: '/modules/admin/result-form', params: { id: String(exam._id) } } as any)} /> : null}
            {can.toDraft ? <Btn label="Back to Draft" onPress={() => step('draft')} /> : null}
            {can.reject ? <Btn label="Reject Marks" onPress={() => step('reject')} danger /> : null}
            {can.reopen && published ? <Btn label="Withdraw Results" onPress={() => step('reopen')} danger /> : null}
            {published && !exam.archived && ((exam.summary?.failed || 0) > 0 || (exam.reExam?.entered || 0) > 0) ? (
              <Btn label={`Re-exam${exam.summary?.failed ? ` (${exam.summary.failed})` : ''}`} onPress={() => router.push({ pathname: '/modules/results-reexam', params: { examId: String(exam._id), office: '1' } } as any)} />
            ) : null}
            <Btn label="Marks Register" onPress={() => saveAndShare(() => R.office.register(exam._id), `${String(exam.title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-marks-register.xlsx`,
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')} />
            {!exam.archived && exam.subjectCount > 0 ? (
              <Btn label="Admit Cards" onPress={() => saveAndShare(() => R.office.admitCards(exam._id), `${String(exam.title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-admit-cards.pdf`)} />
            ) : null}
            {can.archive ? <Btn label="Archive" onPress={() => step('archive')} /> : null}
            {can.delete ? <Btn label="Delete Draft" onPress={() => step('delete')} danger /> : null}
          </View>
        </View>

        {flash ? <TouchableOpacity onPress={() => setFlash('')}><Text style={os.ok}>{flash}</Text></TouchableOpacity> : null}

        <SegTabs active={tab} onChange={setTab} tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'marks', label: exam.status === 'DRAFT' ? 'Subjects' : `Marks ${exam.sheetsSubmitted}/${exam.subjectCount}` },
          ...(can.results ? [{ key: 'results', label: 'Results' }] : []),
          { key: 'activity', label: 'Activity' },
        ]} />

        {tab === 'overview' ? (
          <>
            {exam.summary ? (
              <View style={os.card}>
                <Text style={os.cap}>RESULTS AT A GLANCE</Text>
                <Figs items={[
                  { label: 'Students', value: exam.summary.students },
                  { label: 'Passed', value: pct(exam.summary.passPct) },
                  { label: 'Average', value: pct(exam.summary.avgPct) },
                  { label: 'Highest', value: pct(exam.summary.topPct) },
                ]} />
                {exam.summary.toppers?.length ? <Text style={[os.lineSub, { marginTop: 8 }]}>Top: {exam.summary.toppers.map((t: any) => t.name).join(', ')}</Text> : null}
              </View>
            ) : null}

            <View style={os.card}>
              <Text style={os.cap}>EXAM</Text>
              {[
                ['Dates', fmtRange(exam.startDate, exam.endDate)],
                ['Result date', exam.publishDate ? fmtDay(exam.publishDate) : 'As soon as published'],
                ['Marks due by', exam.marksDueDate ? `${fmtDay(exam.marksDueDate)}${exam.overdue ? ' — overdue' : ''}` : ''],
                ['Students', plural(exam.roster || 0, 'student')],
                ['Subjects', `${plural(exam.subjectCount || 0, 'subject')}`],
                ['Class teacher', exam.classTeacher || 'Not assigned'],
                ['Created', [exam.createdBy?.name, fmtDay(exam.createdAt)].filter(Boolean).join(' · ')],
                ['Validated', exam.approvals?.classApprovedAt ? [exam.approvals.classApprovedBy, fmtDay(exam.approvals.classApprovedAt)].filter(Boolean).join(' · ') : ''],
                ['Published', exam.approvals?.finalApprovedAt ? [exam.approvals.finalApprovedBy, fmtDay(exam.approvals.finalApprovedAt)].filter(Boolean).join(' · ') : ''],
              ].filter(([, v]) => v).map(([k, v]) => (
                <View key={k} style={x.kv}><Text style={x.k}>{k}</Text><Text style={x.v}>{v}</Text></View>
              ))}
              {exam.description ? <Text style={[os.lineSub, { marginTop: 8 }]}>{exam.description}</Text> : null}
            </View>

            <View style={os.card}>
              <Text style={os.cap}>SETTINGS</Text>
              {LIVE.filter(([k]) => !(published && ['notifyOnPublish', 'timetableShared'].includes(k))).map(([k, label, said]) => {
                const on = k === 'timetableShared' ? exam.timetableShared !== false : k === 'notifyOnPublish' ? opts.showInPortal !== false && !!opts[k] : !!opts[k];
                const off = saving === k || (k === 'notifyOnPublish' && opts.showInPortal === false) || (k === 'timetableShared' && exam.archived);
                return (
                  <View key={k} style={off ? { opacity: 0.5 } : undefined} pointerEvents={off ? 'none' : 'auto'}>
                    <Toggle label={label} value={on} sub={said(exam, on)} onChange={(v) => setOption(k, v)} />
                  </View>
                );
              })}
              <Text style={[os.lineSub, { marginTop: 6 }]}>
                Grace marks: {opts.allowGraceMarks ? `up to ${opts.grace?.perSubject} in at most ${plural(opts.grace?.maxSubjects || 0, 'subject')}` : 'not allowed'}
                {published ? ' · fixed once results are published' : ''}
              </Text>
            </View>

            {exam.withheld?.length ? (
              <View style={os.card}>
                <Text style={os.cap}>WITHHELD FROM FAMILIES · {exam.withheld.length}</Text>
                {exam.withheld.map((w: any) => (
                  <View key={w.student} style={os.line}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={os.lineName}>{w.name}</Text>
                      <Text style={os.lineSub}>{[w.reason, w.by].filter(Boolean).join(' · ')}</Text>
                    </View>
                  </View>
                ))}
                {can.withhold ? <View style={os.btnRow}><Btn label="Release…" onPress={() => release()} /></View> : null}
              </View>
            ) : null}

            {p ? (
              <View style={os.card}>
                <Text style={os.cap}>PROMOTION</Text>
                {!p.enabled ? <Text style={os.lineSub}>Off — every student stays in their class. Switch it on from the web, under the exam’s Promotion.</Text> : (
                  <>
                    <Text style={os.lineSub}>
                      Students who pass move up{p.mode === 'none' ? ' without a section' : ' into the same section'}{p.target?.class ? ` to ${p.target.class.className}${p.target.year ? `, ${p.target.year.yearName}` : ''}` : ''}.
                      {p.placement === 'repeat' ? ' Those who do not pass repeat the class next year.' : ' Those who do not pass stay where they are.'}
                    </Text>
                    <Text style={[os.lineSub, { marginTop: 4 }]}>
                      {!published ? `Runs when the results reach families${exam.publishDate ? ` — ${fmtDay(exam.publishDate)}` : ''}.`
                        : p.state === 'scheduled' ? `Scheduled for ${fmtDay(p.dueAt)}.` : p.state === 'done' ? `Ran ${fmtDay(p.ranAt)}.` : p.state === 'waiting' ? 'Some students wait for next year’s class to be set up.' : p.state === 'reverted' ? 'Undone when the results were withdrawn.' : ''}
                    </Text>
                    {pstats ? (
                      <Figs cols={4} items={[
                        { label: p.state === 'scheduled' || !p.state ? 'Will move up' : 'Moved up', value: pstats.promoted ?? 0 },
                        { label: 'Repeat', value: pstats.repeated ?? 0 },
                        { label: 'Did not pass', value: pstats.stay ?? 0 },
                        { label: 'Pass out', value: (pstats.final || 0) + (pstats.passedOut || 0) },
                        ...(pstats.onCondition ? [{ label: 'On condition', value: pstats.onCondition }] : []),
                        ...(pstats.detained ? [{ label: 'Kept back', value: pstats.detained }] : []),
                        ...(pstats.noDetention ? [{ label: 'No-detention', value: pstats.noDetention }] : []),
                        ...(pstats.wait ? [{ label: 'Waiting', value: pstats.wait, tone: Colors.warning }] : []),
                      ]} />
                    ) : null}
                    {(pstats?.exceptions || []).filter((e2: any) => e2.outcome !== 'promoted' || e2.reason).slice(0, 8).map((e2: any) => (
                      <View key={`${e2.student}${e2.outcome}`} style={os.line}>
                        <Text style={[os.lineName, { flex: 1 }]} numberOfLines={1}>{e2.name}</Text>
                        <Text style={os.lineSub} numberOfLines={2}>{OUTCOME[e2.outcome] || e2.outcome}{e2.reason && e2.reason !== OUTCOME[e2.outcome] ? ` — ${e2.reason}` : ''}</Text>
                      </View>
                    ))}
                    {exam.promotionDecisions?.length ? (
                      <>
                        <Text style={[os.cap, { marginTop: 10 }]}>DECIDED BY THE OFFICE</Text>
                        {exam.promotionDecisions.map((d: any) => (
                          <View key={d.student} style={os.line}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={os.lineName}>{d.name}</Text>
                              <Text style={os.lineSub}>{d.decision === 'promote' ? 'Promoted on condition' : 'Kept back'}{d.reason ? ` — ${d.reason}` : ''}</Text>
                            </View>
                            {published && !exam.archived ? (
                              <TouchableOpacity onPress={async () => {
                                try { await R.office.decide(exam._id, { student: d.student, decision: null }); done(`${d.name}: back to what the result says`); }
                                catch (err: any) { say('Not changed', err?.message || 'That did not work'); }
                              }}><Text style={x.link}>Undo</Text></TouchableOpacity>
                            ) : null}
                          </View>
                        ))}
                      </>
                    ) : null}
                    {published && !exam.archived ? <View style={os.btnRow}><Btn label="Decide for a student" onPress={() => setDeciding(true)} /></View> : null}
                  </>
                )}
              </View>
            ) : null}
          </>
        ) : null}

        {tab === 'marks' ? (
          <>
            {exam.status === 'DRAFT' ? <Text style={os.note}>Mark entry has not been opened. These are the subjects teachers will be asked for.</Text> : null}
            {(exam.subjects || []).map((s2: any) => {
              const sh = SHEET[s2.sheet.status] || SHEET.NOT_STARTED;
              const sendable = can.returnSubject && (published || s2.sheet.status === 'SUBMITTED');
              return (
                <View key={s2.subject._id} style={os.card}>
                  <View style={os.rowTop}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={os.lineName}>{s2.subject.subjectName}{s2.subject.subjectCode ? <Text style={os.lineSub}>  {s2.subject.subjectCode}</Text> : null}</Text>
                      <Text style={os.lineSub}>
                        {[s2.gradeOnly ? 'Graded — no marks' : s2.components ? s2.components.map((c: any) => `${c.label} ${c.maxMarks}`).join(' + ') : `Max ${s2.maxMarks} · pass ${s2.passingMarks}`,
                          s2.examDate ? fmtDay(s2.examDate) : '',
                          s2.teachers.length ? s2.teachers.map((t: any) => t.name).join(', ') : 'No teacher assigned'].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Pill label={sh.label} fg={sh.fg} bg={sh.bg} />
                      {s2.elective ? <Pill label="Elective" fg={Colors.info} bg={Colors.infoLight} /> : null}
                      {s2.sheet.overdue ? <Pill label="Overdue" fg={Colors.danger} bg={Colors.dangerLight} /> : null}
                    </View>
                  </View>
                  {exam.status !== 'DRAFT' ? (
                    <>
                      <Text style={[os.lineSub, { marginTop: 6 }]}>
                        {s2.sheet.entered} of {s2.sheet.total} entered{s2.sheet.absent ? ` · ${s2.sheet.absent} absent` : ''}
                        {s2.sheet.submittedBy ? ` · submitted by ${s2.sheet.submittedBy}` : ''}{s2.sheet.changes ? ` · ${plural(s2.sheet.changes, 'mark')} changed` : ''}
                      </Text>
                      <View style={os.btnRow}>
                        <Btn label={!can.marks ? 'View Marks' : s2.sheet.status === 'SUBMITTED' ? 'Correct Marks' : 'Enter Marks'}
                          onPress={() => router.push({ pathname: '/modules/results-sheet', params: { examId: String(exam._id), subjectId: String(s2.subject._id), office: '1' } } as any)}
                          primary={can.marks && !s2.teachers.length && s2.sheet.status !== 'SUBMITTED'} />
                        {sendable ? <Btn label={published ? 'Withdraw' : 'Send Back'} onPress={() => sendBack(s2)} danger={published} /> : null}
                      </View>
                    </>
                  ) : null}
                </View>
              );
            })}
          </>
        ) : null}

        {tab === 'results' ? (
          !results ? <LoaderView /> : (
            <>
              {results.summary ? (
                <View style={os.card}>
                  <Figs items={[
                    { label: 'Students', value: results.summary.students },
                    { label: 'Passed', value: results.summary.passed },
                    { label: 'Pass rate', value: pct(results.summary.passPct) },
                    { label: 'Average', value: pct(results.summary.avgPct) },
                  ]} />
                  <View style={x.grades}>
                    {(results.summary.grades || []).map((g: any) => (
                      <View key={g.grade} style={[x.grade, !g.count && { opacity: 0.45 }]}><GradePill grade={g.grade} scale={results.scale} /><Text style={x.gradeN}>{g.count}</Text></View>
                    ))}
                  </View>
                  {can.withhold ? <View style={os.btnRow}><Btn label="Withhold…" onPress={() => withhold()} /></View> : null}
                </View>
              ) : null}
              {rows.map((r: any) => {
                const on = open === r._id;
                const classWide = r.classOutOf && r.classOutOf > rows.length;
                return (
                  <TouchableOpacity key={r._id} style={os.card} activeOpacity={0.8} onPress={() => setOpen(on ? null : r._id)}
                    accessibilityRole="button" accessibilityState={{ expanded: on }}>
                    <View style={[os.rowTop, { alignItems: 'center' }]}>
                      <View style={[x.rank, r.rank <= 3 && x.rankTop]}><Text style={x.rankText}>{r.rank}</Text></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={os.lineName} numberOfLines={1}>{r.student.name}</Text>
                        <Text style={os.lineSub} numberOfLines={1}>
                          {[r.student.rollNumber ? `Roll ${r.student.rollNumber}` : '', `${r.totalMarks}/${r.totalMaxMarks}`, classWide ? `class ${r.classRank}/${r.classOutOf}` : ''].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 3 }}>
                        <Text style={x.pct}>{pct(r.percentage)}</Text>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          <GradePill grade={r.grade} scale={results.scale} />
                          {r.withheld ? <Pill label="Withheld" fg="#8A4B05" bg={Colors.warningLight} /> : <PassPill passed={!!r.isPassed} label={r.isPassed ? 'Pass' : 'Fail'} />}
                        </View>
                      </View>
                    </View>
                    {on ? (
                      <View style={{ marginTop: 8 }}>
                        {r.subjects.map((s2: any) => (
                          <View key={s2.subject._id} style={os.line}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={os.lineName} numberOfLines={1}>{s2.subject.subjectName}</Text>
                              {s2.components?.length && !s2.isAbsent ? <Text style={os.lineSub}>{s2.components.map((c: any) => `${c.label} ${c.marks ?? '—'}/${c.maxMarks}`).join(' · ')}</Text> : null}
                              {s2.graceMarks ? <Text style={[os.lineSub, { color: '#6126C9' }]}>incl. {s2.graceMarks} grace</Text> : null}
                              {s2.remarks ? <Text style={[os.lineSub, { fontStyle: 'italic' }]}>“{s2.remarks}”</Text> : null}
                            </View>
                            <Text style={[os.lineName, !s2.gradeOnly && !s2.isPassed && { color: Colors.danger }]}>
                              {s2.isAbsent ? 'AB' : s2.gradeOnly ? s2.grade : `${s2.marksObtained}/${s2.maxMarks}`}
                            </Text>
                          </View>
                        ))}
                        {r.withheld ? <Text style={[os.warn, { marginTop: 8 }]}>Withheld — {r.withheld.reason || 'no reason given'}.</Text> : null}
                        <View style={os.btnRow}>
                          {can.correct ? <Btn label="Correct a Mark" onPress={() => setCorrecting(r)} /> : null}
                          {can.withhold ? (r.withheld
                            ? <Btn label="Release" onPress={() => release(String(r.student._id))} />
                            : <Btn label="Withhold" onPress={() => withhold(String(r.student._id))} />) : null}
                        </View>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </>
          )
        ) : null}

        {tab === 'activity' ? (
          exam.timeline?.length ? (
            <View style={os.card}>
              {exam.timeline.map((a: any, i: number) => (
                <View key={`${a.action}${a.at}${i}`} style={[os.line, i === 0 && { borderTopWidth: 0 }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={os.lineName}>{a.label}</Text>
                    <Text style={os.lineSub}>{[a.by, fmtDay(a.at)].filter(Boolean).join(' · ')}</Text>
                    {a.notes ? <Text style={[os.lineSub, { fontStyle: 'italic' }]}>“{a.notes}”</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          ) : <Empty icon="time-outline" text="Nothing has been recorded for this exam yet." />
        ) : null}
      </ScrollView>

      <AskSheet ask={ask} onClose={() => setAsk(null)} onDone={done} />
      {correcting ? <CorrectMark exam={exam} row={correcting} subjects={results?.subjects || []} scale={results?.scale || []}
        onClose={() => setCorrecting(null)} onDone={(m) => { setCorrecting(null); done(m); }} /> : null}
      {deciding ? <Decide exam={exam} rows={rows} onClose={() => setDeciding(false)} onDone={(m) => { setDeciding(false); done(m); }} /> : null}
    </>
  );
}

function Btn({ label, onPress, primary, danger }: { label: string; onPress: () => void; primary?: boolean; danger?: boolean }) {
  return (
    <TouchableOpacity style={primary ? os.btn : [os.ghost, danger && os.dangerGhost]} onPress={onPress} accessibilityRole="button">
      <Text style={primary ? os.btnText : [os.ghostText, danger && { color: Colors.danger }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** One paper of a published result, corrected in place. */
function CorrectMark({ exam, row, subjects, scale, onClose, onDone }: { exam: any; row: any; subjects: any[]; scale: any[]; onClose: () => void; onDone: (m: string) => void }) {
  const papers = subjects.filter((s2) => row.subjects.some((x2: any) => x2.subject._id === s2._id));
  const [sub, setSub] = useState(papers[0]?._id || '');
  const cfg = papers.find((s2) => s2._id === sub);
  const now = row.subjects.find((x2: any) => x2.subject._id === sub);
  const [marks, setMarks] = useState('');
  const [parts, setParts] = useState<Record<string, string>>({});
  const [grade, setGrade] = useState('');
  const [absent, setAbsent] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setAbsent(!!now?.isAbsent && !now?.reExam);
    setMarks(now && !now.isAbsent && !now.gradeOnly ? String(now.reExam?.original?.marksObtained ?? (now.marksObtained - (now.graceMarks || 0))) : '');
    setParts(Object.fromEntries((cfg?.components || []).map((c: any) => [c.key, String((now?.components || []).find((y: any) => y.key === c.key)?.marks ?? '')])));
    setGrade(now?.gradeOnly && now.grade !== 'AB' ? now.grade : '');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub]);
  const go = async () => {
    if (!reason.trim()) { setError('Say why the mark is being corrected — it is kept in the history'); return; }
    setBusy(true); setError('');
    try {
      const body: any = { student: row.student._id, subject: sub, reason: reason.trim(), isAbsent: absent };
      if (!absent) {
        if (cfg?.gradeOnly) body.grade = grade;
        else if (cfg?.components) body.parts = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v === '' ? null : Number(v)]));
        else body.marksObtained = marks === '' ? null : Number(marks);
      }
      const out = unwrap(await R.office.correct(exam._id, body));
      onDone(out?.change ? `${row.student.name}: ${out.change.before} → ${out.change.after} — worked out again` : 'Mark corrected');
    } catch (e: any) { setError(e?.message || 'The mark could not be corrected'); setBusy(false); }
  };
  return (
    <FormModal visible title={`Correct a mark — ${row.student.name}`} onClose={onClose} onSubmit={go} submitting={busy} submitLabel="Correct Mark">
      <Text style={[os.lineSub, { marginBottom: 10 }]}>The mark changes on its sheet, the result and ranks are worked out again, and the family is told.</Text>
      <Select label="Paper" value={sub} onChange={setSub} options={papers.map((s2) => ({ value: s2._id, label: s2.subjectName }))} />
      <Text style={[os.lineSub, { marginBottom: 8 }]}>Now: {now ? (now.isAbsent ? 'Absent' : now.gradeOnly ? now.grade : `${now.marksObtained} / ${now.maxMarks}`) : '—'}</Text>
      <Toggle label="Absent from this paper" value={absent} onChange={setAbsent} />
      {!absent ? (
        cfg?.gradeOnly ? (
          <View style={x.chips}>
            {scale.map((g: any) => (
              <TouchableOpacity key={g.grade} style={[x.chip, grade === g.grade && x.chipOn]} onPress={() => setGrade(g.grade)}>
                <Text style={[x.chipText, grade === g.grade && { color: '#fff' }]}>{g.grade}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : cfg?.components ? (
          cfg.components.map((c: any) => (
            <View key={c.key} style={{ marginBottom: 8 }}>
              <Text style={x.label}>{c.label} / {c.maxMarks}</Text>
              <TextInput style={x.input} keyboardType="decimal-pad" value={parts[c.key] ?? ''} onChangeText={(v) => setParts((pp) => ({ ...pp, [c.key]: v.replace(',', '.') }))} />
            </View>
          ))
        ) : (
          <View style={{ marginBottom: 8 }}>
            <Text style={x.label}>Marks / {cfg?.maxMarks}</Text>
            <TextInput style={x.input} keyboardType="decimal-pad" value={marks} onChangeText={(v) => setMarks(v.replace(',', '.'))} />
          </View>
        )
      ) : null}
      <Text style={x.label}>Why *</Text>
      <TextInput style={[x.input, { minHeight: 70, textAlignVertical: 'top' }]} multiline value={reason} onChangeText={(v) => { setReason(v.slice(0, 300)); setError(''); }}
        placeholder="e.g. Page 3 was not added to the total" placeholderTextColor={Colors.textLight} />
      {error ? <Text style={[os.bad, { marginTop: 10 }]}>{error}</Text> : null}
    </FormModal>
  );
}

/** A final exam's promotion decided by hand for one student. */
function Decide({ exam, rows, onClose, onDone }: { exam: any; rows: any[]; onClose: () => void; onDone: (m: string) => void }) {
  const decided = useMemo(() => new Set((exam.promotionDecisions || []).map((d: any) => String(d.student))), [exam]);
  const [student, setStudent] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const row = rows.find((r) => String(r.student._id) === student);
  const decision = row ? (row.isPassed ? 'detain' : 'promote') : '';
  const go = async () => {
    if (!row) { setError('Choose the student'); return; }
    if (!reason.trim()) { setError('Say why — it is kept with the promotion'); return; }
    setBusy(true); setError('');
    try {
      await R.office.decide(exam._id, { student, decision, reason: reason.trim() });
      onDone(decision === 'promote' ? `${row.student.name} will be promoted on condition` : `${row.student.name} will be kept back`);
    } catch (e: any) { setError(e?.message || 'That did not work'); setBusy(false); }
  };
  return (
    <FormModal visible title="Decide a student's promotion" onClose={onClose} onSubmit={go} submitting={busy} submitLabel="Save Decision">
      <Text style={[os.lineSub, { marginBottom: 10 }]}>Over what the result says: promote one who did not pass (on condition), or keep back one who did. Where the promotion has run, the student moves now.</Text>
      <Select label="Student" value={student} onChange={(v) => { setStudent(v); setError(''); }}
        options={rows.filter((r) => !decided.has(String(r.student._id))).map((r) => ({ value: String(r.student._id), label: `${r.student.name} — ${r.isPassed ? 'passed' : 'did not pass'}` }))} />
      {row ? <Text style={[os.note, { marginTop: 4 }]}>{row.isPassed ? `${row.student.name} passed. Keeping them back means they ${exam.promotion?.placement === 'repeat' ? 'repeat the class next year' : 'stay where they are'}.` : `${row.student.name} did not pass. Promoting them on condition moves them up with the others.`}</Text> : null}
      <Text style={x.label}>Why *</Text>
      <TextInput style={[x.input, { minHeight: 60, textAlignVertical: 'top' }]} multiline value={reason} onChangeText={(v) => { setReason(v.slice(0, 200)); setError(''); }}
        placeholder={decision === 'detain' ? 'e.g. Attendance below 75%' : 'e.g. Absent through illness — re-exam in June'} placeholderTextColor={Colors.textLight} />
      {error ? <Text style={[os.bad, { marginTop: 10 }]}>{error}</Text> : null}
    </FormModal>
  );
}

const x = StyleSheet.create({
  flow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  flowStep: { flex: 1, alignItems: 'center', gap: 4 },
  flowDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  flowDone: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  flowNow: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  flowNum: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary },
  flowLabel: { fontSize: 10, color: Colors.textSecondary },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.divider },
  k: { fontSize: 12, color: Colors.textSecondary },
  v: { flexShrink: 1, fontSize: 12.5, fontWeight: '600', color: Colors.text, textAlign: 'right' },
  link: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  grades: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  grade: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gradeN: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  rank: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  rankTop: { backgroundColor: '#FDF1D3' },
  rankText: { fontSize: 12, fontWeight: '800', color: Colors.text },
  pct: { fontSize: 15, fontWeight: '700', color: Colors.text },
  label: { fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  input: { minHeight: 42, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt, paddingHorizontal: 10, fontSize: 15, color: Colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  chip: { minWidth: 52, paddingVertical: 8, paddingHorizontal: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 15, fontWeight: '700', color: Colors.text },
});
