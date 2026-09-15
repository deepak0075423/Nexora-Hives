/**
 * Teacher Feedback → Settings.
 *
 * Defaults, visibility, notifications and automation, plus the activity log.
 * Nothing saves as you type: a privacy floor or a visibility switch changed by
 * a stray tap is the one mistake this module cannot afford, so the screen names
 * what has been edited and saves on the button.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as fb from '@/api/feedback.api';
import { Colors } from '@/constants/theme';
import {
  Blank, Btn, Field, Hero, Loading, NoteBar, Page, Pager, Panel, Pick, SearchBox, Stepper, Switch, Tag,
  errText, fmtDay, useFlash, useLoad, SETTINGS_DEFAULTS, Tone,
} from '../parts';

const ACTION_TONE: Record<string, Tone> = {
  create: 'green', update: 'blue', delete: 'red', activate: 'green', close: 'amber',
  archive: 'slate', export: 'purple', seed: 'teal', reopen: 'amber',
};
const LABELS: Record<string, string> = {
  defaultAnonymous: 'anonymous by default', defaultMinimumResponses: 'minimum responses', defaultCampaignDays: 'default campaign length',
  teacherCanSeeComments: 'teachers read comments', teacherCanSeeTrends: 'teachers see historical trends', publishToTeachersOnClose: 'publish only after close',
  notifyOnCampaignStart: 'campaign-start notice', notifyReminders: 'reminders', reminderIntervalDays: 'reminder interval',
  notifyBeforeClose: 'closing-soon warning', closingSoonDays: 'closing-soon lead time', notifyOnSubmission: 'submission confirmation',
  emailNotifications: 'email notifications', autoActivateScheduled: 'automatic activation', autoCloseExpired: 'automatic closing',
};
const LOG_LIMIT = 10;

export default function Settings({ onBlocked }: { onBlocked: () => void }) {
  const q = useLoad<any>(() => fb.getSettings(), [], { onBlocked });
  const [saved, setSaved] = useState<any>(null);
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [flashNode, flash] = useFlash();
  const [logPage, setLogPage] = useState(1);
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const log = useLoad<any>(() => fb.getAuditLog({ page: logPage, limit: LOG_LIMIT, ...(action ? { actionType: action } : {}) }), [logPage, action]);

  useEffect(() => { if (q.data) { setSaved(q.data); setDraft(q.data); } }, [q.data]);

  const set = (k: string, v: any) => setDraft((d: any) => ({ ...d, [k]: v }));
  // Numbers compare loosely — a value retyped as the same number is not a change.
  const dirty = useMemo(() => (!saved || !draft ? [] : Object.keys(LABELS).filter((k) => {
    const a = saved[k]; const b = draft[k];
    return typeof a === 'number' || typeof b === 'number' ? Number(a) !== Number(b) : a !== b;
  })), [saved, draft]);

  const save = async () => {
    setSaving(true);
    try {
      const d: any = (await fb.updateSettings(draft) as any)?.data;
      setSaved(d); setDraft(d); flash('Settings saved'); log.reload();
    } catch (e) { flash(errText(e), 'red'); } finally { setSaving(false); }
  };

  if (q.loading && !q.data) return <Loading />;
  if (q.error || !draft) return <Page><NoteBar tone="red" icon="alert-circle">{q.error || 'Settings could not be loaded.'}</NoteBar></Page>;

  const term = search.trim().toLowerCase();
  const logRows: any[] = (log.data?.data ?? []).filter((r: any) => !term || `${r.description || ''} ${r.user?.name || ''} ${r.entityType || ''}`.toLowerCase().includes(term));

  return (
    <Page refreshing={q.refreshing} onRefresh={() => { q.reload(); log.reload(); }}>
      <Hero icon="settings-outline" title="Feedback Settings" subtitle="Defaults, visibility, notifications and automation for teacher feedback.">
        <Btn label="Reset to default" icon="refresh" onPress={() => { setDraft((d: any) => ({ ...d, ...SETTINGS_DEFAULTS })); flash('Defaults loaded — review, then save', 'blue'); }} />
        <Btn kind="primary" label={saving ? 'Saving…' : 'Save settings'} icon="checkmark-circle" busy={saving} disabled={!dirty.length} onPress={save} />
      </Hero>

      {flashNode}
      {dirty.length ? (
        <NoteBar tone="amber" icon="alert-circle" title={`${dirty.length} unsaved change${dirty.length === 1 ? '' : 's'}`}
          action={<><Btn small label="Discard" onPress={() => setDraft(saved)} /><Btn small kind="primary" label="Save settings" busy={saving} onPress={save} /></>}>
          {`${dirty.map((k) => LABELS[k]).join(', ')}. Nothing takes effect until you save, and a campaign already running keeps the settings it started with.`}
        </NoteBar>
      ) : null}

      <Panel icon="document-text-outline" tone="blue" title="Campaign Defaults" subtitle="Used when creating a new feedback campaign.">
        <Switch label="Anonymous by default" hint="Hide student identity from teachers unless changed." value={!!draft.defaultAnonymous} onChange={(v) => set('defaultAnonymous', v)} />
        <Field label="Minimum responses" hint="Below this, teacher analytics stay hidden.">
          <Stepper value={draft.defaultMinimumResponses} min={1} max={50} onChange={(v) => set('defaultMinimumResponses', v)} />
        </Field>
        <Field label="Default campaign length (days)" hint="How long a new campaign stays open.">
          <Stepper value={draft.defaultCampaignDays} min={1} max={120} onChange={(v) => set('defaultCampaignDays', v)} />
        </Field>
      </Panel>

      <Panel icon="eye-outline" tone="green" title="Teacher Visibility" subtitle="What teachers can see in their results.">
        <Switch label="Teachers can read student comments" hint="Aggregated scores always show; written comments can be withheld."
          value={!!draft.teacherCanSeeComments} onChange={(v) => set('teacherCanSeeComments', v)} />
        <Switch label="Teachers can see historical trends" hint="Their past feedback data and progress."
          value={!!draft.teacherCanSeeTrends} onChange={(v) => set('teacherCanSeeTrends', v)} />
        <Switch label="Publish results only after a campaign closes" hint="Teachers see nothing while a campaign is still collecting."
          value={!!draft.publishToTeachersOnClose} onChange={(v) => set('publishToTeachersOnClose', v)} />
      </Panel>

      <Panel icon="notifications-outline" tone="amber" title="Notifications" subtitle="Reminders and communication.">
        <Switch label="Notify students when a campaign starts" value={!!draft.notifyOnCampaignStart} onChange={(v) => set('notifyOnCampaignStart', v)} />
        <Switch label="Remind students who have not responded" value={!!draft.notifyReminders} onChange={(v) => set('notifyReminders', v)} />
        <Field label="Reminder every (days)">
          <Stepper value={draft.reminderIntervalDays} min={1} max={30} disabled={!draft.notifyReminders} onChange={(v) => set('reminderIntervalDays', v)} />
        </Field>
        <Switch label="Warn students before a campaign closes" value={!!draft.notifyBeforeClose} onChange={(v) => set('notifyBeforeClose', v)} />
        <Field label="Closing-soon warning (days before)">
          <Stepper value={draft.closingSoonDays} min={1} max={14} disabled={!draft.notifyBeforeClose} onChange={(v) => set('closingSoonDays', v)} />
        </Field>
        <Switch label="Confirm to the student after they submit" value={!!draft.notifyOnSubmission} onChange={(v) => set('notifyOnSubmission', v)} />
        <Switch label="Also send by email" hint="Uses the school's own SMTP settings when configured." value={!!draft.emailNotifications} onChange={(v) => set('emailNotifications', v)} />
      </Panel>

      <Panel icon="flash-outline" tone="purple" title="Automation" subtitle="Run the campaign lifecycle without manual steps.">
        <Switch label="Activate scheduled campaigns automatically" hint="A campaign scheduled for a future date goes live on its start date."
          value={!!draft.autoActivateScheduled} onChange={(v) => set('autoActivateScheduled', v)} />
        <Switch label="Close campaigns automatically at the end date" hint="Outstanding assignments are marked expired. No data is deleted."
          value={!!draft.autoCloseExpired} onChange={(v) => set('autoCloseExpired', v)} />
      </Panel>

      {/* Read-only on purpose: retention and export permission have no model field and no job behind them. */}
      <Panel icon="key-outline" tone="pink" title="Data & Privacy" subtitle="What the module enforces, whatever the settings above say.">
        <View style={{ gap: 10 }}>
          {[
            ['The response floor is absolute.', `Below ${draft.defaultMinimumResponses} responses a teacher’s figures are hidden from the teacher, the principal and the admin alike — and from every Excel, CSV and PDF export.`],
            ['No screen pairs a student with an answer.', 'A campaign’s tracking tab says who has submitted so the school can chase the rest; it never shows what anybody wrote.'],
            ['Who reaches this module at all', 'is the Designation permission for Feedback, not a setting here — Designations decides that.'],
          ].map(([b, t]) => (
            <View key={b} style={st.rule}>
              <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
              <Text style={st.ruleText}><Text style={{ fontWeight: '800', color: Colors.text }}>{b}</Text> {t}</Text>
            </View>
          ))}
        </View>
      </Panel>

      <Panel icon="time-outline" tone="indigo" title="Activity Log" subtitle="Changes made across teacher feedback.">
        <View style={{ gap: 8 }}>
          <SearchBox value={search} onChange={setSearch} placeholder="Search the log…" />
          <Pick label="Action" all="All actions" value={action} onChange={(v) => { setAction(v); setLogPage(1); }} options={Object.keys(ACTION_TONE).map((a) => ({ value: a, label: a }))} />
          {log.loading && !log.data ? <Loading /> : !logRows.length ? (
            <Blank icon="receipt-outline" title={term || action ? 'Nothing in the log matches' : 'Nothing logged yet'}
              body="Creating a campaign, editing a question or changing a setting all leave an entry here." />
          ) : logRows.map((r: any) => (
            <View key={r._id} style={st.log}>
              <View style={st.logTop}>
                <Tag label={r.actionType} tone={ACTION_TONE[r.actionType] ?? 'slate'} />
                <Text style={st.logWhen}>
                  {fmtDay(r.createdAt)}, {new Date(r.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toUpperCase()}
                </Text>
              </View>
              <Text style={st.logText}>{r.description}</Text>
              <Text style={st.logBy}>{r.user?.name || 'System'}</Text>
            </View>
          ))}
          <Pager page={logPage} pages={log.data?.pages ?? 1} total={log.data?.total ?? 0} onPage={setLogPage} noun="entry" many="entries" />
        </View>
      </Panel>
    </Page>
  );
}


const st = StyleSheet.create({
  rule: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  ruleText: { flex: 1, fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
  log: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 10, gap: 5 },
  logTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  logWhen: { fontSize: 11, color: Colors.textSecondary },
  logText: { fontSize: 12.5, color: Colors.text, lineHeight: 18 },
  logBy: { fontSize: 11, color: Colors.textSecondary },
});
