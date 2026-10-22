/**
 * Admissions on the phone — what every admission screen shares (Oct 2026).
 *
 * The look is the app's newer module kit (components/inventory/parts.tsx:
 * panels, tinted tiles, pill tabs, sheets, fields); this adds the admission
 * module's own words — the same statuses, tones and labels as the web
 * (school-frontend src/pages/admission/meta.js), so a family or an office
 * reads the same thing on either — plus a loader hook, a page frame, and a
 * day-by-day time picker for exam slots and campus visits.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator, Alert, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '@/constants/theme';
import { TINT, BRAND, Pill, Note, Btn, Blank, type Tone } from '@/components/inventory/parts';

export {
  BRAND, TINT, Head, Tiles, Tile, Tabs, Panel, Pill, Rec, Facts, Fact, Note, Blank, Muted, Btn, Sheet, Step, Field, Box, Pick, Spinner,
  money, plural, ago, words,
} from '@/components/inventory/parts';
export type { Tone } from '@/components/inventory/parts';

// ── Words ─────────────────────────────────────────────────────────────────────

type Def = { label: string; tone: Tone };
const d = (label: string, tone: Tone): Def => ({ label, tone });

/** Application statuses (school-backend services/admission/workflow.js). */
export const STATUS: Record<string, Def> = {
  draft: d('Draft', 'slate'), submitted: d('Submitted', 'blue'), incomplete: d('Incomplete', 'amber'), under_review: d('Under review', 'blue'),
  documents_pending: d('Documents pending', 'amber'), documents_rejected: d('Documents rejected', 'red'), verified: d('Verified', 'green'),
  eligible: d('Eligible', 'green'), ineligible: d('Ineligible', 'red'), exam_scheduled: d('Exam scheduled', 'indigo'),
  exam_completed: d('Exam completed', 'indigo'), interview_scheduled: d('Interview scheduled', 'indigo'), interview_completed: d('Interview completed', 'indigo'),
  evaluated: d('Evaluated', 'violet'), selected: d('Selected', 'green'), waitlisted: d('Waitlisted', 'amber'), rejected: d('Rejected', 'red'),
  offer_issued: d('Offer issued', 'teal'), accepted: d('Accepted', 'green'), declined: d('Declined', 'slate'), offer_expired: d('Offer expired', 'slate'),
  payment_pending: d('Payment pending', 'amber'), confirmed: d('Confirmed', 'green'), enrolled: d('Enrolled', 'green'),
  withdrawn: d('Withdrawn', 'slate'), cancelled: d('Cancelled', 'slate'),
};
export const DOC_STATUS: Record<string, Def> = {
  uploaded: d('Uploaded', 'blue'), under_review: d('Under review', 'blue'), verified: d('Verified', 'green'), rejected: d('Rejected', 'red'),
  resubmission_required: d('Upload again', 'amber'), replaced: d('Replaced', 'slate'), missing: d('Missing', 'amber'),
};
export const FEE_STATUS: Record<string, Def> = {
  not_required: d('Not required', 'slate'), due: d('Due', 'amber'), paid: d('Paid', 'green'), waived: d('Waived', 'teal'), refunded: d('Refunded', 'slate'),
};
export const REFUND_STATUS: Record<string, Def> = { pending: d('With the gateway', 'amber'), processed: d('Refunded', 'green'), failed: d('Refused by the gateway', 'red') };
export const INSTALMENT_STATUS: Record<string, Def> = { paid: d('Paid', 'green'), part: d('Part paid', 'amber'), due: d('Due', 'slate'), overdue: d('Overdue', 'red') };
export const OFFER_STATUS: Record<string, Def> = {
  issued: d('Offered', 'teal'), accepted: d('Accepted', 'green'), declined: d('Declined', 'slate'), expired: d('Expired', 'slate'),
  withdrawn: d('Withdrawn', 'slate'), confirmed: d('Confirmed', 'green'), cancelled: d('Cancelled', 'slate'),
};
export const EXAM_MODE: Record<string, string> = { online: 'Online', offline: 'At the school', interview: 'Interview' };
export const RESULTS_STATUS: Record<string, Def> = {
  none: d('No marks yet', 'slate'), in_progress: d('Marking', 'blue'), submitted: d('Awaiting approval', 'amber'), approved: d('Approved', 'violet'), published: d('Published', 'green'),
};
export const LIST_STATUS: Record<string, Def> = {
  draft: d('Draft', 'slate'), pending_approval: d('Awaiting approval', 'amber'), approved: d('Approved', 'violet'),
  published: d('Published', 'green'), closed: d('Closed', 'slate'), cancelled: d('Cancelled', 'slate'),
};
export const LIST_METHOD: Record<string, string> = { merit: 'Merit list', lottery: 'Lottery', points_lottery: 'Points, then lottery' };
export const DECISION: Record<string, Def> = {
  selected: d('Selected', 'green'), waitlisted: d('Waitlisted', 'amber'), not_selected: d('Not on this list', 'slate'), excluded: d('Excluded', 'red'),
};
export const APPEAL_STATUS: Record<string, Def> = {
  open: d('Received', 'amber'), in_review: d('Being looked at', 'indigo'), upheld: d('Upheld', 'green'), not_upheld: d('Not upheld', 'slate'), withdrawn: d('Withdrawn', 'slate'),
};
export const APPEAL_KIND: Record<string, string> = { recheck: 'Re-check of a result', decision: 'Appeal against the decision' };
export const VISIT_STATUS: Record<string, Def> = { booked: d('Booked', 'green'), cancelled: d('Cancelled', 'slate'), attended: d('Visited', 'indigo'), no_show: d('Missed', 'amber') };
export const REQUEST_STATUS: Record<string, Def> = { open: d('Received', 'amber'), in_progress: d('Being looked at', 'indigo'), done: d('Done', 'green'), declined: d('Declined', 'slate') };
export const PAY_MODES = [
  { value: 'cash', label: 'Cash' }, { value: 'cheque', label: 'Cheque' }, { value: 'dd', label: 'Demand draft' },
  { value: 'bank_transfer', label: 'Bank transfer' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card (at the counter)' },
];
export const REFUND_MODES = [{ value: 'cash', label: 'Cash' }, { value: 'cheque', label: 'Cheque' }, { value: 'bank_transfer', label: 'Bank transfer' }, { value: 'upi', label: 'UPI' }];

export const defOf = (map: Record<string, Def>, key?: string | null): Def =>
  map[String(key || '')] || d(String(key || '—').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), 'slate');

/** A status as a coloured pill, in the module's words. */
export function Tag({ map = STATUS, value, icon }: { map?: Record<string, Def>; value?: string | null; icon?: any }) {
  const x = defOf(map, value);
  return <Pill tone={x.tone} icon={icon}>{x.label}</Pill>;
}

// ── Dates, sizes, errors ──────────────────────────────────────────────────────

const DAY: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
export const fmtDate = (v?: string | Date | null) => (v ? new Date(v).toLocaleDateString('en-IN', DAY) : '—');
export const fmtDateTime = (v?: string | Date | null) => (v ? new Date(v).toLocaleString('en-IN', { ...DAY, hour: 'numeric', minute: '2-digit' }) : '—');
export const fmtTime = (v?: string | Date | null) => (v ? new Date(v).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '');
export const fmtWeekday = (v?: string | Date | null) => (v ? new Date(v).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }) : '');
export const size = (b?: number) => (!b ? '' : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const errMsg = (e: any, fallback = 'Something went wrong') => e?.data?.message || e?.message || fallback;
/** An array, whatever came (a missing or null list is empty). */
export const unwrapList = (x: any): any[] => (Array.isArray(x) ? x : []);
/** 'YYYY-MM-DD' in the phone's own zone. */
export const dayKey = (v: string | Date) => { const x = new Date(v); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

/** A short message — RN's Alert does nothing on react-native-web, so the browser's own there. */
export function say(title: string, message = '') {
  if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.alert(message ? `${title}\n\n${message}` : title); return; }
  Alert.alert(title, message);
}

// ── Loading ───────────────────────────────────────────────────────────────────

/**
 * Load something from the server for a screen. `data` keeps the last good
 * answer while reloading; the body's `data` is unwrapped only when the body
 * has that key (an endpoint answering `data: null` means "nothing", not "the
 * whole body"). `meta` is the whole body, for lists that send a total beside.
 */
export function useApi<T = any>(fn: () => Promise<any>, deps: any[] = [], { enabled = true } = {}) {
  const [state, setState] = useState<{ data: T | null; meta: any; loading: boolean; error: string; errorCode: string }>({ data: null, meta: null, loading: enabled, error: '', errorCode: '' });
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);
  const run = useCallback(async () => {
    if (!enabled) return;
    setState((s) => ({ ...s, loading: true, error: '', errorCode: '' }));
    try {
      const res: any = await fn();
      const body = res && typeof res === 'object' && !Array.isArray(res) && 'data' in res ? res.data : res;
      if (live.current) setState({ data: body as T, meta: res, loading: false, error: '', errorCode: '' });
    } catch (e: any) {
      if (live.current) setState((s) => ({ ...s, loading: false, error: errMsg(e, 'Could not load this'), errorCode: String(e?.data?.code || '') }));
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, [run, enabled]);
  return { ...state, reload: run, setData: (x: T | null) => setState((s) => ({ ...s, data: x })) };
}

// ── Page frame ────────────────────────────────────────────────────────────────

/**
 * A screen: its title in the header, a scroll that pulls to refresh, and the
 * first load's spinner or error in place of the body.
 */
export function Page({ title, loading, error, onRetry, onRefresh, children, headerRight, options }: {
  title: string; loading?: boolean; error?: string; onRetry?: () => void; onRefresh?: () => Promise<any> | void;
  children?: React.ReactNode; headerRight?: () => React.ReactNode; options?: Record<string, any>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh ? async () => { setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); } } : undefined;
  return (
    <>
      <Stack.Screen options={{ title, headerRight, ...options }} />
      <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled"
        refreshControl={refresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} /> : undefined}>
        {loading ? <View style={s.loading}><ActivityIndicator color={BRAND} /></View>
          : error ? <Blank icon="cloud-offline-outline" title="This could not be loaded" body={error} action={onRetry ? <Btn icon="refresh" onPress={onRetry}>Try again</Btn> : undefined} />
            : children}
      </ScrollView>
    </>
  );
}

/** Buttons side by side, wrapping on a narrow phone. */
export const Row = ({ children, end }: { children: React.ReactNode; end?: boolean }) => (
  <View style={[s.row, end && { justifyContent: 'flex-end' }]}>{children}</View>
);

/** A tinted banner at the top of a record: what it is and where it stands. */
export function Hero({ tone = 'indigo', eyebrow, title, sub, right, children }: {
  tone?: Tone; eyebrow?: string; title: string; sub?: string; right?: React.ReactNode; children?: React.ReactNode;
}) {
  const t = TINT[tone];
  return (
    <View style={[s.hero, { backgroundColor: t.tile, borderColor: t.soft }]}>
      <View style={s.heroTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {eyebrow ? <Text style={[s.heroEyebrow, { color: t.fg }]}>{eyebrow}</Text> : null}
          <Text style={s.heroTitle}>{title}</Text>
          {sub ? <Text style={s.heroSub}>{sub}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

/** A line in a list inside a panel: a title, a smaller line, and something on the right. */
export function Line({ title, sub, right, onPress, icon, tone = 'indigo', last }: {
  title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; onPress?: () => void; icon?: any; tone?: Tone; last?: boolean;
}) {
  const Wrap: any = onPress ? TouchableOpacity : View;
  const t = TINT[tone];
  return (
    <Wrap style={[s.line, last && { borderBottomWidth: 0 }]} onPress={onPress} activeOpacity={0.75} accessibilityRole={onPress ? 'button' : undefined}>
      {icon ? <View style={[s.lineIcon, { backgroundColor: t.soft }]}><Ionicons name={icon} size={15} color={t.fg} /></View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === 'string' ? <Text style={s.lineTitle}>{title}</Text> : title}
        {sub != null ? (typeof sub === 'string' ? <Text style={s.lineSub}>{sub}</Text> : sub) : null}
      </View>
      {right}
      {onPress && !right ? <Ionicons name="chevron-forward" size={16} color={Colors.textLight} /> : null}
    </Wrap>
  );
}

// ── Times, day by day ─────────────────────────────────────────────────────────

/**
 * Times laid out under their day, as the web's slot picker (an exam or
 * interview time, a campus visit). The server counts the room left and says
 * no to a full time; this only shows it.
 */
export function TimeGrid<T extends { startsAt: string }>({ items, keyOf, picked, onPick, mine, caption, disabled }: {
  items: T[]; keyOf: (x: T) => string; picked?: string; onPick?: (x: T) => void;
  mine?: (x: T) => boolean; caption: (x: T) => string; disabled?: (x: T) => boolean;
}) {
  const days: T[][] = [];
  const at = new Map<string, number>();
  for (const x of items) {
    const k = dayKey(x.startsAt);
    if (!at.has(k)) { at.set(k, days.length); days.push([]); }
    days[at.get(k)!].push(x);
  }
  return (
    <View style={{ gap: 12 }}>
      {days.map((list) => (
        <View key={dayKey(list[0].startsAt)}>
          <Text style={s.day}>{fmtWeekday(list[0].startsAt)}</Text>
          <View style={s.times} accessibilityRole="radiogroup">
            {list.map((x) => {
              const k = keyOf(x);
              const on = picked === k;
              const isMine = mine?.(x);
              const off = disabled?.(x);
              return (
                <TouchableOpacity key={k} disabled={off || !onPick} onPress={() => onPick?.(x)} activeOpacity={0.75}
                  style={[s.time, on && s.timeOn, isMine && !on && s.timeMine, off && { opacity: 0.45 }]}
                  accessibilityRole="radio" accessibilityState={{ checked: on, disabled: off }} accessibilityLabel={`${fmtTime(x.startsAt)}, ${caption(x)}`}>
                  <Text style={[s.timeText, on && { color: '#fff' }]}>{fmtTime(x.startsAt)}</Text>
                  <Text style={[s.timeCap, on && { color: 'rgba(255,255,255,0.85)' }]} numberOfLines={2}>{caption(x)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Two choices a family or office makes before something irreversible: a tick to say "I understand". */
export function Tick({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <TouchableOpacity style={s.tick} onPress={() => onChange(!on)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} activeOpacity={0.75}>
      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? BRAND : Colors.textSecondary} />
      <Text style={s.tickText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** The "this happens on the web" note — said once, with the way there. */
export function WebOnly({ what, onOpen }: { what: string; onOpen?: () => void }) {
  return (
    <Note tone="slate" icon="desktop-outline">
      <Text style={s.webText}>{what}</Text>
      {onOpen ? <TouchableOpacity onPress={onOpen} accessibilityRole="link"><Text style={s.webLink}>Open it on the web</Text></TouchableOpacity> : null}
    </Note>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, paddingBottom: 90 },
  loading: { paddingVertical: 60, alignItems: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  hero: { borderRadius: Radius.lg, borderWidth: 1, padding: 15, marginBottom: 12, gap: 8 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  heroEyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
  heroTitle: { fontSize: 19, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  heroSub: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 3, lineHeight: 17 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  lineIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  lineTitle: { fontSize: 13.5, fontWeight: '600', color: Colors.text },
  lineSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },
  day: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 7 },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  time: { minWidth: 96, flexGrow: 1, flexBasis: '30%', paddingVertical: 9, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#fff' },
  timeOn: { backgroundColor: BRAND, borderColor: BRAND },
  timeMine: { borderColor: BRAND, backgroundColor: '#F5F5FF' },
  timeText: { fontSize: 14, fontWeight: '800', color: Colors.text },
  timeCap: { fontSize: 10.5, color: Colors.textSecondary, marginTop: 2 },
  tick: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 6 },
  tickText: { flex: 1, fontSize: 13, color: Colors.text, lineHeight: 18 },
  webText: { fontSize: 12, color: Colors.text, lineHeight: 17 },
  webLink: { fontSize: 12.5, fontWeight: '700', color: BRAND, marginTop: 4 },
});
