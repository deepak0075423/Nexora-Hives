/**
 * Teacher Feedback → Campaigns.
 *
 * The register of every evaluation drive. A campaign is the only thing in this
 * module with a lifecycle — Draft → Scheduled → Active → Completed → Archived —
 * so a row's actions depend on where it sits in that line.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import * as fb from '@/api/feedback.api';
import { Colors } from '@/constants/theme';
import {
  Blank, Btn, Card, CampaignPill, Hero, Loading, Meter, NoteBar, Page, Pager, Pick, Rating, SearchBox, Tile, Tiles, Toolbar,
  daysLeft, fmtDay, plural, useLoad,
} from '../parts';
import { blankCampaign, toCampaignForm, useCampaignActions, useCampaignSave } from './campaignParts';

const STATUSES = [
  { value: 'active', label: 'Collecting now' }, { value: 'scheduled', label: 'Scheduled' },
  { value: 'draft', label: 'Draft' }, { value: 'closed', label: 'Completed' }, { value: 'archived', label: 'Archived' },
];
const SORTS = [
  { value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'name', label: 'Name (A–Z)' },
  { value: 'rate', label: 'Response rate' }, { value: 'rating', label: 'Average rating' },
];
const LIMIT = 10;

export default function Campaigns({ onBlocked, go, createOnOpen }: { onBlocked: () => void; go?: (tab: string, opts?: any) => void; createOnOpen?: boolean }) {
  const router = useRouter();
  const q = useLoad<any>(() => fb.getCampaigns({ limit: 100, includeArchived: true }), [], { onBlocked });
  const settingsQ = useLoad<any>(() => fb.getSettings(), []);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [menu, setMenu] = useState<string | null>(null);

  const actions = useCampaignActions(q.reload);
  const saver = useCampaignSave((created) => {
    actions.flash(created ? 'Created as a draft — start it when you are ready' : 'Campaign saved');
    q.reload();
  });

  useEffect(() => {
    if (createOnOpen) saver.open(blankCampaign(settingsQ.data));
  }, [createOnOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows: any[] = useMemo(() => q.data?.data ?? [], [q.data]);
  const total = q.data?.total ?? rows.length;

  const counts = useMemo(() => ({
    all: rows.length,
    active: rows.filter((r) => r.status === 'active').length,
    draft: rows.filter((r) => r.status === 'draft').length,
    archived: rows.filter((r) => r.status === 'archived').length,
    responses: rows.reduce((n, r) => n + (r.submitted || 0), 0),
    asked: rows.reduce((n, r) => n + (r.assigned || 0), 0),
  }), [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    // Archived drives stay out unless asked for by name — hiding them is the only thing archiving does.
    const out = rows.filter((r) => (status ? r.status === status : r.status !== 'archived')
      && (!term || `${r.name} ${r.term || ''} ${r.description || ''}`.toLowerCase().includes(term)));
    return [...out].sort((a, b) => {
      switch (sort) {
        case 'oldest': return +new Date(a.startDate) - +new Date(b.startDate);
        case 'name': return a.name.localeCompare(b.name);
        case 'rate': return (b.responseRate || 0) - (a.responseRate || 0);
        case 'rating': return (b.avgRating ?? -1) - (a.avgRating ?? -1);
        default: return +new Date(b.startDate) - +new Date(a.startDate);
      }
    });
  }, [rows, status, search, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / LIMIT));
  const cur = Math.min(page, pages);
  const shown = filtered.slice((cur - 1) * LIMIT, cur * LIMIT);
  const closingSoon = rows.filter((r) => {
    const dl = daysLeft(r.endDate);
    return r.status === 'active' && dl != null && dl >= 0 && dl <= 3 && r.assigned > r.submitted;
  });
  const pick = (v: string) => { setStatus(status === v ? '' : v); setPage(1); };
  const openNew = () => saver.open(blankCampaign(settingsQ.data));
  const openCampaign = (id: string) => router.push({ pathname: '/modules/feedback-campaign', params: { id } } as any);

  if (q.loading && !q.data) return <Loading />;

  return (
    <Page refreshing={q.refreshing} onRefresh={q.reload}>
      <Hero icon="megaphone-outline" title="Feedback Campaigns" subtitle="Create and run teacher evaluation drives, and see how many students have answered.">
        <Btn kind="primary" label="New Campaign" icon="add" onPress={openNew} />
        {go ? <Btn label="Templates" icon="clipboard-outline" onPress={() => go('questions', { view: 'templates' })} /> : null}
      </Hero>

      {actions.flashNode}
      {q.error ? <NoteBar tone="red" icon="alert-circle">{q.error}</NoteBar> : null}

      <Tiles>
        <Tile icon="megaphone-outline" tone="purple" value={counts.all} label="Total Campaigns" caption={counts.archived ? `${counts.archived} archived` : 'None archived'} onPress={() => pick('')} on={!status} />
        <Tile icon="pulse-outline" tone="green" value={counts.active} label="Collecting Now"
          caption={closingSoon.length ? `${closingSoon.length} closing within 3 days` : 'Students can answer these'} onPress={() => pick('active')} on={status === 'active'} />
        <Tile icon="clipboard-outline" tone="amber" value={counts.draft} label="Drafts" caption="Built but not started" onPress={() => pick('draft')} on={status === 'draft'} />
        <Tile icon="chatbubbles-outline" tone="blue" value={counts.responses} label="Responses"
          caption={counts.asked ? `${Math.round((counts.responses / counts.asked) * 100)}% of everyone asked` : 'Nothing asked yet'} />
      </Tiles>

      {total > rows.length ? (
        <NoteBar tone="blue">{`Showing the ${rows.length} most recent of ${total} campaigns. Older ones still count towards Insights.`}</NoteBar>
      ) : null}

      {closingSoon.length ? (
        <NoteBar tone="amber" icon="notifications-outline"
          action={closingSoon.length === 1 ? <Btn small label="Send reminders" icon="notifications-outline" onPress={() => actions.ask(closingSoon[0], 'reminders')} /> : null}>
          {closingSoon.length === 1
            ? `${closingSoon[0].name} ${daysLeft(closingSoon[0].endDate) ? `closes in ${plural(daysLeft(closingSoon[0].endDate)!, 'day')}` : 'closes today'} and ${plural(closingSoon[0].assigned - closingSoon[0].submitted, 'student')} ${closingSoon[0].assigned - closingSoon[0].submitted === 1 ? 'has' : 'have'} not answered.`
            : `${closingSoon.length} campaigns close within three days and still have outstanding responses. A reminder is in each campaign’s actions.`}
        </NoteBar>
      ) : null}

      <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search campaigns by name or term…" />
      <Toolbar>
        <Pick label="Status" all="All (except archived)" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={STATUSES} />
        <Pick label="Sort" value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={SORTS} />
      </Toolbar>

      {!shown.length ? (
        <Card>
          <Blank icon={search || status ? 'search-outline' : 'megaphone-outline'}
            title={search || status ? 'No campaigns match these filters' : 'No campaigns yet'}
            body={search || status ? 'Try another status or search term.'
              : 'A campaign asks one set of questions of one group of students over one window of dates. Create one as a draft, check it, then start it when you are ready.'}
            action={search || status
              ? <Btn label="Clear filters" onPress={() => { setSearch(''); setStatus(''); }} />
              : <Btn kind="primary" label="Create the first campaign" onPress={openNew} />} />
        </Card>
      ) : shown.map((r) => {
        const left = daysLeft(r.endDate);
        const busy = actions.busyId === r._id;
        return (
          <View key={r._id} style={st.card}>
            <TouchableOpacity onPress={() => openCampaign(r._id)} activeOpacity={0.7} accessibilityLabel={`Open ${r.name}`}>
              <View style={st.top}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.name}>{r.name}</Text>
                  <Text style={st.sub}>{[r.term, r.academicYear?.yearName, plural(r.questionCount || 0, 'question')].filter(Boolean).join(' · ')}</Text>
                </View>
                <CampaignPill status={r.status} />
              </View>
              <View style={st.window}>
                <Text style={st.windowText}>{fmtDay(r.startDate)} – {fmtDay(r.endDate)}</Text>
                <Text style={[st.windowText, r.status === 'active' && left != null && left <= 3 && { color: '#B45309', fontWeight: '700' }]}>
                  {r.status === 'active' && left != null
                    ? (left > 0 ? `${plural(left, 'day')} left` : left === 0 ? 'Closes today' : 'Past its closing date')
                    : r.status === 'scheduled' ? `Opens ${fmtDay(r.startDate)}` : r.status === 'draft' ? 'Not started' : 'Finished'}
                </Text>
              </View>
              <View style={st.figs}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={st.figLabel}>{r.submitted} / {r.assigned} responses</Text>
                  <Meter value={r.responseRate} />
                </View>
                <Rating value={r.avgRating} sub={r.isAnonymous ? 'Anonymous' : 'Named'} />
              </View>
            </TouchableOpacity>

            <View style={st.acts}>
              {r.status === 'draft' ? <Btn small kind="primary" label="Start" icon="power" busy={busy} onPress={() => actions.ask(r, 'activate')} /> : null}
              {r.status === 'active' ? <Btn small label="Remind" icon="notifications-outline" busy={busy} onPress={() => actions.ask(r, 'reminders')} /> : null}
              {['draft', 'scheduled', 'active'].includes(r.status) ? <Btn small label="Edit" icon="create-outline" onPress={() => saver.open(toCampaignForm(r))} /> : null}
              <Btn small label={menu === r._id ? 'Less' : 'More'} icon={menu === r._id ? 'chevron-up' : 'ellipsis-horizontal'} onPress={() => setMenu(menu === r._id ? null : r._id)} />
            </View>
            {menu === r._id ? (
              <View style={st.more}>
                <Btn small label="Open campaign" icon="eye-outline" onPress={() => openCampaign(r._id)} />
                {['scheduled', 'active'].includes(r.status) ? <Btn small label="Sync assignments" icon="sync-outline" onPress={() => actions.ask(r, 'sync')} /> : null}
                {['scheduled', 'active'].includes(r.status) ? <Btn small label="Close it" icon="checkmark-done-outline" onPress={() => actions.ask(r, 'close')} /> : null}
                {r.status === 'closed' ? <Btn small label="Archive it" icon="archive-outline" onPress={() => actions.ask(r, 'archive')} /> : null}
                <Btn small label="Duplicate as draft" icon="copy-outline" onPress={() => actions.ask(r, 'duplicate')} />
                {r.status === 'draft' ? <Btn small kind="danger" label="Delete draft" icon="trash-outline" onPress={() => actions.ask(r, 'delete')} /> : null}
              </View>
            ) : null}
          </View>
        );
      })}

      <Pager page={cur} pages={pages} total={filtered.length} onPage={setPage} noun="campaign" />

      <Card style={{ padding: 14, gap: 10 }}>
        <Text style={st.lifeTitle}>The life of a campaign</Text>
        {[
          ['draft', 'Built and editable. Nothing has been sent and no student can see it.'],
          ['scheduled', 'Started ahead of its opening date. It goes live on its own that morning.'],
          ['active', 'Collecting. Questions and targeting are frozen; the closing date and reminders are not.'],
          ['closed', 'No more submissions. Everything collected stays readable and counts towards trends.'],
          ['archived', 'Out of the lists and pickers, all data kept.'],
        ].map(([k, text]) => (
          <View key={k} style={st.life}><View style={{ width: 92 }}><CampaignPill status={k} /></View><Text style={st.lifeText}>{text}</Text></View>
        ))}
      </Card>

      <NoteBar tone="blue">
        Students are matched to their own teachers from the section–subject–teacher allocations, so a campaign that reaches nobody usually means those allocations are missing. Use Sync assignments to pick up students who joined a section after a campaign started.
      </NoteBar>

      {saver.sheet}
      {actions.dialog}
    </Page>
  );
}


const st = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 13, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  name: { fontSize: 15, fontWeight: '800', color: Colors.text },
  sub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2 },
  window: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 8 },
  windowText: { fontSize: 11.5, color: Colors.textSecondary },
  figs: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  figLabel: { fontSize: 11.5, color: Colors.text, fontWeight: '600' },
  acts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.divider },
  more: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  lifeTitle: { fontSize: 14.5, fontWeight: '800', color: Colors.text },
  life: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  lifeText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
});
