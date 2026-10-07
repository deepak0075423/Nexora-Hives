/**
 * The Results module on the phone (Oct 2026): the pieces its screens share.
 *
 *   gradeColor   a grade's colour on the school's own scale (A green, B blue,
 *                C/D amber, E/F red — the web's resultMeta.gradeTone)
 *   Tiles        the figures a screen leads with, two across
 *   KidSwitch    a parent's children, as cards — whose results these are is
 *                the most important fact on the screen
 *   Scorecard    one exam's result: tap to see every subject
 *   Overall      the year's overall result, "so far" until it is whole
 *
 * Every figure comes from the same read models the web pages use; nothing on
 * the phone works a mark, a grade or a pass out for itself.
 *
 * Since Oct 2026 the scorecard also shows a withheld result as withheld (the
 * school's reason, no figures), a paper's parts, a graded paper's grade, the
 * subject teacher's remark, the class's average and highest per subject, the
 * rank across the whole class, each re-exam paper's own day, and — while the
 * school's window is open — asks for a paper to be checked again.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { TextInput } from '@/components/ui/TextInput';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

/* ── Numbers and days ────────────────────────────────────────────────────── */

export const pct = (v: any) => (v === null || v === undefined || v === '' ? '—' : `${Math.round(Number(v) * 10) / 10}%`);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const valid = (d: any) => { const x = d ? new Date(d) : null; return x && !Number.isNaN(x.getTime()) ? x : null; };
/**
 * A calendar day — an exam's dates, a paper's date. Stored at UTC midnight of
 * the day they mean, so read by their UTC parts; read locally, a phone west of
 * Greenwich would show the day before.
 */
export const fmtDay = (d: any) => {
  const x = valid(d);
  return x ? `${String(x.getUTCDate()).padStart(2, '0')} ${MON[x.getUTCMonth()]} ${x.getUTCFullYear()}` : '';
};
export const fmtDayShort = (d: any) => {
  const x = valid(d);
  return x ? `${DOW[x.getUTCDay()]} ${x.getUTCDate()} ${MON[x.getUTCMonth()]}` : '';
};
export const fmtRange = (a: any, b: any) => {
  const x = valid(a); const y = valid(b);
  if (!x || !y) return fmtDay(a || b);
  if (x.getTime() === y.getTime()) return fmtDay(a);
  if (x.getUTCFullYear() === y.getUTCFullYear() && x.getUTCMonth() === y.getUTCMonth()) return `${x.getUTCDate()} – ${fmtDay(b)}`;
  return `${fmtDay(a)} – ${fmtDay(b)}`;
};
/** "09:30" → "9:30 am". */
export const fmtTime = (t?: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  if (!m) return '';
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
};
/** "9:30–11:00 am", or "11:30 am–1:00 pm" across noon. */
export const fmtTimeRange = (a?: string, b?: string) => {
  const x = fmtTime(a); const y = fmtTime(b);
  if (!x) return '';
  if (!y) return x;
  return x.slice(-2) === y.slice(-2) ? `${x.slice(0, -3)}–${y}` : `${x}–${y}`;
};
export const classLine = (r: any) => [r?.className, r?.sectionName].filter(Boolean).join(' – ');
export const plural = (n: number, one: string, many?: string) => `${n} ${n === 1 ? one : (many || `${one}s`)}`;

/* ── Grades ──────────────────────────────────────────────────────────────── */

const LETTER: Record<string, { fg: string; bg: string }> = {
  A: { fg: Colors.success, bg: Colors.successLight },
  O: { fg: Colors.success, bg: Colors.successLight },
  B: { fg: Colors.info, bg: Colors.infoLight },
  C: { fg: Colors.warning, bg: Colors.warningLight },
  D: { fg: Colors.warning, bg: Colors.warningLight },
  E: { fg: Colors.danger, bg: Colors.dangerLight },
  F: { fg: Colors.danger, bg: Colors.dangerLight },
};
/**
 * A grade's colour. It goes by the letter — unless the scale the grade is on
 * (sent with the result) says it is a failing grade (red), or a passing one
 * (never red, whatever its letter); absent is grey.
 */
export function gradeColor(grade?: string, scale?: { grade: string; pass?: boolean }[] | null) {
  const g = String(grade || '').trim();
  if (!g || g.toUpperCase() === 'AB') return { fg: Colors.textSecondary, bg: Colors.surfaceAlt };
  const band = Array.isArray(scale) ? scale.find((b) => b?.grade === g) : null;
  if (band && band.pass === false) return LETTER.F;
  const tone = LETTER[g.charAt(0).toUpperCase()];
  if (band) return tone && tone !== LETTER.F ? tone : LETTER.B;
  return tone || { fg: Colors.primary, bg: Colors.surfaceAlt };
}

export function Pill({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <View style={[p.pill, { backgroundColor: bg }]}>
      <Text style={[p.pillText, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}
export const GradePill = ({ grade, scale }: { grade?: string; scale?: any[] | null }) => (grade ? <Pill label={grade} {...gradeColor(grade, scale)} /> : null);
export const PassPill = ({ passed, label }: { passed: boolean; label?: string }) => (
  <Pill label={label || (passed ? 'Passed' : 'Not passed')}
    fg={passed ? Colors.success : Colors.danger} bg={passed ? Colors.successLight : Colors.dangerLight} />
);

/* ── Tiles ───────────────────────────────────────────────────────────────── */

const TONE: Record<string, { fg: string; bg: string }> = {
  info: { fg: Colors.info, bg: Colors.infoLight },
  success: { fg: Colors.success, bg: Colors.successLight },
  warning: { fg: Colors.warning, bg: Colors.warningLight },
  danger: { fg: Colors.danger, bg: Colors.dangerLight },
  primary: { fg: Colors.primary, bg: '#EDE9FE' },
  neutral: { fg: Colors.textSecondary, bg: Colors.surfaceAlt },
};

/**
 * Two across: at phone width four across splits every label mid-word. A tile
 * given `onPress` is the way to the rows behind its number.
 */
export function Tiles({ items }: {
  items: { label: string; value: any; icon: string; tone?: string; cap?: string; onPress?: () => void; on?: boolean }[];
}) {
  return (
    <View style={p.tiles}>
      {items.map((t) => {
        const tone = TONE[t.tone || 'neutral'] || TONE.neutral;
        const body = (
          <>
            <View style={[p.tileIcon, { backgroundColor: tone.bg }]}>
              <Ionicons name={t.icon as any} size={16} color={tone.fg} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={p.tileValue} numberOfLines={1}>{String(t.value ?? '—')}</Text>
              <Text style={p.tileLabel} numberOfLines={1}>{t.label}</Text>
              {!!t.cap && <Text style={p.tileCap} numberOfLines={1}>{t.cap}</Text>}
            </View>
          </>
        );
        return t.onPress ? (
          <TouchableOpacity key={t.label} style={[p.tile, t.on && p.tileOn]} onPress={t.onPress} activeOpacity={0.8}
            accessibilityRole="button" accessibilityState={{ selected: !!t.on }}>
            {body}
          </TouchableOpacity>
        ) : <View key={t.label} style={p.tile}>{body}</View>;
      })}
    </View>
  );
}

/* ── A parent's children ─────────────────────────────────────────────────── */

/** `showSchool` — the children are not all at the school signed in to (the server's `multiSchool`). */
export function KidSwitch({ kids, value, onPick, caption = 'WHOSE RESULTS', showSchool = false }: {
  kids: any[]; value?: string | null; onPick: (id: string) => void; caption?: string; showSchool?: boolean;
}) {
  if (kids.length < 2) return null;
  return (
    <View style={{ gap: 8, marginBottom: Spacing.md }}>
      <Text style={p.cap}>{caption}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {kids.map((k) => {
          const on = String(k._id) === String(value);
          return (
            <TouchableOpacity key={k._id} onPress={() => onPick(String(k._id))} activeOpacity={0.85} style={[p.kid, on && p.kidOn]}
              accessibilityRole="button" accessibilityState={{ selected: on }}>
              <View style={[p.kidAvatar, on && { backgroundColor: Colors.primary }]}>
                <Text style={[p.kidAvatarText, on && { color: Colors.textInverse }]}>
                  {String(k.name || '?').trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                </Text>
              </View>
              <View style={{ maxWidth: 150 }}>
                <Text style={[p.kidName, on && { color: Colors.primary }]} numberOfLines={1}>{k.name}</Text>
                <Text style={p.kidClass} numberOfLines={1}>
                  {k.className ? `${k.className}${k.sectionName ? ` · ${k.sectionName}` : ''}` : 'No class yet'}
                  {showSchool && k.schoolName ? ` · ${k.schoolName}` : ''}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ── One exam's result ───────────────────────────────────────────────────── */

/** "Promoted to Class 7 – A", or — for a student placed to repeat — "Continues in Class 6 – A". */
export const moveText = (m: any) => (m?.kind === 'repeated' ? 'Continues in' : m?.kind === 'passedOut' ? 'Passed out of' : 'Promoted to');

/** "Re-exam on 12 Jun: Maths, Science" — or each paper with its own day. */
export function reExamLine(due: any) {
  if (!due) return '';
  const papers: any[] = due.papers?.length ? due.papers : (due.subjects || []).map((subjectName: string) => ({ subjectName, date: due.date }));
  const day = (x: any) => (x?.date ? `${fmtDay(x.date)}${x.startTime ? `, ${fmtTimeRange(x.startTime, x.endTime)}` : ''}` : 'day to be given');
  const days = new Set(papers.map((x) => `${x.date || ''}|${x.startTime || ''}`));
  return days.size <= 1
    ? `Re-exam ${papers[0]?.date ? `on ${day(papers[0])}` : '(day to be given)'}: ${papers.map((x) => x.subjectName).join(', ')}`
    : `Re-exam: ${papers.map((x) => `${x.subjectName} ${day(x)}`).join(' · ')}`;
}

const RECHECK: Record<string, string> = { open: 'Re-check asked', declined: 'Re-check declined' };

/** Ask for one paper to be checked again: what should be looked at. */
function AskRecheck({ subject, exam, until, onClose, onSend }: { subject: any; exam: any; until?: string; onClose: () => void; onSend: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    if (!reason.trim()) { setError('Say what should be checked — a total, a question, a page'); return; }
    setBusy(true); setError('');
    try { await onSend(reason.trim()); } catch (e: any) { setError(e?.message || 'The request could not be sent'); setBusy(false); }
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={p.sheetRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={p.sheet}>
          <Text style={p.sheetTitle}>Ask for a re-check</Text>
          <Text style={p.sheetSub}>{subject.subjectName} · {exam.title}</Text>
          <Text style={p.sheetNote}>The school checks the paper again — re-totals it, or looks at an answer again — and tells you what it found. If a mark was wrong it is corrected, and the result with it.{until ? ` Requests close on ${fmtDay(until)}.` : ''}</Text>
          <TextInput style={p.sheetInput} value={reason} onChangeText={(v) => { setReason(v.slice(0, 500)); setError(''); }} multiline autoFocus
            placeholder="e.g. Question 4 may not have been added to the total" placeholderTextColor={Colors.textLight} />
          {error ? <Text style={p.sheetError}>{error}</Text> : null}
          <View style={p.sheetBtns}>
            <TouchableOpacity style={p.sheetGhost} onPress={onClose} disabled={busy}><Text style={p.sheetGhostText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={p.sheetBtn} onPress={go} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={p.sheetBtnText}>Send Request</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Scorecard({ r, open: startOpen = false, onRecheck }: {
  r: any; open?: boolean; onRecheck?: (body: { examId: string; subjectId: string; reason: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(startOpen);
  const [asking, setAsking] = useState<any>(null);
  const e = r.exam || {};
  // Withheld: the family sees that it is, and why — no figures.
  if (r.withheld) {
    return (
      <View style={[p.card, p.heldCard]}>
        <View style={p.scHead}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={p.scTitle} numberOfLines={2}>{e.title}</Text>
            <Text style={p.scSub} numberOfLines={2}>{[e.examTypeLabel, classLine(e), e.yearName].filter(Boolean).join(' · ')}</Text>
          </View>
          <Pill label="Withheld" fg="#8A4B05" bg={Colors.warningLight} />
        </View>
        <View style={p.due}>
          <Ionicons name="lock-closed" size={14} color={Colors.warning} />
          <Text style={p.dueText}>The school is holding this result back for now{r.withheld.reason ? ` — ${r.withheld.reason}` : ''}. Please contact the school office.</Text>
        </View>
      </View>
    );
  }
  const scale = r.scale;
  const classWide = r.classRank && r.classOutOf && r.classOutOf > (r.outOf || 0);
  const canAsk = !!onRecheck && !!r.recheck?.open;
  return (
    <View style={p.card}>
      <TouchableOpacity onPress={() => setOpen((o) => !o)} activeOpacity={0.75} style={p.scHead}
        accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={p.scTitle} numberOfLines={2}>{e.title}</Text>
          <Text style={p.scSub} numberOfLines={2}>{[e.examTypeLabel, classLine(e), e.yearName].filter(Boolean).join(' · ')}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={p.scPct}>{pct(r.percentage)}</Text>
          <GradePill grade={r.grade} scale={scale} />
        </View>
      </TouchableOpacity>

      <View style={p.scFacts}>
        <PassPill passed={!!r.isPassed} />
        <Text style={p.scFact}>{r.totalMarks} / {r.totalMaxMarks}</Text>
        {r.rank ? <Text style={p.scFact}>Rank {r.rank} of {r.outOf}</Text> : null}
        {classWide ? <Text style={p.scFact}>{r.classRank} of {r.classOutOf} in the class</Text> : null}
        {r.classFigures?.avgPct != null ? <Text style={p.scFact}>Class avg {pct(r.classFigures.avgPct)}</Text> : null}
      </View>

      {r.reExamDue ? (
        <View style={p.due}>
          <Ionicons name="calendar" size={14} color={Colors.warning} />
          <Text style={p.dueText}>{reExamLine(r.reExamDue)}{r.reExamDue.note ? ` — ${r.reExamDue.note}` : ''}</Text>
        </View>
      ) : null}
      {r.promotion ? (
        <View style={p.promo}>
          <Ionicons name="school" size={14} color={Colors.success} />
          <Text style={p.promoText}>{moveText(r.promotion)} {[r.promotion.to?.className, r.promotion.to?.sectionName].filter(Boolean).join(' – ')}{r.promotion.kind !== 'passedOut' && r.promotion.to?.yearName ? ` for ${r.promotion.to.yearName}` : ''}</Text>
        </View>
      ) : null}

      {open ? (
        <View style={p.subs}>
          {(r.subjects || []).map((x: any) => {
            const rc = x.recheck;
            return (
              <View key={x._id || x.subjectName} style={p.subRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={p.subName} numberOfLines={1}>{x.subjectName}</Text>
                  <Text style={p.subNote} numberOfLines={3}>
                    {[
                      x.gradeOnly ? 'graded — not in the total' : `pass ${x.passingMarks}`,
                      !x.isAbsent && x.components?.length ? x.components.map((c: any) => `${c.label} ${c.marks ?? '—'}/${c.maxMarks}`).join(', ') : '',
                      x.graceMarks ? `incl. ${x.graceMarks} grace` : '',
                      x.reExam ? `re-exam${x.reExam.original ? ` · first ${x.reExam.original.isAbsent ? 'absent' : x.reExam.original.marksObtained}` : ''}` : '',
                      x.classFigures ? `class avg ${pct(x.classFigures.avgPct)}, top ${pct(x.classFigures.topPct)}` : '',
                    ].filter(Boolean).join(' · ')}
                  </Text>
                  {x.remarks ? <Text style={p.subRemark} numberOfLines={3}>“{x.remarks}”</Text> : null}
                  {rc ? (
                    <Text style={[p.subNote, { color: rc.status === 'open' ? Colors.warning : Colors.info }]} numberOfLines={3}>
                      {rc.status === 'resolved' ? (rc.outcome === 'changed' ? 'Re-checked: the mark was corrected' : 'Re-checked: the marks stand') : RECHECK[rc.status] || 'Re-check'}
                      {rc.response ? ` — ${rc.response}` : ''}
                    </Text>
                  ) : canAsk ? (
                    <TouchableOpacity onPress={() => setAsking(x)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Ask for ${x.subjectName} to be checked again`}>
                      <Text style={p.askLink}>Ask for a re-check</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {x.gradeOnly ? null : <Text style={[p.subScore, !x.isPassed && { color: Colors.danger }]}>{x.isAbsent ? 'AB' : `${x.marksObtained}/${x.maxMarks}`}</Text>}
                <View style={{ width: 44, alignItems: 'flex-end' }}><GradePill grade={x.isAbsent ? 'AB' : x.grade} scale={scale} /></View>
              </View>
            );
          })}
          {r.reExam ? <Text style={p.subFoot}>This result includes a re-exam. The rank is the exam’s own, from before it.</Text> : null}
          {canAsk ? <Text style={p.subFoot}>A paper marked wrongly? Ask for a re-check by {fmtDay(r.recheck.until)}.</Text> : null}
          {e.publishedOn ? <Text style={p.subFoot}>Published {fmtDay(e.publishedOn)}</Text> : null}
        </View>
      ) : (
        <Text style={p.more}>Tap for every subject</Text>
      )}
      {asking && onRecheck ? (
        <AskRecheck subject={asking} exam={e} until={r.recheck?.until} onClose={() => setAsking(null)}
          onSend={async (reason) => { await onRecheck({ examId: String(e._id), subjectId: String(asking._id), reason }); setAsking(null); }} />
      ) : null}
    </View>
  );
}

/* ── The year's overall result ───────────────────────────────────────────── */

export function Overall({ o }: { o: any }) {
  if (!o) return null;
  const whole = o.final || o.exams.length >= o.of;
  const result = whole ? (o.isPassed ? 'Passed' : 'Not passed') : (o.isPassed ? 'Passing so far' : 'Not passing so far');
  const classWide = o.classRank && o.classOutOf && o.classOutOf > (o.outOf || 0);
  return (
    <View style={p.card}>
      <Text style={p.ovTitle}>Overall Result · {o.year?.yearName}</Text>
      <Text style={p.ovSub}>
        {whole ? `The ${plural(o.exams.length, 'exam')} the school counts towards the year, ${o.method === 'weighted' ? 'weighed as its rule sets' : 'added up by marks'}`
          : `${o.exams.length} of the ${plural(o.of, 'exam')} the school counts, so far`}
      </Text>
      <View style={p.ovRow}>
        <View>
          <Text style={p.ovPct}>{pct(o.percentage)}</Text>
          <Text style={p.ovMarks}>{o.marks} / {o.max} marks</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <GradePill grade={o.grade} scale={o.scale} />
            <PassPill passed={!!o.isPassed} label={result} />
          </View>
          {o.rank ? <Text style={p.scFact}>Rank {o.rank} of {o.outOf} in the section</Text> : null}
          {classWide ? <Text style={p.scFact}>Rank {o.classRank} of {o.classOutOf} in the class</Text> : null}
        </View>
      </View>
      <View style={p.ovExams}>
        {o.exams.map((x: any) => (
          <View key={x._id} style={p.ovExam}>
            <Text style={p.ovExamName} numberOfLines={1}>{x.title}</Text>
            <Text style={[p.ovExamPct, !x.isPassed && { color: Colors.danger }]}>{pct(x.percentage)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────────────────────── */

const p = StyleSheet.create({
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '700' },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.md },
  tile: {
    flexBasis: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 12, borderWidth: 1, borderColor: Colors.border,
  },
  tileOn: { borderColor: Colors.primary, borderWidth: 1.5 },
  tileIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tileValue: { fontSize: 18, fontWeight: '700', color: Colors.text },
  tileLabel: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  tileCap: { fontSize: 10, color: Colors.textLight, marginTop: 1 },

  cap: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.8 },
  kid: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
  },
  kidOn: { borderColor: Colors.primary, borderWidth: 1.5 },
  kidAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  kidAvatarText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  kidName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  kidClass: { fontSize: 11, color: Colors.textSecondary },

  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  scHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  scTitle: { ...Typography.h4, color: Colors.text },
  scSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  scPct: { fontSize: 20, fontWeight: '700', color: Colors.text },
  scFacts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 },
  scFact: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  due: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10, padding: 8, borderRadius: Radius.md, backgroundColor: Colors.warningLight },
  dueText: { flex: 1, fontSize: 12, color: '#7A4A06' },
  promo: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10, padding: 8, borderRadius: Radius.md, backgroundColor: Colors.successLight },
  promoText: { flex: 1, fontSize: 12, color: '#14532D', fontWeight: '600' },
  subs: { marginTop: 10, borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: 6 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  subName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  subNote: { fontSize: 10.5, color: Colors.textSecondary, marginTop: 1 },
  subScore: { fontSize: 13, fontWeight: '700', color: Colors.text },
  subFoot: { fontSize: 11, color: Colors.textSecondary, marginTop: 8 },
  more: { fontSize: 11, color: Colors.textLight, marginTop: 10 },

  ovTitle: { ...Typography.h4, color: Colors.text },
  ovSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  ovRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 12 },
  ovPct: { fontSize: 28, fontWeight: '700', color: Colors.text },
  ovMarks: { fontSize: 11, color: Colors.textSecondary },
  ovExams: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  ovExam: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: Radius.md, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border, maxWidth: '100%',
  },
  ovExamName: { fontSize: 12, fontWeight: '600', color: Colors.text, flexShrink: 1 },
  ovExamPct: { fontSize: 12, fontWeight: '700', color: Colors.text },

  heldCard: { backgroundColor: '#FFFAF0' },
  subRemark: { fontSize: 11, fontStyle: 'italic', color: Colors.textSecondary, marginTop: 2 },
  askLink: { fontSize: 11.5, fontWeight: '700', color: Colors.primary, marginTop: 4 },
  sheetRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: Spacing.md, paddingBottom: Spacing.xl },
  sheetTitle: { ...Typography.h4, color: Colors.text },
  sheetSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  sheetNote: { fontSize: 12, color: Colors.textSecondary, marginTop: 10, lineHeight: 18 },
  sheetInput: {
    minHeight: 90, marginTop: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
    padding: 10, fontSize: 14, color: Colors.text, textAlignVertical: 'top',
  },
  sheetError: { fontSize: 12, color: Colors.danger, marginTop: 8 },
  sheetBtns: { flexDirection: 'row', gap: 8, marginTop: 12 },
  sheetGhost: { flex: 1, height: 44, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  sheetGhostText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  sheetBtn: { flex: 1, height: 44, borderRadius: Radius.md, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  sheetBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
