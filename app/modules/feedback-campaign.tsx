/**
 * One campaign, in full — for the school admin.
 *
 * Four views, in the order the questions get asked: what it has collected
 * (Results), who it was about (Teachers), what it actually asked (Questions),
 * and who still has not answered (Who responded). That last one is the only
 * screen in the module that names students, and it names them ONLY against a
 * submission status — never beside the content of an answer.
 */
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as fb from '@/api/feedback.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Colors } from '@/constants/theme';
import {
  Avatar, Bars, Blank, Btn, CampaignPill, Card, Dot, Hero, Loading, Meter, Muted, NoteBar, Page, Pager, Panel, Pick, Rating, RatingOr,
  SearchBox, Seg, Stars, Tag, TagRow, Tile, Tiles, daysLeft, fmtDay, minutesFor, plural, toneAt, typeShort, useLoad, Tone,
} from '@/components/feedback/parts';
import { toCampaignForm, useCampaignActions, useCampaignSave } from '@/components/feedback/admin/campaignParts';

export default function FeedbackCampaignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState('results');
  const [blocked, setBlocked] = useState(false);
  const onBlocked = useCallback(() => setBlocked(true), []);
  const campaign = useLoad<any>(() => fb.getCampaign(String(id)), [id], { onBlocked, skip: !id });
  const analytics = useLoad<any>(() => fb.getCampaignAnalytics(String(id)), [id], { skip: !id });
  const reload = () => { campaign.reload(); analytics.reload(); };
  // A deleted draft has no page left to show, so that one action leaves the screen.
  const lastAction = useRef<string | null>(null);
  const actions = useCampaignActions(() => { if (lastAction.current === 'delete') router.back(); else reload(); });
  const saver = useCampaignSave(() => { actions.flash('Campaign saved'); reload(); });

  if (blocked) return <><Stack.Screen options={{ title: 'Campaign' }} /><ModuleDisabled /></>;
  if (campaign.loading && !campaign.data) return <><Stack.Screen options={{ title: 'Campaign' }} /><Loading /></>;
  if (campaign.error && !campaign.data) {
    return <><Stack.Screen options={{ title: 'Campaign' }} /><Page><NoteBar tone="red" icon="alert-circle">{campaign.error}</NoteBar></Page></>;
  }

  const c = campaign.data;
  const left = daysLeft(c.endDate);
  const ask = (action: string) => { lastAction.current = action; actions.ask(c, action); };

  return (
    <>
      <Stack.Screen options={{ title: c.name }} />
      <Page refreshing={campaign.refreshing} onRefresh={reload}>
        <Hero icon="megaphone-outline" title={c.name} subtitle={[c.term, c.academicYear?.yearName, `${fmtDay(c.startDate)} – ${fmtDay(c.endDate)}`].filter(Boolean).join(' · ')}>
          {['draft', 'scheduled', 'active'].includes(c.status) ? <Btn label="Edit" icon="create-outline" onPress={() => saver.open(toCampaignForm(c))} /> : null}
          {c.status === 'draft' ? <Btn kind="primary" label="Start collecting" icon="power" onPress={() => ask('activate')} /> : null}
          {['scheduled', 'active'].includes(c.status) ? <Btn label="Sync" icon="sync-outline" onPress={() => ask('sync')} /> : null}
          {c.status === 'active' ? <Btn label="Remind" icon="notifications-outline" onPress={() => ask('reminders')} /> : null}
          {['scheduled', 'active'].includes(c.status) ? <Btn kind="primary" label="Close" onPress={() => ask('close')} /> : null}
          {c.status === 'closed' ? <Btn label="Archive" icon="archive-outline" onPress={() => ask('archive')} /> : null}
          <Btn label="Duplicate" icon="copy-outline" onPress={() => ask('duplicate')} />
          {c.status === 'draft' ? <Btn kind="danger" label="Delete" icon="trash-outline" onPress={() => ask('delete')} /> : null}
        </Hero>

        {actions.flashNode}

        <TagRow>
          <CampaignPill status={c.status} />
          <Tag label={c.isAnonymous ? 'Anonymous' : 'Named'} tone={c.isAnonymous ? 'purple' : 'slate'} />
          <Tag label={plural(c.questions?.length || 0, 'question')} tone="slate" />
          <Tag label={`~ ${minutesFor(c.questions?.length || 0)} min to fill in`} tone="slate" />
          <Tag label={`Floor: ${c.minimumResponses} responses`} tone="blue" />
          {c.status === 'active' && left != null ? (
            <Tag label={left > 0 ? `${plural(left, 'day')} left` : left === 0 ? 'Closes today' : 'Past its closing date'} tone={left <= 3 ? 'amber' : 'slate'} />
          ) : null}
        </TagRow>

        <Tiles>
          <Tile icon="school-outline" tone="blue" value={c.assigned} label="Students Asked" caption="From the section–subject–teacher allocations" />
          <Tile icon="checkmark-circle-outline" tone="green" value={c.submitted} label="Submitted" caption={`${c.responseRate}% of everyone asked`} />
          <Tile icon="time-outline" tone="amber" value={c.pending} label="Outstanding" caption={c.status === 'active' ? 'Can still be chased with a reminder' : 'Marked expired when it closed'} />
          <Tile icon="star-outline" tone="purple" value={c.avgRating == null ? '—' : c.avgRating.toFixed(1)} unit={c.avgRating == null ? '' : '/ 5'} label="Average Rating"
            caption={c.avgRating == null ? 'Nothing scored yet' : 'Out of 5, school-wide'} />
        </Tiles>

        {c.status === 'draft' ? (
          <NoteBar tone="blue">This campaign has not started. Nothing has been sent and no student can see it — check the questions and the targeting, then Start collecting. From that moment both are frozen.</NoteBar>
        ) : null}

        <Seg value={tab} onChange={setTab} options={[
          { value: 'results', label: 'Results' },
          { value: 'teachers', label: `Teachers${analytics.data?.byTeacher ? ` (${analytics.data.byTeacher.length})` : ''}` },
          { value: 'questions', label: `Questions (${c.questions?.length || 0})` },
          { value: 'tracking', label: 'Who responded' },
        ]} />

        {tab === 'results' ? <Results a={analytics} campaign={c} /> : null}
        {tab === 'teachers' ? <Teachers a={analytics} campaign={c} onOpen={(tid) => router.push({ pathname: '/modules/feedback-teacher-detail', params: { id: tid } } as any)} /> : null}
        {tab === 'questions' ? <QuestionsTab questions={c.questions || []} /> : null}
        {tab === 'tracking' ? <Tracking id={String(id)} campaign={c} /> : null}

        <NoteBar tone="purple" icon="key-outline">
          {`Per-teacher figures are withheld until ${c.minimumResponses} students have answered about that teacher. The totals above are averaged across every teacher at once, so they identify nobody${c.isAnonymous ? ' — and this campaign is anonymous, so no answer is ever paired with the student who wrote it' : ''}.`}
        </NoteBar>
      </Page>
      {saver.sheet}
      {actions.dialog}
    </>
  );
}

function Results({ a, campaign }: { a: any; campaign: any }) {
  if (a.loading && !a.data) return <Loading />;
  if (a.error) return <NoteBar tone="red" icon="alert-circle">{a.error}</NoteBar>;
  const d = a.data;
  const cut = (rows: any[], title: string, icon: any, tone: Tone) => (
    <Panel icon={icon} tone={tone} title={title} subtitle="Average rating out of 5">
      {rows?.some((r) => r.rating != null)
        ? <Bars colored data={rows.filter((r) => r.rating != null).map((r) => ({ label: r.name, value: Number(r.rating.toFixed(1)) }))} />
        : <Muted>Nothing past the {campaign.minimumResponses}-response floor yet.</Muted>}
    </Panel>
  );
  return (
    <>
      <Panel icon="star-outline" tone="amber" title="Overall" subtitle="Every scored answer in this campaign, averaged">
        <View style={{ gap: 9 }}>
          <Rating value={d.overall.averageRating} big />
          <Stars value={Math.round(d.overall.averageRating || 0)} size={22} />
          <Meter value={d.overall.responseRate} />
          <Muted>{d.overall.responses} of {d.overall.assigned} students answered. This figure is school-wide, so it is shown whatever the floor.</Muted>
        </View>
      </Panel>
      <Panel icon="layers-outline" tone="purple" title="By Category" subtitle="Where this campaign says teaching is strongest">
        {d.overall.categories?.some((x: any) => x.average != null)
          ? <Bars colored data={d.overall.categories.filter((x: any) => x.average != null).map((x: any) => ({ label: x.name, value: Number(x.average.toFixed(1)) }))} />
          : <Muted>No scored answers yet — the categories fill in as students submit.</Muted>}
      </Panel>
      {cut(d.bySubject, 'By Subject', 'book-outline', 'blue')}
      {cut(d.byClass, 'By Class', 'grid-outline', 'teal')}
      {cut(d.bySection, 'By Section', 'people-outline', 'green')}
    </>
  );
}

function Teachers({ a, campaign, onOpen }: { a: any; campaign: any; onOpen: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  if (a.loading && !a.data) return <Loading />;
  if (a.error) return <NoteBar tone="red" icon="alert-circle">{a.error}</NoteBar>;
  const all: any[] = a.data?.byTeacher ?? [];
  const term = search.trim().toLowerCase();
  const rows = term ? all.filter((r) => r.name.toLowerCase().includes(term)) : all;
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const cur = Math.min(page, pages);
  return (
    <>
      <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search teachers…" />
      <Text style={st.muted}>{rows.filter((r) => !r.locked).length} of {rows.length} are past the {campaign.minimumResponses}-response floor</Text>
      {!rows.length ? (
        <Card><Blank icon="people-outline" title={search ? 'No teacher matches' : 'No teachers in this campaign'}
          body={search ? 'Try another name.' : 'Assignments are built from the section–subject–teacher allocations when a campaign starts.'} /></Card>
      ) : rows.slice((cur - 1) * 10, cur * 10).map((r) => (
        <TouchableOpacity key={r._id} style={st.card} onPress={() => onOpen(r._id)} activeOpacity={0.75}>
          <Avatar name={r.name} size={38} tone={toneAt(all.indexOf(r))} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text style={st.name} numberOfLines={1}>{r.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={st.sub}>{r.responses} / {r.assigned}</Text>
              <Meter value={r.responseRate} />
            </View>
          </View>
          <RatingOr value={r.rating} locked={r.locked} responses={r.responses} minimum={campaign.minimumResponses}
            sub={r.rating == null ? undefined : plural(r.responses, 'response')} />
        </TouchableOpacity>
      ))}
      <Pager page={cur} pages={pages} total={rows.length} onPage={setPage} noun="teacher" />
    </>
  );
}

/** The exact questions this campaign asked — a snapshot, so editing the bank never moves them. */
function QuestionsTab({ questions }: { questions: any[] }) {
  const scored = questions.filter((q) => q.includeInScore).length;
  const mins = minutesFor(questions.length);
  if (!questions.length) return <Card><Blank icon="help-circle-outline" title="No questions on this campaign" body="A campaign is built from a template. This one appears to have been created without one." /></Card>;
  return (
    <>
      <Text style={st.muted}>{plural(scored, 'question')} count towards the rating · about {plural(mins, 'minute')} to fill in · frozen when the campaign was created</Text>
      <Panel title={plural(questions.length, 'question')} flush>
        {questions.map((q, i) => (
          <View key={q._id} style={[st.qrow, i > 0 && st.sep]}>
            <Text style={st.qn}>{i + 1}</Text>
            <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
              <Text style={st.qt}>{q.questionText}{q.isRequired ? <Text style={{ color: '#DC2626' }}> *</Text> : null}</Text>
              {q.helpText || q.options?.length ? <Text style={st.sub}>{q.helpText || q.options.map((o: any) => o.optionText).join(' · ')}</Text> : null}
              <View style={st.tags}>
                {q.categoryName ? <Tag label={q.categoryName} tone="purple" /> : null}
                <Tag label={typeShort(q.questionType)} tone="blue" />
                {q.includeInScore ? <Tag label="Scored" tone="green" icon="checkmark-circle" /> : null}
              </View>
            </View>
          </View>
        ))}
      </Panel>
    </>
  );
}

const ASSIGNMENT: Record<string, [string, Tone]> = {
  submitted: ['Submitted', 'green'], pending: ['Not started', 'amber'], in_progress: ['In progress', 'blue'], expired: ['Expired', 'slate'],
};

function Tracking({ id, campaign }: { id: string; campaign: any }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const q = useLoad<any>(() => fb.getCampaignAssignments(id, { page, limit: 20, status }), [id, page, status]);
  const rows: any[] = q.data?.data ?? [];
  const term = search.trim().toLowerCase();
  const shown = term ? rows.filter((r) => `${r.student?.name || ''} ${r.teacher || ''} ${r.subject || ''} ${r.section || ''}`.toLowerCase().includes(term)) : rows;

  return (
    <>
      <SearchBox value={search} onChange={setSearch} placeholder="Search students, teachers or sections…" />
      <Pick label="Submission status" all="All statuses" value={status} onChange={(v) => { setStatus(v); setPage(1); }}
        options={Object.entries(ASSIGNMENT).map(([value, [label]]) => ({ value, label }))} />
      {q.data?.isAnonymous ? (
        <NoteBar tone="purple" icon="key-outline">
          This is a submission register, not a list of answers. It says who has responded so the school can chase the rest — it never shows what anybody wrote, and this campaign is anonymous, so no screen anywhere pairs a student with their answers.
        </NoteBar>
      ) : null}
      {q.loading && !q.data ? <Loading /> : !shown.length ? (
        <Card><Blank icon="file-tray-outline" title={status || term ? 'Nothing matches' : 'No assignments'}
          body={campaign.status === 'draft' ? 'Assignments are generated when the campaign starts.' : 'No student was matched to a teacher for this campaign. Check the section–subject–teacher allocations.'} /></Card>
      ) : (
        <Panel title={`${plural(q.data?.total ?? shown.length, 'assignment')}`} flush>
          {shown.map((r, i) => {
            const [word, tone] = ASSIGNMENT[r.status] ?? ASSIGNMENT.pending;
            return (
              <View key={r._id} style={[st.trow, i > 0 && st.sep]}>
                <Ionicons name="person-circle-outline" size={30} color={Colors.textLight} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.name} numberOfLines={1}>{r.student?.name || '—'}</Text>
                  <Text style={st.sub} numberOfLines={1}>{[r.section, r.teacher, r.subject].filter(Boolean).join(' · ')}</Text>
                  {r.submittedAt ? <Text style={st.sub}>on {fmtDay(r.submittedAt)}</Text> : null}
                </View>
                <Dot label={word} tone={tone} />
              </View>
            );
          })}
        </Panel>
      )}
      <Pager page={page} pages={q.data?.pages ?? 1} total={q.data?.total ?? 0} onPage={setPage} noun="assignment" />
    </>
  );
}

const st = StyleSheet.create({
  muted: { fontSize: 12, color: Colors.textSecondary, marginLeft: 2 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 11 },
  name: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 11.5, color: Colors.textSecondary },
  sep: { borderTopWidth: 1, borderTopColor: Colors.divider },
  qrow: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  qn: { width: 24, height: 24, borderRadius: 7, textAlign: 'center', lineHeight: 24, fontSize: 11, fontWeight: '800', color: Colors.textSecondary, backgroundColor: '#F1F5F9', overflow: 'hidden' },
  qt: { fontSize: 13.5, fontWeight: '600', color: Colors.text, lineHeight: 19 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  trow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
});
