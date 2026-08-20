import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as libApi from '@/api/library.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import FinePayments from '@/components/library/FinePayments';
import {
  unwrap, LoaderView, Empty, RowItem, Badge, SectionTitle, SegTabs, fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

// A parent's view of the library: what each child has out, and what they owe.
// The web has had this since the module shipped; the phone had no library tile
// for parents at all.
//
// With more than one child, a picker at the top switches between them — every
// figure below belongs to the selected child, so there is never a doubt about
// whose fine is being paid.

export default function LibraryParentScreen() {
  const [children, setChildren] = useState<any[]>([]);
  const [childId, setChildId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = useCallback(async () => {
    try {
      const d: any = unwrap(await libApi.getParentOverview());
      const kids = d?.children ?? [];
      setChildren(kids);
      setChildId(prev => (prev && kids.some((k: any) => idOf(k) === prev) ? prev : idOf(kids[0]) || ''));
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

  const child = children.find((c: any) => idOf(c) === childId);
  const now = new Date();

  return (
    <>
      <Stack.Screen options={{ title: 'Library' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 60 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={Colors.primary} />
          }
        >
          {loading ? <LoaderView /> : children.length === 0 ? (
            <Empty icon="library-outline" text="No library activity for your children yet" />
          ) : (
            <>
              {children.length > 1 && (
                <SegTabs
                  tabs={children.map((c: any) => ({ key: idOf(c), label: nameOf(c) }))}
                  active={childId}
                  onChange={setChildId}
                />
              )}

              <SectionTitle>Books borrowed</SectionTitle>
              {(child?.issuances ?? []).length === 0 ? (
                <Empty icon="book-outline" text="No books currently out" />
              ) : (
                (child?.issuances ?? []).map((i: any) => {
                  const late = i.dueDate && new Date(i.dueDate) < now;
                  return (
                    <RowItem
                      key={i._id}
                      icon="book" iconColor="#059669" iconBg="#D1FAE5"
                      title={i.book?.title ?? '--'}
                      sub={`Issued ${fmtDate(i.issueDate)} · due ${fmtDate(i.dueDate)}`}
                      right={<Badge label={late ? 'Overdue' : 'Issued'} tone={late ? 'danger' : 'success'} />}
                    />
                  );
                })
              )}

              {/* Fines, payment and receipts for the selected child. The same
                  component a member sees for themselves. */}
              {childId ? (
                <FinePayments forUserId={childId} title={`Fines — ${nameOf(child)}`} />
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    </>
  );
}

// The overview populates `childId`, so it arrives either as an object or a raw id.
const idOf   = (c: any) => String(c?.childId?._id ?? c?.childId ?? '');
const nameOf = (c: any) => c?.childId?.name ?? 'Child';
