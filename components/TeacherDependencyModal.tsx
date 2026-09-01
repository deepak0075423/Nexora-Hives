import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import { FormModal, ActionBtn, unwrap, fmtDate } from '@/components/ui/kit';

/**
 * Delete / Deactivate a teacher, with what still points at them shown first.
 *
 * The account is the last thing to go, not the first: a section whose class
 * teacher has been deleted has nobody in charge of it, and a library copy booked
 * out to a deleted user can never be returned. So this asks the server what is
 * still attached, lists it, and only offers the action once it is clear.
 *
 * The server enforces the same rule on the write itself — this sheet is the
 * explanation, never the enforcement. A refusal comes back as a 409 carrying a
 * fresh report, which replaces whatever was on screen.
 *
 * Timetable periods are the one family that can be cleared automatically, since
 * an unassigned period is a state the grid already shows as an open slot. That
 * is Force, and it is only offered when the timetable is all that is left.
 */

type Action = 'delete' | 'deactivate';

export default function TeacherDependencyModal({ visible, teacher, action, onClose, onDone }: {
  visible: boolean;
  teacher: { _id: string; name?: string } | null;
  action: Action;
  onClose: () => void;
  onDone: () => void;
}) {
  const [report, setReport]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const verb     = action === 'delete' ? 'Delete' : 'Deactivate';
  const verbPast = action === 'delete' ? 'deleted' : 'deactivated';

  useEffect(() => {
    if (!visible || !teacher?._id) return;
    let alive = true;
    setLoading(true); setError(null); setReport(null);
    adminApi.getTeacherDependencies(teacher._id)
      .then((res: any) => { if (alive) setReport(unwrap(res)); })
      .catch((err: any) => { if (alive) setError(err.message ?? 'Could not check this teacher'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [visible, teacher?._id]);

  const run = async (force = false) => {
    setBusy(true);
    try {
      const res: any = action === 'delete'
        ? await adminApi.deleteTeacher(teacher!._id, force)
        : await adminApi.toggleUser(teacher!._id, force);
      const cleared = unwrap(res)?.clearedPeriods ?? 0;
      onDone();
      onClose();
      Alert.alert(
        `Teacher ${verbPast}`,
        cleared
          ? `${teacher?.name} was ${verbPast} and removed from ${cleared} timetable period(s).`
          : `${teacher?.name} was ${verbPast}.`,
      );
    } catch (err: any) {
      // The server re-checked and found something this sheet had not — show
      // what it found rather than a bare error.
      if (err.status === 409 && err.data?.data) {
        setReport(err.data.data);
        Alert.alert(`Cannot ${verb.toLowerCase()}`, err.message);
      } else {
        Alert.alert('Error', err.message ?? `Could not ${verb.toLowerCase()} this teacher`);
      }
    } finally { setBusy(false); }
  };

  const confirmForce = () => {
    Alert.alert(
      `Force ${verb}`,
      `This removes ${teacher?.name} from all ${report.timetable.count} timetable period(s) and then `
      + `${action === 'delete' ? 'deletes' : 'deactivates'} the account. The periods stay in the grid as `
      + 'open slots, ready for another teacher. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: `Force ${verb}`, style: 'destructive', onPress: () => run(true) },
      ],
    );
  };

  const a        = report?.assignments;
  const blocked  = !!report?.blocked;
  const canForce = !!report?.canForce;

  return (
    <FormModal visible={visible} title={`${verb} ${teacher?.name ?? 'Teacher'}`} onClose={busy ? () => {} : onClose}>
      {loading && <View style={s.center}><ActivityIndicator color={Colors.accent} /></View>}

      {!loading && !!error && (
        <View style={s.alertDanger}><Text style={s.alertDangerText}>{error}</Text></View>
      )}

      {!loading && report && !blocked && (
        <Text style={s.clear}>
          Nothing is assigned to {teacher?.name} — no classes, no subjects
          {report.library.enabled ? ', no books on loan' : ''}
          {report.timetable.enabled ? ' and no timetable periods' : ''}.
          {action === 'delete'
            ? ' Deleting the account cannot be undone.'
            : ' They will not be able to sign in until reactivated.'}
        </Text>
      )}

      {!loading && report && blocked && (
        <>
          <View style={s.alertDanger}>
            <Text style={s.alertDangerText}>
              {teacher?.name} cannot be {verbPast} yet. Reassign or clear everything below first —
              each item is still pointing at this account.
            </Text>
          </View>

          <Group title="Class Teacher" rows={a.classTeacher}
            line={(r: any) => `${r.className}${r.sectionName ? ` – ${r.sectionName}` : ''}`}
            hint="Set another class teacher on the section." />

          <Group title="Vice Class Teacher" rows={a.viceClassTeacher}
            line={(r: any) => `${r.className}${r.sectionName ? ` – ${r.sectionName}` : ''}`}
            hint="Set another vice class teacher on the section." />

          <Group title="Subjects taught" rows={a.subjects}
            line={(r: any) => r.subjectName + (r.subjectCode ? ` (${r.subjectCode})` : '')}
            hint="Remove this teacher from the subject on the Subjects screen." />

          <Group title="Subject Teacher" rows={a.subjectTeacher}
            line={(r: any) => `${r.className}${r.sectionName ? ` – ${r.sectionName}` : ''} · ${r.subjectName}`}
            hint="Assign another subject teacher on the section." />

          {report.library.enabled && (
            <Group title="Books on loan" rows={report.library.books}
              line={(r: any) => [
                r.title,
                r.copyCode || null,
                r.dueDate ? `due ${fmtDate(r.dueDate)}${r.overdue ? ' (overdue)' : ''}` : null,
              ].filter(Boolean).join(' · ')}
              hint="Every copy has to come back before the account goes." />
          )}

          {report.timetable.enabled && (
            <Group title="Timetable periods" rows={report.timetable.periods} limit={10}
              line={(r: any) => [
                `${r.dayOfWeek} · P${r.periodNumber}`,
                r.startTime ? `${r.startTime}–${r.endTime}` : null,
                `${r.className}${r.sectionName ? ` – ${r.sectionName}` : ''}`,
                r.subjectName || null,
              ].filter(Boolean).join(' · ')}
              hint={canForce
                ? `Reassign these in the timetable, or use Force ${verb} to empty them all at once.`
                : 'Reassign these in the timetable.'} />
          )}

          {canForce && (
            <View style={s.alertWarn}>
              <Text style={s.alertWarnText}>
                Force {verb} removes {teacher?.name} from all {report.timetable.count} period(s) above
                and then {action === 'delete' ? 'deletes' : 'deactivates'} the account. The periods stay
                in the grid as open slots — the subject and time are not changed.
              </Text>
            </View>
          )}
        </>
      )}

      <View style={s.actions}>
        {canForce && !busy && (
          <ActionBtn label={`Force ${verb}`} tone="warning" onPress={confirmForce} />
        )}
        {!loading && !error && !blocked && (
          <ActionBtn
            label={busy ? 'Working…' : verb}
            tone={action === 'delete' ? 'danger' : 'warning'}
            disabled={busy}
            onPress={() => run(false)}
          />
        )}
        <ActionBtn label="Cancel" tone="neutral" onPress={onClose} disabled={busy} />
      </View>
    </FormModal>
  );
}

/** One dependency family. Renders nothing when the family is clear. */
function Group({ title, rows, line, hint, limit = 8 }: {
  title: string; rows?: any[]; line: (r: any) => string; hint?: string; limit?: number;
}) {
  if (!rows?.length) return null;
  const shown = rows.slice(0, limit);
  return (
    <View style={s.group}>
      <View style={s.groupHead}>
        <Text style={s.groupTitle}>{title}</Text>
        <Text style={s.groupCount}>{rows.length}</Text>
      </View>
      <View style={s.groupBox}>
        {shown.map((r, i) => (
          <Text key={i} style={[s.groupRow, i < shown.length - 1 && s.groupRowDivider]}>{line(r)}</Text>
        ))}
        {rows.length > shown.length && (
          <Text style={[s.groupRow, s.groupMore]}>…and {rows.length - shown.length} more</Text>
        )}
      </View>
      {!!hint && <Text style={s.hint}>{hint}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: Spacing.xl, alignItems: 'center' },
  clear: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },

  alertDanger: {
    backgroundColor: Colors.dangerLight, borderWidth: 1, borderColor: Colors.danger,
    borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md,
  },
  alertDangerText: { fontSize: 12, color: Colors.danger, lineHeight: 18 },
  alertWarn: {
    backgroundColor: Colors.warningLight, borderWidth: 1, borderColor: Colors.warning,
    borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.xs,
  },
  alertWarnText: { fontSize: 12, color: Colors.warning, lineHeight: 18 },

  group: { marginBottom: Spacing.md },
  groupHead: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm, marginBottom: 5 },
  groupTitle: { ...Typography.label, color: Colors.text, fontWeight: '700' },
  groupCount: { fontSize: 11, color: Colors.textSecondary },
  groupBox: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, overflow: 'hidden' },
  groupRow: { fontSize: 12, color: Colors.text, paddingVertical: 7, paddingHorizontal: 12, lineHeight: 17 },
  groupRowDivider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  groupMore: { color: Colors.textSecondary, borderTopWidth: 1, borderTopColor: Colors.border },
  hint: { fontSize: 11, color: Colors.textSecondary, marginTop: 4, lineHeight: 16 },

  actions: { gap: Spacing.sm, marginTop: Spacing.md },
});
