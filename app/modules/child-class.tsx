/**
 * Class Info — a parent's view of a child's class.
 *
 * A parent can have more than one child and their classes genuinely differ, so
 * this is told per child: a switch across the top picks whose class is on
 * screen and everything below belongs to that one child. There is deliberately
 * no "both children" view — a class is one per child, and merging two would
 * produce a roster and a class teacher belonging to nobody.
 *
 * The body is the same component the child sees on their own My Class screen.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '@/constants/theme';
import * as parentApi from '@/api/parent.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { unwrap, LoaderView, SegTabs, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import { Hero, Blank, Note } from '@/components/library/parts';
import { ClassBody, classTitle } from '@/components/class/ClassBody';

const firstName = (n?: string) => String(n ?? '').trim().split(/\s+/)[0] || 'your child';

export default function ChildClassScreen() {
  const [children, setChildren] = useState<any[]>([]);
  const [childId, setChildId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = useCallback(async () => {
    try {
      const d: any = unwrap(await parentApi.getChildClass());
      const kids = d?.children ?? [];
      setChildren(kids);
      setChildId((prev) => (prev && kids.some((k: any) => String(k._id) === prev)
        ? prev : String(kids[0]?._id ?? '')));
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: "Child's Class" }} />
      <ModuleDisabled />
    </>
  );

  const child = children.find((c: any) => String(c._id) === childId) || children[0];
  const where = child
    ? [child.className, child.sectionName ? `Section ${child.sectionName}` : ''].filter(Boolean).join(' — ')
    : '';

  return (
    <>
      <Stack.Screen options={{ title: "Child's Class" }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <Hero icon="school"
          title={child ? classTitle(child.section, child.pendingClass) : 'Class Info'}
          blurb={child
            ? `Everything about ${firstName(child.name)}'s class, in one place.`
            : "Your child's class, teachers and classmates."}
          quote="“A better tomorrow starts with what you learn today.”" />

        {loading ? <LoaderView /> : !children.length ? (
          <Blank icon="school-outline" title="No child is linked to this account yet"
            body="Ask the school office to link your children, and their class will appear here." />
        ) : (
          <>
            {/* One child needs no switch; two or more do, because their classes
                are different classes. */}
            {children.length > 1 && (
              <SegTabs
                tabs={children.map((c: any) => ({ key: String(c._id), label: firstName(c.name) }))}
                active={String(child?._id ?? '')}
                onChange={setChildId}
              />
            )}

            <View style={s.who}>
              <Ionicons name="person-circle" size={16} color={Colors.primary} />
              <Text style={s.whoText} numberOfLines={1}>
                {child?.name}{where ? ` · ${where}` : ''}
              </Text>
              {child?.rollNumber ? <Text style={s.whoRoll}>Roll {child.rollNumber}</Text> : null}
            </View>

            <ClassBody view={child} who={child?.name} quickLinks={[
              { icon: 'checkbox-outline', label: 'Attendance', to: '/modules/attendance', tone: 'green' },
              { icon: 'document-text-outline', label: 'Exams', to: '/modules/exams', tone: 'pink' },
              { icon: 'bar-chart-outline', label: 'Results', to: '/modules/results', tone: 'amber' },
              { icon: 'wallet-outline', label: 'Fees', to: '/modules/fees', tone: 'blue' },
            ]} />

            {children.length > 1 && (
              <Note>Showing {child?.name} — use the switch above for your other child.</Note>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  who: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: Spacing.md,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  whoText: { flex: 1, fontSize: 12.5, fontWeight: '700', color: Colors.text },
  whoRoll: { fontSize: 11, color: Colors.textSecondary },
});
