import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as feesApi from '@/api/fees.api';
import { unwrap, FormModal, ActionBtn, Toggle, fmtMoney, confirmAsync } from '@/components/ui/kit';

/**
 * Switching a fee structure or a fee head off and on, from the phone.
 *
 * "Off" means the same thing here as on the website and in the server: it
 * stops charging from now on, and never touches what has already been
 * charged. Because none of it can be undone by tapping the other way, the
 * sheet loads what the action would touch — how many students, how much
 * charged, how much still to come — and shows it before offering the button.
 *
 * `kind` picks which endpoint answers: a structure charges one class or
 * section, a head charges in every structure that carries it.
 */
export default function LifecycleModal({
  kind, row, onClose, onDone, sym = '₹',
}: {
  kind: 'structure' | 'head';
  row: any | null;
  onClose: () => void;
  onDone: () => void;
  sym?: string;
}) {
  const [impact, setImpact] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [cancelUnpaid, setCancelUnpaid] = useState(false);
  const [catchUp, setCatchUp] = useState(false);
  const [newFromCurrent, setNewFromCurrent] = useState(false);

  useEffect(() => {
    if (!row) return;
    setImpact(null); setCancelUnpaid(false); setCatchUp(false); setNewFromCurrent(false);
    const call = kind === 'structure' ? feesApi.structureImpact(row._id) : feesApi.feeHeadImpact(row._id);
    call.then(r => setImpact(unwrap(r))).catch(() => setImpact({}));
  }, [row?._id, kind]);

  if (!row) return null;
  const money = (n?: number) => `${sym}${Number(n ?? 0).toLocaleString('en-IN')}`;
  const on = row.isActive !== false;
  const missed: string[] = impact?.missedMonths ?? [];
  const structures: string[] = impact?.structures ?? [];
  const canDelete = kind === 'structure' && impact && (impact.charged ?? 0) <= 0;

  const run = async (label: string, fn: () => Promise<any>, done: string) => {
    setBusy(label);
    try {
      await fn();
      onDone();
      onClose();
      Alert.alert('Done', done);
    } catch (err: any) {
      Alert.alert('Could not do that', err?.message ?? 'Please try again.');
    } finally { setBusy(''); }
  };

  const toggleOff = () => run('off',
    () => (kind === 'structure'
      ? feesApi.toggleFeeStructure(row._id, { cancelUnpaid })
      : feesApi.toggleFeeHead(row._id, {})),
    cancelUnpaid
      ? 'Switched off, and the unpaid charges were cancelled.'
      : 'Switched off. What it already charged stays on those accounts.');

  const toggleOn = () => run('on',
    () => (kind === 'structure'
      ? feesApi.toggleFeeStructure(row._id, { catchUp })
      : feesApi.toggleFeeHead(row._id, { catchUp })),
    catchUp
      ? 'Switched on, and the months it was off for were charged too.'
      : 'Switched on. The months it was off for will never be charged.');

  return (
    <FormModal visible={!!row} title={row.name ?? (kind === 'structure' ? 'Fee structure' : 'Fee head')} onClose={onClose}>
      {!impact ? (
        <View style={{ paddingVertical: Spacing.lg, alignItems: 'center' }}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <>
          <View style={s.grid}>
            <Stat label={kind === 'structure' ? 'Students on it now' : 'Structures charging it'}
              value={kind === 'structure'
                ? `${impact.onRoll ?? 0}`
                : (structures.length ? `${structures.length}` : 'None')} />
            <Stat label="Students charged" value={`${impact.students ?? 0}`} />
            <Stat label="Charged so far" value={money(impact.charged)} />
            <Stat label="Still to charge" tone={impact.monthsToCome ? 'warn' : undefined}
              value={impact.monthsToCome
                ? `${money(impact.toCome)} · ${impact.monthsToCome} mo`
                : 'Nothing left'} />
          </View>
          {kind === 'structure' && impact.unpaid > 0 ? (
            <Text style={s.line}>Of what it charged, <Text style={s.bad}>{money(impact.unpaid)}</Text> is still unpaid.</Text>
          ) : null}
          {kind === 'head' && structures.length ? (
            <Text style={s.line}>Carried by {structures.slice(0, 3).join(', ')}{structures.length > 3 ? ` and ${structures.length - 3} more` : ''}.</Text>
          ) : null}

          {on ? (
            <>
              <Text style={s.line}>
                Switching it off stops it charging from now on{kind === 'head' ? ', in every structure that carries it' : ''}.
                What it has already charged stays on those accounts — nobody is refunded by switching something off.
              </Text>
              {kind === 'structure' ? (
                <Toggle label="Also cancel the unpaid charges"
                  sub={`Writes off ${money(impact.unpaid)}. Money already paid is untouched, and so is any month a family has paid for while the office has yet to approve it.`}
                  value={cancelUnpaid} onChange={setCancelUnpaid} />
              ) : null}
              <View style={s.actions}>
                <ActionBtn label={busy === 'off' ? 'Switching off…' : 'Switch off'} tone="danger"
                  disabled={!!busy} onPress={toggleOff} />
                {kind === 'structure' ? (
                  <ActionBtn label={busy === 'demand' ? 'Charging…' : 'Charge the months so far'} tone="info" disabled={!!busy}
                    onPress={() => run('demand',
                      () => feesApi.generateDemand(row._id, { newFrom: newFromCurrent ? 'current' : 'start' }),
                      'Charged every month that has come and was not charged yet.')} />
                ) : null}
              </View>
              {kind === 'structure' ? (
                <Toggle label="New students start from this month"
                  sub="Someone added now is not billed for the earlier months of the year."
                  value={newFromCurrent} onChange={setNewFromCurrent} />
              ) : null}
            </>
          ) : (
            <>
              {missed.length ? (
                <>
                  <Text style={s.line}>It was off for {missed.length} month{missed.length === 1 ? '' : 's'} — {missed.join(', ')}.</Text>
                  <Toggle label="Charge the months it was off for too"
                    sub="Off: those months are never charged and billing simply resumes from now."
                    value={catchUp} onChange={setCatchUp} />
                </>
              ) : (
                <Text style={s.line}>Charging resumes: anything due up to this month is posted now, and each new month as it arrives.</Text>
              )}
              <View style={s.actions}>
                <ActionBtn label={busy === 'on' ? 'Switching on…' : 'Switch on'} tone="success" disabled={!!busy} onPress={toggleOn} />
              </View>
            </>
          )}

          {kind === 'structure' ? (
            canDelete ? (
              <View style={s.actions}>
                <ActionBtn label={busy === 'del' ? 'Deleting…' : 'Delete this structure'} tone="danger" disabled={!!busy}
                  onPress={async () => {
                    const yes = await confirmAsync('Delete structure',
                      'It has charged nobody, so deleting it leaves no trace on any account. Its class and section assignments go with it.', 'Delete');
                    if (yes) run('del', () => feesApi.deleteFeeStructure(row._id), 'Structure deleted.');
                  }} />
              </View>
            ) : (
              <Text style={s.note}>
                It has already charged {money(impact.charged)}, so it cannot be deleted — it is the record of what those
                families were billed for. Switch it off instead.
              </Text>
            )
          ) : null}
        </>
      )}
    </FormModal>
  );
}

const Stat = ({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) => (
  <View style={s.stat}>
    <Text style={s.statLabel}>{label}</Text>
    <Text style={[s.statValue, tone === 'warn' && { color: Colors.warning }]}>{value}</Text>
  </View>
);

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  stat: {
    flexGrow: 1, flexBasis: '46%', backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md, padding: Spacing.sm,
  },
  statLabel: { ...Typography.caption, color: Colors.textSecondary },
  statValue: { ...Typography.label, color: Colors.text, marginTop: 2 },
  line: { ...Typography.caption, color: Colors.textSecondary, lineHeight: 18, marginBottom: Spacing.sm },
  bad: { color: Colors.danger, fontWeight: '700' },
  note: { ...Typography.caption, color: Colors.textLight, lineHeight: 18, marginTop: Spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm, marginBottom: Spacing.sm },
});
