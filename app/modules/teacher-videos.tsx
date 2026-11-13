/**
 * Teacher → Video Learning (phone).
 *
 *   Books     the books of the sections where they teach the subject; open
 *             one to release the whole book, a chapter or a single video to
 *             one of those sections, now
 *   Releases  what is open or scheduled, with unpublish and revoke
 *   Progress  how their students are getting on
 *
 * Scheduling, expiry dates, choosing individual students and the reports'
 * exports are on the web app (Video Learning › Releases / Progress).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, RefreshControl, View, Text } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import { LoaderView, Empty, Card, RowItem, Badge, SegTabs, StatRow, StatTile, ActionBtn, SectionTitle, confirmAsync, unwrap, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import ModuleDisabled from '@/components/ModuleDisabled';
import * as api from '@/api/video.api';
import { Meter, Note, clock, plural, word, tone, spent } from '@/components/videos/parts';

const what = (r: any) => (r.level === 'book' ? 'Whole book' : r.level === 'chapter' ? `Chapter ${r.chapterNumber}: ${r.chapterTitle}` : `${r.videoTitle} (Ch. ${r.chapterNumber})`);
const failed = (e: any) => confirmAsync('Could not do that', e?.message || 'Please try again.', 'OK');

function BookView({ book, onBack }: { book: any; onBack: () => void }) {
  const [section, setSection] = useState(String(book.sections[0]?.section || ''));
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setData(unwrap(await api.teacherBook(book._id, section))); } catch (e: any) { failed(e); }
  }, [book._id, section]);
  useEffect(() => { setData(null); load(); }, [load]);

  const release = async (level: string, extra: object, label: string) => {
    const here = book.sections.find((s: any) => String(s.section) === section);
    if (!await confirmAsync(`Release ${label}?`, `It opens now to everyone in ${here?.className} ${here?.sectionName}, and they are notified.`, 'Release')) return;
    setBusy(true);
    try { await api.teacherRelease({ book: book._id, level, section, ...extra }); await load(); }
    catch (e: any) { failed(e); }
    finally { setBusy(false); }
  };

  return (
    <>
      <ActionBtn label="‹ All books" onPress={onBack} small />
      <Text style={{ fontSize: 17, fontWeight: '700', color: Colors.text, marginTop: Spacing.sm }}>{book.title}</Text>
      <Text style={{ color: Colors.textSecondary, marginBottom: Spacing.sm }}>{book.subjectName}{book.publisher ? ` · ${book.publisher}` : ''}</Text>
      {book.sections.length > 1 ? (
        <SegTabs tabs={book.sections.map((s: any) => ({ key: String(s.section), label: `${s.className} ${s.sectionName}` }))} active={section} onChange={setSection} />
      ) : null}
      {!data ? <LoaderView /> : (
        <>
          <Card>
            <RowItem icon="library-outline" title="Whole book" sub={data.bookRelease ? `${word(data.bookRelease.shownStatus)} for this section` : 'Every chapter and video, including any added later'}
              right={data.bookRelease ? <Badge label={word(data.bookRelease.shownStatus)} tone={tone(data.bookRelease.shownStatus)} />
                : <ActionBtn small tone="primary" label="Release" disabled={busy || !data.chapters.length} onPress={() => release('book', {}, 'the whole book')} />} />
          </Card>
          {data.chapters.map((c: any) => {
            const covered = c.release || data.bookRelease;
            return (
              <View key={c._id}>
                <SectionTitle>{`Chapter ${c.chapterNumber}: ${c.title}`}</SectionTitle>
                <Card>
                  <RowItem icon="albums-outline" title="All videos of this chapter" sub={c.videos.length ? plural(c.videos.length, 'video') : 'No videos yet'}
                    right={covered ? <Badge label={`Released${covered.level !== 'chapter' ? ' (book)' : ''}`} tone="success" />
                      : c.videos.length ? <ActionBtn small tone="primary" label="Release" disabled={busy} onPress={() => release('chapter', { chapter: c._id }, `Chapter ${c.chapterNumber}`)} /> : undefined} />
                  {c.videos.map((v: any) => (
                    <RowItem key={v._id} icon="play-circle-outline" title={v.title} sub={clock(v.durationSec)}
                      right={v.releasedVia ? <Badge label={v.releasedVia === 'video' ? 'Released' : `With the ${v.releasedVia}`} tone="success" />
                        : <ActionBtn small label="Release" disabled={busy} onPress={() => release('video', { chapterVideo: v._id }, `"${v.title}" only`)} />} />
                  ))}
                </Card>
              </View>
            );
          })}
        </>
      )}
    </>
  );
}

export default function TeacherVideos() {
  const [tab, setTab] = useState('books');
  const [ws, setWs] = useState<any>(null);
  const [rel, setRel] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [open, setOpen] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const load = useCallback(async () => {
    try {
      if (tab === 'books') setWs(unwrap(await api.teacherWorkspace()));
      if (tab === 'releases') setRel(unwrap(await api.teacherReleases({ tab: 'active', limit: 50 })) || []);
      if (tab === 'progress') {
        setStats(unwrap(await api.teacherAnalytics()));
        setStudents(unwrap(await api.teacherStudents({ limit: 50 })) || []);
      }
    } catch (e: any) { if (MODULE_BLOCKED_CODES.includes(e?.data?.code)) setBlocked(true); else failed(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [tab]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  const act = async (fn: () => Promise<any>, title: string, msg: string) => {
    if (!await confirmAsync(title, msg, 'Yes')) return;
    try { await fn(); load(); } catch (e: any) { failed(e); }
  };

  const head = <Stack.Screen options={{ title: 'Video Learning' }} />;
  if (blocked) return <>{head}<ModuleDisabled /></>;
  return (
    <>
      {head}
      <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: Spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        <SegTabs tabs={[{ key: 'books', label: 'My books' }, { key: 'releases', label: 'Releases' }, { key: 'progress', label: 'Progress' }]}
          active={tab} onChange={(k) => { setOpen(null); setTab(k); }} />
        {loading ? <LoaderView /> : tab === 'books' ? (
          open ? <BookView book={open} onBack={() => { setOpen(null); load(); }} /> : !ws?.sections?.length ? (
            <Empty icon="person-outline" text="Books appear here for the sections where you are the subject teacher." />
          ) : !ws.books.length ? (
            <Empty icon="library-outline" text="The school has not chosen video lesson books for the subjects you teach yet." />
          ) : (
            <Card>
              {ws.books.map((b: any) => (
                <RowItem key={b._id} icon="book-outline" title={b.title} onPress={() => setOpen(b)}
                  sub={`${b.subjectName} · ${b.sections.map((s: any) => `${s.className} ${s.sectionName}${s.liveReleases ? ` (${s.liveReleases} released)` : ''}`).join(', ')}`} />
              ))}
            </Card>
          )
        ) : tab === 'releases' ? (
          <>
            <Note>Taking a release down closes it straight away; what students have watched is kept. Schedules, end dates and choosing students are on the web app.</Note>
            {rel.length ? (
              <Card>
                {rel.map((r) => (
                  <View key={r._id} style={{ paddingBottom: Spacing.sm }}>
                    <RowItem icon="paper-plane-outline" title={what(r)} sub={`${r.bookTitle} · ${r.className} ${r.sectionName}`} right={<Badge label={word(r.shownStatus)} tone={tone(r.shownStatus)} />} />
                    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.md }}>
                      <ActionBtn small tone="warning" label="Unpublish" onPress={() => act(() => api.teacherUnpublish(r._id), 'Unpublish?', `${what(r)} closes for ${r.className} ${r.sectionName} now. You can publish it again.`)} />
                      <ActionBtn small tone="danger" label="Revoke" onPress={() => act(() => api.teacherRevoke(r._id), 'Revoke access?', `${what(r)} closes for good. Students keep their watch record.`)} />
                    </View>
                  </View>
                ))}
              </Card>
            ) : <Empty icon="paper-plane-outline" text="Nothing is released right now." />}
          </>
        ) : stats ? (
          <>
            <StatRow>
              <StatTile label="Students" value={stats.assignedStudents} icon="people-outline" />
              <StatTile label="Started" value={stats.students?.started ?? 0} icon="trending-up-outline" tone="warning" />
              <StatTile label="Completed" value={stats.students?.completed ?? 0} icon="checkmark-done-outline" tone="success" />
            </StatRow>
            <SectionTitle>Students</SectionTitle>
            {students.length ? (
              <Card>
                {students.map((s) => (
                  <View key={s._id}>
                    <RowItem icon="person-outline" title={s.name} sub={`${s.className} ${s.sectionName} · ${s.completed} of ${s.videos} completed · ${spent(s.watchSeconds)}`}
                      right={<Badge label={word(s.status)} tone={tone(s.status)} />} />
                    <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm }}><Meter percent={s.percent} /></View>
                  </View>
                ))}
              </Card>
            ) : <Empty icon="people-outline" text="Students appear here once something is released to their section." />}
          </>
        ) : null}
      </ScrollView>
    </>
  );
}
