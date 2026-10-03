/**
 * One report card, laid out for a phone (Oct 2026) — the same card the web
 * prints and the PDF carries (school-backend services/reportCard), turned on
 * its side: the exams as a row of figures, then each subject with its marks in
 * every exam, the overall result, attendance, co-scholastic grades and the
 * class teacher's remarks. The PDF is the document to keep or forward; this is
 * the reading of it.
 *
 * Since Oct 2026: a card can be for one term; a graded paper shows its grade
 * only, a paper in parts its parts; each subject the class's average and
 * highest (when the school shows them) and its teacher's remark; the rank
 * across the whole class; and, for the office, whether the card is withheld.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { GradePill, PassPill, Pill, pct, fmtDay, classLine } from '@/components/results/parts';

export default function ReportCardView({ frame, card: c, family = false }: { frame: any; card: any; family?: boolean }) {
  if (!c) return null;
  const o = c.overall;
  const classWide = o?.classRank && o?.classOutOf && o.classOutOf > (o.outOf || 0);
  const progress = family && !c.complete;
  const soFar = (passed: boolean) => (c.complete ? (passed ? 'Passed' : 'Not passed') : (passed ? 'Passing so far' : 'Not passing so far'));
  return (
    <View>
      <View style={s.head}>
        <Text style={s.school} numberOfLines={2}>{frame?.school?.name}</Text>
        {frame?.school?.address ? <Text style={s.headSub}>{frame.school.address}</Text> : null}
        <Text style={s.kind}>{progress ? 'PROGRESS REPORT' : 'REPORT CARD'}</Text>
        <Text style={s.headSub}>Academic Year {frame?.year?.yearName}{c.termLabel ? ` · ${c.termLabel}` : ''}</Text>
      </View>
      {c.withheld && !family ? (
        <Text style={s.withheld}>Withheld from the family{c.withheld.reason ? ` — ${c.withheld.reason}` : ''}. They see that it is withheld, not this card.</Text>
      ) : null}

      <View style={s.card}>
        {[
          ['Student', c.student.name], ['Class & Section', classLine(c.student) || '—'],
          ['Roll No.', c.student.rollNumber || '—'], ['Admission No.', c.student.admissionNumber || '—'],
          ['Date of Birth', c.student.dob ? fmtDay(c.student.dob) : '—'], ['Parent / Guardian', c.student.parents?.join(', ') || '—'],
        ].map(([k, v]) => (
          <View key={k} style={s.kv}><Text style={s.k}>{k}</Text><Text style={s.v} numberOfLines={2}>{v}</Text></View>
        ))}
      </View>

      {c.exams.length ? (
        <>
          <Text style={s.cap}>EXAMS</Text>
          {c.exams.map((e: any) => (
            <View key={e._id} style={s.examRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.examName} numberOfLines={1}>{e.title}</Text>
                <Text style={s.examSub}>{[e.examTypeLabel, `${e.total}/${e.max}`, e.rank ? `rank ${e.rank} of ${e.outOf}` : ''].filter(Boolean).join(' · ')}</Text>
              </View>
              <Text style={s.examPct}>{pct(e.percentage)}</Text>
              <GradePill grade={e.grade} />
            </View>
          ))}

          <Text style={s.cap}>SUBJECTS</Text>
          {c.subjects.map((x: any) => (
            <View key={x._id} style={s.card}>
              <View style={s.subHead}>
                <Text style={s.subName}>{x.subjectName}{x.gradeOnly ? <Text style={s.graded}>  graded</Text> : null}</Text>
                {x.total ? <Text style={s.subTotal}>{x.total.marks}/{x.total.max} · {x.total.grade}</Text> : null}
              </View>
              {x.cells.map((cell: any, i: number) => (
                <View key={c.exams[i]._id} style={s.cellRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.cellExam} numberOfLines={1}>{c.exams[i].title}</Text>
                    {cell?.components?.length && !cell.absent ? (
                      <Text style={s.parts} numberOfLines={2}>{cell.components.map((p: any) => `${p.label} ${p.marks ?? '—'}/${p.max}`).join(' · ')}</Text>
                    ) : null}
                  </View>
                  <Text style={[s.cellMarks, cell && cell.passed === false && { color: Colors.danger }]}>
                    {!cell ? '—' : cell.absent ? 'AB' : cell.gradeOnly ? '' : `${cell.marks}/${cell.max}${cell.grace ? '*' : ''}`}
                  </Text>
                  <View style={{ width: 40, alignItems: 'flex-end' }}>{cell ? <GradePill grade={cell.absent ? 'AB' : cell.grade} /> : null}</View>
                </View>
              ))}
              {x.classFigures ? <Text style={s.foot}>Class average {pct(x.classFigures.avgPct)} · highest {pct(x.classFigures.topPct)}</Text> : null}
              {x.remarks ? <Text style={s.subRemark}>“{x.remarks}”</Text> : null}
            </View>
          ))}
          {c.subjects.some((x: any) => x.cells.some((cell: any) => cell?.grace)) ? <Text style={s.foot}>* Includes grace marks.</Text> : null}
        </>
      ) : <Text style={s.none}>No results have been published for this year yet.</Text>}

      {o ? (
        <View style={[s.card, s.overall]}>
          <Text style={s.cap}>OVERALL</Text>
          <View style={s.ovRow}>
            <View>
              <Text style={s.ovPct}>{pct(o.percentage)}</Text>
              <Text style={s.ovMarks}>{o.marks} / {o.max} marks</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <GradePill grade={o.grade} />
                <PassPill passed={!!o.isPassed} label={soFar(!!o.isPassed)} />
              </View>
              {o.rank ? <Text style={s.examSub}>Rank {o.rank} of {o.outOf} in the section</Text> : null}
              {classWide ? <Text style={s.examSub}>Rank {o.classRank} of {o.classOutOf} in the class</Text> : null}
            </View>
          </View>
        </View>
      ) : null}

      {c.attendance ? (
        <View style={s.card}>
          <Text style={s.cap}>ATTENDANCE</Text>
          <Text style={s.att}>{c.attendance.total ? `${c.attendance.attended} / ${c.attendance.total} days · ${pct(c.attendance.percentage)}` : 'No attendance has been marked this year.'}</Text>
          {c.attendance.total ? <Text style={s.foot}>{fmtDay(c.attendance.from)} to {fmtDay(c.attendance.to)}. A half day counts as half.</Text> : null}
        </View>
      ) : null}

      {c.coScholastic?.length ? (
        <View style={s.card}>
          <Text style={s.cap}>CO-SCHOLASTIC AREAS</Text>
          {c.coScholastic.map((a: any) => (
            <View key={a.key} style={s.kv}>
              <Text style={s.k}>{a.label}</Text>
              {a.grade ? <Pill label={a.grade} fg={Colors.primary} bg={Colors.surfaceAlt} /> : <Text style={s.v}>—</Text>}
            </View>
          ))}
        </View>
      ) : null}

      <View style={s.card}>
        <Text style={s.cap}>CLASS TEACHER’S REMARKS</Text>
        <Text style={s.remarks}>{c.remarks || (progress ? "The class teacher's remarks are given when the school releases the report cards." : '—')}</Text>
      </View>

      {c.promotion ? (
        <View style={s.promo}>
          <Text style={s.promoText}>
            {c.promotion.kind === 'passedOut' ? `Passed out of ${classLine(c.promotion)}.`
              : `${c.promotion.kind === 'repeated' ? 'Continues in' : 'Promoted to'} ${classLine(c.promotion)}${c.promotion.yearName ? ` for ${c.promotion.yearName}` : ''}.`}
          </Text>
        </View>
      ) : null}
      {c.verification ? <Text style={s.foot}>Verify this card at {c.verification.url}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  head: { alignItems: 'center', paddingVertical: 12, marginBottom: 10, borderBottomWidth: 2, borderBottomColor: '#1E2452' },
  school: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'center', textTransform: 'uppercase' },
  headSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  kind: { fontSize: 13, fontWeight: '800', color: '#4038D0', letterSpacing: 2, marginTop: 8 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 4 },
  k: { fontSize: 12, color: Colors.textSecondary },
  v: { fontSize: 13, fontWeight: '600', color: Colors.text, flexShrink: 1, textAlign: 'right' },
  cap: { fontSize: 10, fontWeight: '800', color: '#1E2452', letterSpacing: 0.8, marginTop: 8, marginBottom: 6 },
  examRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: 10, marginBottom: 6, borderWidth: 1, borderColor: Colors.border,
  },
  examName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  examSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  examPct: { fontSize: 14, fontWeight: '700', color: Colors.text },
  subHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  subName: { ...Typography.h4, fontSize: 14, color: Colors.text },
  subTotal: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  cellRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderTopWidth: 1, borderTopColor: Colors.divider },
  cellExam: { flex: 1, fontSize: 12, color: Colors.textSecondary },
  cellMarks: { fontSize: 13, fontWeight: '700', color: Colors.text },
  foot: { fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
  none: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', padding: Spacing.md },
  overall: { backgroundColor: '#F7F7FF', borderColor: '#D6D4F7' },
  ovRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  ovPct: { fontSize: 26, fontWeight: '700', color: Colors.text },
  ovMarks: { fontSize: 11, color: Colors.textSecondary },
  att: { fontSize: 15, fontWeight: '700', color: Colors.text },
  remarks: { fontSize: 13, color: Colors.text, lineHeight: 19 },
  promo: { backgroundColor: Colors.successLight, borderRadius: Radius.md, padding: 10, marginBottom: 8 },
  promoText: { fontSize: 13, fontWeight: '600', color: '#14532D' },
  withheld: { fontSize: 12, fontWeight: '600', color: '#8A4B05', backgroundColor: Colors.warningLight, padding: 10, borderRadius: Radius.md, marginBottom: 8 },
  graded: { fontSize: 10, fontWeight: '600', color: Colors.textSecondary },
  parts: { fontSize: 10.5, color: Colors.textLight, marginTop: 1 },
  subRemark: { fontSize: 12, fontStyle: 'italic', color: Colors.textSecondary, marginTop: 6 },
});
