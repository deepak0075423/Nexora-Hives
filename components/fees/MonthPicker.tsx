import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

/**
 * Pick the months to pay — the phone's copy of the website's picker, keeping
 * the one rule that matters: months are settled OLDEST FIRST on the ledger,
 * so tapping a month takes every unpaid month before it, and tapping a
 * selected one drops every month after it. A selection with a gap would buy
 * something other than what it says.
 *
 * Two kinds of month are never offered: one whose charge was cancelled, and
 * one already covered by a payment the office has yet to approve. A month
 * part-covered that way offers only the rest.
 *
 * The SERVER prices whatever is sent (feesStudent.controller.monthsPayment);
 * `amountFor` here only shows it.
 */

const round = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** What is left to pay on a month, net of anything awaiting approval. */
export const owing = (m: any) => Number(m?.payable != null ? m.payable : m?.amountDue) || 0;

export const payableMonths = (months: any[] = []) =>
  months.filter(m => m?.payStatus !== 'cancelled' && owing(m) > 0.004);

export const amountFor = (months: any[], otherDue: number, count: number) =>
  round((otherDue || 0) + payableMonths(months).slice(0, count).reduce((s, m) => s + owing(m), 0));

export const keysFor = (months: any[], count: number) =>
  payableMonths(months).slice(0, count).map(m => m.monthKey);

/** Months already charged and unpaid — what "pay what is due" means. */
export const dueCount = (months: any[] = []) =>
  payableMonths(months).filter(m => m.chargedAmount > 0).length;

export default function MonthPicker({
  months = [], otherDue = 0, count, onCount, sym = '₹',
}: {
  months?: any[]; otherDue?: number; count: number; onCount: (n: number) => void; sym?: string;
}) {
  const list = payableMonths(months);
  const money = (n: number) => `${sym}${round(n).toLocaleString('en-IN')}`;

  if (!list.length && !(otherDue > 0)) {
    return <Text style={s.none}>Nothing left to pay this year.</Text>;
  }

  return (
    <View style={s.box}>
      {otherDue > 0 ? (
        <View style={[s.row, s.rowFixed]}>
          <Ionicons name="checkbox" size={20} color={Colors.textLight} />
          <View style={{ flex: 1 }}>
            <Text style={s.name}>Fines &amp; other charges</Text>
            <Text style={s.sub}>Always paid first</Text>
          </View>
          <Text style={s.amt}>{money(otherDue)}</Text>
        </View>
      ) : null}

      {list.map((m: any, i: number) => {
        const on = i < count;
        const names = [...new Set((m.items ?? []).filter((x: any) => !x.cancelled).map((x: any) => x.name))].join(', ');
        const tag = m.awaiting > 0 ? 'Part awaiting approval'
          : m.chargedAmount > 0 ? (m.amountPaid > 0 ? 'Part paid' : 'Due')
            : 'In advance';
        return (
          <Pressable
            key={m.monthKey}
            style={[s.row, on && s.rowOn]}
            onPress={() => onCount(on ? i : i + 1)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={m.monthLabel}
          >
            <Ionicons
              name={on ? 'checkbox' : 'square-outline'}
              size={20}
              color={on ? Colors.primary : Colors.border}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>
                {m.monthLabel} <Text style={[s.tag, m.chargedAmount > 0 && { color: Colors.danger }]}>· {tag}</Text>
              </Text>
              {names ? <Text style={s.sub} numberOfLines={1}>{names}</Text> : null}
              {m.amountPaid > 0 ? <Text style={s.sub}>{money(m.amountPaid)} already paid</Text> : null}
            </View>
            <Text style={s.amt}>{money(owing(m))}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  box: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  rowOn: { backgroundColor: '#F5F3FF' },
  rowFixed: { backgroundColor: '#FFF7ED' },
  name: { ...Typography.body, color: Colors.text, fontWeight: '600' },
  tag: { ...Typography.caption, fontWeight: '600', color: Colors.textLight },
  sub: { ...Typography.caption, color: Colors.textLight },
  amt: { ...Typography.body, color: Colors.text, fontWeight: '700' },
  none: { ...Typography.caption, color: Colors.textLight },
});
