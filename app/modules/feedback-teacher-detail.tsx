/**
 * One teacher's feedback, in full — for an admin or a principal.
 *
 * Everything obeys the same privacy floor as the teacher's own screen. Comments
 * arrive unordered and unattributed, and below the floor the screen shows
 * nothing at all rather than a rounded number that would let a small section
 * be worked out.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as fb from '@/api/feedback.api';
import { Colors } from '@/constants/theme';
import {
  Bars, Blank, Card, Columns, Hero, Loading, Meter, Muted, NoteBar, Page, Panel, Pick, Rating, Stars, Tile, Tiles,
  plural, ratingWord, useLoad,
} from '@/components/feedback/parts';

export default function FeedbackTeacherDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [campaignId, setCampaignId] = useState('');
  const q = useLoad<any>(() => fb.getTeacherAnalytics(String(id), campaignId ? { campaignId } : {}), [id, campaignId], { skip: !id });
  const d = q.data;

  if (q.loading && !d) return <><Stack.Screen options={{ title: 'Teacher' }} /><Loading /></>;
  if (q.error && !d) {
    return <><Stack.Screen options={{ title: 'Teacher' }} /><Page><NoteBar tone="red" icon="alert-circle">{q.error}</NoteBar></Page></>;
  }

  const s = d.summary;
  const t = d.teacher;
  const p = d.profile || {};
  const trend = (d.trend || []).filter((x: any) => x.rating != null);

  return (
    <>
      <Stack.Screen options={{ title: t?.name || 'Teacher' }} />
      <Page refreshing={q.refreshing} onRefresh={q.reload}>
        <Hero icon="person-outline" title={t.name} subtitle={[p.designation || 'Teacher', p.department, p.employeeId, t.email].filter(Boolean).join(' · ')}>
          {d.campaigns?.length ? (
            <Pick label="Campaign" value={campaignId || d.campaign?._id || ''} onChange={setCampaignId}
              options={d.campaigns.map((c: any) => ({ value: c._id, label: `${c.name}${c.term ? ` · ${c.term}` : ''}` }))} />
          ) : null}
        </Hero>

        {!s ? (
          <Card><Blank icon="megaphone-outline" title="No campaign has covered this teacher yet"
            body="Their results appear here once a feedback campaign has included them and students have answered." /></Card>
        ) : s.locked ? (
          <>
            <Tiles>
              <Tile icon="chatbubbles-outline" tone="blue" value={s.responses} label="Responses So Far" caption={`${s.minimumResponses} needed before anything is shown`} />
              <Tile icon="school-outline" tone="purple" value={s.assigned} label="Students Asked" caption="In this campaign" />
              <Tile icon="trending-up-outline" tone="green" value={`${s.responseRate}%`} label="Response Rate"
                caption={s.responses < s.minimumResponses ? `${s.minimumResponses - s.responses} more to unlock` : ''} />
              <Tile icon="key-outline" tone="pink" value={s.minimumResponses} label="Privacy Floor" caption="Set on the campaign" />
            </Tiles>
            <Card><Blank icon="lock-closed-outline" title="Results are withheld"
              body={s.responses === 0
                ? 'Nobody has answered about this teacher yet. Nothing is hidden — there is nothing there.'
                : `${s.responses} of ${s.minimumResponses} responses. An average built from so few students would let any one of them be worked out, so no figure, no category and no comment is shown until the floor is reached. This applies to the teacher, the principal and the admin alike.`} /></Card>
            <NoteBar tone="purple" icon="key-outline">The floor is set per campaign. Raising it protects students in small sections; lowering it can make a single student’s answer identifiable.</NoteBar>
          </>
        ) : (
          <>
            <Tiles>
              <Tile icon="star-outline" tone="amber" value={s.averageRating == null ? '—' : s.averageRating.toFixed(1)} unit={s.averageRating == null ? '' : '/ 5'} label="Average Rating" caption={ratingWord(s.averageRating)} />
              <Tile icon="chatbubbles-outline" tone="blue" value={s.responses} label="Responses" caption={`of ${plural(s.assigned, 'student')} asked`} />
              <Tile icon="trending-up-outline" tone="green" value={`${s.responseRate}%`} label="Response Rate" caption={s.responseRate >= 60 ? 'A solid sample' : 'A thin sample — read carefully'} />
              <Tile icon="layers-outline" tone="purple" value={d.categories?.length || 0} label="Categories Scored" caption="Themes this campaign asked about" />
            </Tiles>

            <Panel icon="star-outline" tone="amber" title="Overall" subtitle={`Across ${plural(s.responses, 'response')}`}>
              <View style={{ gap: 9 }}>
                <Rating value={s.averageRating} big />
                <Stars value={Math.round(s.averageRating || 0)} size={22} />
                <Meter value={s.responseRate} />
                <Muted>Read this beside the response rate. A rating is a conversation starter about one campaign, not a verdict on a teacher.</Muted>
              </View>
            </Panel>

            <Panel icon="trending-up-outline" tone="purple" title="Rating Trend" subtitle="This teacher’s own average, campaign by campaign">
              {trend.length > 1
                ? <Columns min={1} max={5} data={trend.map((x: any) => ({ label: x.label, value: x.rating }))} />
                : <Muted>A trend compares this teacher against themselves, never against a colleague — and needs at least two campaigns where they cleared the response floor. So far there {trend.length === 1 ? 'is one.' : 'are none.'}</Muted>}
            </Panel>

            <Panel icon="layers-outline" tone="indigo" title="Category Performance" subtitle="Average out of 5 for each theme the campaign asked about">
              {d.categories?.length
                ? <Bars colored data={d.categories.map((c: any) => ({ label: c.name, value: c.average == null ? null : Number(c.average.toFixed(1)) }))} />
                : <Muted>No scored answers in this campaign.</Muted>}
            </Panel>

            <Panel icon="trophy-outline" tone="green" title="Strengths" subtitle="Categories at 4.0 and above">
              {d.strengths?.length
                ? <Bars color="#22C55E" data={d.strengths.map((c: any) => ({ label: c.name, value: Number(c.average.toFixed(1)) }))} />
                : <Muted>No category reached 4.0 in this campaign.</Muted>}
            </Panel>
            <Panel icon="flag-outline" tone="amber" title="Improvement Areas" subtitle="The lowest-scoring categories">
              {d.improvements?.length
                ? <Bars color="#F59E0B" data={d.improvements.map((c: any) => ({ label: c.name, value: Number(c.average.toFixed(1)) }))} />
                : <Muted>Every category is at 4.0 or above.</Muted>}
            </Panel>

            {(d.options || []).map((block: any) => (
              <Panel key={block.question} icon="list-outline" tone="teal" title={block.question} subtitle="What students picked, and how often">
                <Bars max={100} unit="%" color="#4F46E5" data={block.options.map((o: any) => ({ label: `${o.label} (${o.count})`, value: o.percent }))} />
              </Panel>
            ))}

            <Panel icon="chatbubble-ellipses-outline" tone="blue" title="Student Comments" subtitle="Anonymous, unordered and never linked back to anybody">
              {d.comments?.length
                ? <View style={{ gap: 8 }}>{d.comments.map((c: any, i: number) => (
                  // Comments arrive deliberately unattributed — there is no id to key on.
                  <View key={i} style={st.quote}><Text style={st.quoteText}>{c.text}</Text></View>
                ))}</View>
                : <Muted>No written comments in this campaign.</Muted>}
            </Panel>

            <NoteBar tone="purple" icon="key-outline">
              {`These figures are shown because ${s.responses} students answered, which clears this campaign’s floor of ${s.minimumResponses}. The comments above arrive in no particular order and carry nothing that identifies who wrote them — no admin screen anywhere joins a student to the content of their feedback.`}
            </NoteBar>
          </>
        )}
      </Page>
    </>
  );
}

const st = StyleSheet.create({
  quote: { borderLeftWidth: 3, borderLeftColor: '#818CF8', backgroundColor: '#F8FAFC', borderTopRightRadius: 10, borderBottomRightRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  quoteText: { fontSize: 13, color: Colors.text, lineHeight: 19 },
});
