/**
 * Teacher Feedback → Insights.
 *
 * One question from four angles: who was rated, where they sit, how it has
 * moved, and the filtered report you export. Teachers and Departments read the
 * dashboard payload (it carries the ids, the privacy lock and the trend arrow);
 * Trends and Reports read the report endpoint — the same call the export makes,
 * so what is on screen is exactly what downloads.
 *
 * A principal reaches this too. The campaign list endpoint is the school
 * admin's alone, so every campaign picker here reads the dashboard's list.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import * as fb from '@/api/feedback.api';
import { BASE_URL } from '@/api/axios';
import storage from '@/utils/storage';
import { Colors } from '@/constants/theme';
import {
  Avatar, Bars, Blank, Btn, Card, Columns, Field, Hero, Loading, Meter, Muted, NoteBar, Page, Pager, Panel, Pick, Rating, RatingOr,
  SearchBox, Seg, Spread, SERIES, Tag, TeacherState, TextBox, Tile, Tiles, Toolbar, Withheld,
  departmentIcon, errText, plural, ratingWord, toneAt, useFlash, useLoad, TINT,
} from '../parts';

const LIMIT = 10;
const REPORTS = [
  { value: 'teacher', label: 'Teacher Feedback Report' }, { value: 'campaign', label: 'Campaign Report' },
  { value: 'class', label: 'Class-wise Report' }, { value: 'subject', label: 'Subject-wise Report' },
  { value: 'department', label: 'Department-wise Report' }, { value: 'response_rate', label: 'Response Rate Report' },
  { value: 'trend', label: 'Rating Trend Report' },
];
const EMPTY = { academicYear: '', campaign: '', teacher: '', subject: '', class: '', section: '', term: '', dateFrom: '', dateTo: '' };
const clean = (o: Record<string, any>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));
const MIME: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', pdf: 'application/pdf',
};

/** Fetch the export with the session token and hand it to the share sheet. */
async function exportReport(params: Record<string, any>, format: string) {
  const path = fb.reportPath({ ...params, format });
  const token = await storage.getItem('token');
  const filename = `feedback_${params.type || 'report'}_${new Date().toISOString().slice(0, 10)}.${format}`;
  if (Platform.OS === 'web') {
    const res = await fetch(`${BASE_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || 'Export failed');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
    return;
  }
  const saved = await File.downloadFileAsync(`${BASE_URL}${path}`, new File(Paths.cache, filename),
    { headers: token ? { Authorization: `Bearer ${token}` } : {}, idempotent: true });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(saved.uri, { mimeType: MIME[format], dialogTitle: filename });
}

export default function Insights({ onBlocked, initialView = 'teachers' }: { onBlocked: () => void; initialView?: string }) {
  const router = useRouter();
  const [view, setViewRaw] = useState(['teachers', 'departments', 'trends', 'reports'].includes(initialView) ? initialView : 'teachers');
  const [campaignId, setCampaignId] = useState('');
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [subject, setSubject] = useState('');
  const [state, setState] = useState('');
  const [sort, setSort] = useState('rating');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [reportType, setReportType] = useState('teacher');
  const [draft, setDraft] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [exporting, setExporting] = useState('');
  const [flashNode, flash] = useFlash();

  const setView = (v: string) => { setViewRaw(v); setPage(1); setSearch(''); setDept(''); setSubject(''); setState(''); setSort('rating'); setOpen(null); };

  const meta = useLoad<any>(() => fb.getMeta(), []);
  const dash = useLoad<any>(() => fb.getDashboard(campaignId ? { campaignId } : {}), [campaignId], { onBlocked });
  const reportFilters = view === 'trends'
    ? clean({ campaign: campaignId, academicYear: draft.academicYear, class: draft.class, subject: draft.subject })
    : clean(applied);
  const reportType_ = view === 'trends' ? 'trend' : reportType;
  const report = useLoad<any>(
    () => fb.getReport({ type: reportType_, format: 'json', ...reportFilters }),
    [view, reportType_, JSON.stringify(reportFilters)],
    { skip: view !== 'trends' && view !== 'reports' },
  );
  const byClass = useLoad<any>(
    () => fb.getReport({ type: 'class', format: 'json', ...clean({ campaign: campaignId, academicYear: draft.academicYear }) }),
    [view, campaignId, draft.academicYear], { skip: view !== 'trends' },
  );

  const teachers: any[] = useMemo(() => dash.data?.teachers ?? [], [dash.data]);
  const focus = dash.data?.campaign;
  const min = focus?.minimumResponses || 5;
  const departments = useMemo(() => [...new Set(teachers.map((t) => t.department || 'Unassigned'))].sort(), [teachers]);
  const subjects = useMemo(() => [...new Set(teachers.flatMap((t) => t.subjects || []))].sort(), [teachers]);

  const teacherRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const out = teachers.filter((t) => (!dept || (t.department || 'Unassigned') === dept) && (!subject || (t.subjects || []).includes(subject))
      && (state !== 'rated' || t.rating != null) && (state !== 'locked' || t.rating == null)
      && (state !== 'good' || t.status === 'good') && (state !== 'attention' || t.status === 'attention')
      && (!term || t.name.toLowerCase().includes(term)));
    // A locked row has no rating, so it sorts to the end of both rating orders.
    const byRating = (a: any, b: any, dir: number) => (a.rating == null && b.rating == null ? a.name.localeCompare(b.name)
      : a.rating == null ? 1 : b.rating == null ? -1 : dir * (b.rating - a.rating));
    return [...out].sort((a, b) => (sort === 'rating_up' ? byRating(a, b, -1) : sort === 'name' ? a.name.localeCompare(b.name)
      : sort === 'responses' ? b.responses - a.responses : sort === 'rate' ? b.responseRate - a.responseRate : byRating(a, b, 1)));
  }, [teachers, dept, subject, state, search, sort]);

  const deptRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (dash.data?.departments ?? []).filter((d: any) => !term || d.name.toLowerCase().includes(term))
      .sort((a: any, b: any) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'teachers' ? b.teachers - a.teachers
        : sort === 'responses' ? b.responses - a.responses : (b.rating ?? -1) - (a.rating ?? -1)));
  }, [dash.data, search, sort]);

  const reportRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const src = (report.data?.rows ?? []).map((r: any, i: number) => ({ ...r, _key: r._id || `row-${i}` }));
    return term ? src.filter((r: any) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(term))) : src;
  }, [report.data, search]);

  if (dash.loading && !dash.data) return <Loading />;

  const cards = dash.data?.cards;
  const campaignPick = (
    <Pick label="Campaign" value={campaignId || focus?._id || ''} onChange={setCampaignId}
      options={(dash.data?.campaigns ?? []).map((c: any) => ({ value: c._id, label: `${c.name}${c.term ? ` · ${c.term}` : ''}` }))} />
  );
  const list = view === 'teachers' ? teacherRows : view === 'departments' ? deptRows : reportRows;
  const pages = Math.max(1, Math.ceil(list.length / LIMIT));
  const cur = Math.min(page, pages);
  const shown = list.slice((cur - 1) * LIMIT, cur * LIMIT);
  const openTeacher = (id: string) => router.push({ pathname: '/modules/feedback-teacher-detail', params: { id } } as any);
  const sections = (meta.data?.sections ?? []).filter((x: any) => !draft.class || String(x.class) === draft.class);

  const doExport = async (format: string) => {
    setExporting(format);
    try { await exportReport({ type: reportType, ...clean(applied) }, format); flash(`${format.toUpperCase()} ready`); }
    catch (e) { flash(errText(e), 'red'); } finally { setExporting(''); }
  };

  const HERO: Record<string, [any, string, string]> = {
    teachers: ['people-outline', 'Teacher Performance', 'Feedback received for every teacher in the campaign.'],
    departments: ['business-outline', 'Department Performance', 'Teacher feedback across all departments.'],
    trends: ['trending-up-outline', 'Feedback Trends', 'How teaching quality has moved across campaigns, classes and subjects.'],
    reports: ['document-text-outline', 'Feedback Reports', 'Generate, view and export detailed reports.'],
  };
  const [hIcon, hTitle, hSub] = HERO[view];

  return (
    <Page refreshing={dash.refreshing} onRefresh={() => { dash.reload(); if (view === 'trends' || view === 'reports') report.reload(); }}>
      <Hero icon={hIcon} title={hTitle} subtitle={hSub}>
        {view === 'teachers' || view === 'departments' ? campaignPick : null}
      </Hero>

      <Seg value={view} onChange={setView} options={[
        { value: 'teachers', label: 'Teachers' }, { value: 'departments', label: 'Departments' },
        { value: 'trends', label: 'Trends' }, { value: 'reports', label: 'Reports' },
      ]} />

      {flashNode}
      {dash.error || report.error ? <NoteBar tone="red" icon="alert-circle">{dash.error || report.error}</NoteBar> : null}

      {/* ── Teachers ── */}
      {view === 'teachers' ? (
        <>
          <Tiles>
            <Tile icon="people-outline" tone="blue" value={teachers.length} label="Total Teachers" caption="Receiving feedback" onPress={() => setState('')} />
            <Tile icon="checkmark-circle-outline" tone="green" value={teachers.filter((t) => t.status === 'good').length} label="Well Rated" caption="(≥ 4.0 average)"
              onPress={() => setState(state === 'good' ? '' : 'good')} on={state === 'good'} />
            <Tile icon="alert-circle-outline" tone="amber" value={teachers.filter((t) => t.status === 'attention').length} label="Needs Attention" caption="(< 3.0 average)"
              onPress={() => setState(state === 'attention' ? '' : 'attention')} on={state === 'attention'} />
            <Tile icon="star-outline" tone="purple" value={cards?.averageRating == null ? '—' : cards.averageRating.toFixed(1)} label="Overall Average" caption="Across all teachers" />
          </Tiles>

          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search teacher by name…" />
          <Toolbar>
            <Pick label="Department" all="All departments" value={dept} onChange={(v) => { setDept(v); setPage(1); }} options={departments.map((d) => ({ value: d, label: d }))} />
            <Pick label="Subject" all="All subjects" value={subject} onChange={(v) => { setSubject(v); setPage(1); }} options={subjects.map((x) => ({ value: x, label: x }))} />
            <Pick label="Status" all="All statuses" value={state} onChange={(v) => { setState(v); setPage(1); }} options={[
              { value: 'good', label: 'Well rated (≥ 4.0)' }, { value: 'attention', label: 'Needs attention (< 3.0)' },
              { value: 'rated', label: 'Rating showing' }, { value: 'locked', label: 'Below the floor' },
            ]} />
            <Pick label="Sort" value={sort} onChange={setSort} options={[
              { value: 'rating', label: 'Average rating' }, { value: 'rating_up', label: 'Lowest rated first' },
              { value: 'name', label: 'Name (A–Z)' }, { value: 'responses', label: 'Most responses' }, { value: 'rate', label: 'Response rate' },
            ]} />
          </Toolbar>

          {!shown.length ? <Card><Blank icon="search-outline" title="No teacher matches these filters" body="Try another department, subject or campaign." /></Card>
            : shown.map((t: any) => (
              <TouchableOpacity key={t._id} style={st.card} onPress={() => openTeacher(t._id)} activeOpacity={0.75}>
                <View style={st.row}>
                  <Avatar name={t.name} size={40} tone={toneAt(teachers.indexOf(t))} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.name} numberOfLines={1}>{t.name}</Text>
                    <Text style={st.sub} numberOfLines={1}>{[t.designation || 'Teacher', t.department].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <RatingOr value={t.rating} locked={t.locked} responses={t.responses} minimum={min}
                    sub={t.rating == null ? undefined : ratingWord(t.rating)} />
                </View>
                <View style={st.row}>
                  <Text style={st.meta}>{t.responses} / {t.assigned}</Text>
                  <Meter value={t.responseRate} />
                  {t.trend != null ? <Trend value={t.trend} /> : null}
                </View>
                <View style={st.tags}>
                  <TeacherState status={t.status} responses={t.responses} />
                  {t.subjects?.length ? <Tag label={`${t.subjects[0]}${t.subjects.length > 1 ? ` +${t.subjects.length - 1}` : ''}`} tone="blue" /> : null}
                </View>
              </TouchableOpacity>
            ))}
          <Pager page={cur} pages={pages} total={list.length} onPage={setPage} noun="teacher" />

          <Panel icon="bar-chart-outline" tone="purple" title="Rating Distribution" subtitle="Average ratings across teachers, by band">
            <Spread noun="teachers rated" data={[5, 4, 3, 2, 1].map((b, i) => ({
              label: `${b} star${b === 1 ? '' : 's'}`, color: ['#22C55E', '#4ADE80', '#FACC15', '#FB923C', '#EF4444'][i],
              value: teacherRows.filter((t) => t.rating != null && Math.min(5, Math.max(1, Math.round(t.rating))) === b).length,
            }))} />
          </Panel>
          <Panel icon="sparkles-outline" tone="amber" title="Insights" subtitle="What this campaign is saying so far">
            <View style={{ gap: 8 }}>
              {[
                ['checkmark-circle', 'green', `${plural(teachers.filter((t) => t.status === 'good').length, 'teacher')} performing very well (≥ 4.0)`],
                ['alert-circle', 'amber', `${plural(teachers.filter((t) => t.status === 'attention').length, 'teacher')} needing attention (< 3.0)`],
                ['information-circle', 'blue', `${plural(teachers.filter((t) => t.responses > 0).length, 'teacher')} with feedback so far`],
                ['key', 'purple', `${plural(teachers.filter((t) => t.locked).length, 'teacher')} below the ${min}-response floor, ratings hidden`],
              ].map(([icon, tone, text]) => (
                <View key={text} style={st.insight}>
                  <Ionicons name={icon as any} size={16} color={TINT[tone as 'green'].fg} />
                  <Text style={st.insightText}>{text}</Text>
                </View>
              ))}
            </View>
          </Panel>
          <NoteBar tone="blue">{`Ratings are withheld for any teacher with fewer than ${min} responses, so no individual student can be identified.`}</NoteBar>
        </>
      ) : null}

      {/* ── Departments ── */}
      {view === 'departments' ? (
        <>
          <Tiles>
            <Tile icon="business-outline" tone="purple" value={deptRows.length} label="Departments" caption="Across your school" />
            <Tile icon="people-outline" tone="green" value={teachers.length} label="Teachers" caption="In this campaign" />
            <Tile icon="chatbubbles-outline" tone="blue" value={deptRows.reduce((n: number, d: any) => n + d.responses, 0)} label="Responses" caption="From all departments" />
            <Tile icon="star-outline" tone="amber" value={cards?.averageRating == null ? '—' : cards.averageRating.toFixed(1)} unit={cards?.averageRating == null ? '' : '/ 5'} label="Overall Rating" caption="School-wide" />
          </Tiles>

          <Panel icon="bar-chart-outline" tone="purple" title="Department-wise Average Rating" subtitle="Out of 5 — a department with nobody past the floor is left out">
            {deptRows.some((d: any) => d.rating != null)
              ? <Bars colored data={deptRows.filter((d: any) => d.rating != null).map((d: any) => ({ label: d.name, value: Number(d.rating.toFixed(1)) }))} />
              : <Muted>No department has a teacher past the {min}-response floor yet.</Muted>}
          </Panel>
          <Panel icon="pie-chart-outline" tone="pink" title="Responses by Department" subtitle="Where the feedback actually came from">
            <Spread noun="responses" data={deptRows.filter((d: any) => d.responses > 0).map((d: any, i: number) => ({ label: d.name, value: d.responses, color: SERIES[i % SERIES.length] }))} />
          </Panel>

          <SearchBox value={search} onChange={setSearch} placeholder="Search departments…" />
          <Toolbar>
            <Pick label="Sort" value={sort} onChange={setSort} options={[
              { value: 'rating', label: 'Average rating (High to Low)' }, { value: 'name', label: 'Name (A–Z)' },
              { value: 'teachers', label: 'Most teachers' }, { value: 'responses', label: 'Most responses' },
            ]} />
          </Toolbar>

          {!shown.length ? <Card><Blank icon="business-outline" title="No department data" body="Departments come from teacher profiles. Set one on each teacher to see this broken down." /></Card>
            : shown.map((d: any, i: number) => {
              const t = TINT[toneAt(i)];
              const members = teachers.filter((x) => (x.department || 'Unassigned') === d.name);
              return (
                <View key={d.name} style={st.card}>
                  <TouchableOpacity style={st.row} onPress={() => setOpen(open === d.name ? null : d.name)} accessibilityLabel={`${d.name} details`}>
                    <View style={[st.deptIcon, { backgroundColor: t.soft }]}><Ionicons name={departmentIcon(d.name)} size={18} color={t.fg} /></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.name}>{d.name}</Text>
                      <Text style={st.sub}>{plural(d.teachers, 'teacher')} · {plural(d.responses, 'response')}</Text>
                    </View>
                    {d.rating == null ? <Withheld responses={0} minimum={min} /> : <Rating value={d.rating} sub={plural(d.evaluated, 'teacher')} />}
                    <Ionicons name={open === d.name ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
                  </TouchableOpacity>
                  <View style={st.row}>
                    <Meter value={d.responseRate} />
                    {d.rating == null ? <Tag label="Insufficient" tone="amber" /> : d.evaluated < d.teachers ? <Tag label="Partial" tone="blue" /> : <Tag label="Active" tone="green" />}
                  </View>
                  {open === d.name ? (
                    <View style={st.exp}>
                      {members.length ? members.map((m) => (
                        <TouchableOpacity key={m._id} style={st.expRow} onPress={() => openTeacher(m._id)}>
                          <Avatar name={m.name} size={30} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={st.expName} numberOfLines={1}>{m.name}</Text>
                            <Text style={st.sub} numberOfLines={1}>{m.responses} / {m.assigned} responded</Text>
                          </View>
                          <RatingOr value={m.rating} locked={m.locked} responses={m.responses} minimum={min} />
                        </TouchableOpacity>
                      )) : <Muted>No teacher in this department was part of the campaign.</Muted>}
                    </View>
                  ) : null}
                </View>
              );
            })}
          <Pager page={cur} pages={pages} total={list.length} onPage={setPage} noun="department" />
        </>
      ) : null}

      {/* ── Trends ── */}
      {view === 'trends' ? (
        <>
          <Toolbar>
            <Pick label="Academic year" all="All years" value={draft.academicYear} onChange={(v) => setDraft({ ...draft, academicYear: v })}
              options={(meta.data?.academicYears ?? []).map((y: any) => ({ value: y._id, label: y.yearName }))} />
            <Pick label="Campaign" all="All campaigns" value={campaignId} onChange={setCampaignId}
              options={(dash.data?.campaigns ?? []).map((c: any) => ({ value: c._id, label: c.name }))} />
            <Pick label="Class" all="All classes" value={draft.class} onChange={(v) => setDraft({ ...draft, class: v })}
              options={(meta.data?.classes ?? []).map((c: any) => ({ value: c._id, label: c.className }))} />
            <Pick label="Subject" all="All subjects" value={draft.subject} onChange={(v) => setDraft({ ...draft, subject: v })}
              options={(meta.data?.subjects ?? []).map((x: any) => ({ value: x._id, label: x.subjectName }))} />
          </Toolbar>
          {report.loading ? <Loading /> : <TrendsBody rows={report.data?.rows ?? []} dash={dash.data} byClass={byClass} onReports={() => setView('reports')} />}
        </>
      ) : null}

      {/* ── Reports ── */}
      {view === 'reports' ? (
        <>
          <Tiles>
            <Tile icon="people-outline" tone="blue" value={report.data?.rows?.length ?? 0} label={reportType === 'teacher' ? 'Teachers' : 'Rows'} caption="In selected filters" />
            <Tile icon="chatbubbles-outline" tone="green" value={(report.data?.rows ?? []).reduce((n: number, r: any) => n + (r.responses || 0), 0)} label="Responses"
              caption={`From ${plural(report.data?.meta?.campaigns ?? 0, 'campaign')}`} />
            <Tile icon="star-outline" tone="amber" value={avgOf(report.data?.rows)} label="Average Rating" caption="Across the rows shown" />
            <Tile icon="locate-outline" tone="pink" value={`${rateOf(report.data?.rows)}%`} label="Response Rate"
              caption={`${(report.data?.rows ?? []).filter((r: any) => r.responses > 0).length} of ${report.data?.rows?.length ?? 0} responded`} />
          </Tiles>

          <Panel icon="funnel-outline" tone="purple" title="Report Filters" subtitle="Select criteria, then generate">
            <Field label="Report"><Pick label="Report" value={reportType} onChange={setReportType} options={REPORTS} /></Field>
            <View>
              <Field label="Academic year"><Pick label="Academic year" all="All" value={draft.academicYear} onChange={(v) => setDraft({ ...draft, academicYear: v })}
                options={(meta.data?.academicYears ?? []).map((y: any) => ({ value: y._id, label: y.yearName }))} /></Field>
              <Field label="Campaign"><Pick label="Campaign" all="All" value={draft.campaign} onChange={(v) => setDraft({ ...draft, campaign: v })}
                options={(dash.data?.campaigns ?? []).map((c: any) => ({ value: c._id, label: c.name }))} /></Field>
              <Field label="Teacher"><Pick label="Teacher" all="All" value={draft.teacher} onChange={(v) => setDraft({ ...draft, teacher: v })}
                options={(meta.data?.teachers ?? []).map((t: any) => ({ value: t._id, label: t.name }))} /></Field>
              <Field label="Subject"><Pick label="Subject" all="All" value={draft.subject} onChange={(v) => setDraft({ ...draft, subject: v })}
                options={(meta.data?.subjects ?? []).map((x: any) => ({ value: x._id, label: x.subjectName }))} /></Field>
              <Field label="Class"><Pick label="Class" all="All" value={draft.class} onChange={(v) => setDraft({ ...draft, class: v, section: '' })}
                options={(meta.data?.classes ?? []).map((c: any) => ({ value: c._id, label: c.className }))} /></Field>
              <Field label="Section"><Pick label="Section" all="All" value={draft.section} onChange={(v) => setDraft({ ...draft, section: v })}
                options={sections.map((x: any) => ({ value: x._id, label: x.sectionName }))} /></Field>
            </View>
            <Field label="Term"><TextBox value={draft.term} placeholder="e.g. Term 1" onChange={(v) => setDraft({ ...draft, term: v })} /></Field>
            <Field label="Campaign start between" hint="YYYY-MM-DD — filters on the campaign’s start date.">
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><TextBox value={draft.dateFrom} placeholder="From" maxLength={10} onChange={(v) => setDraft({ ...draft, dateFrom: v.trim() })} /></View>
                <View style={{ flex: 1 }}><TextBox value={draft.dateTo} placeholder="To" maxLength={10} onChange={(v) => setDraft({ ...draft, dateTo: v.trim() })} /></View>
              </View>
            </Field>
            <Text style={[st.sub, JSON.stringify(draft) !== JSON.stringify(applied) && { color: '#B45309', fontWeight: '700' }]}>
              {JSON.stringify(draft) !== JSON.stringify(applied) ? 'Filters changed — press Generate to apply them.'
                : Object.values(applied).filter(Boolean).length ? `${plural(Object.values(applied).filter(Boolean).length, 'filter')} applied.` : 'Showing everything.'}
            </Text>
            <View style={[st.tags, { marginTop: 10 }]}>
              <Btn label="Reset" icon="refresh" onPress={() => { setDraft(EMPTY); setApplied(EMPTY); setPage(1); }} />
              <Btn kind="primary" label="Generate" icon="search" onPress={() => { setApplied(draft); setPage(1); }} />
            </View>
          </Panel>

          <Panel icon="download-outline" tone="green" title="Export" subtitle="The same rows, with the same privacy floor applied">
            <View style={st.tags}>
              {['xlsx', 'csv', 'pdf'].map((f) => (
                <Btn key={f} label={f === 'xlsx' ? 'Excel' : f.toUpperCase()} icon={f === 'pdf' ? 'document-outline' : 'grid-outline'}
                  busy={exporting === f} disabled={!!exporting || !reportRows.length} onPress={() => doExport(f)} />
              ))}
            </View>
          </Panel>

          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search this report…" />
          <Text style={st.reportTitle}>{report.data?.title || 'Report'} · {plural(list.length, 'row')}</Text>
          {report.loading ? <Loading /> : !shown.length ? <Card><Blank icon="document-outline" title="No data" body="No records match the selected filters." /></Card>
            : shown.map((r: any) => <ReportRow key={r._key} row={r} columns={report.data?.columns ?? []} onTeacher={r._id ? () => openTeacher(r._id) : undefined} />)}
          <Pager page={cur} pages={pages} total={list.length} onPage={setPage} noun="row" />

          <NoteBar tone="purple" icon="sparkles-outline" title="Insights">
            {(report.data?.rows ?? []).length
              ? `${(report.data?.rows ?? []).filter((x: any) => (x.responses || 0) > 0).length} of ${report.data.rows.length} ${reportType === 'teacher' ? 'teachers' : 'rows'} have responses. Rows without a rating are withheld because too few students responded — the same rule applies to Excel, CSV and PDF.`
              : 'Nothing matches these filters yet.'}
          </NoteBar>
        </>
      ) : null}
    </Page>
  );
}

function TrendsBody({ rows, dash, byClass, onReports }: { rows: any[]; dash: any; byClass: any; onReports: () => void }) {
  const points = rows.filter((r) => r.avgRating != null);
  const latest = points[points.length - 1];
  const prev = points[points.length - 2];
  const mv = (a?: number, b?: number, pct = false) => (a == null || b == null ? {}
    : { delta: pct ? `${Math.abs(Math.round(a - b))}%` : Math.abs(a - b).toFixed(1), deltaDir: a >= b ? 'up' as const : 'down' as const });
  const classRows = (byClass.data?.rows ?? []).filter((r: any) => r.avgRating != null).sort((a: any, b: any) => b.avgRating - a.avgRating).slice(0, 10);

  return (
    <>
      <Tiles>
        <Tile icon="star-outline" tone="purple" label="Average Rating" value={latest?.avgRating == null ? '—' : latest.avgRating.toFixed(1)} unit="/ 5" caption="vs last campaign" {...mv(latest?.avgRating, prev?.avgRating)} />
        <Tile icon="people-outline" tone="green" label="Response Rate" value={`${latest?.responseRate ?? 0}%`} caption="vs last campaign" {...mv(latest?.responseRate, prev?.responseRate, true)} />
        <Tile icon="document-text-outline" tone="blue" label="Total Responses" value={rows.reduce((n, r) => n + (r.responses || 0), 0)} caption="Across these campaigns" />
        <Tile icon="school-outline" tone="amber" label="Teachers Evaluated" value={dash?.cards?.teachersEvaluated ?? 0} caption="In this campaign" />
      </Tiles>
      {!points.length ? (
        <Card><Blank icon="trending-up-outline" title="No trend data yet" body="Trends appear once at least one campaign has collected responses." /></Card>
      ) : (
        <>
          <Panel icon="trending-up-outline" tone="purple" title="Average Rating Trend" subtitle="Average teacher rating across campaigns">
            <Columns min={1} max={5} data={points.map((r) => ({ label: r.term || r.campaign, value: r.avgRating }))} />
          </Panel>
          <Panel icon="people-outline" tone="green" title="Response Rate Trend" subtitle="Percentage of assigned students who responded">
            <Columns max={100} unit="%" color="#22C55E" data={points.map((r) => ({ label: r.term || r.campaign, value: r.responseRate }))} />
          </Panel>
          <Panel icon="layers-outline" tone="indigo" title="Category Performance" subtitle="Average rating by category, latest campaign">
            {dash?.categories?.some((c: any) => c.average != null)
              ? <Bars data={[...dash.categories].filter((c: any) => c.average != null).sort((a: any, b: any) => b.average - a.average).map((c: any) => ({ label: c.name, value: Number(c.average.toFixed(1)) }))} />
              : <Muted>No scored answers in the latest campaign yet.</Muted>}
          </Panel>
          <Panel icon="grid-outline" tone="blue" title="Performance by Class" subtitle="Average rating across classes">
            {byClass.loading ? <Loading /> : classRows.length
              ? <Bars color="#38BDF8" data={classRows.map((r: any) => ({ label: r.class, value: Number(r.avgRating.toFixed(1)) }))} />
              : <Muted>No class has enough responses to show a rating yet.</Muted>}
          </Panel>
          <NoteBar tone="amber" icon="sparkles-outline" title="Insight" action={<Btn small label="View detailed report" icon="arrow-forward" onPress={onReports} />}>
            {latest && prev
              ? `The overall rating has moved ${latest.avgRating >= prev.avgRating ? 'up' : 'down'} ${Math.abs(latest.avgRating - prev.avgRating).toFixed(1)} against the previous campaign, on a response rate of ${latest.responseRate}%. Read the two together — a rating that climbs while responses fall is usually a smaller, keener sample rather than better teaching.`
              : 'Only one campaign has collected responses so far, so there is nothing to compare against yet.'}
          </NoteBar>
        </>
      )}
    </>
  );
}

/** A report row as a card — its columns come from the server, so the card and the export cannot drift apart. */
function ReportRow({ row, columns, onTeacher }: { row: any; columns: any[]; onTeacher?: () => void }) {
  const lead = columns[0];
  const rest = columns.slice(1).filter((c) => !['note', 'avgRating', 'responseRate'].includes(c.key));
  const hasRating = columns.some((c) => c.key === 'avgRating');
  const Wrap: any = onTeacher ? TouchableOpacity : View;
  return (
    <Wrap style={st.card} onPress={onTeacher} activeOpacity={0.75}>
      <View style={st.row}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.name}>{String(row[lead?.key] ?? '—')}</Text>
        </View>
        {hasRating ? (row.avgRating == null
          ? <View style={st.locked}><Text style={st.lockedText}>{row.note || 'No responses'}</Text></View>
          : <Rating value={row.avgRating} sub={ratingWord(row.avgRating)} />) : null}
      </View>
      <View style={st.facts}>
        {rest.map((c) => {
          const v = row[c.key];
          return (
            <View key={c.key} style={st.fact}>
              <Text style={st.factK}>{c.label}</Text>
              <Text style={st.factV} numberOfLines={2}>{v === 0 || (v && String(v).trim()) ? String(v) : '—'}</Text>
            </View>
          );
        })}
      </View>
      {columns.some((c) => c.key === 'responseRate') ? <Meter value={row.responseRate} /> : null}
    </Wrap>
  );
}

const Trend = ({ value }: { value: number }) => {
  const dir = value > 0.05 ? 'up' : value < -0.05 ? 'down' : 'flat';
  const color = dir === 'up' ? '#16A34A' : dir === 'down' ? '#DC2626' : Colors.textSecondary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Ionicons name={dir === 'up' ? 'trending-up' : dir === 'down' ? 'trending-down' : 'remove'} size={14} color={color} />
      <Text style={{ fontSize: 11.5, fontWeight: '700', color }}>{dir === 'flat' ? '0.0' : `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`}</Text>
    </View>
  );
};


const avgOf = (rows?: any[]) => {
  const have = (rows ?? []).filter((r) => r.avgRating != null);
  return have.length ? (have.reduce((n, r) => n + r.avgRating, 0) / have.length).toFixed(1) : '—';
};
const rateOf = (rows?: any[]) => {
  const a = (rows ?? []).reduce((n, r) => n + (r.assigned || 0), 0);
  const r = (rows ?? []).reduce((n, x) => n + (x.responses || 0), 0);
  return a ? Math.round((r / a) * 100) : 0;
};

const st = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 12, gap: 9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 14, fontWeight: '800', color: Colors.text },
  sub: { fontSize: 11.5, color: Colors.textSecondary },
  meta: { fontSize: 11.5, fontWeight: '600', color: Colors.text, minWidth: 44 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  insight: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  insightText: { flex: 1, fontSize: 12.5, color: Colors.text, lineHeight: 18 },
  deptIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  exp: { backgroundColor: '#F8FAFF', borderRadius: 12, padding: 8, gap: 4 },
  expRow: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 6 },
  expName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  reportTitle: { fontSize: 12.5, fontWeight: '800', color: Colors.textSecondary, marginLeft: 2 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  fact: { width: '50%', paddingRight: 8 },
  factK: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: Colors.textLight },
  factV: { fontSize: 12.5, fontWeight: '600', color: Colors.text, marginTop: 1 },
  locked: { borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#F8FAFC' },
  lockedText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
});
