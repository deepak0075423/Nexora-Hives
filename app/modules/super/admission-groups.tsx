/**
 * Super admin → Admission groups, on the phone (Oct 2026): schools of one
 * trust or chain that families see together on one page, /g/<address>. A
 * school can be in one group; each school decides in its own admission office
 * whether it is listed. "Share status" lets branches see the same family's
 * applications at each other — status and preference only, never the answers
 * (school-backend services/admission/groups.js).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { groups } from '@/api/admission.api';
import { getSchools } from '@/api/superadmin.api';
import { confirmAsync, SearchBar } from '@/components/ui/kit';
import { Page, Panel, Line, Pill, Btn, Row, Note, Muted, Sheet, Field, Box, Tick, Blank, BRAND, useApi, errMsg, say, unwrapList } from '@/components/admission/parts';

export default function AdmissionGroupsScreen() {
  const { data, loading, error, reload } = useApi<any[]>(() => groups.list(), []);
  const [editing, setEditing] = useState<any>(null);
  const list = unwrapList(data);
  return (
    <Page title="Admission groups" loading={loading && !data} error={!data ? error : ''} onRetry={reload} onRefresh={reload}>
      <Btn kind="primary" block icon="add" onPress={() => setEditing({})}>New group</Btn>
      <View style={{ height: 12 }} />
      {list.length ? (
        <Panel icon="git-branch-outline" tone="violet" title={`${list.length} group${list.length === 1 ? '' : 's'}`}>
          {list.map((g, i) => (
            <Line key={g._id} last={i === list.length - 1} onPress={() => setEditing(g)} title={g.name}
              sub={`/g/${g.slug}\n${unwrapList(g.members).map((m: any) => `${m.name || 'School'}${m.listed === false ? ' (not listed)' : ''}`).join(', ')}`}
              right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Pill tone={g.isActive ? 'green' : 'slate'}>{g.isActive ? 'Live' : 'Off'}</Pill>{g.shareStatus ? <Pill tone="amber">Shares status</Pill> : null}</View>} />
          ))}
        </Panel>
      ) : <Blank icon="git-branch-outline" title="No groups yet" body="A group lists several schools' admission portals on one page." />}
      {editing ? <GroupSheet group={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} /> : null}
    </Page>
  );
}

function GroupSheet({ group, onClose, onDone }: { group: any; onClose: () => void; onDone: () => void }) {
  const isNew = !group._id;
  const [f, setF] = useState({
    name: group.name || '', slug: group.slug || '', intro: group.intro || '', primary: group.theme?.primary || '#4f46e5',
    shareStatus: !!group.shareStatus, isActive: group.isActive !== false, members: unwrapList(group.members).map((m: any) => String(m.school)),
  });
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const schools = useApi<any>(() => getSchools({ limit: 200 }), []);
  const all = unwrapList(schools.data?.data ?? schools.data);
  const shown = all.filter((s: any) => !q || String(s.name).toLowerCase().includes(q.toLowerCase()) || f.members.includes(String(s._id)));
  const toggle = (id: string) => setF({ ...f, members: f.members.includes(id) ? f.members.filter((x) => x !== id) : [...f.members, id] });
  const go = async () => {
    setBusy(true);
    const body = { name: f.name.trim(), slug: f.slug.trim().toLowerCase(), intro: f.intro.trim(), theme: { primary: f.primary }, shareStatus: f.shareStatus, isActive: f.isActive, members: f.members };
    try {
      if (isNew) await groups.create(body); else await groups.update(group._id, body);
      say(isNew ? 'Group created' : 'Saved'); onDone();
    } catch (e) { say('Not saved', errMsg(e)); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!(await confirmAsync(`Delete ${group.name}?`, 'The group page goes away. The schools, their portals and every application stay as they are.', 'Delete'))) return;
    try { await groups.remove(group._id); onDone(); } catch (e) { say('Not deleted', errMsg(e)); }
  };
  return (
    <Sheet visible icon="git-branch-outline" tone="violet" title={isNew ? 'New admission group' : group.name} onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind="primary" disabled={busy || !f.name.trim() || !f.slug.trim() || f.members.length < 2} onPress={go}>{isNew ? 'Create' : 'Save'}</Btn></>}>
      <Field label="Name" required><Box value={f.name} onChange={(v) => setF({ ...f, name: v })} maxLength={120} text="title" /></Field>
      <Field label="Address" required hint={`/g/${f.slug || '…'} — lowercase letters, digits and hyphens`}><Box value={f.slug} onChange={(v) => setF({ ...f, slug: v.toLowerCase() })} maxLength={40} text="code" /></Field>
      <Field label="Introduction" hint="Shown at the top of the group page"><Box value={f.intro} onChange={(v) => setF({ ...f, intro: v })} multiline maxLength={1500} /></Field>
      <Field label="Colour" hint="As #rrggbb"><Box value={f.primary} onChange={(v) => setF({ ...f, primary: v })} maxLength={7} text="any" /></Field>
      <Tick on={f.shareStatus} onChange={(v) => setF({ ...f, shareStatus: v })} label="Branches see the same family's applications at each other — status and order of preference only, never the answers" />
      {f.shareStatus ? <Note tone="amber" icon="shield-checkmark-outline">Sharing status across branches is sharing personal data between schools. Make sure each branch’s privacy notice tells families.</Note> : null}
      <Tick on={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Live" />
      <Text style={st.h}>{`Schools (${f.members.length}) — at least two; a school can be in one group only`}</Text>
      <SearchBar value={q} onChange={setQ} placeholder="Find a school" />
      {schools.loading && !schools.data ? <Muted>Loading…</Muted> : shown.slice(0, 80).map((s: any) => {
        const on = f.members.includes(String(s._id));
        return (
          <TouchableOpacity key={s._id} onPress={() => toggle(String(s._id))} style={st.school} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
            <Ionicons name={on ? 'checkbox' : 'square-outline'} size={19} color={on ? BRAND : Colors.textSecondary} />
            <Text style={st.schoolName}>{s.name}</Text>
          </TouchableOpacity>
        );
      })}
      {!isNew ? <><View style={{ height: 12 }} /><Row><Btn kind="danger" icon="trash-outline" onPress={remove}>Delete the group</Btn></Row></> : null}
    </Sheet>
  );
}

const st = StyleSheet.create({
  h: { fontSize: 13, fontWeight: '800', color: Colors.text, marginTop: 8, marginBottom: 6 },
  school: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  schoolName: { flex: 1, fontSize: 13.5, color: Colors.text },
});
