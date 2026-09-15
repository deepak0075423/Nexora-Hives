import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as teacherApi from '@/api/teacher.api';
import * as adminApi from '@/api/admin.api';
import { useAuth } from '@/contexts/AuthContext';
import { examApi, sideForRole, ExamSide } from '@/components/exams/examApi';
import ExamForm from '@/components/exams/ExamForm';
import {
  unwrap, LoaderView, Empty, Card, SegTabs, FormModal, Input, Select, ActionBtn,
  confirmAsync,
} from '@/components/ui/kit';
import {
  ExamMark, StagePill, FactCell, Figures, Figure, ReadinessList, PublishButton, Meter, QuestionCard,
  AttemptPill, ScoreBar, Outcome, Pill, fmtExamDay, fmtClockRange, fmtSpent, plural,
  QUESTION_TYPE_LABEL,
} from '@/components/exams/parts';

/**
 * One aptitude exam — for the teacher who wrote it or class-teaches it, and for
 * the school office (`side=admin`, or any non-teacher role).
 *
 * The web workspace's tabs on a phone: what the exam is and whether it can be
 * published, its questions, who submitted, and the results. Every rule is the
 * server's — publishing is refused until `readiness.ready`, a teacher's
 * approval buttons appear only where `permissions` allows them, and the office
 * releases or withholds results in one step.
 */

type XApi = ReturnType<typeof examApi>;

const err = (e: any) => e?.data?.message ?? e?.message ?? 'Something went wrong';

export default function ExamWorkspaceScreen() {
  const { id, tab: initialTab, side: sideParam } = useLocalSearchParams<{ id: string; tab?: string; side?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  // A module-admin teacher arrives from the office list with side=admin.
  const side: ExamSide = sideParam === 'admin' || sideParam === 'teacher' ? sideParam : sideForRole(user?.role);
  const xapi = examApi(side);
  const [editOpen, setEditOpen] = useState(false);
  const [exam, setExam] = useState<any>(null);
  const [tab, setTab] = useState(initialTab || 'overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = unwrap(await xapi.detail(String(id)));
      // The office's read carries the pass mark inside `attempts`, and may manage any exam.
      setExam(side === 'admin' ? { ...d, canManage: true, passMark: d.passMark ?? d.attempts?.passMark } : d);
    }
    catch (e: any) { Alert.alert('Could not open this exam', err(e)); router.back(); }
    finally { setLoading(false); setRefreshing(false); }
  }, [id, side]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (id) load(); }, [id, load]);

  const publish = async () => {
    if (!await confirmAsync('Publish exam', `${plural(exam.eligible, 'student')} will see it, and its questions lock once published.`, 'Publish')) return;
    setBusy(true);
    try { await xapi.publish(String(id)); await load(); }
    catch (e: any) { Alert.alert('Not published', err(e)); await load(); }
    finally { setBusy(false); }
  };

  const action = async (title: string, message: string, label: string, run: () => Promise<any>, after?: () => void) => {
    if (!await confirmAsync(title, message, label)) return;
    setBusy(true);
    try { await run(); after ? after() : await load(); }
    catch (e: any) { Alert.alert('Not done', err(e)); }
    finally { setBusy(false); }
  };

  const actions = {
    edit: () => setEditOpen(true),
    remove: () => action('Delete exam', 'The exam and its questions are deleted. This cannot be undone.', 'Delete',
      () => xapi.remove(String(id)), () => router.back()),
    unpublish: side === 'admin' ? () => action('Move back to draft', 'Students stop seeing it until it is published again.', 'Move to draft',
      () => adminApi.unpublishAptitudeExam(String(id))) : undefined,
    cancel: side === 'admin' ? () => action('Cancel exam', 'Students stop seeing it at once. Anything already submitted is kept.', 'Cancel exam',
      () => adminApi.cancelAptitudeExam(String(id))) : undefined,
  };

  if (loading || !exam) return (<><Stack.Screen options={{ title: 'Exam' }} /><LoaderView /></>);

  const opened = ['live', 'completed'].includes(exam.stage);
  const tabs = [
    { key: 'overview', label: 'Overview' },
    // The checklist matters only while it is a draft — a closed exam's slot has passed, and that is not a problem.
    { key: 'questions', label: exam.status === 'draft' && exam.readiness && !exam.readiness.ready ? 'Questions !' : 'Questions' },
    ...(opened ? [{ key: 'submissions', label: `Submissions ${exam.submitted ?? 0}` }] : []),
    ...(exam.stage === 'completed' || (opened && side === 'teacher') ? [{ key: 'results', label: exam.task || (side === 'admin' && exam.results?.state === 'awaiting') ? 'Results !' : 'Results' }] : []),
  ];

  return (
    <>
      <Stack.Screen options={{ title: exam.title }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <Card>
          <View style={s.head}>
            <ExamMark exam={exam} size={46} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.title} numberOfLines={2}>{exam.title}</Text>
              <View style={s.headTags}>
                <StagePill stage={exam.stage} />
                <Text style={s.subject}>{exam.subjectName ?? 'General Aptitude'}</Text>
              </View>
            </View>
          </View>
          <View style={s.facts}>
            <FactCell label="Date" value={fmtExamDay(exam)} />
            <FactCell label="Time" value={fmtClockRange(exam)} />
            <FactCell label="Classes" value={exam.audience?.label ?? '--'} />
            <FactCell label="Questions" value={`${exam.questionCount} of ${exam.totalQuestions}`} />
            <FactCell label="Total marks" value={exam.totalMarks} />
            <FactCell label={opened ? 'Submitted' : 'Students'} value={opened ? `${exam.submitted} of ${exam.eligible}` : exam.eligible} />
          </View>
          {opened && (
            <TouchableOpacity style={s.reportBtn} onPress={() => router.push({ pathname: '/modules/exam-report', params: { id, side } } as any)} activeOpacity={0.8}>
              <Ionicons name="stats-chart" size={15} color={Colors.primary} />
              <Text style={s.reportText}>Full analytics report</Text>
              <Ionicons name="chevron-forward" size={15} color={Colors.textLight} />
            </TouchableOpacity>
          )}
        </Card>

        <View style={{ marginTop: Spacing.md }}>
          <SegTabs tabs={tabs} active={tab} onChange={setTab} />
        </View>

        {tab === 'overview' && <Overview exam={exam} onPublish={publish} busy={busy} goQuestions={() => setTab('questions')} actions={actions} />}
        {tab === 'questions' && <Questions xapi={xapi} exam={exam} reload={load} onPublish={publish} busy={busy} />}
        {tab === 'submissions' && <Submissions xapi={xapi} exam={exam} />}
        {tab === 'results' && (side === 'admin' ? <OfficeResults exam={exam} reload={load} /> : <Results exam={exam} reload={load} />)}
      </ScrollView>
      <ExamForm visible={editOpen} side={side} exam={exam} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); load(); }} />
    </>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────

type Actions = { edit: () => void; remove: () => void; unpublish?: () => void; cancel?: () => void };

function Overview({ exam, onPublish, busy, goQuestions, actions }: {
  exam: any; onPublish: () => void; busy: boolean; goQuestions: () => void; actions: Actions;
}) {
  const opened = ['live', 'completed'].includes(exam.stage);
  const draft = exam.status === 'draft';
  const canUnpublish = actions.unpublish && exam.stage === 'scheduled' && !exam.attemptCount;
  const canCancel = actions.cancel && ['scheduled', 'live'].includes(exam.stage);
  return (
    <>
      {exam.status === 'draft' ? (
        <Card>
          <Text style={s.cardTitle}>Before you publish</Text>
          <Text style={s.cardSub}>{exam.readiness?.ready ? 'Ready to publish' : `${exam.readiness?.checks.filter((c: any) => c.ok).length} of ${exam.readiness?.checks.length} complete`}</Text>
          <View style={{ marginTop: Spacing.md }}><ReadinessList readiness={exam.readiness} /></View>
          {exam.canManage && (
            <View style={{ marginTop: Spacing.md, gap: 8 }}>
              <PublishButton readiness={exam.readiness} onPublish={onPublish} busy={busy} />
              <ActionBtn label="Go to questions" tone="info" onPress={goQuestions} />
            </View>
          )}
        </Card>
      ) : opened && (
        <Figures>
          <Figure label="Submitted" value={`${exam.submitted}/${exam.eligible}`} icon="people" tone="info" />
          <Figure label="Average" value={exam.averageScore == null ? '--' : `${exam.averageScore}%`} icon="trophy" tone="success" />
          <Figure label="Questions" value={exam.questionCount} icon="list" tone="neutral" />
          <Figure label="Pass mark" value={`${exam.passMark}/${exam.totalMarks}`} icon="checkmark-circle" tone="warning" />
        </Figures>
      )}

      <Card>
        <Text style={s.cardTitle}>Exam details</Text>
        <View style={{ marginTop: 8, gap: 8 }}>
          <Detail label="Sections" value={exam.audience?.items?.join(', ') ?? exam.audience?.label ?? '--'} />
          <Detail label="Schedule" value={`${fmtExamDay(exam)}, ${fmtClockRange(exam)} (${exam.duration} min)`} />
          <Detail label="Paper" value={`${plural(exam.totalQuestions, 'question')} · ${exam.totalMarks} marks · pass mark ${exam.passMark}`} />
          <Detail label="Anti-cheat" value={`Auto-submits after ${plural(exam.maxViolations ?? 3, 'app switch', 'app switches')}`} />
          <Detail label="Written by" value={exam.createdBy?.name ?? '--'} />
        </View>
        {exam.canManage && (draft || canUnpublish || canCancel) && (
          <View style={s.manage}>
            {draft && <ActionBtn label="Edit details" tone="info" small onPress={actions.edit} disabled={busy} />}
            {draft && <ActionBtn label="Delete draft" tone="danger" small onPress={actions.remove} disabled={busy} />}
            {canUnpublish && <ActionBtn label="Move back to draft" tone="warning" small onPress={actions.unpublish!} disabled={busy} />}
            {canCancel && <ActionBtn label="Cancel exam" tone="danger" small onPress={actions.cancel!} disabled={busy} />}
          </View>
        )}
      </Card>
    </>
  );
}

const Detail = ({ label, value }: { label: string; value: string }) => (
  <View style={s.detail}>
    <Text style={s.detailLabel}>{label}</Text>
    <Text style={s.detailValue}>{value}</Text>
  </View>
);

// ── Questions ─────────────────────────────────────────────────────────────────

const LETTERS = ['a', 'b', 'c', 'd'];
const blankQ = () => ({ questionText: '', questionType: 'mcq_single', options: LETTERS.map(l => ({ optionId: l, text: '' })), correctAnswers: [] as string[], marks: '1' });

function Questions({ xapi, exam, reload, onPublish, busy }: { xapi: XApi; exam: any; reload: () => void; onPublish: () => void; busy: boolean }) {
  const [list, setList] = useState<any[] | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setList(unwrap(await xapi.questions(exam._id)) ?? []); }
    catch (e: any) { setList([]); Alert.alert('Could not load questions', err(e)); }
  }, [exam._id]);
  useEffect(() => { load(); }, [load]);

  const editable = exam.status === 'draft' && exam.canManage;
  const marks = (list ?? []).reduce((n, q) => n + (Number(q.marks) || 0), 0);
  const full = (list?.length ?? 0) >= exam.totalQuestions;

  const remove = async (q: any) => {
    if (!await confirmAsync('Delete question', `Its ${plural(q.marks, 'mark')} go back to be allocated.`, 'Delete')) return;
    try { await xapi.deleteQuestion(exam._id, q._id); await load(); reload(); }
    catch (e: any) { Alert.alert('Not deleted', err(e)); }
  };

  const save = async (form: any) => {
    setSaving(true);
    try {
      const body = {
        questionText: form.questionText.trim(),
        questionType: form.questionType,
        options: form.questionType === 'true_false'
          ? [{ optionId: 'true', text: 'True' }, { optionId: 'false', text: 'False' }]
          : form.options.map((o: any) => ({ optionId: o.optionId, text: o.text.trim() })),
        correctAnswers: form.correctAnswers,
        marks: Number(form.marks),
      };
      if (editing?._id) await xapi.updateQuestion(exam._id, editing._id, body);
      else await xapi.addQuestion(exam._id, body);
      setEditing(null);
      await load(); reload();
    } catch (e: any) { Alert.alert('Not saved', err(e)); }
    finally { setSaving(false); }
  };

  if (!list) return <LoaderView />;

  return (
    <>
      <Card>
        <View style={s.meters}>
          <Meter label="Questions" have={list.length} want={exam.totalQuestions} unit="question" />
          <Meter label="Marks allocated" have={marks} want={exam.totalMarks} unit="mark" />
        </View>
        {editable && (
          <View style={{ marginTop: Spacing.md, gap: 8 }}>
            <ActionBtn
              label={full ? `All ${exam.totalQuestions} questions added` : 'Add question'}
              tone={full ? 'neutral' : 'info'}
              disabled={full}
              onPress={() => setEditing(blankQ())}
            />
            <PublishButton readiness={exam.readiness} onPublish={onPublish} busy={busy} />
          </View>
        )}
        {!editable && (
          <Text style={[s.cardSub, { marginTop: 10 }]}>
            {exam.status !== 'draft' ? 'Published — questions are locked.' : 'Only the teacher who wrote this exam can change its questions.'}
          </Text>
        )}
      </Card>

      {list.length === 0
        ? <Empty icon="help-circle-outline" text={`This exam is set for ${plural(exam.totalQuestions, 'question')} worth ${exam.totalMarks} marks`} />
        : list.map((q, i) => (
          <QuestionCard
            key={q._id}
            q={q}
            index={i}
            keyOnly
            actions={editable ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity onPress={() => setEditing({ ...q, marks: String(q.marks), options: q.questionType === 'true_false' ? blankQ().options : q.options.map((o: any) => ({ ...o })) })} hitSlop={8}>
                  <Ionicons name="create-outline" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(q)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            ) : undefined}
          />
        ))}

      <QuestionForm
        visible={!!editing}
        initial={editing}
        exam={exam}
        otherMarks={marks - (Number(editing?.marks) || 0)}
        saving={saving}
        onClose={() => setEditing(null)}
        onSave={save}
      />
    </>
  );
}

function QuestionForm({ visible, initial, exam, otherMarks, saving, onClose, onSave }: {
  visible: boolean; initial: any; exam: any; otherMarks: number; saving: boolean; onClose: () => void; onSave: (f: any) => void;
}) {
  const [f, setF] = useState<any>(blankQ());
  useEffect(() => { if (visible && initial) setF({ ...initial, marks: String(initial.marks ?? '1'), correctAnswers: [...(initial.correctAnswers ?? [])] }); }, [visible, initial]);

  const setType = (t: string) => setF((x: any) => ({
    ...x, questionType: t, correctAnswers: [],
    options: t === 'true_false' ? [{ optionId: 'true', text: 'True' }, { optionId: 'false', text: 'False' }] : blankQ().options,
  }));
  const toggleKey = (oid: string) => setF((x: any) => ({
    ...x,
    correctAnswers: x.questionType === 'mcq_multiple'
      ? (x.correctAnswers.includes(oid) ? x.correctAnswers.filter((c: string) => c !== oid) : [...x.correctAnswers, oid])
      : [oid],
  }));

  const after = Math.round((otherMarks + (Number(f.marks) || 0)) * 100) / 100;
  const problems: string[] = [];
  if (!String(f.questionText).trim()) problems.push('Write the question');
  if (f.questionType !== 'true_false' && f.options.filter((o: any) => o.text.trim()).length < 2) problems.push('Give at least two options');
  if (!f.correctAnswers.length) problems.push('Mark the correct answer');
  if (!(Number(f.marks) >= 0.5)) problems.push('Marks must be 0.5 or more');

  return (
    <FormModal
      visible={visible}
      title={initial?._id ? 'Edit question' : 'Add question'}
      onClose={onClose}
      submitting={saving}
      submitLabel={initial?._id ? 'Save changes' : 'Add question'}
      onSubmit={() => (problems.length ? Alert.alert('Check the question', problems[0]) : onSave(f))}
    >
      <Select
        label="Type"
        value={f.questionType}
        onChange={setType}
        options={Object.entries(QUESTION_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
      />
      <Input label="Question" value={f.questionText} onChange={(v) => setF((x: any) => ({ ...x, questionText: v }))} multiline placeholder="e.g. If 3x + 5 = 20, what is x?" />

      <Text style={s.formLabel}>
        {f.questionType === 'true_false' ? 'Correct answer' : 'Options'} · tick the correct {f.questionType === 'mcq_multiple' ? 'options' : 'option'}
      </Text>
      {f.options.map((o: any, i: number) => {
        const on = f.correctAnswers.includes(o.optionId);
        return (
          <View key={o.optionId} style={[s.optRow, on && s.optRowOn]}>
            <TouchableOpacity onPress={() => toggleKey(o.optionId)} hitSlop={8} accessibilityLabel={`mark-${o.optionId}`}>
              <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? Colors.success : Colors.textLight} />
            </TouchableOpacity>
            {f.questionType === 'true_false' ? (
              <Text style={s.optFixed}>{o.text}</Text>
            ) : (
              <View style={{ flex: 1 }}>
                <Input
                  label={`Option ${o.optionId.toUpperCase()}`}
                  value={o.text}
                  onChange={(v) => setF((x: any) => ({ ...x, options: x.options.map((q: any, j: number) => (j === i ? { ...q, text: v } : q)) }))}
                />
              </View>
            )}
          </View>
        );
      })}

      <Input label="Marks" value={String(f.marks)} onChange={(v) => setF((x: any) => ({ ...x, marks: v }))} keyboardType="numeric" />
      <Text style={[s.hint, after > exam.totalMarks && { color: Colors.danger }]}>
        {after === exam.totalMarks
          ? `With this question the paper carries all ${exam.totalMarks} marks.`
          : after > exam.totalMarks
            ? `That takes the paper to ${after} of ${exam.totalMarks} marks — ${Math.round((after - exam.totalMarks) * 100) / 100} over.`
            : `Paper after this question: ${after} of ${exam.totalMarks} marks.`}
      </Text>
    </FormModal>
  );
}

// ── Submissions ───────────────────────────────────────────────────────────────

function Submissions({ xapi, exam }: { xapi: XApi; exam: any }) {
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState<any>(null);

  useEffect(() => {
    xapi.submissions(exam._id).then((r) => setData(r)).catch((e) => Alert.alert('Could not load submissions', err(e)));
  }, [exam._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <LoaderView />;
  const rows = [
    ...(data.data ?? []),
    ...(data.notAttempted ?? []).map((st: any) => ({ _id: `n-${st._id}`, student: st, status: exam.stage === 'completed' ? 'missed' : 'not_started', score: null })),
  ];

  return (
    <>
      <Card>
        <Text style={s.cardTitle}>{data.data?.filter((a: any) => a.score != null).length ?? 0} of {plural(rows.length, 'student')} submitted</Text>
        <Text style={s.cardSub}>Pass mark {data.passMark} of {data.totalMarks}</Text>
      </Card>
      {rows.length === 0 ? <Empty icon="people-outline" text="Nobody on the roster yet" /> : rows.map((r: any) => (
        <TouchableOpacity
          key={r._id}
          style={s.subRow}
          activeOpacity={r.score != null ? 0.75 : 1}
          onPress={() => r.score != null && setOpen(r)}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.subName} numberOfLines={1}>{r.student?.name ?? '--'}</Text>
            <Text style={s.subMeta} numberOfLines={1}>
              {[r.student?.rollNumber && `Roll ${r.student.rollNumber}`, r.student?.className].filter(Boolean).join(' · ') || '--'}
            </Text>
            {r.score != null && (
              <View style={{ marginTop: 6, gap: 4 }}>
                <Text style={s.subScore}>{r.score} / {data.totalMarks} · {fmtSpent(r.timeTaken)}{r.violationCount ? ` · ${r.violationCount} switches` : ''}</Text>
                <ScoreBar value={r.percentage} />
              </View>
            )}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <AttemptPill status={r.status} />
            {r.score != null && <Outcome passed={r.passed} />}
          </View>
        </TouchableOpacity>
      ))}
      <PaperSheet xapi={xapi} exam={exam} student={open} onClose={() => setOpen(null)} />
    </>
  );
}

/** One student's marked paper. */
function PaperSheet({ xapi, exam, student, onClose }: { xapi: XApi; exam: any; student: any; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    if (!student) { setData(null); return; }
    xapi.studentResponse(exam._id, String(student.student._id))
      .then((r) => setData(unwrap(r)))
      .catch((e) => { Alert.alert('Could not load the paper', err(e)); onClose(); });
  }, [student]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <FormModal visible={!!student} title={student?.student?.name ?? 'Paper'} onClose={onClose}>
      {!data ? <LoaderView /> : (
        <>
          <View style={s.paperHead}>
            <View>
              <Text style={s.paperScore}>{data.score} / {data.totalMarks}</Text>
              <Text style={s.cardSub}>{data.percentage}% · {fmtSpent(data.timeTaken)}</Text>
            </View>
            <Outcome passed={data.passed} />
          </View>
          <View style={s.paperCounts}>
            <Pill label={`${data.correct} correct`} tone="good" />
            <Pill label={`${data.incorrect} incorrect`} tone="bad" />
            <Pill label={`${data.unanswered} not answered`} />
          </View>
          {(data.questions ?? []).map((q: any, i: number) => <QuestionCard key={q._id} q={q} index={i} viewer="teacher" />)}
        </>
      )}
    </FormModal>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────

function Results({ exam, reload }: { exam: any; reload: () => void }) {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [publishDate, setPublishDate] = useState('');

  const load = useCallback(() => {
    teacherApi.getResultApproval(exam._id).then((r) => setData(unwrap(r))).catch((e) => Alert.alert('Could not load results', err(e)));
  }, [exam._id]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <LoaderView />;
  const p = data.permissions ?? {};
  const step1 = data.subjectTeacherApprovalStatus === 'approved';
  const step2 = data.resultApprovalStatus ?? 'pending';

  const act = async (fn: () => Promise<any>, done: string) => {
    setBusy(true);
    try { await fn(); Alert.alert('Done', done); load(); reload(); }
    catch (e: any) { Alert.alert('Not saved', err(e)); }
    finally { setBusy(false); }
  };

  const reject = async () => {
    const ok = await confirmAsync('Reject results', 'Results stay hidden from students and parents. You can approve them later.', 'Reject');
    if (!ok) return;
    act(() => teacherApi.approveResults(exam._id, { action: 'reject', reason: 'Rejected from the mobile app — re-checking the scores' }), 'Results rejected');
  };

  return (
    <>
      <Card>
        <Text style={s.cardTitle}>Results approval</Text>
        <Text style={s.cardSub}>
          {p.needsSubjectStep
            ? 'Two steps: the teacher who wrote it confirms the scores, then the class teacher publishes them'
            : 'Set by the school office — the class teacher approves and publishes'}
        </Text>
        <View style={{ marginTop: Spacing.md, gap: 12 }}>
          <Step n={1} state={data.stage === 'completed' ? 'done' : 'todo'} title="Exam closed"
            text={data.stage === 'completed'
              ? `${data.submitted} of ${plural(data.eligible, 'student')} submitted${data.averageScore != null ? ` · class average ${data.averageScore}%` : ''}`
              : `Closes ${fmtExamDay(exam)}`} />

          <Step n={2} state={!p.needsSubjectStep || step1 ? 'done' : 'todo'} title="Subject teacher confirms the scores"
            text={!p.needsSubjectStep ? 'Not needed — set by the school office'
              : step1 ? `Confirmed by ${data.subjectTeacherApprovedBy?.name ?? '--'}`
                : p.canSubjectApprove ? 'Check the submissions, then confirm the scores'
                  : `Waiting for ${data.createdBy?.name ?? 'the teacher who wrote it'}`}>
            {p.canSubjectApprove && (
              <ActionBtn label="Confirm scores" tone="success" onPress={() => act(() => teacherApi.subjectApproveResults(exam._id), 'Scores confirmed')} disabled={busy} />
            )}
          </Step>

          <Step n={3} state={step2 === 'approved' ? 'done' : step2 === 'rejected' ? 'bad' : 'todo'} title="Class teacher approves and publishes"
            text={step2 === 'approved'
              ? `Approved by ${data.resultApprovedBy?.name ?? '--'}${data.resultPublishDate ? ` · publishes ${fmtExamDay({ examDate: data.resultPublishDate })}` : ' · students can see their scores'}`
              : step2 === 'rejected' ? `Rejected: ${data.resultRejectionReason || 'no reason given'}`
                : p.canFinalApprove ? 'Approve to publish the scores to students and parents'
                  : p.isClassTeacher && p.needsSubjectStep && !step1 ? 'You can approve once the scores are confirmed in step 2'
                    : 'Waiting for the class teacher of this exam’s section'}>
            {p.canFinalApprove && (
              <View style={{ gap: 8, width: '100%' }}>
                <Input label="Publish on (optional, YYYY-MM-DD)" value={publishDate} onChange={setPublishDate} placeholder="Leave empty to publish now" />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <ActionBtn label="Approve & publish" tone="success" disabled={busy}
                    onPress={() => act(() => teacherApi.approveResults(exam._id, { action: 'approve', resultPublishDate: publishDate || undefined }), 'Results published')} />
                  <ActionBtn label="Reject" tone="danger" disabled={busy} onPress={reject} />
                </View>
              </View>
            )}
          </Step>
        </View>
      </Card>
    </>
  );
}

/**
 * The school office's sign-off: release (now or on a date) or withhold. It
 * stands in for both teacher steps — whoever signs is recorded on each.
 */
function OfficeResults({ exam, reload }: { exam: any; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [publishDate, setPublishDate] = useState('');
  const [reason, setReason] = useState('');
  const r = exam.results ?? {};
  const a = exam.approval ?? {};
  const at = exam.attempts ?? {};

  const decide = async (body: object, done: string) => {
    setBusy(true);
    try { await adminApi.decideAptitudeResults(exam._id, body); Alert.alert('Done', done); reload(); }
    catch (e: any) { Alert.alert('Not saved', err(e)); }
    finally { setBusy(false); }
  };

  const release = () => {
    if (publishDate && !/^\d{4}-\d{2}-\d{2}$/.test(publishDate)) { Alert.alert('Check the date', 'Publish date must be YYYY-MM-DD'); return; }
    decide({ action: 'release', publishDate: publishDate || undefined }, publishDate ? `Results publish on ${publishDate}` : 'Results released');
  };
  const withhold = async () => {
    if (!await confirmAsync('Withhold results', 'Students and parents will not see the scores until you release them.', 'Withhold')) return;
    decide({ action: 'withhold', reason }, 'Results withheld');
  };

  if (exam.stage !== 'completed') {
    return <Empty icon="time-outline" text={`Results can be released once the exam closes on ${fmtExamDay(exam)}`} />;
  }

  return (
    <>
      <Figures>
        <Figure label="Submitted" value={`${exam.submitted}/${exam.eligible}`} icon="people" tone="info" />
        <Figure label="Average" value={exam.averageScore == null ? '--' : `${exam.averageScore}%`} icon="trophy" tone="success" />
        <Figure label="Passed" value={at.passed ?? 0} icon="checkmark-circle" tone="neutral" />
        <Figure label="High / low" value={at.highest == null ? '--' : `${at.highest} / ${at.lowest}`} icon="stats-chart" tone="neutral" />
      </Figures>

      <Card>
        <Text style={s.cardTitle}>Results</Text>
        <Text style={s.cardSub}>
          {r.state === 'released' ? 'Released — students and parents can see their scores'
            : r.state === 'scheduled' ? `Approved — publishes ${fmtExamDay({ examDate: r.publishDate })}`
              : r.state === 'withheld' ? `Withheld${r.reason ? `: ${r.reason}` : ''}`
                : 'Awaiting sign-off'}
        </Text>
        <View style={{ marginTop: Spacing.md, gap: 12 }}>
          <Step n={1} state={a.subjectTeacher?.status === 'approved' ? 'done' : 'todo'} title="Scores confirmed"
            text={a.subjectTeacher?.status === 'approved' ? `By ${a.subjectTeacher.by ?? '--'}` : 'Not yet — releasing here confirms them too'} />
          <Step n={2} state={a.final?.status === 'approved' ? 'done' : a.final?.status === 'rejected' ? 'bad' : 'todo'} title="Results approved"
            text={a.final?.status === 'approved' ? `By ${a.final.by ?? '--'}` : a.final?.status === 'rejected' ? `Withheld by ${a.final.by ?? '--'}` : 'Waiting'}>
          </Step>
        </View>

        {r.state !== 'released' && (
          <View style={{ marginTop: Spacing.md, gap: 8 }}>
            <Input label="Publish on (optional, YYYY-MM-DD)" value={publishDate} onChange={setPublishDate} placeholder="Leave empty to release now" />
            {r.state !== 'withheld' && (
              <Input label="Reason if withholding (optional)" value={reason} onChange={setReason} placeholder="e.g. Re-checking question 4" />
            )}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <ActionBtn label={publishDate ? 'Schedule release' : 'Release results'} tone="success" disabled={busy} onPress={release} />
              {r.state !== 'withheld' && <ActionBtn label="Withhold" tone="danger" disabled={busy} onPress={withhold} />}
            </View>
          </View>
        )}
        {r.state === 'released' && (
          <View style={{ marginTop: Spacing.md }}>
            <ActionBtn label="Withhold results" tone="danger" disabled={busy} onPress={withhold} />
          </View>
        )}
      </Card>
    </>
  );
}

function Step({ n, state, title, text, children }: { n: number; state: 'done' | 'todo' | 'bad'; title: string; text: string; children?: React.ReactNode }) {
  const tone = state === 'done' ? Colors.success : state === 'bad' ? Colors.danger : Colors.textLight;
  return (
    <View style={s.step}>
      <View style={[s.stepDot, { backgroundColor: state === 'todo' ? Colors.surfaceAlt : tone }]}>
        {state === 'todo'
          ? <Text style={s.stepNum}>{n}</Text>
          : <Ionicons name={state === 'done' ? 'checkmark' : 'close'} size={14} color="#fff" />}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Text style={s.stepTitle}>{title}</Text>
        <Text style={s.stepText}>{text}</Text>
        {children}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 17, fontWeight: '700', color: Colors.text },
  headTags: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  subject: { fontSize: 12, color: Colors.textSecondary },
  facts: { flexDirection: 'row', flexWrap: 'wrap', marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: 6 },
  reportBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.divider },
  reportText: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.text },
  manage: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.md, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.divider },

  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  cardSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },
  meters: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },

  detail: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  detailLabel: { fontSize: 12, color: Colors.textSecondary, flexShrink: 0 },
  detailValue: { fontSize: 12, fontWeight: '600', color: Colors.text, flex: 1, textAlign: 'right' },

  formLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, marginTop: 4 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, borderRadius: Radius.md, marginBottom: 4 },
  optRowOn: { backgroundColor: '#F0FDF4' },
  optFixed: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text },
  hint: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16, marginBottom: Spacing.sm },

  subRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: 8,
  },
  subName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  subMeta: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  subScore: { fontSize: 11, color: Colors.textSecondary },

  paperHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  paperScore: { fontSize: 22, fontWeight: '800', color: Colors.text },
  paperCounts: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: Spacing.md },

  step: { flexDirection: 'row', gap: 12 },
  stepDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary },
  stepTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  stepText: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
});
