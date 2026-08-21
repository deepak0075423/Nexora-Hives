import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

/**
 * Renders the answer to the two questions an apply form cannot answer on its
 * own: how many days of this type are left, and what the chosen dates will
 * actually cost once weekends, school holidays and the type's sandwich rule are
 * applied.
 *
 * The payload comes from /leave/apply-preview (admin or teacher variant) — the
 * server computes it with the same helpers the real submit uses, so the number
 * shown is the number that gets charged. Shared by both apply screens.
 */
export default function LeavePreviewPanel({ preview, loading }: { preview: any; loading?: boolean }) {
  if (loading && !preview) {
    return (
      <View style={s.box}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={s.muted}>Checking balance…</Text>
        </View>
      </View>
    );
  }
  if (!preview) return null;

  const b = preview.balance ?? {};
  const d = preview.days;
  const allocated = (b.totalAllocated ?? 0) + (b.carriedForward ?? 0);

  return (
    <View style={{ opacity: loading ? 0.5 : 1 }}>
      <View style={s.box}>
        <View style={s.boxHead}>
          <Text style={s.boxTitle}>{preview.leaveType?.name} balance</Text>
          <Text style={s.muted}>{b.academicYear ?? '—'}</Text>
        </View>

        {b.allocated ? (
          <View style={s.stats}>
            {([
              ['Allocated', allocated],
              ['Used', b.used ?? 0],
              ['Pending', b.pending ?? 0],
              ['Available', b.remaining ?? 0],
            ] as [string, number][]).map(([label, value], i) => (
              <View key={label} style={s.stat}>
                <Text style={[
                  s.statValue,
                  i === 3 && { color: value > 0 ? Colors.success : Colors.danger },
                ]}>{value}</Text>
                <Text style={s.statLabel}>{label}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.muted}>
            No allocation this year — 0 day(s) available.
            {preview.leaveType?.category === 'compoff'
              ? ' Comp Off days are credited only when a Comp Off request is approved.'
              : ''}
          </Text>
        )}

        {b.allocated && b.spendable > b.remaining ? (
          <Text style={[s.muted, { marginTop: 6 }]}>
            Policy allows applying up to {b.spendable} day(s) (negative balance permitted).
          </Text>
        ) : null}
      </View>

      {d ? (
        d.error ? (
          <View style={[s.alert, { backgroundColor: Colors.dangerLight }]}>
            <Text style={[s.alertText, { color: Colors.danger }]}>{d.error}</Text>
          </View>
        ) : (
          <View style={[
            s.alert,
            { backgroundColor: preview.sufficient === false ? Colors.dangerLight : Colors.infoLight },
          ]}>
            <Text style={[
              s.alertText,
              { color: preview.sufficient === false ? Colors.danger : Colors.info, fontWeight: '600' },
            ]}>
              {d.totalDays} {d.leaveMode === 'half_day' ? 'day (half day)' : 'working day(s)'} out of{' '}
              {d.calendarDays} calendar day(s)
            </Text>
            <Text style={[s.alertText, { marginTop: 2 }]}>{describeDays(d)}</Text>
            {d.lopDays > 0 ? (
              <Text style={[s.alertText, { color: Colors.warning, fontWeight: '600', marginTop: 4 }]}>
                {d.paidDays} day(s) paid · {d.lopDays} day(s) loss of pay — payroll deducts the unpaid days.
              </Text>
            ) : null}
            {preview.sufficient === false ? (
              <Text style={[s.alertText, { color: Colors.danger, fontWeight: '600', marginTop: 4 }]}>
                Insufficient balance — {d.totalDays} needed, {b.spendable ?? 0} available.
              </Text>
            ) : null}
          </View>
        )
      ) : null}

      {preview.warning && !preview.days?.error ? (
        <View style={[s.alert, { backgroundColor: Colors.warningLight }]}>
          <Text style={[s.alertText, { color: Colors.warning }]}>{preview.warning}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Why the charged count differs from the number of calendar days picked. */
function describeDays(d: any): string {
  if (d.sandwiched)
    return 'Sandwich rule is on — every calendar day in the range is charged, weekly offs and holidays included.';
  const skipped = [
    d.weeklyOffDays > 0 && `${d.weeklyOffDays} non-working day(s) — weekly offs`,
    d.holidayDays   > 0 && `${d.holidayDays} school holiday(s)`,
  ].filter(Boolean);
  return skipped.length
    ? `Not charged: ${skipped.join(', ')}.`
    : 'No weekly offs or holidays fall in this range.';
}

const s = StyleSheet.create({
  box: {
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.sm, marginBottom: 10,
  },
  boxHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  boxTitle: { ...Typography.label, color: Colors.text, fontWeight: '700' },
  muted: { ...Typography.bodySmall, color: Colors.textSecondary, lineHeight: 18 },
  stats: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 18, fontWeight: '700', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  alert: { borderRadius: Radius.md, padding: Spacing.sm, marginBottom: 10 },
  alertText: { ...Typography.bodySmall, color: Colors.textSecondary, lineHeight: 18 },
});
