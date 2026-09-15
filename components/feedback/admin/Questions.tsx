/**
 * Teacher Feedback → Questions.
 *
 * One screen for the whole of "what gets asked": the question bank, the
 * categories results are reported under, and the templates a campaign is built
 * from. All three load together and filter on the device — the bank is a few
 * dozen rows, and the template picker must see every active question.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as fb from '@/api/feedback.api';
import { Colors } from '@/constants/theme';
import {
  Blank, Btn, Card, Dialog, Hero, Loading, NoteBar, Page, Pager, Pick, SearchBox, Seg, Tag, Tile, Tiles, Toolbar,
  BRAND, categoryIcon, errText, fmtDay, minutesFor, plural, toneAt, typeShort, useFlash, useLoad, QUESTION_TYPES, TINT,
} from '../parts';
import { CategorySheet, QuestionSheet, TemplateSheet, blankQuestion, toQuestionForm } from './questionSheets';

const LIMIT = 10;
const STATUS = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'archived', label: 'Archived' }];
const HERO: Record<string, { icon: any; title: string; subtitle: string; add: string; nouns: string }> = {
  bank: { icon: 'checkbox-outline', title: 'Question Bank', subtitle: 'Create and manage reusable questions for your feedback campaigns.', add: 'New Question', nouns: 'questions' },
  categories: { icon: 'layers-outline', title: 'Feedback Categories', subtitle: 'Group questions so results can be reported per category.', add: 'New Category', nouns: 'categories' },
  templates: { icon: 'clipboard-outline', title: 'Feedback Templates', subtitle: 'Reusable question sets that keep campaigns consistent.', add: 'New Template', nouns: 'templates' },
};

export default function Questions({ onBlocked, initialView = 'bank', go }: { onBlocked: () => void; initialView?: string; go?: (tab: string, o?: any) => void }) {
  const [view, setViewRaw] = useState(HERO[initialView] ? initialView : 'bank');
  const qs = useLoad<any>(() => fb.getQuestions({ limit: 500 }), [], { onBlocked });
  const cats = useLoad<any[]>(() => fb.getCategories({}), []);
  const tpls = useLoad<any[]>(() => fb.getTemplates(), []);
  const [flashNode, flash] = useFlash();

  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [qForm, setQForm] = useState<any>(null);
  const [cForm, setCForm] = useState<any>(null);
  const [tForm, setTForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [del, setDel] = useState<{ kind: 'question' | 'category' | 'template'; row: any } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const questions: any[] = useMemo(() => qs.data?.data ?? [], [qs.data]);
  const categories: any[] = useMemo(() => cats.data ?? [], [cats.data]);
  const templates: any[] = useMemo(() => tpls.data ?? [], [tpls.data]);
  const reload = () => { qs.reload(); cats.reload(); tpls.reload(); };

  // Switching views drops the old view's filters — but a category's "see its
  // questions" keeps the category it was opened from.
  const setView = (v: string, keepCategory = '') => { setViewRaw(v); setPage(1); setSearch(''); setType(''); setStatus(''); setCat(keepCategory); };

  const catAt = useMemo(() => new Map(categories.map((c, i) => [String(c._id), { name: c.name, i }])), [categories]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (view === 'bank') {
      return questions.filter((q) => (!status || q.status === status) && (!type || q.questionType === type)
        && (!cat || String(q.category || '') === cat) && (!term || `${q.questionText} ${q.helpText || ''}`.toLowerCase().includes(term)))
        .sort((a, b) => +new Date(b.createdAt || 0) - +new Date(a.createdAt || 0));
    }
    if (view === 'categories') {
      return categories.filter((c) => (!status || c.status === status) && (!term || `${c.name} ${c.description || ''}`.toLowerCase().includes(term)))
        .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    }
    return templates.filter((t) => (!status || t.status === status) && (!term || `${t.name} ${t.description || ''}`.toLowerCase().includes(term)))
      .sort((a, b) => +new Date(b.createdAt || 0) - +new Date(a.createdAt || 0));
  }, [view, questions, categories, templates, status, type, cat, search]);

  const pages = Math.max(1, Math.ceil(rows.length / LIMIT));
  const cur = Math.min(page, pages);
  const shown = rows.slice((cur - 1) * LIMIT, cur * LIMIT);
  const filtered = !!search || !!cat || !!type || !!status;
  const hero = HERO[view];

  // ── Actions ──
  const run = async (fn: () => Promise<any>, ok: string, after?: () => void) => {
    setSaving(true); setFormErr('');
    try { await fn(); after?.(); flash(ok); reload(); } catch (e) { setFormErr(errText(e)); } finally { setSaving(false); }
  };
  const saveQuestion = (p: any) => run(() => (p._id ? fb.updateQuestion(p._id, p) : fb.createQuestion(p)), p._id ? 'Question saved' : 'Question added', () => setQForm(null));
  const saveCategory = (f: any) => run(() => (f._id ? fb.updateCategory(f._id, f) : fb.createCategory(f)), f._id ? 'Category saved' : 'Category added', () => setCForm(null));
  const saveTemplate = (f: any) => {
    const payload = { ...f, questions: f.questions.map((id: string) => ({ question: id })) };
    return run(() => (f._id ? fb.updateTemplate(f._id, payload) : fb.createTemplate(payload)), f._id ? 'Template saved' : 'Template created', () => setTForm(null));
  };
  const toggle = async (row: any, kind: 'question' | 'category' | 'template') => {
    const next = row.status === 'active' ? 'inactive' : 'active';
    try {
      if (kind === 'question') await fb.updateQuestion(row._id, { status: next });
      else if (kind === 'category') await fb.updateCategory(row._id, { status: next });
      else await fb.updateTemplate(row._id, { status: next });
      flash(next === 'active' ? 'Activated' : 'Deactivated'); reload();
    } catch (e) { flash(errText(e), 'red'); }
  };
  const duplicate = async (q: any) => {
    try {
      await fb.createQuestion({ ...toQuestionForm(q), _id: null, questionText: `${q.questionText} (copy)`, status: 'inactive' });
      flash('Copied — the new question starts inactive'); reload();
    } catch (e) { flash(errText(e), 'red'); }
  };
  const remove = async () => {
    if (!del) return;
    setDeleting(true);
    try {
      if (del.kind === 'question') {
        const d: any = (await fb.deleteQuestion(del.row._id) as any)?.data;
        flash(d?.archived ? 'Archived — it has been answered before, so the history is kept' : 'Question deleted');
      } else if (del.kind === 'category') { await fb.deleteCategory(del.row._id); flash('Category deleted'); }
      else { await fb.deleteTemplate(del.row._id); flash('Template deleted'); }
      setDel(null); reload();
    } catch (e) { setDel(null); flash(errText(e), 'red'); } finally { setDeleting(false); }
  };
  const seed = async () => {
    setSeeding(true);
    try {
      const d: any = (await fb.seedDefaults() as any)?.data;
      flash(`Added ${d?.categories ?? 0} categories, ${d?.questions ?? 0} questions and ${d?.templates ?? 0} template(s)`); reload();
    } catch (e) { flash(errText(e), 'red'); } finally { setSeeding(false); }
  };
  const openNew = () => {
    setFormErr('');
    if (view === 'bank') setQForm(blankQuestion());
    else if (view === 'categories') setCForm({ name: '', description: '', displayOrder: categories.length, status: 'active' });
    else setTForm({ name: '', description: '', instructions: '', questions: [] });
  };
  const pickStatus = (v: string) => { setStatus(status === v ? '' : v); setPage(1); };

  if (qs.loading && !qs.data) return <Loading />;

  const pctOf = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}% of total` : 'None yet');
  const active = (list: any[]) => list.filter((x) => x.status === 'active').length;

  const delCopy = !del ? null : del.kind === 'question'
    ? {
      title: del.row.answered ? 'Archive this question?' : 'Delete this question?',
      confirm: del.row.answered ? 'Archive question' : 'Delete question',
      message: del.row.answered
        ? `“${del.row.questionText}” has been answered before, so it will be archived rather than deleted — past campaigns stay readable and it is no longer offered to new templates.`
        : `“${del.row.questionText}” will be removed from the bank. Campaigns that already copied it keep their own copy.`,
    }
    : del.kind === 'category'
      ? { title: 'Delete this category?', confirm: 'Delete category', message: `“${del.row.name}” groups ${plural(del.row.questionCount || 0, 'question')}. A category still in use cannot be deleted — deactivate it instead, and existing results keep reporting under it.` }
      : { title: 'Delete this template?', confirm: 'Delete template', message: `“${del.row.name}” will no longer be offered when creating a campaign. Campaigns already created from it are untouched — each one copied the questions when it was made.` };

  return (
    <Page refreshing={qs.refreshing} onRefresh={reload}>
      <Hero icon={hero.icon} title={hero.title} subtitle={hero.subtitle}>
        <Btn kind="primary" label={hero.add} icon="add" onPress={openNew} />
      </Hero>

      <Seg value={view} onChange={(v) => setView(v)} options={[
        { value: 'bank', label: `Questions (${questions.length})` },
        { value: 'categories', label: `Categories (${categories.length})` },
        { value: 'templates', label: `Templates (${templates.length})` },
      ]} />

      {flashNode}
      {qs.error ? <NoteBar tone="red" icon="alert-circle">{qs.error}</NoteBar> : null}

      {view === 'bank' ? (
        <Tiles>
          <Tile icon="document-text-outline" tone="blue" value={questions.length} label="Total Questions" caption="Across all categories" onPress={() => pickStatus('')} />
          <Tile icon="checkmark-circle-outline" tone="green" value={active(questions)} label="Active" caption={pctOf(active(questions), questions.length)} onPress={() => pickStatus('active')} on={status === 'active'} />
          <Tile icon="time-outline" tone="purple" value={questions.length - active(questions)} label="Inactive" caption={pctOf(questions.length - active(questions), questions.length)} onPress={() => pickStatus('inactive')} on={status === 'inactive'} />
          <Tile icon="folder-outline" tone="amber" value={categories.length} label="Categories" caption="Organised by topic" onPress={() => setView('categories')} />
        </Tiles>
      ) : view === 'categories' ? (
        <Tiles>
          <Tile icon="folder-outline" tone="blue" value={categories.length} label="Total Categories" caption="Organise your questions" onPress={() => pickStatus('')} />
          <Tile icon="checkmark-circle-outline" tone="green" value={active(categories)} label="Active" caption={pctOf(active(categories), categories.length)} onPress={() => pickStatus('active')} on={status === 'active'} />
          <Tile icon="time-outline" tone="amber" value={categories.length - active(categories)} label="Inactive" caption={pctOf(categories.length - active(categories), categories.length)} onPress={() => pickStatus('inactive')} on={status === 'inactive'} />
          <Tile icon="bar-chart-outline" tone="purple" value={categories.reduce((n, c) => n + (c.questionCount || 0), 0)} label="Questions" caption="Across all categories" onPress={() => setView('bank')} />
        </Tiles>
      ) : (
        <Tiles>
          <Tile icon="clipboard-outline" tone="purple" value={templates.length} label="Total Templates" caption="Create and reuse" onPress={() => pickStatus('')} />
          <Tile icon="checkmark-circle-outline" tone="green" value={active(templates)} label="Active" caption="Currently available" onPress={() => pickStatus('active')} on={status === 'active'} />
          <Tile icon="cube-outline" tone="amber" value={templates.length - active(templates)} label="Inactive" caption="Not in use" onPress={() => pickStatus('inactive')} on={status === 'inactive'} />
          <Tile icon="repeat-outline" tone="blue" value={templates.reduce((n, t) => n + (t.timesUsed || 0), 0)} label="Times Reused" caption="Across all campaigns" />
        </Tiles>
      )}

      {!questions.length && !categories.length && !qs.loading ? (
        <NoteBar tone="blue" action={<Btn small kind="primary" label={seeding ? 'Adding…' : 'Load the standard set'} busy={seeding} onPress={seed} />}>
          Nothing has been set up yet. The standard set is the two-minute teacher evaluation — eight categories, fourteen rating questions, a likes / improvements pair and an optional comment — which most schools then edit rather than write from scratch.
        </NoteBar>
      ) : null}

      <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={`Search ${hero.nouns}…`} />
      <Toolbar>
        {view === 'bank' ? (
          <>
            <Pick label="Category" all="All categories" value={cat} onChange={(v) => { setCat(v); setPage(1); }} options={categories.map((c) => ({ value: String(c._id), label: c.name }))} />
            <Pick label="Type" all="All types" value={type} onChange={(v) => { setType(v); setPage(1); }} options={QUESTION_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          </>
        ) : null}
        <Pick label="Status" all="All statuses" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={STATUS} />
        {view === 'bank' ? <Btn small label={seeding ? 'Loading…' : 'Load defaults'} icon="download-outline" busy={seeding} onPress={seed} /> : null}
      </Toolbar>

      {!shown.length ? (
        <Card>
          <Blank icon={filtered ? 'search-outline' : hero.icon} title={filtered ? `No ${hero.nouns} match these filters` : `No ${hero.nouns} yet`}
            body={filtered ? 'Try another search term or filter.' : view === 'templates'
              ? 'A template is a saved question list. Build one and every campaign can start from it in a tap.'
              : 'Load the standard set to start from the usual eight categories, or write your own.'}
            action={filtered ? <Btn label="Clear filters" onPress={() => { setSearch(''); setCat(''); setType(''); setStatus(''); }} /> : <Btn kind="primary" label={hero.add} onPress={openNew} />} />
        </Card>
      ) : view === 'bank' ? shown.map((q) => {
        const hit = catAt.get(String(q.category));
        return (
          <View key={q._id} style={st.card}>
            <Text style={st.qText}>{q.questionText}{q.isRequired ? <Text style={{ color: '#DC2626' }}> *</Text> : null}</Text>
            {q.helpText ? <Text style={st.sub}>{q.helpText}</Text> : null}
            {q.options?.length ? <Text style={st.sub} numberOfLines={2}>{q.options.map((o: any) => o.optionText).join(' · ')}</Text> : null}
            <View style={st.tags}>
              {hit ? <Tag label={hit.name} tone={toneAt(hit.i)} /> : null}
              <Tag label={typeShort(q.questionType)} tone="blue" />
              <Tag label={q.includeInScore ? 'Scored' : 'Not scored'} tone={q.includeInScore ? 'green' : 'slate'} />
              <Tag label={q.status === 'active' ? 'Active' : q.status === 'archived' ? 'Archived' : 'Inactive'} tone={q.status === 'active' ? 'green' : 'slate'} />
              {q.answered ? <Tag label="Answered" tone="purple" icon="lock-closed" /> : null}
            </View>
            <View style={st.acts}>
              <Btn small label="Edit" icon="create-outline" onPress={() => { setFormErr(''); setQForm(toQuestionForm(q)); }} />
              <Btn small label={q.status === 'active' ? 'Deactivate' : 'Activate'} icon={q.status === 'active' ? 'power' : 'checkmark-circle-outline'} onPress={() => toggle(q, 'question')} />
              <Btn small label="Copy" icon="copy-outline" onPress={() => duplicate(q)} />
              <Btn small kind="danger" label={q.answered ? 'Archive' : 'Delete'} icon="trash-outline" onPress={() => setDel({ kind: 'question', row: q })} />
            </View>
          </View>
        );
      }) : view === 'categories' ? shown.map((c) => {
        const i = categories.findIndex((x) => x._id === c._id);
        const t = TINT[toneAt(i < 0 ? 0 : i)];
        return (
          <View key={c._id} style={st.card}>
            <View style={st.catTop}>
              <View style={[st.catIcon, { backgroundColor: t.soft }]}><Ionicons name={categoryIcon(c.name)} size={18} color={t.fg} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.name}>{c.name}</Text>
                {c.description ? <Text style={st.sub}>{c.description}</Text> : null}
              </View>
              <Tag label={c.status === 'active' ? 'Active' : 'Inactive'} tone={c.status === 'active' ? 'green' : 'slate'} />
            </View>
            <View style={st.tags}>
              <Tag label={`Order ${c.displayOrder ?? 0}`} tone="slate" />
              <Tag label={plural(c.questionCount || 0, 'question')} tone="indigo" />
            </View>
            <View style={st.acts}>
              <Btn small label="Edit" icon="create-outline" onPress={() => { setFormErr(''); setCForm({ ...c }); }} />
              <Btn small label={c.status === 'active' ? 'Deactivate' : 'Activate'} icon={c.status === 'active' ? 'power' : 'checkmark-circle-outline'} onPress={() => toggle(c, 'category')} />
              {c.questionCount ? <Btn small label="Its questions" icon="list-outline" onPress={() => setView('bank', String(c._id))} /> : null}
              <Btn small kind="danger" label="Delete" icon="trash-outline" onPress={() => setDel({ kind: 'category', row: c })} />
            </View>
          </View>
        );
      }) : shown.map((tp) => {
        const n = tp.questionCount ?? (tp.questions?.length || 0);
        return (
          <View key={tp._id} style={st.card}>
            <View style={st.catTop}>
              <View style={[st.catIcon, { backgroundColor: '#EDE9FE' }]}><Ionicons name="document-text-outline" size={20} color="#7C3AED" /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.name}>{tp.name}{tp.isDefault ? <Text style={st.def}>  default</Text> : null}</Text>
                {tp.description ? <Text style={st.sub}>{tp.description}</Text> : null}
              </View>
            </View>
            <View style={st.tags}>
              <Tag label={tp.feedbackType === 'parent_teacher' ? 'Parent → Teacher' : 'Student → Teacher'} tone="indigo" />
              <Tag label={plural(n, 'question')} tone="slate" />
              <Tag label={`~ ${plural(minutesFor(n), 'minute')}`} tone="slate" icon="time-outline" />
              <Tag label={tp.status === 'active' ? 'Active' : 'Inactive'} tone={tp.status === 'active' ? 'green' : 'slate'} />
            </View>
            <Text style={st.meta}>Created {fmtDay(tp.createdAt)} · Last used {tp.lastUsedAt ? fmtDay(tp.lastUsedAt) : 'never'}</Text>
            <View style={st.acts}>
              <Btn small label="Edit" icon="create-outline" onPress={() => {
                setFormErr('');
                setTForm({ _id: tp._id, name: tp.name, description: tp.description || '', instructions: tp.instructions || '', questions: (tp.questions || []).map((x: any) => String(x.question)), status: tp.status });
              }} />
              {go ? <Btn small label="Start a campaign" icon="megaphone-outline" onPress={() => go('campaigns', { create: true })} /> : null}
              {!tp.isDefault ? <Btn small label={tp.status === 'active' ? 'Deactivate' : 'Activate'} icon="power" onPress={() => toggle(tp, 'template')} /> : null}
              {!tp.isDefault ? <Btn small kind="danger" label="Delete" icon="trash-outline" onPress={() => setDel({ kind: 'template', row: tp })} /> : null}
            </View>
          </View>
        );
      })}

      <Pager page={cur} pages={pages} total={rows.length} onPage={setPage} noun={hero.nouns === 'categories' ? 'category' : hero.nouns.replace(/s$/, '')} many={hero.nouns} />

      {view === 'bank' ? (
        <NoteBar tone="purple">
          Only questions marked Scored produce a rating out of 5 — written answers and pick-lists are collected and reported, but never averaged. A question that has already been answered is archived rather than deleted, so past campaigns stay readable.
        </NoteBar>
      ) : view === 'categories' ? (
        <NoteBar tone="amber" icon="sparkles-outline" title="Tip">Groups help you analyse feedback by topic and identify key strengths and improvement areas.</NoteBar>
      ) : (
        <NoteBar tone="purple" icon="sparkles-outline" title="Use templates to create consistent campaigns quickly.">
          A campaign copies the questions when it is created, so editing a template never disturbs one already running.
        </NoteBar>
      )}

      <QuestionSheet form={qForm} setForm={setQForm} categories={categories} saving={saving} error={formErr}
        onClose={() => { setQForm(null); setFormErr(''); }} onSave={saveQuestion} />
      <CategorySheet form={cForm} setForm={setCForm} categories={categories} saving={saving} error={formErr}
        onClose={() => { setCForm(null); setFormErr(''); }} onSave={saveCategory} />
      <TemplateSheet form={tForm} setForm={setTForm} questions={questions.filter((q) => q.status === 'active')} categories={categories}
        saving={saving} error={formErr} onClose={() => { setTForm(null); setFormErr(''); }} onSave={saveTemplate} />
      <Dialog visible={!!delCopy} icon="trash-outline" danger title={delCopy?.title ?? ''} message={delCopy?.message}
        confirmLabel={delCopy?.confirm} busy={deleting} onClose={() => setDel(null)} onConfirm={remove} />
    </Page>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 13, gap: 8 },
  qText: { fontSize: 14, fontWeight: '700', color: Colors.text, lineHeight: 20 },
  name: { fontSize: 14.5, fontWeight: '800', color: Colors.text },
  def: { fontSize: 11, fontWeight: '800', color: BRAND },
  sub: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  meta: { fontSize: 11.5, color: Colors.textSecondary },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  acts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 9, borderTopWidth: 1, borderTopColor: Colors.divider },
  catTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});

