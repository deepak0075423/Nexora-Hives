/**
 * The chat module's sheets: new chat, create group (a teacher's class, subject
 * or staff group; an admin's open group), add members, edit group, forward,
 * edit history, message actions and the contact / group info panel. Every rule
 * about who may be in a class or subject group is enforced by the server
 * (services/classGroupService) — these only offer what it would allow.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Switch, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as chatApi from '@/api/chat.api';
import { unwrap } from '@/components/ui/kit';
import { Sheet, SheetItem, SearchField, Chips, Btn, Avatar, chatAvatarKind } from './parts';
import { C, ROLE_LABEL, chatName, isGroup, lastSeen, personLine, errText } from './format';

type Ion = React.ComponentProps<typeof Ionicons>['name'];

const ROLE_FILTERS: Record<string, [string, string][]> = {
  school_admin: [['', 'Everyone'], ['teacher', 'Teachers'], ['student', 'Students'], ['parent', 'Parents'], ['school_admin', 'Admins']],
  teacher:      [['', 'Everyone'], ['teacher', 'Teachers'], ['student', 'Students'], ['parent', 'Parents'], ['school_admin', 'Admins']],
  student:      [['', 'Everyone'], ['teacher', 'Teachers'], ['school_admin', 'Admins']],
  parent:       [['', 'Everyone'], ['teacher', 'Teachers'], ['school_admin', 'Admins']],
};
const STAFF_FILTERS: [string, string][] = [['', 'Everyone'], ['teacher', 'Teachers'], ['school_admin', 'Admins']];
const isStaff = (c: any) => c.role === 'teacher' || c.role === 'school_admin';

/** Contacts the caller may reach, searched on the server (debounced). */
function useContacts(open: boolean, q: string, role: string) {
  const [state, setState] = useState<{ rows: any[]; loading: boolean; error?: string }>({ rows: [], loading: false });
  useEffect(() => {
    if (!open) return undefined;
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(async () => {
      try {
        const d = unwrap(await chatApi.getContacts({ q: q.trim() || undefined, role: role || undefined, limit: 80 }));
        setState({ rows: Array.isArray(d) ? d : [], loading: false });
      } catch (e: any) { setState({ rows: [], loading: false, error: errText(e) }); }
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [open, q, role]);
  return state;
}

function PickRow({ c, on, check, locked, right, onPress }: {
  c: any; on?: boolean; check?: boolean; locked?: boolean; right?: string; onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={[s.pick, on && s.pickOn]} onPress={onPress} disabled={locked || !onPress} accessibilityLabel={c.name}
      accessibilityState={check ? { checked: !!on } : undefined}>
      {check && (
        <View style={[s.check, on && s.checkOn, locked && { backgroundColor: '#B9B5F6', borderColor: '#B9B5F6' }]}>
          {on && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
      )}
      <Avatar name={c.name} size={38} image={c.profileImage} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.pickName} numberOfLines={1}>{c.name}{c.you ? ' (you)' : ''}</Text>
        {!!(c.line || c.tag) && <Text style={s.pickLine} numberOfLines={1}>{c.line || c.tag}</Text>}
      </View>
      <View style={s.rolePill}><Text style={s.rolePillText}>{right ?? (ROLE_LABEL[c.role] || c.role || 'Teacher')}</Text></View>
    </TouchableOpacity>
  );
}

const Loading = ({ text = 'Loading…' }: { text?: string }) => (
  <View style={s.blank}><ActivityIndicator color={C.brand} /><Text style={s.blankText}>{text}</Text></View>
);
const Blank = ({ title, text }: { title?: string; text: string }) => (
  <View style={s.blank}>{!!title && <Text style={s.blankTitle}>{title}</Text>}<Text style={s.blankText}>{text}</Text></View>
);

// ─── New chat ─────────────────────────────────────────────────────────────────

export function NewChatSheet({ visible, onClose, myRole, onPick }: {
  visible: boolean; onClose: () => void; myRole: string; onPick: (c: any) => void;
}) {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const { rows, loading, error } = useContacts(visible, q, role);
  useEffect(() => { if (visible) { setQ(''); setRole(''); } }, [visible]);
  return (
    <Sheet visible={visible} onClose={onClose} tall title="New Chat" subtitle="Start a conversation with someone you are allowed to message.">
      <SearchField value={q} onChange={setQ} placeholder="Search by name..." />
      <View style={{ height: 10 }} />
      <Chips options={ROLE_FILTERS[myRole] || ROLE_FILTERS.student} value={role} onChange={setRole} />
      <View style={s.list}>
        {loading && !rows.length ? <Loading text="Loading people…" />
          : error ? <Blank text={error} />
            : !rows.length ? <Blank title="Nobody found" text={q ? `No one matches “${q}”.` : 'There is nobody you can message yet.'} />
              : rows.map((c) => <PickRow key={c._id} c={c} onPress={() => onPick(c)} />)}
      </View>
      {rows.length >= 80 && <Text style={s.note}>Showing the first 80 — search to narrow it down.</Text>}
    </Sheet>
  );
}

// ─── Member picker (contacts) ─────────────────────────────────────────────────

function MemberPicker({ open, myRole, picked, setPicked, exclude = [], staffOnly = false }: {
  open: boolean; myRole: string; picked: any[]; setPicked: (fn: (p: any[]) => any[]) => void; exclude?: string[]; staffOnly?: boolean;
}) {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const { rows, loading } = useContacts(open, q, role);
  const excluded = useMemo(() => new Set(exclude.map(String)), [exclude]);
  const list = rows.filter((c) => !excluded.has(String(c._id)) && (!staffOnly || isStaff(c)));
  const toggle = (c: any) => setPicked((p) => (p.some((x) => x._id === c._id) ? p.filter((x) => x._id !== c._id) : [...p, c]));
  return (
    <>
      <SearchField value={q} onChange={setQ} placeholder="Search people to add..." />
      <View style={{ height: 10 }} />
      <Chips options={staffOnly ? STAFF_FILTERS : (ROLE_FILTERS[myRole] || ROLE_FILTERS.student)} value={role} onChange={setRole} />
      {picked.length > 0 && (
        <View style={s.picked}>
          {picked.map((c) => (
            <TouchableOpacity key={c._id} style={s.pickedChip} onPress={() => toggle(c)} accessibilityLabel={`Remove ${c.name}`}>
              <Text style={s.pickedText}>{c.name}</Text><Ionicons name="close" size={13} color={C.brand} />
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={s.list}>
        {loading && !list.length ? <Loading text="Loading people…" />
          : !list.length ? <Blank text={q ? `No one matches “${q}”.` : 'Nobody else to add.'} />
            : list.map((c) => <PickRow key={c._id} c={c} check on={picked.some((x) => x._id === c._id)} onPress={() => toggle(c)} />)}
      </View>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}{hint ? <Text style={s.fieldHint}>{`  ${hint}`}</Text> : null}</Text>
      {children}
    </View>
  );
}

function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { key: string; icon: Ion; title: string; sub: string }[] }) {
  return (
    <View style={s.seg}>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <TouchableOpacity key={o.key} style={[s.segBtn, on && s.segOn]} onPress={() => onChange(o.key)} accessibilityLabel={o.title} accessibilityState={{ selected: on }}>
            <Ionicons name={o.icon} size={19} color={on ? C.brand : C.muted} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.segTitle}>{o.title}</Text>
              <Text style={s.segSub}>{o.sub}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Create group ─────────────────────────────────────────────────────────────

/**
 * An admin gets the open form (anyone in the school). A teacher first says what
 * the group is for: the class they run, a subject they teach, or a staff group —
 * students only ever join through the first two.
 */
export function CreateGroupSheet({ visible, onClose, myRole, onCreated, onOpenExisting }: {
  visible: boolean; onClose: () => void; myRole: string; onCreated: (row: any) => void; onOpenExisting: (chatId: string) => void;
}) {
  const teacher = myRole === 'teacher';
  const [step, setStep] = useState<any>(null);
  useEffect(() => { if (visible) setStep(teacher ? { kind: 'choose' } : { kind: 'staff' }); }, [visible, teacher]);
  if (!visible || !step) return null;
  const back = teacher ? () => setStep({ kind: 'choose' }) : undefined;
  if (step.kind === 'choose') return <GroupKindChooser onClose={onClose} onChoose={setStep} onOpenExisting={onOpenExisting} />;
  if (step.kind === 'class' || step.kind === 'subject') {
    return <ClassGroupForm pick={step} onClose={onClose} onBack={back} onCreated={onCreated} onOpenExisting={onOpenExisting} />;
  }
  return <StaffGroupForm onClose={onClose} onBack={back} myRole={myRole} staffOnly={teacher} onCreated={onCreated} />;
}

function Choice({ icon, glyph, title, sub, existing, onPress }: {
  icon: Ion; glyph?: boolean; title: string; sub: string; existing?: any; onPress: () => void;
}) {
  const blocked = existing && !existing.isMember;
  return (
    <TouchableOpacity style={[s.choice, blocked && { backgroundColor: '#FAFBFC' }]} onPress={blocked ? undefined : onPress} disabled={blocked} accessibilityLabel={title}>
      <View style={[s.choiceIcon, glyph && { backgroundColor: C.brandSoft }]}><Ionicons name={icon} size={22} color={glyph ? C.brand : C.ink3} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.choiceTitle}>{title}</Text>
        <Text style={s.choiceSub}>{sub}</Text>
      </View>
      {existing
        ? <View style={[s.tag, existing.isMember && { backgroundColor: C.brandSoft }]}><Text style={[s.tagText, existing.isMember && { color: C.brand }]}>{existing.isMember ? 'Open' : 'Already created'}</Text></View>
        : <Ionicons name="chevron-forward" size={18} color={C.muted} />}
    </TouchableOpacity>
  );
}

function GroupKindChooser({ onClose, onChoose, onOpenExisting }: { onClose: () => void; onChoose: (s: any) => void; onOpenExisting: (id: string) => void }) {
  const [state, setState] = useState<{ loading: boolean; data: any; error: string }>({ loading: true, data: null, error: '' });
  useEffect(() => {
    chatApi.getClassGroupOptions()
      .then((res) => setState({ loading: false, data: unwrap(res) || { classGroups: [], subjectGroups: [] }, error: '' }))
      .catch((e) => setState({ loading: false, data: { classGroups: [], subjectGroups: [] }, error: errText(e) }));
  }, []);
  const cg: any[] = state.data?.classGroups || [];
  const sg: any[] = state.data?.subjectGroups || [];
  const go = (g: any, kind: string) => (g.existing ? onOpenExisting(g.existing.chatId) : onChoose({ kind, sectionId: g.sectionId, subjectId: g.subjectId || null }));
  return (
    <Sheet visible onClose={onClose} tall title="Create Group" subtitle="Who is this group for?">
      {state.loading ? <Loading text="Loading your classes…" /> : (
        <>
          {cg.length > 0 && <Text style={s.label}>CLASS GROUP</Text>}
          {cg.map((g) => (
            <Choice key={g.sectionId} glyph icon="people-outline" existing={g.existing} title={`Class ${g.label}`}
              sub={g.existing && !g.existing.isMember ? `“${g.existing.name}” already exists`
                : `${g.as === 'class' ? 'You are the class teacher' : 'You are the vice class teacher'} · ${g.students} student${g.students === 1 ? '' : 's'}`}
              onPress={() => go(g, 'class')} />
          ))}
          {sg.length > 0 && <Text style={s.label}>SUBJECT GROUP</Text>}
          {sg.map((g) => (
            <Choice key={`${g.sectionId}-${g.subjectId}`} glyph icon="book-outline" existing={g.existing} title={`Class ${g.label} · ${g.subjectName}`}
              sub={g.existing && !g.existing.isMember ? `Already created by another ${g.subjectName} teacher — ask them to add you`
                : `${g.students} student${g.students === 1 ? '' : 's'} · ${g.subjectName} teachers of Class ${g.label}`}
              onPress={() => go(g, 'subject')} />
          ))}
          <Text style={s.label}>OTHER</Text>
          <Choice icon="briefcase-outline" title="Staff group" sub="Teachers and admins only — no students" onPress={() => onChoose({ kind: 'staff' })} />
          {!cg.length && !sg.length && <Text style={s.note}>Class and subject groups appear here for the classes you run or teach this year.</Text>}
          {!!state.error && <Text style={s.err}>{state.error}</Text>}
        </>
      )}
    </Sheet>
  );
}

function ClassGroupForm({ pick, onClose, onBack, onCreated, onOpenExisting }: {
  pick: any; onClose: () => void; onBack?: () => void; onCreated: (row: any) => void; onOpenExisting: (id: string) => void;
}) {
  const [roster, setRoster] = useState<any>(null);
  const [loadErr, setLoadErr] = useState('');
  const [form, setForm] = useState({ name: '', description: '', readOnly: false });
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isSubject = pick.kind === 'subject';

  useEffect(() => {
    chatApi.getClassGroupRoster({ kind: pick.kind, sectionId: pick.sectionId, subjectId: pick.subjectId || undefined })
      .then((res) => {
        const r = unwrap(res);
        setRoster(r);
        setForm({ name: r?.defaultName || '', description: '', readOnly: false });
        setChosen(new Set((r?.teachers || []).map((t: any) => t._id)));
      })
      .catch((e) => setLoadErr(errText(e)));
  }, [pick.kind, pick.sectionId, pick.subjectId]);

  const toggle = (t: any) => {
    if (t.locked) return;
    setChosen((cur) => { const n = new Set(cur); if (n.has(t._id)) n.delete(t._id); else n.add(t._id); return n; });
  };

  const submit = async () => {
    if (!form.name.trim()) { setErr('Give the group a name'); return; }
    setSaving(true); setErr('');
    try {
      const res = await chatApi.createClassGroup({
        kind: pick.kind, sectionId: pick.sectionId, subjectId: pick.subjectId || undefined,
        name: form.name.trim(), description: form.description.trim(), isReadOnly: form.readOnly,
        teacherIds: (roster?.teachers || []).filter((t: any) => !t.locked && chosen.has(t._id)).map((t: any) => t._id),
      });
      onCreated(unwrap(res));
    } catch (e: any) {
      if (e?.data?.chatId) { onOpenExisting(e.data.chatId); return; }
      setErr(errText(e));
    } finally { setSaving(false); }
  };

  const students: any[] = roster?.students || [];
  const teachers: any[] = roster?.teachers || [];
  const people = students.length + teachers.filter((t) => chosen.has(t._id)).length;
  const visible = showAll ? students : students.slice(0, 12);

  return (
    <Sheet visible onClose={onClose} tall title={isSubject ? 'Subject group' : 'Class group'}
      subtitle={roster ? (isSubject ? `${roster.subjectName} · ${roster.label}` : roster.label) : undefined}
      footer={<>
        <Btn kind="ghost" label={onBack ? 'Back' : 'Cancel'} onPress={onBack || onClose} style={{ flex: 1 }} />
        <Btn label={saving ? 'Creating…' : `Create · ${people} people`} onPress={submit} disabled={saving || !roster || !!roster?.existing} style={{ flex: 1.4 }} />
      </>}>
      {loadErr ? <Blank text={loadErr} /> : !roster ? <Loading text="Loading the class…" /> : (
        <>
          {roster.existing && (
            <TouchableOpacity style={s.callout} onPress={() => onOpenExisting(roster.existing.chatId)}>
              <Ionicons name="information-circle-outline" size={18} color={C.amberInk} />
              <Text style={s.calloutText}>{roster.label} already has {isSubject ? `a ${roster.subjectName} group` : 'a class group'}: “{roster.existing.name}”. Tap to open it.</Text>
            </TouchableOpacity>
          )}
          <Field label="Group name">
            <TextInput style={s.input} value={form.name} maxLength={80} onChangeText={(v) => { setForm((f) => ({ ...f, name: v })); setErr(''); }} accessibilityLabel="Group name" />
          </Field>
          <Field label="Description" hint="(optional)">
            <TextInput style={[s.input, { minHeight: 64, textAlignVertical: 'top' }]} multiline maxLength={300} value={form.description}
              onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
              placeholder={isSubject ? `Homework, notes and doubts for ${roster.subjectName}` : 'Announcements and discussion for the class'}
              placeholderTextColor={C.faint} accessibilityLabel="Description" />
          </Field>
          <Field label="Who can post">
            <Seg value={form.readOnly ? 'ro' : 'all'} onChange={(v) => setForm((f) => ({ ...f, readOnly: v === 'ro' }))} options={[
              { key: 'all', icon: 'chatbubbles-outline', title: 'Everyone', sub: 'Students and teachers can write' },
              { key: 'ro', icon: 'megaphone-outline', title: 'Teachers only', sub: 'Students can read' },
            ]} />
          </Field>

          <View style={s.roster}>
            <View style={s.rosterHead}><Ionicons name="lock-closed-outline" size={15} color={C.muted} /><Text style={s.rosterTitle}>Students · {students.length}</Text></View>
            <Text style={s.rosterNote}>
              {students.length
                ? `Every student of ${roster.label} is in this group, and stays in it as the class changes. Students can’t be removed.`
                : `${roster.label} has no students placed yet — they will join as they are added to the class.`}
            </Text>
            {students.length > 0 && (
              <View style={s.picked}>
                {visible.map((st) => <View key={st._id} style={s.studentChip}><Text style={s.studentText}>{st.rollNumber ? `${st.rollNumber}. ` : ''}{st.name}</Text></View>)}
                {students.length > visible.length && (
                  <TouchableOpacity onPress={() => setShowAll(true)}><Text style={s.more}>+{students.length - visible.length} more</Text></TouchableOpacity>
                )}
              </View>
            )}
          </View>

          <Field label="Teachers" hint={`· ${teachers.filter((t) => chosen.has(t._id)).length} in the group`}>
            <Text style={[s.note, { marginTop: 0, marginBottom: 6 }]}>
              {isSubject
                ? `Only teachers who teach ${roster.subjectName} in ${roster.label} can be in this group.`
                : `The class teacher and vice class teacher are always in it. Subject teachers of ${roster.label} can be added.`}
            </Text>
            <View style={s.list}>
              {teachers.map((t) => (
                <PickRow key={t._id} c={{ ...t, line: t.tag || 'Teacher' }} check on={chosen.has(t._id)} locked={t.locked}
                  right={t.admin ? 'Manages group' : t.locked ? 'Always in' : 'Teacher'} onPress={() => toggle(t)} />
              ))}
            </View>
          </Field>
          {!!err && <Text style={s.err}>{err}</Text>}
        </>
      )}
    </Sheet>
  );
}

function StaffGroupForm({ onClose, onBack, myRole, staffOnly, onCreated }: {
  onClose: () => void; onBack?: () => void; myRole: string; staffOnly: boolean; onCreated: (row: any) => void;
}) {
  const [form, setForm] = useState({ name: '', description: '', kind: 'group' });
  const [picked, setPicked] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    if (!form.name.trim()) { setErr('Give the group a name'); return; }
    if (!picked.length) { setErr('Add at least one member'); return; }
    setSaving(true);
    try {
      const res = await chatApi.createGroup({
        name: form.name.trim(), description: form.description.trim(),
        type: form.kind === 'broadcast' ? 'broadcast' : 'group', isReadOnly: form.kind === 'broadcast',
        memberIds: picked.map((c) => c._id),
      });
      onCreated(unwrap(res));
    } catch (e: any) { setErr(errText(e)); }
    finally { setSaving(false); }
  };
  return (
    <Sheet visible onClose={onClose} tall title={staffOnly ? 'Staff group' : 'Create Group'}
      subtitle={staffOnly ? 'Teachers and admins. Students join through a class or subject group.' : 'Everyone you add can see the whole conversation.'}
      footer={<>
        <Btn kind="ghost" label={onBack ? 'Back' : 'Cancel'} onPress={onBack || onClose} style={{ flex: 1 }} />
        <Btn label={saving ? 'Creating…' : `Create${picked.length ? ` · ${picked.length + 1} people` : ''}`} onPress={submit} disabled={saving} style={{ flex: 1.4 }} />
      </>}>
      <Field label="Group name">
        <TextInput style={s.input} value={form.name} maxLength={80} placeholder="e.g. Science Dept." placeholderTextColor={C.faint}
          onChangeText={(v) => { setForm((f) => ({ ...f, name: v })); setErr(''); }} accessibilityLabel="Group name" />
      </Field>
      <Field label="Description" hint="(optional)">
        <TextInput style={[s.input, { minHeight: 56, textAlignVertical: 'top' }]} multiline maxLength={300} value={form.description}
          onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="What is this group for?" placeholderTextColor={C.faint} accessibilityLabel="Description" />
      </Field>
      <Field label="Type">
        <Seg value={form.kind} onChange={(v) => setForm((f) => ({ ...f, kind: v }))} options={[
          { key: 'group', icon: 'chatbubbles-outline', title: 'Group chat', sub: 'Everyone can send messages' },
          { key: 'broadcast', icon: 'megaphone-outline', title: 'Announcements', sub: 'Only admins & teachers post' },
        ]} />
      </Field>
      <Field label="Members" hint={`· ${picked.length} selected`}>
        <MemberPicker open myRole={myRole} staffOnly={staffOnly} picked={picked} setPicked={(fn) => { setPicked(fn); setErr(''); }} />
      </Field>
      {!!err && <Text style={s.err}>{err}</Text>}
    </Sheet>
  );
}

// ─── Add members / edit group ─────────────────────────────────────────────────

export function AddMembersSheet({ visible, onClose, myRole, chat, existing, onAdded, classGroup = false, staffOnly = false }: {
  visible: boolean; onClose: () => void; myRole: string; chat: any; existing: string[]; onAdded: () => void; classGroup?: boolean; staffOnly?: boolean;
}) {
  const [picked, setPicked] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [cands, setCands] = useState<{ rows: any[]; loading: boolean }>({ rows: [], loading: false });
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { if (visible) { setPicked([]); setQ(''); setErr(''); } }, [visible]);
  useEffect(() => {
    if (!visible || !classGroup) return;
    setCands({ rows: [], loading: true });
    chatApi.getGroupCandidates(chat._id)
      .then((res) => { const d = unwrap(res); setCands({ rows: Array.isArray(d) ? d : [], loading: false }); })
      .catch(() => setCands({ rows: [], loading: false }));
  }, [visible, classGroup, chat?._id]);

  const submit = async () => {
    if (!picked.length) return;
    setSaving(true);
    try { await chatApi.addMembers(chat._id, picked.map((c) => c._id)); onAdded(); }
    catch (e: any) { setErr(errText(e)); }
    finally { setSaving(false); }
  };
  const toggle = (c: any) => setPicked((p) => (p.some((x) => x._id === c._id) ? p.filter((x) => x._id !== c._id) : [...p, c]));
  const term = q.trim().toLowerCase();
  const list = cands.rows.filter((c) => !term || c.name.toLowerCase().includes(term));

  return (
    <Sheet visible={visible} onClose={onClose} tall title="Add members"
      subtitle={classGroup ? (chat.kind === 'subject'
        ? `Only teachers of ${chat.subjectName} in Class ${chat.sectionLabel} can join`
        : `Teachers of Class ${chat.sectionLabel} who are not in the group yet`) : chatName(chat)}
      footer={<>
        <Btn kind="ghost" label="Cancel" onPress={onClose} style={{ flex: 1 }} />
        <Btn label={saving ? 'Adding…' : `Add${picked.length ? ` ${picked.length}` : ''}`} onPress={submit} disabled={saving || !picked.length} style={{ flex: 1.4 }} />
      </>}>
      {classGroup ? (
        <>
          <SearchField value={q} onChange={setQ} placeholder="Search..." />
          <View style={s.list}>
            {cands.loading ? <Loading />
              : !list.length ? <Blank title="Everyone is already here" text="No other teacher of this class can be added." />
                : list.map((c) => <PickRow key={c._id} c={c} check on={picked.some((x) => x._id === c._id)} onPress={() => toggle(c)} />)}
          </View>
        </>
      ) : (
        <MemberPicker open={visible} myRole={myRole} staffOnly={staffOnly} picked={picked} setPicked={setPicked} exclude={existing} />
      )}
      {!!err && <Text style={s.err}>{err}</Text>}
    </Sheet>
  );
}

export function EditGroupSheet({ visible, onClose, chat, onSaved }: { visible: boolean; onClose: () => void; chat: any; onSaved: (patch: any) => void }) {
  const [form, setForm] = useState({ name: '', description: '', isReadOnly: false });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (visible && chat) { setForm({ name: chat.name || '', description: chat.description || '', isReadOnly: !!chat.isReadOnly }); setErr(''); }
  }, [visible, chat]);
  const submit = async () => {
    if (!form.name.trim()) { setErr('Group name is required'); return; }
    setSaving(true);
    try {
      await chatApi.updateGroupSettings(chat._id, { name: form.name.trim(), description: form.description.trim(), isReadOnly: form.isReadOnly });
      onSaved({ name: form.name.trim(), displayName: form.name.trim(), description: form.description.trim(), isReadOnly: form.isReadOnly });
    } catch (e: any) { setErr(errText(e)); }
    finally { setSaving(false); }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Edit group"
      footer={<>
        <Btn kind="ghost" label="Cancel" onPress={onClose} style={{ flex: 1 }} />
        <Btn label={saving ? 'Saving…' : 'Save'} onPress={submit} disabled={saving} style={{ flex: 1.4 }} />
      </>}>
      <Field label="Group name">
        <TextInput style={s.input} value={form.name} maxLength={80} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} accessibilityLabel="Group name" />
      </Field>
      <Field label="Description" hint="(optional)">
        <TextInput style={[s.input, { minHeight: 72, textAlignVertical: 'top' }]} multiline maxLength={300} value={form.description}
          onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} accessibilityLabel="Description" />
      </Field>
      <View style={s.switchRow}>
        <Ionicons name="lock-closed-outline" size={18} color={C.ink3} />
        <Text style={s.switchText}>Only admins and teachers can post</Text>
        <Switch value={form.isReadOnly} onValueChange={(v) => setForm((f) => ({ ...f, isReadOnly: v }))} trackColor={{ true: C.brand, false: '#D7DAE3' }} />
      </View>
      {!!err && <Text style={s.err}>{err}</Text>}
    </Sheet>
  );
}

// ─── Forward / history / message actions ──────────────────────────────────────

export function ForwardSheet({ msg, chats, onClose, onPick }: { msg: any; chats: any[]; onClose: () => void; onPick: (c: any) => void }) {
  const [q, setQ] = useState('');
  useEffect(() => { if (msg) setQ(''); }, [msg]);
  const list = chats.filter((c) => !c.isArchived && (!q.trim() || chatName(c).toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <Sheet visible={!!msg} onClose={onClose} tall title="Forward message">
      {msg && (
        <View style={s.fwdPreview}>
          <Text style={s.fwdWho}>{msg.sender?.name}</Text>
          <Text style={s.fwdText} numberOfLines={3}>{msg.content || 'Attachment'}</Text>
        </View>
      )}
      <SearchField value={q} onChange={setQ} placeholder="Search conversations..." />
      <View style={s.list}>
        {!list.length ? <Blank text="No conversations match." /> : list.map((c) => (
          <TouchableOpacity key={c._id} style={s.pick} onPress={() => onPick(c)} accessibilityLabel={`Forward to ${chatName(c)}`}>
            <Avatar name={chatName(c)} size={38} group={chatAvatarKind(c)} image={c.displayAvatar} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.pickName} numberOfLines={1}>{chatName(c)}</Text>
              <Text style={s.pickLine} numberOfLines={1}>{isGroup(c) ? `${c.memberCount} members` : (ROLE_LABEL[c.otherUser?.role] || '')}</Text>
            </View>
            <Ionicons name="send" size={17} color={C.brand} />
          </TouchableOpacity>
        ))}
      </View>
    </Sheet>
  );
}

export function HistorySheet({ msg, onClose }: { msg: any; onClose: () => void }) {
  const when = (d?: string) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  return (
    <Sheet visible={!!msg} onClose={onClose} title="Edit history" subtitle={msg ? `Sent by ${msg.sender?.name} · ${when(msg.createdAt)}` : undefined}>
      {msg && (
        <>
          {(msg.editHistory || []).map((h: any, i: number) => (
            <View key={i} style={s.history}>
              <Text style={s.historyWhen}>Version {i + 1}{h.editedAt ? ` · replaced ${when(h.editedAt)}` : ''}</Text>
              <Text style={[s.historyText, { textDecorationLine: 'line-through', opacity: 0.75 }]}>{h.content || '(empty)'}</Text>
            </View>
          ))}
          <View style={[s.history, { borderLeftColor: '#22C55E' }]}>
            <Text style={s.historyWhen}>Current{msg.editedAt ? ` · edited ${when(msg.editedAt)}` : ''}</Text>
            <Text style={s.historyText}>{msg.content}</Text>
          </View>
        </>
      )}
    </Sheet>
  );
}

const QUICK = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export function MessageActionsSheet({ msg, myId, isAdmin, onClose, onReact, onReply, onForward, onCopy, onEdit, onDelete, onHistory }: {
  msg: any; myId: string; isAdmin: boolean; onClose: () => void;
  onReact: (e: string) => void; onReply: () => void; onForward: () => void; onCopy: () => void; onEdit: () => void; onDelete: () => void; onHistory: () => void;
}) {
  if (!msg) return null;
  const mine = String(msg.sender?._id) === myId;
  const canEdit = mine && !msg.isDeleted && Date.now() - new Date(msg.createdAt).getTime() < 86400000;
  const canDelete = !msg.isDeleted && (mine || isAdmin);
  return (
    <Sheet visible onClose={onClose} title={mine ? 'Your message' : (msg.sender?.name || 'Message')}>
      <View style={s.quick}>
        {QUICK.map((e) => (
          <TouchableOpacity key={e} style={s.quickBtn} onPress={() => onReact(e)} accessibilityLabel={`React ${e}`}><Text style={{ fontSize: 26 }}>{e}</Text></TouchableOpacity>
        ))}
      </View>
      <SheetItem icon="arrow-undo-outline" label="Reply" onPress={onReply} />
      <SheetItem icon="arrow-redo-outline" label="Forward" onPress={onForward} />
      {!!msg.content && <SheetItem icon="copy-outline" label="Copy text" onPress={onCopy} />}
      {canEdit && <SheetItem icon="create-outline" label="Edit" onPress={onEdit} />}
      {isAdmin && (msg.editHistory || []).length > 0 && <SheetItem icon="time-outline" label="Edit history" onPress={onHistory} />}
      {canDelete && <SheetItem icon="trash-outline" danger label={mine ? 'Delete for everyone' : 'Delete (admin)'} onPress={onDelete} />}
    </Sheet>
  );
}

// ─── Contact / group info ─────────────────────────────────────────────────────

export function InfoSheet({
  visible, chat, profile, loading, myId, online, observer, onClose,
  onMute, onArchive, onAddMembers, onEditGroup, onRemoveMember, onLeave, onMessage, onSync, syncing,
}: {
  visible: boolean; chat: any; profile: any; loading?: boolean; myId: string; online: Set<string>; observer: boolean; onClose: () => void;
  onMute: () => void; onArchive: () => void; onAddMembers: () => void; onEditGroup: () => void; onRemoveMember: (m: any) => void;
  onLeave: () => void; onMessage: (m: any) => void; onSync: () => void; syncing?: boolean;
}) {
  if (!chat) return null;
  const group = isGroup(chat);
  const person = profile?.person;
  const members: any[] = profile?.members || [];
  const iAmAdmin = members.some((m) => m._id === myId && m.memberRole === 'admin');
  const manage = profile?.manage || null;
  const classKind = profile?.kind || '';
  const canAdd = classKind ? !!manage?.canManage : iAmAdmin;
  const canRemove = (m: any) => (classKind ? (manage?.removable || []).includes(m._id) : iAmAdmin && m._id !== myId);
  const canLeave = classKind ? !!manage?.canLeave : true;
  const tagOf = (m: any) => (classKind ? (manage?.tags?.[m._id] || ROLE_LABEL[m.role] || m.role) : (ROLE_LABEL[m.role] || m.role));
  const staff = classKind ? members.filter((m) => m.role !== 'student') : members;
  const students = classKind ? members.filter((m) => m.role === 'student') : [];
  const label = profile?.classSection?.label || chat.sectionLabel || '';

  const row = (m: any) => (
    <View key={m._id} style={s.member}>
      <Avatar name={m.name} size={38} image={m.profileImage} online={online.has(m._id)} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.pickName} numberOfLines={1}>{m.name}{m._id === myId ? ' (you)' : ''}</Text>
        <Text style={s.pickLine} numberOfLines={1}>{tagOf(m)}{m.memberRole === 'admin' ? ' · Manages group' : ''}</Text>
      </View>
      {!observer && m._id !== myId && (
        <TouchableOpacity onPress={() => onMessage(m)} hitSlop={8} accessibilityLabel={`Message ${m.name}`}><Ionicons name="chatbubble-outline" size={18} color={C.faint} /></TouchableOpacity>
      )}
      {!observer && canRemove(m) && (
        <TouchableOpacity onPress={() => onRemoveMember(m)} hitSlop={8} accessibilityLabel={`Remove ${m.name}`}><Ionicons name="close-circle-outline" size={20} color={C.faint} /></TouchableOpacity>
      )}
    </View>
  );

  return (
    <Sheet visible={visible} onClose={onClose} tall title={group ? 'Group info' : 'Contact info'}>
      <View style={s.hero}>
        <Avatar name={chatName(chat)} size={84} group={chatAvatarKind(chat)} image={chat.displayAvatar} online={!group && online.has(chat.otherUser?._id)} />
        <Text style={s.heroName}>{chatName(chat)}</Text>
        <Text style={s.heroSub}>
          {group
            ? `${classKind === 'class' ? 'Class group' : classKind === 'subject' ? 'Subject group' : chat.type === 'broadcast' ? 'Announcement channel' : 'Group'} · ${chat.memberCount} member${chat.memberCount === 1 ? '' : 's'}`
            : `${ROLE_LABEL[chat.otherUser?.role] || ''}${chat.otherUser ? ` · ${online.has(chat.otherUser._id) ? 'Online' : lastSeen(chat.otherUser.lastSeenAt)}` : ''}`}
        </Text>
      </View>

      {loading && !profile ? <Loading /> : (
        <>
          {!group && person && (
            <View style={s.facts}>
              {person.role === 'teacher' && <>
                {person.subjects?.length > 0 && <Fact label="TEACHES"><View style={s.chipsRow}>{person.subjects.map((x: string) => <Text key={x} style={s.factChip}>{x}</Text>)}</View></Fact>}
                {person.classes?.length > 0 && <Fact label="CLASSES"><View style={s.chipsRow}>{person.classes.map((x: string) => <Text key={x} style={s.factChip}>{x}</Text>)}</View></Fact>}
                {person.classTeacherOf?.length > 0 && <Fact label="CLASS TEACHER OF"><Text style={s.factText}>{person.classTeacherOf.join(', ')}</Text></Fact>}
                {!!(person.designation || person.department) && <Fact label="ROLE"><Text style={s.factText}>{[person.designation, person.department].filter(Boolean).join(' · ')}</Text></Fact>}
              </>}
              {person.role === 'student' && <>
                <Fact label="CLASS"><Text style={s.factText}>{personLine(person)[0]}</Text></Fact>
                {!!person.rollNumber && <Fact label="ROLL NUMBER"><Text style={s.factText}>{person.rollNumber}</Text></Fact>}
              </>}
              {person.role === 'parent' && (
                <Fact label="CHILDREN">
                  {(person.children || []).length
                    ? person.children.map((k: any) => <Text key={k._id} style={s.factText}>{k.name}{k.className ? ` · Class ${k.className}` : ''}</Text>)
                    : <Text style={s.factText}>None linked</Text>}
                </Fact>
              )}
              {person.role === 'school_admin' && <Fact label="ROLE"><Text style={s.factText}>School administrator</Text></Fact>}
            </View>
          )}

          {group && (
            <>
              <View style={s.facts}>
                {classKind === 'class' && <Fact label={`CLASS GROUP · CLASS ${label}`}><Text style={s.factText}>Every student of Class {label} is in this group, with its class teacher and vice class teacher. Subject teachers of the class can be added.</Text></Fact>}
                {classKind === 'subject' && <Fact label={`${(profile?.subject?.name || chat.subjectName || '').toUpperCase()} · CLASS ${label}`}><Text style={s.factText}>Every student of Class {label} is in this group. Only teachers of {profile?.subject?.name || chat.subjectName} in Class {label} can join it.</Text></Fact>}
                {!!chat.description && <Fact label="ABOUT"><Text style={s.factText}>{chat.description}</Text></Fact>}
                {!!profile?.createdBy && <Fact label="CREATED BY"><Text style={s.factText}>{profile.createdBy._id === myId ? 'You' : profile.createdBy.name}{profile.createdAt ? ` · ${new Date(profile.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</Text></Fact>}
              </View>
              <View style={s.sectionHead}>
                <Text style={s.sectionTitle}>{classKind ? `Teachers · ${staff.length}` : `${members.length} member${members.length === 1 ? '' : 's'}`}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {!observer && classKind && manage?.canSync && <Btn small kind="ghost" icon="refresh" label={syncing ? 'Syncing…' : 'Sync'} onPress={onSync} disabled={syncing} />}
                  {!observer && canAdd && <Btn small kind="ghost" icon="person-add-outline" label="Add" onPress={onAddMembers} />}
                </View>
              </View>
              {staff.map(row)}
              {!!classKind && (
                <>
                  <View style={s.sectionHead}>
                    <Text style={s.sectionTitle}>Students · {students.length}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="lock-closed-outline" size={13} color={C.muted} /><Text style={s.pickLine}>Follows Class {label}</Text></View>
                  </View>
                  {!students.length && <Text style={s.note}>No students are placed in Class {label} yet.</Text>}
                  {students.map(row)}
                </>
              )}
            </>
          )}

          {!observer && (
            <View style={{ marginTop: 14, gap: 8 }}>
              <View style={s.switchRow}>
                <Ionicons name="notifications-off-outline" size={18} color={C.ink3} />
                <Text style={s.switchText}>Mute notifications</Text>
                <Switch value={!!chat.isMuted} onValueChange={onMute} trackColor={{ true: C.brand, false: '#D7DAE3' }} />
              </View>
              <Btn kind="ghost" icon="archive-outline" label={chat.isArchived ? 'Move back to chats' : 'Archive conversation'} onPress={onArchive} />
              {group && iAmAdmin && <Btn kind="ghost" icon="create-outline" label="Edit group" onPress={onEditGroup} />}
              {group && canLeave && <Btn kind="danger" icon="log-out-outline" label="Leave group" onPress={onLeave} />}
            </View>
          )}
        </>
      )}
    </Sheet>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={{ marginBottom: 12 }}><Text style={s.factLabel}>{label}</Text>{children}</View>;
}

const s = StyleSheet.create({
  list: { marginTop: 12, borderWidth: 1, borderColor: C.line, borderRadius: 12, overflow: 'hidden' },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.line2, backgroundColor: '#fff' },
  pickOn: { backgroundColor: '#F5F4FF' },
  pickName: { fontSize: 14.5, fontWeight: '600', color: C.ink },
  pickLine: { fontSize: 12.5, color: C.muted, marginTop: 1 },
  rolePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: '#F1F2F6' },
  rolePillText: { fontSize: 11, fontWeight: '600', color: C.ink3 },
  check: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: '#C5C9D6', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: C.brand, borderColor: C.brand },
  picked: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  pickedChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 10, paddingRight: 7, paddingVertical: 4, borderRadius: 999, backgroundColor: C.brandSoft },
  pickedText: { fontSize: 12.5, fontWeight: '600', color: C.brand },
  studentChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
  studentText: { fontSize: 12.5, color: C.ink3 },
  more: { fontSize: 12.5, fontWeight: '700', color: C.brand, paddingVertical: 4, paddingHorizontal: 6 },
  note: { fontSize: 12.5, color: C.muted, marginTop: 8 },
  err: { fontSize: 13, color: C.danger, marginTop: 10 },
  blank: { alignItems: 'center', gap: 6, paddingVertical: 28, paddingHorizontal: 16 },
  blankTitle: { fontSize: 15, fontWeight: '700', color: C.ink2 },
  blankText: { fontSize: 13.5, color: C.muted, textAlign: 'center' },
  label: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.faint, marginTop: 14, marginBottom: 8 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: '#fff' },
  choiceIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F2F6' },
  choiceTitle: { fontSize: 15, fontWeight: '600', color: C.ink },
  choiceSub: { fontSize: 12.5, color: C.muted, marginTop: 1 },
  tag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: '#F1F2F6' },
  tagText: { fontSize: 12, fontWeight: '600', color: C.muted },
  callout: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, marginBottom: 14, borderRadius: 10, backgroundColor: C.amberBg },
  calloutText: { flex: 1, fontSize: 13, color: C.amberInk },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: C.ink2, marginBottom: 6 },
  fieldHint: { fontWeight: '500', color: C.muted },
  input: { borderWidth: 1, borderColor: C.field, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.ink, backgroundColor: '#fff' },
  seg: { gap: 8 },
  segBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderWidth: 1, borderColor: C.field, borderRadius: 10, backgroundColor: '#fff' },
  segOn: { borderColor: C.brand, borderWidth: 2, backgroundColor: '#F7F7FF', padding: 10 },
  segTitle: { fontSize: 14, fontWeight: '700', color: C.ink },
  segSub: { fontSize: 12.5, color: C.muted },
  roster: { borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, backgroundColor: '#FBFBFD', marginBottom: 14 },
  rosterHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rosterTitle: { fontSize: 14, fontWeight: '700', color: C.ink2 },
  rosterNote: { fontSize: 12.5, color: C.muted, marginTop: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  switchText: { flex: 1, fontSize: 14.5, color: C.ink2 },
  fwdPreview: { borderLeftWidth: 3, borderLeftColor: C.brand, paddingLeft: 10, marginBottom: 12 },
  fwdWho: { fontSize: 12.5, fontWeight: '700', color: C.brand },
  fwdText: { fontSize: 13.5, color: C.ink3 },
  history: { borderLeftWidth: 3, borderLeftColor: C.line, paddingLeft: 12, marginBottom: 14 },
  historyWhen: { fontSize: 12, color: C.muted, marginBottom: 2 },
  historyText: { fontSize: 14.5, color: C.ink2 },
  quick: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 10, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: C.line2 },
  quickBtn: { padding: 4 },
  hero: { alignItems: 'center', gap: 4, paddingBottom: 16, marginBottom: 14, borderBottomWidth: 1, borderBottomColor: C.line2 },
  heroName: { fontSize: 18, fontWeight: '700', color: C.ink, marginTop: 8, textAlign: 'center' },
  heroSub: { fontSize: 13.5, color: C.muted, textAlign: 'center' },
  facts: { paddingBottom: 4, marginBottom: 6 },
  factLabel: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.5, color: C.faint, marginBottom: 4 },
  factText: { fontSize: 14, color: C.ink2, lineHeight: 20 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  factChip: { fontSize: 12.5, fontWeight: '500', color: C.ink3, backgroundColor: '#F1F2F6', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 3 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 4 },
  sectionTitle: { fontSize: 13.5, fontWeight: '700', color: C.ink2 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
});
