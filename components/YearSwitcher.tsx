import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '@/api/axios';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { viewYear, setViewYear } from '@/utils/yearView';

/**
 * The academic year the whole app is showing (Nov 2026).
 *
 * Every module reads one academic year: the school's active year, unless this
 * switcher is on another. Choosing a year changes what every list, tile and
 * report shows — nothing else: new entries still go to the school's current
 * year, which the line under the header says while another year is in view.
 *
 * Offered to administrators and teachers. Students and parents always see the
 * school's current year.
 */
type Year = { _id: string; yearName: string; status: string };

const AMBER = { bg: '#FFF8E6', border: '#F0B429', text: '#6B4500' };

function useYears() {
  const { user } = useAuth();
  const staff = user?.role === 'admin' || user?.role === 'teacher';
  const [years, setYears] = useState<Year[]>([]);
  const [active, setActive] = useState('');

  const load = useCallback(() => {
    if (!staff) { setYears([]); setActive(''); return; }
    api.get('/profile/academic-years')
      .then((r: any) => {
        const d = r?.data || {};
        const list: Year[] = Array.isArray(d.years) ? d.years : [];
        // A stored choice the school no longer has is dropped.
        const stored = viewYear();
        if (stored && !list.some((y) => String(y._id) === stored)) setViewYear('');
        setYears(list);
        setActive(d.active || '');
      })
      .catch(() => {});
  }, [staff]);

  useEffect(() => { load(); }, [load]);

  const viewing = viewYear() && years.some((y) => String(y._id) === viewYear()) ? viewYear() : active;
  return { years, active, viewing, staff };
}

/** The chip in the header, and the sheet it opens. */
export default function YearSwitcher() {
  const { years, active, viewing, staff } = useYears();
  const [open, setOpen] = useState(false);

  // Nothing to switch between: say nothing.
  if (!staff || years.length < 2) return null;

  const current = years.find((y) => String(y._id) === String(viewing)) || null;
  const elsewhere = !!current && String(current._id) !== String(active);

  const pick = (id: string) => {
    setOpen(false);
    if (String(id) === String(viewing)) return;
    // The whole app is mounted afresh for the year (app/_layout.tsx SessionScope).
    setViewYear(String(id) === String(active) ? '' : String(id));
  };

  return (
    <>
      <TouchableOpacity style={[s.chip, elsewhere && s.chipElsewhere]} onPress={() => setOpen(true)}
        accessibilityRole="button" accessibilityLabel={`Academic year ${current?.yearName || ''}. Change`}>
        <Ionicons name="calendar-outline" size={14} color={elsewhere ? AMBER.text : Colors.textSecondary} />
        <Text style={[s.chipText, elsewhere && { color: AMBER.text }]} numberOfLines={1}>{current?.yearName || '—'}</Text>
        <Ionicons name="chevron-down" size={12} color={elsewhere ? AMBER.text : Colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle}>Academic year</Text>
            <Text style={s.sheetHint}>Every screen shows this year’s records. Anything you add is saved to the current year.</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {[...years].reverse().map((y) => {
                const on = String(y._id) === String(viewing);
                return (
                  <TouchableOpacity key={y._id} style={[s.row, on && s.rowOn]} onPress={() => pick(y._id)}
                    accessibilityRole="button" accessibilityState={{ selected: on }}>
                    <Text style={[s.rowText, on && s.rowTextOn]}>{y.yearName}</Text>
                    {String(y._id) === String(active) && <Text style={s.tag}>Current</Text>}
                    {on && <Ionicons name="checkmark" size={18} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/**
 * Shown under the header while a year other than the school's current one is
 * in view — so nobody mistakes last year's lists for today's.
 */
export function YearViewNotice() {
  const { years, active, viewing, staff } = useYears();
  if (!staff || !viewing || !active || String(viewing) === String(active)) return null;
  const shown = years.find((y) => String(y._id) === String(viewing));
  const now = years.find((y) => String(y._id) === String(active));
  if (!shown) return null;
  return (
    <View style={s.notice}>
      <Ionicons name="calendar-outline" size={15} color={AMBER.text} />
      <Text style={s.noticeText}>
        Viewing <Text style={s.noticeStrong}>{shown.yearName}</Text>. New entries are saved to {now?.yearName || 'the current year'}.
      </Text>
      <TouchableOpacity style={s.noticeBtn} onPress={() => setViewYear('')} accessibilityRole="button">
        <Text style={s.noticeBtnText}>Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    height: 38, paddingHorizontal: 10, borderRadius: Radius.md,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, maxWidth: 132,
  },
  chipElsewhere: { backgroundColor: AMBER.bg, borderColor: AMBER.border },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.text, flexShrink: 1 },

  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: Spacing.lg },
  sheet: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  sheetHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 4, marginBottom: 10, lineHeight: 17 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 13, paddingHorizontal: 12, borderRadius: Radius.md,
  },
  rowOn: { backgroundColor: Colors.background },
  rowText: { flex: 1, fontSize: 15, color: Colors.text },
  rowTextOn: { fontWeight: '700', color: Colors.primary },
  tag: {
    fontSize: 10, fontWeight: '700', color: Colors.textSecondary,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: Colors.background, overflow: 'hidden',
  },

  notice: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: Radius.md,
    backgroundColor: AMBER.bg, borderWidth: 1, borderColor: AMBER.border,
  },
  noticeText: { flex: 1, fontSize: 12, color: AMBER.text, lineHeight: 16 },
  noticeStrong: { fontWeight: '800' },
  noticeBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 1, borderColor: AMBER.border, backgroundColor: '#fff' },
  noticeBtnText: { fontSize: 11, fontWeight: '700', color: AMBER.text },
});
