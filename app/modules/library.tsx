/**
 * The library, for a member — student or teacher.
 *
 * Four tabs, the same four the web has: the shelf you land on, the catalogue,
 * what you are holding, and what you owe.
 *
 * The Overview tab has two faces. A member sees their own shelf; a teacher who
 * runs the library also sees the counter's — books out across the school and
 * fines standing against all readers. The line is drawn by the server, not
 * here: those figures come from GET /library/dashboard, which sits behind the
 * module-admin guard, so a teacher without library access cannot obtain them
 * however this screen is rendered. Catalogue size and the category split are
 * not privileged — Search shows both to anyone who may browse.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Alert, TextInput,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useModules } from '@/hooks/useModules';
import * as studentApi from '@/api/student.api';
import * as teacherApi from '@/api/teacher.api';
import * as libApi from '@/api/library.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import FinePayments from '@/components/library/FinePayments';
import { unwrap, LoaderView, SegTabs, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import {
  Hero, Figures, Panel, Pill, Blank, BookRow, TONES, money, shortDate, ago, type Tone,
} from '@/components/library/parts';

// LibraryIssuance.status: issued | returned | overdue | lost. A book the member
// still holds is one that has neither come back nor been written off.
const OUT_ON_LOAN = ['issued', 'overdue'];
const DAY = 86400000;

const LOAN_TONE: Record<string, { label: string; tone: Tone }> = {
  issued:   { label: 'Borrowed', tone: 'blue' },
  overdue:  { label: 'Overdue',  tone: 'red' },
  returned: { label: 'Returned', tone: 'green' },
  lost:     { label: 'Lost',     tone: 'amber' },
};

const SORTS = [
  { label: 'Title (A–Z)', value: 'title_asc' },
  { label: 'Title (Z–A)', value: 'title_desc' },
  { label: 'Recently added', value: 'newest' },
  { label: 'Most available', value: 'available' },
];
const AVAIL = [
  { label: 'All books', value: '' },
  { label: 'Available now', value: 'available' },
  { label: 'All copies out', value: 'out' },
];

type Tab = 'overview' | 'search' | 'books' | 'fines';

export default function LibraryScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { modules } = useModules();
  const isTeacher   = user?.role === 'teacher';
  const runsLibrary = isTeacher && !!modules?.isLibrarian;

  const [tab, setTab] = useState<Tab>('overview');
  const [mine, setMine] = useState<any>(null);      // personal dashboard
  const [wide, setWide] = useState<any>(null);      // the counter's, when allowed
  const [books, setBooks] = useState<any[]>([]);    // my loans
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    if (!user?.role) return;
    try {
      const [dash, loans] = await Promise.all([
        isTeacher ? teacherApi.getLibrary() : studentApi.getLibrary(),
        isTeacher ? teacherApi.getMyBooks() : studentApi.getMyBooks(),
      ]);
      setMine(unwrap(dash));
      setBooks(unwrap(loans) ?? []);
      // Asked for only by somebody who may have it — and refused by the server
      // if that ever stops being true.
      if (runsLibrary) {
        try { setWide(unwrap(await libApi.getDashboard())); } catch { setWide(null); }
      } else setWide(null);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  }, [user?.role, isTeacher, runsLibrary]);

  useEffect(() => { load(); }, [load]);

  const renew = async (b: any) => {
    setBusyId(b._id);
    try {
      const res: any = isTeacher ? await libApi.renewTeacherBook(b._id) : await libApi.renewMyBook(b._id);
      Alert.alert('Renewed', res?.message || 'Your loan has been extended.');
      load();
    } catch (err: any) { Alert.alert('Cannot renew', err?.message ?? 'Could not renew'); }
    finally { setBusyId(''); }
  };

  const reserve = async (b: any) => {
    setBusyId(b._id);
    try {
      const res: any = isTeacher ? await libApi.teacherReserve(b._id) : await libApi.studentReserve(b._id);
      const pos = res?.data?.queuePosition;
      Alert.alert('Reserved', res?.data?.status === 'ready'
        ? 'Ready to collect — pick it up from the library.'
        : `You are number ${pos ?? '?'} in the queue.`);
      load();
    } catch (err: any) { Alert.alert('Cannot reserve', err?.message ?? 'Could not reserve'); }
    finally { setBusyId(''); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Library' }} />
      <ModuleDisabled />
    </>
  );

  const cat    = mine?.catalogue ?? {};
  const holds  = mine?.reservations ?? [];
  const fines  = mine?.pendingFines ?? [];
  const issued = books.filter((b: any) => OUT_ON_LOAN.includes(b.status));
  const owed   = fines.reduce((sum: number, f: any) => sum + Math.max(
    0, Number(f.amount || 0) - Number(f.waivedAmount || 0) - Number(f.paidAmount || 0)), 0);

  return (
    <>
      <Stack.Screen options={{ title: 'Library' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <Hero icon="library"
          title="Library"
          blurb={runsLibrary
            ? 'Access, manage and explore your school library resources.'
            : isTeacher
              ? 'Browse the catalogue, track what you have borrowed and settle any fines.'
              : 'Find your next book, track what you have borrowed and check your fines.'}
          quote={isTeacher
            ? '“A reader today, a better educator tomorrow.”'
            : '“A reader today, a leader tomorrow.”'} />

        <SegTabs
          tabs={[
            { key: 'overview', label: 'Overview' },
            { key: 'search',   label: 'Search' },
            { key: 'books',    label: 'My Books' },
            { key: 'fines',    label: 'My Fines' },
          ]}
          active={tab}
          onChange={(k) => setTab(k as Tab)}
        />

        {loading ? <LoaderView /> : (
          <>
            {tab === 'overview' && (
              <>
                <Figures items={[
                  { icon: 'library-outline', tone: 'blue', label: 'Total Books',
                    value: Number(cat.totalBooks || 0).toLocaleString('en-IN'),
                    caption: `${Number(cat.availableCopies || 0).toLocaleString('en-IN')} copies on the shelf` },
                  runsLibrary
                    ? { icon: 'checkmark-circle-outline', tone: 'green' as Tone, label: 'Issued Books',
                        value: wide?.issuedCopies ?? 0, caption: 'Currently issued' }
                    : { icon: 'checkmark-circle-outline', tone: 'green' as Tone, label: 'Issued Books',
                        value: issued.length,
                        caption: issued.filter((b: any) => b.status === 'overdue').length
                          ? `${issued.filter((b: any) => b.status === 'overdue').length} overdue`
                          : 'Currently with you' },
                  runsLibrary
                    ? { icon: 'time-outline', tone: 'amber' as Tone, label: 'Pending Fines',
                        value: wide?.pendingFines ?? 0,
                        caption: wide?.pendingFineTotal ? `${money(wide.pendingFineTotal)} across all readers` : 'Across all readers' }
                    : { icon: 'time-outline', tone: 'amber' as Tone, label: 'Pending Fines',
                        value: fines.length,
                        caption: owed > 0 ? `${money(owed)} outstanding` : 'Nothing outstanding' },
                  runsLibrary
                    ? { icon: 'people-outline', tone: 'violet' as Tone, label: 'Active Readers',
                        value: wide?.activeReaders ?? 0, caption: `of ${wide?.members ?? 0} students & staff` }
                    : { icon: 'star-outline', tone: 'violet' as Tone, label: 'Reservations',
                        value: holds.length, caption: holds.length ? 'Waiting for you' : 'Nothing on hold' },
                ]} />

                <Panel icon="flash" tone="indigo" title="Quick Actions">
                  <View style={s.quick}>
                    {[
                      { icon: 'search', label: 'Search Books', tone: 'blue' as Tone, go: () => setTab('search') },
                      { icon: 'book', label: 'My Books', tone: 'green' as Tone, go: () => setTab('books') },
                      { icon: 'cash-outline', label: 'My Fines', tone: 'amber' as Tone, go: () => setTab('fines') },
                      ...(runsLibrary ? [{ icon: 'settings-outline', label: 'Manage Library', tone: 'violet' as Tone,
                        go: () => router.push('/modules/library-admin' as any) }] : []),
                    ].map((a) => (
                      <TouchableOpacity key={a.label} style={[s.quickItem, { backgroundColor: TONES[a.tone].bg }]} onPress={a.go}>
                        <Ionicons name={a.icon as any} size={19} color={TONES[a.tone].fg} />
                        <Text style={[s.quickText, { color: TONES[a.tone].fg }]}>{a.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </Panel>

                <Panel icon="book" tone="indigo"
                  title={runsLibrary ? 'Currently Issued Books' : 'My Issued Books'}>
                  {runsLibrary ? (
                    (wide?.recent ?? []).filter((r: any) => OUT_ON_LOAN.includes(r.status)).length === 0 ? (
                      <Blank icon="book-outline" title="No books are out right now"
                        body="Issued books appear here as soon as the counter lends one." />
                    ) : (wide?.recent ?? []).filter((r: any) => OUT_ON_LOAN.includes(r.status)).slice(0, 5)
                      .map((r: any) => (
                        <BookRow key={r._id} book={r.book}
                          meta={`${r.issuedTo?.name ?? 'Reader'}${r.issuedTo?.className ? ` · ${r.issuedTo.className}` : ''}\nDue ${shortDate(r.dueDate)}`}
                          right={<Pill label={LOAN_TONE[r.status]?.label ?? r.status} tone={LOAN_TONE[r.status]?.tone ?? 'slate'} />} />
                      ))
                  ) : issued.length === 0 ? (
                    <Blank icon="book-outline" title="You have no books out"
                      body="Search the catalogue and reserve a book to get started." />
                  ) : issued.map((b: any) => (
                    <LoanRow key={b._id} row={b} busy={busyId === b._id} onRenew={() => renew(b)} />
                  ))}
                </Panel>

                <Panel icon="time" tone="indigo" title="Recent Activity">
                  {runsLibrary ? (
                    (wide?.recent ?? []).length === 0
                      ? <Blank icon="pulse-outline" title="Nothing at the counter yet" />
                      : (wide?.recent ?? []).slice(0, 6).map((r: any) => (
                        <ActivityRow key={r._id}
                          title={`${r.book?.title ?? 'Book'} ${r.status === 'returned' ? 'returned' : 'issued'}`}
                          sub={`by ${r.issuedTo?.name ?? 'a reader'}${r.issuedTo?.className ? ` (${r.issuedTo.className})` : ''}`}
                          at={r.status === 'returned' ? (r.returnDate ?? r.issueDate) : r.issueDate}
                          back={r.status === 'returned'} />
                      ))
                  ) : (mine?.history ?? []).length === 0 ? (
                    <Blank icon="pulse-outline" title="No library activity yet"
                      body="Books you borrow and return will show up here." />
                  ) : (mine?.history ?? []).slice(0, 6).map((h: any) => (
                    <ActivityRow key={h._id}
                      title={`${h.title} ${h.status === 'returned' ? 'returned' : 'issued to you'}`}
                      sub={h.status === 'returned' ? `Borrowed ${shortDate(h.issueDate)}` : `Due ${shortDate(h.dueDate)}`}
                      at={h.status === 'returned' ? (h.returnDate ?? h.issueDate) : h.issueDate}
                      back={h.status === 'returned'} />
                  ))}
                </Panel>

                <Panel icon="stats-chart" tone="violet" title="Popular Categories">
                  <Categories categories={mine?.categories ?? []} />
                </Panel>
              </>
            )}

            {tab === 'search' && (
              <SearchTab isTeacher={isTeacher} busyId={busyId} onReserve={reserve} />
            )}

            {tab === 'books' && (
              <MyBooksTab rows={books} busyId={busyId} onRenew={renew} />
            )}

            {tab === 'fines' && <FinePayments title="Outstanding fines" />}
          </>
        )}
      </ScrollView>
    </>
  );
}

// ── A loan of mine ───────────────────────────────────────────────────────────
export function LoanRow({ row, busy, onRenew }: { row: any; busy?: boolean; onRenew?: () => void }) {
  const late = row.status === 'overdue' || (row.status === 'issued' && row.dueDate && new Date(row.dueDate).getTime() < Date.now());
  const st = LOAN_TONE[late ? 'overdue' : row.status] ?? { label: row.status, tone: 'slate' as Tone };
  const days = row.dueDate ? Math.ceil((new Date(row.dueDate).getTime() - Date.now()) / DAY) : null;
  const due = row.fineSummary?.outstanding || 0;

  return (
    <BookRow book={row.book}
      meta={[
        row.bookCopy?.uniqueCode ? `Copy ${row.bookCopy.uniqueCode}` : '',
        `Issued ${shortDate(row.issueDate)} · due ${shortDate(row.dueDate)}`,
        OUT_ON_LOAN.includes(row.status) && days != null
          ? (days < 0 ? `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`
            : days === 0 ? 'Due today' : `${days} day${days === 1 ? '' : 's'} left`)
          : row.returnDate ? `Returned ${shortDate(row.returnDate)}` : '',
      ].filter(Boolean).join('\n')}
      right={
        <>
          <Pill label={st.label} tone={st.tone} />
          {due > 0 ? <Text style={s.owed}>{money(due)} due</Text> : null}
        </>
      }
      footer={OUT_ON_LOAN.includes(row.status) && onRenew ? (
        <TouchableOpacity style={s.renew} onPress={onRenew} disabled={busy}>
          <Ionicons name="refresh" size={15} color={Colors.primary} />
          <Text style={s.renewText}>{busy ? 'Renewing…' : 'Renew loan'}</Text>
        </TouchableOpacity>
      ) : null}
    />
  );
}

function ActivityRow({ title, sub, at, back }: { title: string; sub?: string; at?: any; back?: boolean }) {
  const tone: Tone = back ? 'green' : 'indigo';
  return (
    <View style={s.act}>
      <View style={[s.actIcon, { backgroundColor: TONES[tone].bg }]}>
        <Ionicons name={back ? 'checkmark-circle' : 'book'} size={15} color={TONES[tone].fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.actTitle} numberOfLines={2}>{title}</Text>
        {sub ? <Text style={s.actSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      <Text style={s.actWhen}>{ago(at)}</Text>
    </View>
  );
}

/** Divided by every category, so the shares cannot add up to more than the collection. */
function Categories({ categories }: { categories: any[] }) {
  const rows = categories.slice(0, 5);
  if (!rows.length) {
    return <Blank icon="layers-outline" title="No categories yet"
      body="Categories appear once books are catalogued." />;
  }
  const total = categories.reduce((n, c) => n + Number(c.count || 0), 0);
  const top   = Math.max(...rows.map((c) => c.count), 1);
  const tones: Tone[] = ['blue', 'violet', 'pink', 'green', 'amber'];
  return (
    <>
      {rows.map((c, i) => (
        <View key={c.category} style={s.cat}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.catName} numberOfLines={1}>{c.category}</Text>
            <Text style={s.catCount}>{c.count} book{c.count === 1 ? '' : 's'}</Text>
          </View>
          <View style={s.catBar}>
            <View style={[s.catFill, {
              width: `${Math.max(4, Math.round((c.count / top) * 100))}%`,
              backgroundColor: TONES[tones[i % tones.length]].fg,
            }]} />
          </View>
          <Text style={s.catPct}>{total ? Math.round((c.count / total) * 100) : 0}%</Text>
        </View>
      ))}
    </>
  );
}

// ── Search ───────────────────────────────────────────────────────────────────
function SearchTab({ isTeacher, busyId, onReserve }: {
  isTeacher: boolean; busyId: string; onReserve: (b: any) => void;
}) {
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [category, setCategory] = useState('');
  const [availability, setAvailability] = useState('');
  const [sort, setSort] = useState('title_asc');
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const call = isTeacher ? teacherApi.searchLibrary : studentApi.searchLibrary;
      const r: any = await call({
        q: applied || undefined, category: category || undefined,
        availability: availability || undefined, sort, limit: 25,
      });
      setRes(r);
    } catch { setRes(null); }
    finally { setBusy(false); }
  }, [isTeacher, applied, category, availability, sort]);

  useEffect(() => { run(); }, [run]);

  const rows: any[]  = res?.data ?? [];
  const facets       = res?.facets ?? {};
  const summary      = res?.summary ?? {};
  const total        = res?.total ?? 0;
  const cats: any[]  = facets.category ?? [];

  return (
    <>
      <Figures items={[
        { icon: 'library-outline', tone: 'blue', label: 'Total Books',
          value: Number(summary.totalBooks || 0).toLocaleString('en-IN'), caption: 'In library' },
        { icon: 'checkmark-circle-outline', tone: 'green', label: 'Available',
          value: Number(summary.availableCopies || 0).toLocaleString('en-IN'), caption: 'Ready to issue' },
        { icon: 'time-outline', tone: 'amber', label: 'Currently Issued',
          value: Number(summary.issuedCopies || 0).toLocaleString('en-IN'), caption: 'By students & staff' },
        { icon: 'bookmark-outline', tone: 'pink', label: 'Reserved',
          value: Number(summary.reserved || 0).toLocaleString('en-IN'), caption: 'By students & staff' },
      ]} />

      <Panel icon="funnel" tone="indigo" title="Filters">
        <View style={s.searchBox}>
          <Ionicons name="search" size={16} color={Colors.textLight} />
          <TextInput
            style={s.searchInput}
            placeholder="Title, author, ISBN, keyword…"
            placeholderTextColor={Colors.textLight}
            value={q}
            onChangeText={setQ}
            returnKeyType="search"
            onSubmitEditing={() => setApplied(q.trim())}
          />
          {q ? (
            <TouchableOpacity onPress={() => { setQ(''); setApplied(''); }}>
              <Ionicons name="close-circle" size={17} color={Colors.textLight} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* A filter with nothing behind it is not drawn — a dropdown that only
            ever offers "All" promises a way to narrow and then refuses. */}
        {cats.length > 0 && (
          <Chips label="Category" value={category} onChange={setCategory}
            options={[{ label: 'All', value: '' },
              ...cats.map((c: any) => ({ label: `${c.value} (${c.count})`, value: c.value }))]} />
        )}
        <Chips label="Availability" value={availability} onChange={setAvailability} options={AVAIL} />
        <Chips label="Sort by" value={sort} onChange={setSort} options={SORTS} />
      </Panel>

      <Panel icon="book" tone="indigo" title={`Books (${total.toLocaleString('en-IN')})`}>
        {busy ? <LoaderView /> : rows.length === 0 ? (
          <Blank icon="search-outline"
            title={applied || category || availability ? 'No books match those filters' : 'The catalogue is empty'}
            body={applied || category || availability
              ? 'Try a broader search, or clear the filters to see everything.'
              : 'Books appear here as soon as the library adds them.'} />
        ) : rows.map((b: any) => (
          <BookRow key={b._id} book={b}
            meta={[b.category, b.isbn ? `ISBN ${b.isbn}` : ''].filter(Boolean).join(' · ')}
            right={
              b.availableCopies > 0
                ? <Pill label={`${b.availableCopies} available`} tone="green" />
                : b.totalCopies > 0 ? <Pill label="All copies out" tone="amber" />
                  : <Pill label="No copies yet" tone="slate" />
            }
            footer={
              b.myReservation ? (
                <View style={s.heldRow}>
                  <Pill label={b.myReservation.status === 'ready' ? 'Ready to collect' : 'Reserved'} tone="indigo" />
                </View>
              ) : (
                <TouchableOpacity style={s.renew} onPress={() => onReserve(b)} disabled={busyId === b._id}>
                  <Ionicons name="bookmark-outline" size={15} color={Colors.primary} />
                  <Text style={s.renewText}>
                    {busyId === b._id ? 'Working…' : b.availableCopies > 0 ? 'Reserve' : 'Join queue'}
                  </Text>
                </TouchableOpacity>
              )
            } />
        ))}
      </Panel>
    </>
  );
}

// ── My books ─────────────────────────────────────────────────────────────────
export function MyBooksTab({ rows, busyId, onRenew }: { rows: any[]; busyId: string; onRenew: (b: any) => void }) {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      const st = r.status === 'issued' && (r.isOverdue || new Date(r.dueDate).getTime() < Date.now())
        ? 'overdue' : r.status;
      if (status && st !== status) return false;
      if (!needle) return true;
      return [r.book?.title, (r.book?.authors ?? []).join(' '), r.book?.isbn, r.bookCopy?.uniqueCode]
        .some((v: any) => String(v ?? '').toLowerCase().includes(needle));
    });
  }, [rows, status, q]);

  const open     = rows.filter((r) => OUT_ON_LOAN.includes(r.status));
  const returned = rows.filter((r) => r.status === 'returned');

  return (
    <>
      <Figures items={[
        { icon: 'library-outline', tone: 'violet', label: 'Total Books', value: rows.length, caption: 'All time' },
        { icon: 'book-outline', tone: 'blue', label: 'Currently Borrowed', value: open.length, caption: 'Not yet returned' },
        { icon: 'refresh-outline', tone: 'green', label: 'Returned', value: returned.length, caption: 'All time' },
        { icon: 'alert-circle-outline', tone: 'red', label: 'Overdue',
          value: open.filter((r) => r.status === 'overdue' || new Date(r.dueDate).getTime() < Date.now()).length,
          caption: 'Past the due date' },
      ]} />

      <Panel icon="book" tone="indigo" title={`My Books (${shown.length})`}>
        <View style={s.searchBox}>
          <Ionicons name="search" size={16} color={Colors.textLight} />
          <TextInput style={s.searchInput} placeholder="Title, author, ISBN or accession no…"
            placeholderTextColor={Colors.textLight} value={q} onChangeText={setQ} />
        </View>
        <Chips label="Status" value={status} onChange={setStatus} options={[
          { label: 'All', value: '' }, { label: 'Borrowed', value: 'issued' },
          { label: 'Overdue', value: 'overdue' }, { label: 'Returned', value: 'returned' },
          { label: 'Lost', value: 'lost' },
        ]} />

        {shown.length === 0 ? (
          <Blank icon="book-outline"
            title={rows.length ? 'No loans match those filters' : 'You have not borrowed anything yet'}
            body={rows.length ? 'Try a different status, or clear the search.'
              : 'Books you borrow from the library will appear here.'} />
        ) : shown.map((b: any) => (
          <LoanRow key={b._id} row={b} busy={busyId === b._id} onRenew={() => onRenew(b)} />
        ))}
      </Panel>
    </>
  );
}

/** A row of choices — the phone's answer to a dropdown. */
function Chips({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <View style={s.chipsWrap}>
      <Text style={s.chipsLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <TouchableOpacity key={o.value || 'all'} onPress={() => onChange(o.value)}
              style={[s.chipBtn, on && s.chipBtnOn]}>
              <Text style={[s.chipBtnText, on && s.chipBtnTextOn]} numberOfLines={1}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  quickItem: {
    flexGrow: 1, flexBasis: '46%', flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 13, paddingHorizontal: 12, borderRadius: Radius.md,
  },
  quickText: { fontSize: 12.5, fontWeight: '700' },

  owed: { fontSize: 10.5, fontWeight: '700', color: Colors.danger, marginTop: 4 },
  renew: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 8, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
  },
  renewText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  heldRow: { flexDirection: 'row', justifyContent: 'center' },

  act: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.divider,
  },
  actIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.text, lineHeight: 17 },
  actSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  actWhen: { fontSize: 10.5, color: Colors.textLight },

  cat: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  catName: { fontSize: 12.5, fontWeight: '700', color: Colors.text },
  catCount: { fontSize: 10.5, color: Colors.textLight },
  catBar: { width: 90, height: 6, borderRadius: 999, backgroundColor: Colors.surfaceAlt, overflow: 'hidden' },
  catFill: { height: '100%', borderRadius: 999 },
  catPct: { width: 34, textAlign: 'right', fontSize: 11.5, fontWeight: '700', color: Colors.textSecondary },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt, marginBottom: 10,
  },
  searchInput: { flex: 1, paddingVertical: 9, fontSize: 13, color: Colors.text },

  chipsWrap: { marginBottom: 10 },
  chipsLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6 },
  chips: { gap: 7, paddingRight: 4 },
  chipBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  chipBtnOn: { backgroundColor: TONES.indigo.bg, borderColor: TONES.indigo.fg },
  chipBtnText: { fontSize: 11.5, fontWeight: '600', color: Colors.textSecondary, maxWidth: 160 },
  chipBtnTextOn: { color: TONES.indigo.fg, fontWeight: '700' },
});
