/**
 * The parent's library — what each child has borrowed, and what they owe.
 *
 * Told per child, because a parent with two children has two different shelves
 * and merging them produces a list nobody can act on: a book is due back from a
 * particular child, not from the family. A switch across the top picks whose
 * shelf is on screen; every figure, loan and fine below belongs to that one
 * child, so there is never a doubt about whose fine is being paid.
 *
 * `LibraryParentScreen` loads and picks; `ParentLibraryBody` draws, and is kept
 * pure so it can be rendered and checked without a device.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as libApi from '@/api/library.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import FinePayments from '@/components/library/FinePayments';
import { unwrap, LoaderView, SegTabs, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import {
  Hero, Figures, Panel, Pill, Blank, BookRow, Note, money, shortDate, type Tone,
} from '@/components/library/parts';

const OPEN = ['issued', 'overdue'];
const DAY  = 86400000;

const LOAN_TONE: Record<string, { label: string; tone: Tone }> = {
  issued:   { label: 'Borrowed', tone: 'blue' },
  overdue:  { label: 'Overdue',  tone: 'red' },
  returned: { label: 'Returned', tone: 'green' },
  lost:     { label: 'Lost',     tone: 'amber' },
};

const firstName = (n?: string) => String(n ?? '').trim().split(/\s+/)[0] || 'your child';

export default function LibraryParentScreen() {
  const [children, setChildren] = useState<any[]>([]);
  const [childId, setChildId] = useState('');
  const [year, setYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = useCallback(async () => {
    try {
      const d: any = unwrap(await libApi.getParentOverview());
      const kids = d?.children ?? [];
      setChildren(kids);
      setYear(d?.academicYear?.yearName ?? '');
      setChildId((prev) => (prev && kids.some((k: any) => String(k._id) === prev)
        ? prev : String(kids[0]?._id ?? '')));
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code) || err?.status === 403) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Library' }} />
      <ModuleDisabled />
    </>
  );

  const child = children.find((c: any) => String(c._id) === childId) || children[0];

  return (
    <>
      <Stack.Screen options={{ title: 'Library' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <Hero icon="library" title="Library"
          blurb="See what each of your children has borrowed, what is due back, and settle any fines."
          quote="“A child who reads will be an adult who thinks.”" />

        {loading ? <LoaderView /> : children.length === 0 ? (
          <Blank icon="library-outline" title="No child is linked to this account yet"
            body="Ask the school office to link your children, and their library activity will appear here." />
        ) : (
          <ParentLibraryBody kids={children} child={child} year={year} onPick={setChildId} />
        )}
      </ScrollView>
    </>
  );
}

export function ParentLibraryBody({ kids, child, year, onPick }: {
  kids: any[]; child: any; year?: string; onPick: (id: string) => void;
}) {
  const loans: any[] = child?.loans ?? [];
  const holds: any[] = child?.reservations ?? [];
  const st           = child?.stats ?? {};
  const where = child
    ? [child.className, child.sectionName ? `Section ${child.sectionName}` : ''].filter(Boolean).join(' — ')
    : '';

  return (
    <>
      {/* One child needs no switch; two or more do, because their borrowing is
          nothing alike. */}
      {kids.length > 1 && (
        <SegTabs
          tabs={kids.map((c: any) => ({ key: String(c._id), label: firstName(c.name) }))}
          active={String(child?._id ?? '')}
          onChange={onPick}
        />
      )}

      <View style={s.who}>
        <Ionicons name="person-circle" size={16} color={Colors.primary} />
        <Text style={s.whoText} numberOfLines={1}>
          {child?.name}{where ? ` · ${where}` : ''}
        </Text>
        {/* Money owed follows the child, not the screen. */}
        {st.finesOutstanding > 0
          ? <Pill label={`${money(st.finesOutstanding)} due`} tone="red" />
          : null}
      </View>

      <Figures items={[
        { icon: 'book-outline', tone: 'blue', label: 'Currently Borrowed', value: st.borrowed ?? 0,
          caption: st.borrowed ? 'Not yet returned' : 'Nothing out right now' },
        { icon: 'alert-circle-outline', tone: 'red', label: 'Overdue', value: st.overdue ?? 0,
          caption: st.overdue ? 'Past the due date' : 'Nothing late' },
        { icon: 'refresh-outline', tone: 'green', label: 'Returned', value: st.returned ?? 0,
          caption: year ? `In ${year}` : 'All time' },
        { icon: 'bookmark-outline', tone: 'violet', label: 'Reserved', value: st.reserved ?? 0,
          caption: st.reserved ? 'Waiting in the queue' : 'Nothing on hold' },
      ]} />

      <Panel icon="book" tone="indigo" title={`Books — ${firstName(child?.name)}`}>
        {loans.length === 0 ? (
          <Blank icon="book-outline" title={`${child?.name ?? 'This child'} has not borrowed anything yet`}
            body="Books borrowed from the school library will appear here." />
        ) : loans.map((l: any) => {
          const late  = l.isOverdue || l.status === 'overdue';
          const badge = LOAN_TONE[late && l.status === 'issued' ? 'overdue' : l.status]
            ?? { label: l.status, tone: 'slate' as Tone };
          const days  = l.dueDate ? Math.ceil((new Date(l.dueDate).getTime() - Date.now()) / DAY) : null;
          const due   = l.fineSummary?.outstanding || 0;
          return (
            <BookRow key={l._id} book={l.book}
              meta={[
                l.bookCopy?.uniqueCode ? `Copy ${l.bookCopy.uniqueCode}` : '',
                `Issued ${shortDate(l.issueDate)} · due ${shortDate(l.dueDate)}`,
                OPEN.includes(l.status) && days != null
                  ? (days < 0 ? `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`
                    : days === 0 ? 'Due today' : `${days} day${days === 1 ? '' : 's'} left`)
                  : l.returnDate ? `Returned ${shortDate(l.returnDate)}` : '',
              ].filter(Boolean).join('\n')}
              right={
                <>
                  <Pill label={badge.label} tone={badge.tone} />
                  {due > 0 ? <Text style={s.owed}>{money(due)} due</Text> : null}
                </>
              } />
          );
        })}
      </Panel>

      {holds.length > 0 && (
        <Panel icon="bookmark" tone="violet" title={`Reservations — ${firstName(child?.name)}`}>
          {holds.map((h: any) => (
            <BookRow key={h._id} book={h.book}
              right={h.status === 'ready'
                ? <Pill label="Ready to collect" tone="green" />
                : <Pill label={`In queue${h.queuePosition ? ` · #${h.queuePosition}` : ''}`} tone="indigo" />} />
          ))}
        </Panel>
      )}

      {/* Fines, payment and receipts for the selected child. The same component
          a member sees for themselves — keyed on the child so switching reloads
          that child's fines rather than showing the last one's. */}
      {child?._id ? (
        <FinePayments key={String(child._id)} forUserId={String(child._id)}
          title={`Outstanding — ${firstName(child.name)}`} />
      ) : null}

      {kids.length > 1 && (
        <Note>Showing {child?.name} — use the switch above for your other child.</Note>
      )}
    </>
  );
}

const s = StyleSheet.create({
  who: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: Spacing.md,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: Radius.lg,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  whoText: { flex: 1, fontSize: 12.5, fontWeight: '700', color: Colors.text },
  owed: { fontSize: 10.5, fontWeight: '700', color: Colors.danger, marginTop: 4 },
});
