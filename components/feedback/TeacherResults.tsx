/**
 * Teacher → my own feedback: results, by subject & section, and trends.
 *
 * Combined results only, and only once a campaign's response floor is reached.
 * The server enforces the floor on every figure — the total, each category,
 * each question, each subject or section slice — so these screens render
 * whatever comes back and explain any gap rather than leaving a blank.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as fb from '@/api/feedback.api';
import { Colors } from '@/constants/theme';
import {
  Bars, Blank, Card, Columns, Countdown, Hero, Loading, LockedResults, Meter, Muted, NoteBar, Page, Panel, Pick,
  Rating, SERIES, SliceList, Stars, SubHead, Tag, TagRow, Tile, Tiles, Withheld, fmtDay, plural, ratingWord, useLoad,
} from './parts';

type Props = { onBlocked: () => void };

const campaignOptions = (list: any[] = []) => list.map((c) => ({
  value: c._id,
  label: `${c.name}${c.term && !String(c.name).includes(c.term) ? ` · ${c.term}` : ''}${c.status === 'active' ? ' (collecting)' : ''}`,
}));

// ── My Feedback ───────────────────────────────────────────────────────────────

export function TeacherDashboard({ onBlocked }: Props) {
  const [campaignId, setCampaignId] = useState('');
  const q = useLoad<any>(() => fb.getTeacherDashboard(campaignId ? { campaignId } : {}), [campaignId], { onBlocked });
  const d = q.data;

  if (q.loading && !d) return <Loading />;
  if (q.error && !d) return <Page><NoteBar tone="red" icon="alert-circle">{q.error}</NoteBar></Page>;

  if (!d?.campaign) {
    return (
      <Page refreshing={q.refreshing} onRefresh={q.reload}>
        <Hero icon="star-outline" title="My Feedback" subtitle="What your students said about your teaching — combined and anonymous." />
        <Card><Blank icon="clipboard-outline" title="No feedback to show yet"
          body="When your school runs a feedback campaign that includes you, your results appear here once enough students have answered." /></Card>
      </Page>
    );
  }

  const s = d.summary;
  const c = d.campaign;
  const prev = d.previous;
  const delta = s.averageRating != null && prev?.averageRating != null ? Number((s.averageRating - prev.averageRating).toFixed(1)) : null;
  const shown = (d.categories || []).filter((x: any) => x.average != null);
  const hidden = (d.categories || []).filter((x: any) => x.average == null);

  return (
    <Page refreshing={q.refreshing} onRefresh={q.reload}>
      <Hero icon="star-outline" title="My Feedback" subtitle="What your students said about your teaching — combined and anonymous.">
        <Pick label="Campaign" value={campaignId || c._id} onChange={setCampaignId} options={campaignOptions(d.campaigns)} />
      </Hero>

      <TagRow>
        <Tag label={c.status === 'active' ? 'Collecting' : 'Completed'} tone={c.status === 'active' ? 'green' : 'blue'} />
        <Tag label={`${fmtDay(c.startDate)} – ${fmtDay(c.endDate)}`} tone="slate" icon="calendar-outline" />
        {c.status === 'active' ? <Countdown endDate={c.endDate} /> : null}
        {c.isAnonymous ? <Tag label="Anonymous" tone="purple" icon="key-outline" /> : null}
        <Tag label={`Shown from ${s.minimumResponses} responses`} tone="slate" />
      </TagRow>

      {s.locked ? (
        <LockedResults responses={s.responses} minimum={s.minimumResponses} assigned={s.assigned} campaignOpen={c.status === 'active'} />
      ) : (
        <>
          <Tiles>
            <Tile icon="star-outline" tone="amber" value={s.averageRating == null ? '—' : s.averageRating.toFixed(1)} unit={s.averageRating == null ? '' : '/ 5'}
              label="Overall Rating" caption={ratingWord(s.averageRating) || 'No scored answers'}
              delta={delta == null ? null : Math.abs(delta).toFixed(1)} deltaDir={delta! > 0 ? 'up' : delta! < 0 ? 'down' : 'flat'} />
            <Tile icon="chatbubbles-outline" tone="blue" value={s.responses} label="Responses" caption={`from ${plural(s.assigned, 'student')} asked`} />
            <Tile icon="trending-up-outline" tone="green" value={`${s.responseRate}%`} label="Response Rate"
              caption={s.responseRate >= 60 ? 'A solid sample' : 'A thin sample — read with care'} />
            <Tile icon="layers-outline" tone="purple" value={shown.length} label="Categories Rated"
              caption={hidden.length ? `${hidden.length} hidden — too few answers` : 'Every category has enough answers'} />
          </Tiles>

          <Panel icon="star-outline" tone="amber" title="Overall" subtitle={prev ? `Compared with ${prev.name}` : 'Your first campaign with results'}>
            <View style={{ gap: 9 }}>
              <Rating value={s.averageRating} big />
              <Stars value={Math.round(s.averageRating || 0)} size={22} />
              <Meter value={s.responseRate} />
              <Muted>
                {delta == null ? `Based on ${plural(s.responses, 'response')}.`
                  : delta === 0 ? `The same as ${prev.name}, on ${plural(s.responses, 'response')}.`
                  : `${delta > 0 ? 'Up' : 'Down'} ${Math.abs(delta).toFixed(1)} since ${prev.name}, on ${plural(s.responses, 'response')}.`}
              </Muted>
            </View>
          </Panel>

          <Panel icon="layers-outline" tone="purple" title="By Category" subtitle="Your average out of 5 for each theme">
            {shown.length
              ? <Bars colored data={shown.map((x: any) => ({ label: x.name, value: Number(x.average.toFixed(1)) }))} />
              : <Muted>No category has enough answers to show yet.</Muted>}
            {hidden.length ? (
              <Text style={st.hidden}>🔑 Not shown: {hidden.map((x: any) => x.name).join(', ')} — answered by fewer than {s.minimumResponses} students.</Text>
            ) : null}
          </Panel>

          <Panel icon="trophy-outline" tone="green" title="Strengths" subtitle="Categories rated 4.0 and above">
            {d.strengths?.length
              ? <Bars color="#22C55E" data={d.strengths.map((x: any) => ({ label: x.name, value: Number(x.average.toFixed(1)) }))} />
              : <Muted>No category has reached 4.0 in this campaign yet.</Muted>}
          </Panel>
          <Panel icon="flag-outline" tone="amber" title="Where to Grow" subtitle="Your lowest-rated categories">
            {d.improvements?.length
              ? <Bars color="#F59E0B" data={d.improvements.map((x: any) => ({ label: x.name, value: Number(x.average.toFixed(1)) }))} />
              : <Muted>Every category is at 4.0 or above. Well done.</Muted>}
          </Panel>

          {d.questionBreakdown?.length ? (
            <Panel icon="checkbox-outline" tone="indigo" title="Question by Question" subtitle="Your average for each rated question, in the order students saw them">
              {d.questionBreakdown.map((x: any, i: number) => (
                <View key={x.question} style={[st.qrow, i > 0 && st.sep]}>
                  <Text style={st.qn}>{i + 1}</Text>
                  <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                    <Text style={st.qt}>{x.question}</Text>
                    {x.category ? <Text style={st.qc}>{x.category}</Text> : null}
                    {!x.withheld ? (
                      <View style={st.qtrack}><View style={[st.qfill, { width: `${(x.average / 5) * 100}%` }]} /></View>
                    ) : null}
                  </View>
                  {x.withheld
                    ? <Withheld reason="floor" responses={x.answers} minimum={s.minimumResponses} />
                    : <Rating value={x.average} sub={`${x.answers} answers`} />}
                </View>
              ))}
            </Panel>
          ) : null}

          {(d.options || []).map((block: any) => (
            <Panel key={block.question} icon="list-outline" tone="teal" title={block.question} subtitle="What students picked, and how often">
              <Bars max={100} unit="%" color="#14B8A6"
                data={block.options.map((o: any) => ({ label: `${o.label} (${o.count})`, value: o.percent }))} />
            </Panel>
          ))}

          <Panel icon="chatbubble-ellipses-outline" tone="blue" title="What Students Wrote"
            subtitle={d.settings?.canSeeComments ? 'In no particular order, never linked to a student' : 'Written comments'}>
            {!d.settings?.canSeeComments
              ? <Muted>Your school shows teachers their scores but not written comments.</Muted>
              : d.comments?.length
                ? <View style={{ gap: 8 }}>{d.comments.map((cm: any, i: number) => (
                  // Comments arrive deliberately unattributed — no id to key on.
                  <View key={i} style={st.quote}><Text style={st.quoteText}>{cm.text}</Text></View>
                ))}</View>
                : <Muted>No written comments in this campaign.</Muted>}
          </Panel>
        </>
      )}

      <NoteBar tone="purple" icon="key-outline">
        Every figure here is combined across your students and hidden until at least {s.minimumResponses} of them have answered — for the total, each category and each question. Nobody in the school can see who said what.
      </NoteBar>
    </Page>
  );
}

// ── By subject & section ──────────────────────────────────────────────────────

export function TeacherBreakdown({ onBlocked }: Props) {
  const [campaignId, setCampaignId] = useState('');
  const q = useLoad<any>(() => fb.getTeacherBreakdown(campaignId ? { campaignId } : {}), [campaignId], { onBlocked });
  const d = q.data;

  if (q.loading && !d) return <Loading />;
  if (q.error && !d) return <Page><NoteBar tone="red" icon="alert-circle">{q.error}</NoteBar></Page>;
  if (!d?.campaign) {
    return (
      <Page refreshing={q.refreshing} onRefresh={q.reload}>
        <Hero icon="grid-outline" title="By Subject & Section" subtitle="Your results split by what you teach and where you teach it." />
        <Card><Blank icon="grid-outline" title="Nothing to break down yet" body="Once a campaign includes you, your results by subject and section appear here." /></Card>
      </Page>
    );
  }

  const s = d.summary;
  const c = d.campaign;
  const min = s.minimumResponses;
  const shownSubjects = (d.bySubject || []).filter((x: any) => !x.locked);
  const shownSections = (d.bySection || []).filter((x: any) => !x.locked);
  const protectedCount = [...(d.bySubject || []), ...(d.bySection || [])].filter((x: any) => x.protectsOthers).length;
  const best = [...shownSubjects].sort((a: any, b: any) => (b.rating ?? 0) - (a.rating ?? 0))[0];

  return (
    <Page refreshing={q.refreshing} onRefresh={q.reload}>
      <Hero icon="grid-outline" title="By Subject & Section" subtitle="Your results split by what you teach and where you teach it.">
        <Pick label="Campaign" value={campaignId || c._id} onChange={setCampaignId} options={campaignOptions(d.campaigns)} />
      </Hero>
      <TagRow>
        <Tag label={c.status === 'active' ? 'Collecting' : 'Completed'} tone={c.status === 'active' ? 'green' : 'blue'} />
        <Tag label={`${fmtDay(c.startDate)} – ${fmtDay(c.endDate)}`} tone="slate" icon="calendar-outline" />
        <Tag label={`Each slice shown from ${min} responses`} tone="slate" />
      </TagRow>

      {s.locked ? (
        <LockedResults responses={s.responses} minimum={min} assigned={s.assigned} campaignOpen={c.status === 'active'} />
      ) : (
        <>
          <Tiles>
            <Tile icon="book-outline" tone="purple" value={(d.bySubject || []).length} label="Subjects" caption={`${shownSubjects.length} with results showing`} />
            <Tile icon="grid-outline" tone="blue" value={(d.bySection || []).length} label="Sections" caption={`${shownSections.length} with results showing`} />
            <Tile icon="trophy-outline" tone="amber" value={best ? best.rating.toFixed(1) : '—'} label="Best Subject" caption={best ? best.name : 'None showing yet'} />
            <Tile icon="trending-up-outline" tone="green" value={`${s.responseRate}%`} label="Response Rate" caption={`${s.responses} of ${s.assigned} students answered`} />
          </Tiles>

          <Panel icon="book-outline" tone="purple" title="By Subject" subtitle="Your average out of 5 in each subject">
            {shownSubjects.length > 1 ? (
              <View style={{ marginBottom: 12 }}>
                <Bars colored data={shownSubjects.map((x: any) => ({ label: x.name, value: Number(x.rating.toFixed(1)) }))} />
              </View>
            ) : null}
            <SliceList slices={d.bySubject} minimum={min} empty="No subject data for this campaign." />
          </Panel>

          <Panel icon="grid-outline" tone="blue" title="By Section" subtitle="Your average out of 5 in each class section">
            {shownSections.length > 1 ? (
              <View style={{ marginBottom: 12 }}>
                <Bars colored data={shownSections.map((x: any) => ({ label: x.name, value: Number(x.rating.toFixed(1)) }))} />
              </View>
            ) : null}
            <SliceList slices={d.bySection} minimum={min} empty="No section data for this campaign." />
          </Panel>

          {(d.bySubject || []).length <= 1 && (d.bySection || []).length <= 1 ? (
            <NoteBar tone="blue">You teach one subject in one section in this campaign, so there is nothing to split — your overall result is on My Feedback.</NoteBar>
          ) : null}
        </>
      )}

      <NoteBar tone="purple" icon="key-outline" title={protectedCount ? `${plural(protectedCount, 'slice')} ${protectedCount === 1 ? 'is' : 'are'} hidden to protect others.` : undefined}>
        A slice with fewer than {min} responses is never shown. A slice can also be hidden even with enough responses, when showing it next to your overall result would let a smaller group’s average be worked out by subtraction. Both rules keep every student anonymous.
      </NoteBar>
    </Page>
  );
}

// ── Trends ────────────────────────────────────────────────────────────────────

export function TeacherTrends({ onBlocked }: Props) {
  const [slice, setSlice] = useState('');   // "subject:<id>" | "section:<id>" | ""
  const params = useMemo(() => {
    if (!slice) return {};
    const [dim, id] = slice.split(':');
    return { [dim]: id };
  }, [slice]);
  const q = useLoad<any>(() => fb.getTeacherTrends(params), [slice], { onBlocked });
  const d = q.data;

  if (q.loading && !d) return <Loading />;
  if (q.error && !d) return <Page><NoteBar tone="red" icon="alert-circle">{q.error}</NoteBar></Page>;
  if (d?.disabled) {
    return (
      <Page>
        <Hero icon="trending-up-outline" title="My Trends" subtitle="How your rating has moved over time." />
        <Card><Blank icon="lock-closed-outline" title="Trends are turned off" body="Your school shows teachers each campaign’s results but not how they compare over time." /></Card>
      </Page>
    );
  }

  const points: any[] = d?.points ?? [];
  const rated = points.filter((p) => p.rating != null);
  const latest = rated[rated.length - 1];
  const before = rated[rated.length - 2];
  const delta = latest && before ? Number((latest.rating - before.rating).toFixed(1)) : null;
  const best = [...rated].sort((a, b) => b.rating - a.rating)[0];
  const latestRate = latest?.assigned ? Math.round((latest.responses / latest.assigned) * 100) : null;
  const filterOptions = [
    ...(d?.filters?.subjects ?? []).map((x: any) => ({ value: `subject:${x._id}`, label: `Subject · ${x.name}` })),
    ...(d?.filters?.sections ?? []).map((x: any) => ({ value: `section:${x._id}`, label: `Section · ${x.name}` })),
  ];

  return (
    <Page refreshing={q.refreshing} onRefresh={q.reload}>
      <Hero icon="trending-up-outline" title="My Trends" subtitle="How your rating has moved from campaign to campaign — compared only with yourself.">
        <Pick label="Show" all="Everything I teach" value={slice} onChange={setSlice} options={filterOptions} />
      </Hero>

      {!points.length ? (
        <Card><Blank icon="trending-up-outline" title="No history yet"
          body={slice ? 'You have no evaluations for this in any campaign you can see.' : 'Trends appear once you have been included in a feedback campaign.'} /></Card>
      ) : (
        <>
          <Tiles>
            <Tile icon="star-outline" tone="purple" label="Latest Rating" value={latest ? latest.rating.toFixed(1) : '—'} unit={latest ? '/ 5' : ''}
              delta={delta == null ? null : Math.abs(delta).toFixed(1)} deltaDir={delta! > 0 ? 'up' : delta! < 0 ? 'down' : 'flat'}
              caption={before ? `vs ${before.label}` : latest ? 'First rated campaign' : 'No rated campaign yet'} />
            <Tile icon="trophy-outline" tone="amber" label="Best Campaign" value={best ? best.rating.toFixed(1) : '—'} unit={best ? '/ 5' : ''} caption={best?.label} />
            <Tile icon="bar-chart-outline" tone="green" label="Campaigns Rated" value={`${rated.length} of ${points.length}`}
              caption={points.length - rated.length ? `${points.length - rated.length} withheld` : 'None withheld'} />
            <Tile icon="people-outline" tone="blue" label="Latest Response" value={latestRate == null ? '—' : `${latestRate}%`}
              caption={latest ? `${latest.responses} of ${latest.assigned} answered` : ''} />
          </Tiles>

          <Panel icon="trending-up-outline" tone="purple" title="Overall Rating" subtitle="Your average out of 5 in each campaign">
            {rated.length > 1
              ? <Columns min={1} max={5} data={rated.map((p) => ({ label: p.label, value: p.rating }))} />
              : <Muted>A trend needs at least two campaigns with results{rated.length === 1 ? ' — you have one so far' : ''}.</Muted>}
          </Panel>

          {(d.categories || []).some((cat: any) => cat.points.length > 1) ? (
            <>
              <SubHead>By category</SubHead>
              {d.categories.filter((cat: any) => cat.points.length > 1).map((cat: any, i: number) => (
                <Panel key={cat._id} title={cat.name} subtitle={plural(cat.points.length, 'campaign')}>
                  <Columns min={1} max={5} height={100} color={SERIES[i % SERIES.length]}
                    data={cat.points.map((p: any) => ({ label: p.label, value: p.value }))} />
                </Panel>
              ))}
            </>
          ) : null}

          <Panel icon="list-outline" tone="indigo" title="Campaign by campaign" subtitle="Newest first — every campaign that included you" flush>
            {[...points].reverse().map((p, i) => (
              <View key={p.campaignId} style={[st.row, i > 0 && st.sep]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.rowName} numberOfLines={2}>{p.name}</Text>
                  <Text style={st.rowSub}>{[p.label !== p.name ? p.label : '', fmtDay(p.date)].filter(Boolean).join(' · ')} · {p.responses} / {p.assigned}</Text>
                  <View style={{ marginTop: 5 }}><Tag label={p.status === 'active' ? 'Collecting' : 'Completed'} tone={p.status === 'active' ? 'green' : 'blue'} /></View>
                </View>
                {p.locked ? <Withheld reason={p.reason} responses={p.responses} minimum={p.minimumResponses} /> : <Rating value={p.rating} />}
              </View>
            ))}
          </Panel>
        </>
      )}

      <NoteBar tone="purple" icon="key-outline">
        A campaign is withheld when fewer students answered than its floor, or — when you look at one subject or section — when showing it would let a smaller group be worked out from your other results. You can look at one subject or one section at a time, never both together, for the same reason.
      </NoteBar>
    </Page>
  );
}

const st = StyleSheet.create({
  hidden: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 12, lineHeight: 16 },
  qrow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  sep: { borderTopWidth: 1, borderTopColor: Colors.divider },
  qn: { width: 24, height: 24, borderRadius: 7, textAlign: 'center', lineHeight: 24, fontSize: 11, fontWeight: '800', color: Colors.textSecondary, backgroundColor: '#F1F5F9', overflow: 'hidden' },
  qt: { fontSize: 13, fontWeight: '600', color: Colors.text, lineHeight: 18 },
  qc: { fontSize: 11, color: Colors.textSecondary, marginTop: -3 },
  qtrack: { height: 6, borderRadius: 99, backgroundColor: '#EEF2F7', overflow: 'hidden' },
  qfill: { height: '100%', borderRadius: 99, backgroundColor: '#8B5CF6' },
  quote: { borderLeftWidth: 3, borderLeftColor: '#818CF8', backgroundColor: '#F8FAFC', borderTopRightRadius: 10, borderBottomRightRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  quoteText: { fontSize: 13, color: Colors.text, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  rowName: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  rowSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 1 },
});
