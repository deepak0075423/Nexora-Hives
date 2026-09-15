import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { VIZ, TONE_COLOR, toneForPercent } from '@/components/ui/viz';

/**
 * The pieces every aptitude exam screen in the app is built from — the same
 * language as the web module (school-frontend/src/pages/exams): an exam's
 * stage, its mark, the publish checklist, a question as it was answered, and
 * the small score figures.
 *
 * The server decides every figure and every verdict; this file only draws them.
 */

// ── Stage ─────────────────────────────────────────────────────────────────────

export type Stage = 'draft' | 'scheduled' | 'live' | 'completed' | 'cancelled';

export const STAGES: Record<string, { label: string; bg: string; color: string }> = {
  draft:     { label: 'Draft',     bg: Colors.warningLight, color: Colors.warning },
  scheduled: { label: 'Scheduled', bg: Colors.infoLight,    color: Colors.info },
  live:      { label: 'Live',      bg: Colors.successLight, color: Colors.success },
  completed: { label: 'Completed', bg: '#EDE9FE',           color: '#6D28D9' },
  cancelled: { label: 'Cancelled', bg: Colors.surfaceAlt,   color: Colors.textSecondary },
};

export function StagePill({ stage }: { stage?: string }) {
  const s = STAGES[stage ?? 'draft'] ?? STAGES.draft;
  return (
    <View style={[p.pill, { backgroundColor: s.bg }]}>
      {stage === 'live' && <View style={p.liveDot} />}
      <Text style={[p.pillText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' }) {
  const map: Record<string, { bg: string; color: string }> = {
    neutral: { bg: Colors.surfaceAlt, color: Colors.textSecondary },
    good:    { bg: Colors.successLight, color: Colors.success },
    warn:    { bg: Colors.warningLight, color: Colors.warning },
    bad:     { bg: Colors.dangerLight, color: Colors.danger },
    accent:  { bg: '#EDE9FE', color: '#4F46E5' },
  };
  const t = map[tone];
  return <View style={[p.pill, { backgroundColor: t.bg }]}><Text style={[p.pillText, { color: t.color }]}>{label}</Text></View>;
}

/** The glyph beside an exam, read off its title and subject — as on the web. */
const LOOKS: { test: RegExp; icon: string; bg: string; color: string }[] = [
  { test: /\b(math|maths|mathematics|quant\w*|arithmetic|algebra|geometry)\b/i, icon: 'calculator', bg: '#DCFCE7', color: '#16A34A' },
  { test: /\b(english|verbal|language|hindi|grammar|reading|comprehension)\b/i, icon: 'book', bg: '#EDE9FE', color: '#7C3AED' },
  { test: /\b(science|physics|chemistry|biology|evs)\b/i, icon: 'flask', bg: '#E0F2FE', color: '#0284C7' },
  { test: /\b(logic\w*|reason\w*|puzzle\w*|iq|brain)\b/i, icon: 'bulb', bg: '#FCE7F3', color: '#DB2777' },
];

export function ExamMark({ exam, size = 40 }: { exam: any; size?: number }) {
  const text = `${exam?.title ?? ''} ${exam?.subjectName ?? exam?.subject?.subjectName ?? ''}`;
  const look = LOOKS.find(l => l.test.test(text)) ?? { icon: 'stats-chart', bg: '#FFEDD5', color: '#EA580C' };
  return (
    <View style={[p.mark, { width: size, height: size, backgroundColor: look.bg }]}>
      <Ionicons name={look.icon as any} size={Math.round(size * 0.5)} color={look.color} />
    </View>
  );
}

// ── Dates ─────────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The calendar day as entered — examDate is UTC midnight, so read the ISO day. */
export function fmtExamDay(exam: any) {
  if (!exam?.examDate) return '--';
  const [y, m, d] = new Date(exam.examDate).toISOString().slice(0, 10).split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

export function fmtClock(hhmm?: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) return '--';
  const h = Number(m[1]);
  return `${String(h % 12 || 12).padStart(2, '0')}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

export function fmtEndClock(exam: any) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(exam?.startTime ?? '');
  if (!m) return '--';
  const mins = Number(m[1]) * 60 + Number(m[2]) + (Number(exam.duration) || 0);
  return fmtClock(`${Math.floor(mins / 60) % 24}:${String(mins % 60).padStart(2, '0')}`);
}

/** "3:05 – 4:05 PM" — the half named once when both ends share it. */
export function fmtClockRange(exam: any) {
  const from = fmtClock(exam?.startTime); const to = fmtEndClock(exam);
  if (from === '--' || to === '--') return '--';
  const trim = (t: string) => t.replace(/^0/, '');
  return from.slice(-2) === to.slice(-2) ? `${trim(from.slice(0, -3))} – ${trim(to)}` : `${trim(from)} – ${trim(to)}`;
}

export function fmtGap(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60); const sec = s % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

export function fmtSpent(ms?: number | null) {
  if (ms == null) return '--';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── Exam row ──────────────────────────────────────────────────────────────────

/** One exam in a list: mark, title, subject, when, and where it stands. */
export function ExamRow({ exam, onPress, right, footer }: {
  exam: any; onPress?: () => void; right?: React.ReactNode; footer?: React.ReactNode;
}) {
  const Wrap: any = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={p.row} onPress={onPress} activeOpacity={0.75}>
      <View style={p.rowTop}>
        <ExamMark exam={exam} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={p.rowTitle} numberOfLines={2}>{exam.title}</Text>
          <Text style={p.rowSub} numberOfLines={1}>
            {exam.subjectName ?? exam.subject?.subjectName ?? 'General Aptitude'}
            {exam.audience?.label ? ` · ${exam.audience.label}` : ''}
          </Text>
        </View>
        {right ?? <StagePill stage={exam.stage} />}
      </View>
      <View style={p.rowFacts}>
        <Fact icon="calendar-outline" text={fmtExamDay(exam)} />
        <Fact icon="time-outline" text={`${fmtClockRange(exam)} · ${exam.duration} min`} />
        {exam.eligible != null && (
          <Fact icon="people-outline" text={['live', 'completed'].includes(exam.stage)
            ? `${exam.submitted} of ${exam.eligible} submitted` : plural(exam.eligible, 'student')} />
        )}
      </View>
      {footer}
    </Wrap>
  );
}

export function Fact({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={p.fact}>
      <Ionicons name={icon as any} size={13} color={Colors.textLight} />
      <Text style={p.factText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

/** Label over value, used in the facts strip of a detail header. */
export function FactCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={p.factCell}>
      <Text style={p.factCellLabel}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number'
        ? <Text style={p.factCellValue}>{value}</Text> : value}
    </View>
  );
}

// ── Figures ───────────────────────────────────────────────────────────────────

const TILE_TONE: Record<string, { bg: string; color: string }> = {
  info:    { bg: Colors.infoLight, color: Colors.info },
  success: { bg: Colors.successLight, color: Colors.success },
  warning: { bg: Colors.warningLight, color: Colors.warning },
  danger:  { bg: Colors.dangerLight, color: Colors.danger },
  accent:  { bg: '#EDE9FE', color: '#4F46E5' },
  neutral: { bg: Colors.surfaceAlt, color: Colors.textSecondary },
};

/**
 * Two figures a row. The kit's four-across StatRow splits a word like
 * "SCHEDULED" in half at phone width; these wrap between words only.
 */
export function Figures({ children }: { children: React.ReactNode }) {
  return <View style={p.figures}>{children}</View>;
}

export function Figure({ label, value, icon, tone = 'neutral', note }: {
  label: string; value: React.ReactNode; icon: string; tone?: keyof typeof TILE_TONE; note?: string | null;
}) {
  const t = TILE_TONE[tone] ?? TILE_TONE.neutral;
  return (
    <View style={p.figure}>
      <View style={[p.figureIcon, { backgroundColor: t.bg }]}><Ionicons name={icon as any} size={15} color={t.color} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={p.figureLabel}>{label}</Text>
        <Text style={p.figureValue}>{value}</Text>
        {note ? <Text style={p.figureNote}>{note}</Text> : null}
      </View>
    </View>
  );
}

// ── Publish readiness ─────────────────────────────────────────────────────────

/**
 * The publish checklist, exactly as the server computed it
 * (services/aptitudeExam.js `publishReadiness`): every check, ticked or not,
 * with what to do about the ones that are not.
 */
export function ReadinessList({ readiness }: { readiness?: any }) {
  if (!readiness?.checks) return null;
  return (
    <View style={{ gap: 8 }}>
      {readiness.checks.map((c: any) => (
        <View key={c.key} style={p.check}>
          <Ionicons
            name={c.ok ? 'checkmark-circle' : 'alert-circle'}
            size={17}
            color={c.ok ? Colors.success : Colors.warning}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={p.checkLabel}>{c.label}</Text>
            <Text style={[p.checkDetail, !c.ok && { color: Colors.warning }]}>{c.detail}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Publish — disabled until the exam is complete, and it says why when pressed
 * rather than doing nothing.
 */
export function PublishButton({ readiness, onPublish, busy, label = 'Publish exam' }: {
  readiness?: any; onPublish: () => void; busy?: boolean; label?: string;
}) {
  const ready = !!readiness?.ready;
  const [why, setWhy] = React.useState(false);
  const missing = (readiness?.checks ?? []).filter((c: any) => !c.ok);
  return (
    <View style={{ gap: 8 }}>
      <TouchableOpacity
        style={[p.publish, !ready && p.publishBlocked, busy && { opacity: 0.6 }]}
        onPress={() => (ready ? onPublish() : setWhy(v => !v))}
        activeOpacity={0.85}
        accessibilityState={{ disabled: !ready }}
      >
        <Ionicons name={ready ? 'checkmark-circle' : 'alert-circle'} size={16} color={ready ? '#fff' : Colors.textSecondary} />
        <Text style={[p.publishText, !ready && { color: Colors.textSecondary }]}>{busy ? 'Publishing…' : label}</Text>
      </TouchableOpacity>
      {why && !ready && (
        <View style={p.whyBox}>
          <Text style={p.whyTitle}>Can’t publish yet</Text>
          {missing.map((c: any) => (
            <Text key={c.key} style={p.whyLine}>• <Text style={{ fontWeight: '700' }}>{c.label}:</Text> {c.detail}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

/** A count against its target — questions added, marks allocated. `unit` is singular ("question"). */
export function Meter({ label, have, want, unit }: { label: string; have: number; want: number; unit: string }) {
  const done = want > 0 && Math.abs(have - want) < 0.001;
  const over = have > want;
  const pct = want > 0 ? Math.min(100, (have / want) * 100) : 0;
  const diff = Math.round(Math.abs(want - have) * 100) / 100;
  const color = done ? VIZ.good : over ? VIZ.bad : VIZ.accent;
  return (
    <View style={{ flex: 1, minWidth: 130 }}>
      <View style={p.meterHead}>
        <Text style={p.meterLabel}>{label}</Text>
        <Text style={p.meterValue}>{Math.round(have * 100) / 100} / {want || '--'}</Text>
      </View>
      <View style={p.meterTrack}><View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 8 }} /></View>
      <Text style={[p.meterNote, { color: done ? Colors.success : over ? Colors.danger : Colors.warning }]}>
        {want <= 0 ? `Set the total ${unit}s` : done ? 'Complete' : over ? `${plural(diff, unit)} over` : `${plural(diff, unit)} to go`}
      </Text>
    </View>
  );
}

// ── Score pieces ──────────────────────────────────────────────────────────────

export function ScoreBar({ value }: { value?: number | null }) {
  const tone = toneForPercent(value);
  return (
    <View style={p.scoreBar}>
      <View style={p.scoreTrack}>
        <View style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%`, height: '100%', backgroundColor: TONE_COLOR[tone], borderRadius: 8 }} />
      </View>
      <Text style={p.scoreVal}>{value == null ? '--' : `${value}%`}</Text>
    </View>
  );
}

export function Outcome({ passed }: { passed?: boolean | null }) {
  if (passed == null) return null;
  return <Pill label={passed ? 'Passed' : 'Not passed'} tone={passed ? 'good' : 'bad'} />;
}

const ATTEMPT: Record<string, { label: string; tone: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' }> = {
  not_started:    { label: 'Not started', tone: 'neutral' },
  in_progress:    { label: 'In progress', tone: 'accent' },
  submitted:      { label: 'Submitted', tone: 'good' },
  auto_submitted: { label: 'Auto-submitted', tone: 'warn' },
  missed:         { label: 'Missed', tone: 'bad' },
};
export function AttemptPill({ status }: { status?: string }) {
  const a = ATTEMPT[status ?? 'not_started'] ?? ATTEMPT.not_started;
  return <Pill label={a.label} tone={a.tone} />;
}

// ── One question, as it was answered ──────────────────────────────────────────

export const QUESTION_TYPE_LABEL: Record<string, string> = {
  mcq_single: 'Single choice', mcq_multiple: 'Multiple choice', true_false: 'True / False',
};

const letter = (i: number) => String.fromCharCode(65 + i);

/**
 * A marked question. `keyOnly` shows just the answer key (the question editor);
 * otherwise the chosen answer is marked beside the correct one, in words as
 * well as colour.
 */
export function QuestionCard({ q, index, keyOnly, viewer = 'student', actions }: {
  q: any; index: number; keyOnly?: boolean; viewer?: 'student' | 'teacher'; actions?: React.ReactNode;
}) {
  const selected: string[] = q.selected ?? [];
  const key: string[] = q.correctAnswers ?? [];
  const state = keyOnly ? null : !selected.length ? 'unanswered' : q.isCorrect ? 'correct' : 'incorrect';
  const border = state === 'correct' ? Colors.success : state === 'incorrect' ? Colors.danger : state === 'unanswered' ? Colors.textLight : Colors.border;

  return (
    <View style={[p.qCard, { borderLeftColor: border, borderLeftWidth: 4 }]}>
      <View style={p.qHead}>
        <View style={p.qNum}><Text style={p.qNumText}>Q{index + 1}</Text></View>
        <Pill label={QUESTION_TYPE_LABEL[q.questionType] ?? q.questionType} />
        {state === 'correct' && <Pill label="Correct" tone="good" />}
        {state === 'incorrect' && <Pill label="Incorrect" tone="bad" />}
        {state === 'unanswered' && <Pill label="Not answered" tone="neutral" />}
        <View style={{ flex: 1 }} />
        <Text style={p.qMarks}>
          {keyOnly ? plural(q.marks, 'mark') : `${q.earnedMarks ?? (q.isCorrect ? q.marks : 0)} / ${q.marks}`}
        </Text>
        {actions}
      </View>
      <Text style={p.qText}>{q.questionText}</Text>
      <View style={{ gap: 6 }}>
        {(q.options ?? []).map((o: any, i: number) => {
          const isKey = key.includes(o.optionId);
          const isSel = selected.includes(o.optionId);
          return (
            <View key={o.optionId} style={[p.opt, isKey && p.optKey, !isKey && isSel && p.optWrong]}>
              <View style={[p.optLetter, isKey && { backgroundColor: Colors.success }, !isKey && isSel && { backgroundColor: Colors.danger }]}>
                <Text style={[p.optLetterText, (isKey || isSel) && { color: '#fff' }]}>
                  {q.questionType === 'true_false' ? (o.optionId === 'true' ? 'T' : 'F') : letter(i)}
                </Text>
              </View>
              <Text style={p.optText}>{o.text}</Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {!keyOnly && isSel && <Pill label={viewer === 'student' ? 'Your answer' : 'Chosen'} tone={isKey ? 'accent' : 'bad'} />}
                {isKey && <Pill label={keyOnly ? 'Correct' : 'Correct answer'} tone="good" />}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── Insights ──────────────────────────────────────────────────────────────────

const TONE_ICON: Record<string, { icon: string; color: string; bg: string }> = {
  good: { icon: 'checkmark-circle', color: Colors.success, bg: Colors.successLight },
  warn: { icon: 'alert-circle', color: Colors.warning, bg: Colors.warningLight },
  bad:  { icon: 'close-circle', color: Colors.danger, bg: Colors.dangerLight },
  info: { icon: 'information-circle', color: Colors.info, bg: Colors.infoLight },
};

export function Insights({ items }: { items: { tone: string; text: string }[] }) {
  if (!items?.length) return null;
  return (
    <View style={{ gap: 8 }}>
      {items.map((it, i) => {
        const t = TONE_ICON[it.tone] ?? TONE_ICON.info;
        return (
          <View key={i} style={[p.insight, { backgroundColor: t.bg, borderLeftColor: t.color }]}>
            <Ionicons name={t.icon as any} size={16} color={t.color} />
            <Text style={p.insightText}>{it.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

const p = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: Radius.full, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '600' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },

  mark: { borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },

  row: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: 10 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTitle: { ...Typography.h4, color: Colors.text },
  rowSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  rowFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  factText: { fontSize: 11, color: Colors.textSecondary, flexShrink: 1 },

  factCell: { minWidth: 92, flexGrow: 1, flexBasis: '30%', paddingVertical: 6 },
  factCellLabel: { fontSize: 10, color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.4 },
  factCellValue: { fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 2 },

  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.md },
  figure: { flexGrow: 1, flexBasis: '46%', minWidth: 140, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 11 },
  figureIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  figureLabel: { fontSize: 11, color: Colors.textSecondary },
  figureValue: { fontSize: 18, fontWeight: '800', color: Colors.text, marginTop: 1 },
  figureNote: { fontSize: 10, color: Colors.textLight, marginTop: 1 },

  check: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  checkLabel: { fontSize: 12, fontWeight: '600', color: Colors.text },
  checkDetail: { fontSize: 11, color: Colors.textSecondary, marginTop: 1, lineHeight: 15 },

  publish: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 11 },
  publishBlocked: { backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  publishText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  whyBox: { backgroundColor: Colors.warningLight, borderRadius: Radius.md, padding: Spacing.sm, gap: 4 },
  whyTitle: { fontSize: 12, fontWeight: '700', color: Colors.warning },
  whyLine: { fontSize: 11, color: Colors.text, lineHeight: 16 },

  meterHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  meterLabel: { fontSize: 12, color: Colors.textSecondary },
  meterValue: { fontSize: 13, fontWeight: '700', color: Colors.text },
  meterTrack: { height: 8, borderRadius: 8, backgroundColor: VIZ.track, marginTop: 5, overflow: 'hidden' },
  meterNote: { fontSize: 10, fontWeight: '600', marginTop: 3 },

  scoreBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreTrack: { flex: 1, minWidth: 54, height: 7, borderRadius: 8, backgroundColor: VIZ.track, overflow: 'hidden' },
  scoreVal: { fontSize: 12, fontWeight: '700', color: Colors.text, minWidth: 38, textAlign: 'right' },

  qCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: 10 },
  qHead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  qNum: { backgroundColor: '#EDE9FE', borderRadius: Radius.sm, paddingHorizontal: 7, paddingVertical: 3 },
  qNumText: { fontSize: 11, fontWeight: '800', color: '#4F46E5' },
  qMarks: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  qText: { fontSize: 14, color: Colors.text, lineHeight: 20, marginVertical: 10 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 8, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, flexWrap: 'wrap' },
  optKey: { borderColor: Colors.success, backgroundColor: '#F0FDF4' },
  optWrong: { borderColor: Colors.danger, backgroundColor: '#FEF2F2' },
  optLetter: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  optLetterText: { fontSize: 11, fontWeight: '800', color: Colors.textSecondary },
  optText: { flex: 1, minWidth: 80, fontSize: 13, color: Colors.text },

  insight: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: Radius.md, borderLeftWidth: 3 },
  insightText: { flex: 1, minWidth: 0, fontSize: 12, color: Colors.text, lineHeight: 17 },
});
