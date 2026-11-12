/**
 * The discussion under one document, on the phone (Nov 2026) — the same rules
 * as the web (school-frontend pages/admin/assignmentParts.jsx CommentCard and
 * pages/documents/viewerParts.jsx DocComments):
 *
 *   • Everybody edits and deletes their own comments, and nobody else's.
 *   • Only an admin deletes somebody else's comment.
 *   • Pin is for an admin or the teacher who shared the document.
 *   • A comment its author deleted after other people had replied stays as
 *     "This comment was deleted", holding their replies.
 *
 * The server says what each reader may do with each comment (canEdit /
 * canDelete / canPin) and enforces the same; these buttons only follow it.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { BASE_URL } from '@/api/axios';
import { withFileToken } from '@/utils/fileAccess';
import { TextInput } from '@/components/ui/TextInput';
import { unwrap, confirmAsync, Empty, FormModal, Input, LoaderView } from '@/components/ui/kit';

// ── Files ────────────────────────────────────────────────────────────────────

// A light purple tint (Colors.primaryLight is a dark shade in this theme).
const TINT = '#EDE9FE';

const ORIGIN = BASE_URL.replace(/\/api\/?$/, '');

/** A stored file's address. Stored paths can be the server's own disk path: the address is what follows `uploads/`. */
export function fileHref(f: any) {
  const raw = typeof f === 'string' ? f : (f?.filePath || f?.url || f?.fileUrl || '');
  const p = String(raw).replace(/\\/g, '/');
  const at = p.indexOf('uploads/');
  const url = /^https?:/.test(p) ? p : `${ORIGIN}/${at !== -1 ? p.slice(at) : p.replace(/^\//, '')}`;
  return withFileToken(url);
}

export function openDocFile(f: any) {
  Linking.openURL(fileHref(f)).catch(() => Alert.alert('Could not open', 'This file could not be opened.'));
}

export const fmtSize = (n?: number) => {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const fileIcon = (f: any) => {
  const m = String(f?.mimeType || f?.originalName || '').toLowerCase();
  if (m.includes('pdf')) return 'document-text';
  if (m.includes('image') || /\.(png|jpe?g|gif|webp)$/.test(m)) return 'image';
  if (m.includes('video')) return 'videocam';
  return 'document-attach';
};

/** Files as tappable rows — each opens on its own. */
export function FileList({ files, compact }: { files: any[]; compact?: boolean }) {
  if (!files?.length) return null;
  return (
    <View style={{ gap: 6, marginTop: compact ? 6 : 0 }}>
      {files.map((f, i) => (
        <TouchableOpacity key={`${f?.storedName || f?.originalName || i}-${i}`} style={[c.file, compact && c.fileCompact]}
          onPress={() => openDocFile(f)} accessibilityRole="button" accessibilityLabel={`Open ${f?.originalName || 'file'}`}>
          <View style={c.fileIcon}><Ionicons name={fileIcon(f) as any} size={16} color={Colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={c.fileName} numberOfLines={1}>{f?.originalName || 'File'}</Text>
            {f?.fileSize ? <Text style={c.fileSize}>{fmtSize(f.fileSize)}</Text> : null}
          </View>
          <Ionicons name="open-outline" size={16} color={Colors.textLight} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Comments ─────────────────────────────────────────────────────────────────

export interface CommentApi {
  list: (id: string) => Promise<any>;
  add: (id: string, data: object) => Promise<any>;
  update: (cid: string, data: object) => Promise<any>;
  remove: (cid: string) => Promise<any>;
  /** Staff only — a student's route has no likes. */
  like?: (cid: string) => Promise<any>;
}

const ROLE_LABEL: Record<string, string> = { school_admin: 'Admin', teacher: 'Teacher', student: 'Student', parent: 'Parent' };
const ROLE_TONE: Record<string, { bg: string; color: string }> = {
  school_admin: { bg: '#F3E8FF', color: '#7E22CE' },
  teacher:      { bg: '#EEF2FF', color: '#4338CA' },
  student:      { bg: '#E0F2FE', color: '#0369A1' },
  parent:       { bg: '#CCFBF1', color: '#0F766E' },
};

const when = (d?: string) => {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, ${x
    .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()}`;
};

const initials = (name?: string) =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';

/**
 * What deleting a comment will do. An admin's delete takes the replies with
 * it. Anyone else deletes only their own words: replies from other people
 * stay, under "This comment was deleted". (Same words as the web.)
 */
function deleteText(cm: any, adminSide: boolean) {
  if (cm.deleted) return 'Remove this deleted comment and every reply under it?';
  const replies = cm.replies || [];
  if (!replies.length) return cm.mine ? 'Delete your comment?' : `Delete ${cm.author?.name || 'this person'}’s comment?`;
  if (adminSide) return `Delete this comment? The ${replies.length === 1 ? 'reply' : `${replies.length} replies`} under it go with it.`;
  return replies.some((r: any) => !r.mine)
    ? 'Delete your comment? The replies from other people stay, under a note that your comment was deleted.'
    : 'Delete your comment? Your replies under it go with it.';
}

const Chip = ({ icon, label, onPress, on, danger, a11y }: {
  icon: string; label: string; onPress: () => void; on?: boolean; danger?: boolean; a11y?: string;
}) => (
  <TouchableOpacity style={[c.chip, on && c.chipOn, danger && c.chipDanger]} onPress={onPress}
    accessibilityRole="button" accessibilityLabel={a11y || label}>
    <Ionicons name={icon as any} size={13} color={danger ? Colors.danger : on ? Colors.primary : Colors.textSecondary} />
    <Text style={[c.chipText, on && { color: Colors.primary }, danger && { color: Colors.danger }]}>{label}</Text>
  </TouchableOpacity>
);

type Handlers = {
  onReply?: (cm: any, parent: any) => void;
  onEdit: (cm: any) => void;
  onPin: (cm: any) => void;
  onDelete: (cm: any) => void;
  onLike?: (cm: any) => void;
};

function CommentCard({ cm, parent, depth = 0, h }: { cm: any; parent?: any; depth?: number; h: Handlers }) {
  const replies = (cm.replies || []).map((r: any) => (
    <CommentCard key={r._id} cm={r} parent={cm} depth={depth + 1} h={h} />
  ));

  // Deleted by its author after others had replied — kept to hold their replies.
  if (cm.deleted) {
    return (
      <View style={[c.card, depth ? c.reply : null]}>
        <View style={c.goneRow}>
          <View style={c.goneIcon}><Ionicons name="trash-outline" size={14} color={Colors.textLight} /></View>
          <Text style={c.goneText}>This comment was deleted.</Text>
          {cm.canDelete ? <Chip icon="trash-outline" label="Remove thread" danger onPress={() => h.onDelete(cm)} /> : null}
        </View>
        {replies.length ? <View style={c.replies}>{replies}</View> : null}
      </View>
    );
  }

  const tone = ROLE_TONE[cm.author?.role] || { bg: Colors.surfaceAlt, color: Colors.textSecondary };
  return (
    <View style={[c.card, depth ? c.reply : null]} accessibilityLabel={`Comment by ${cm.mine ? 'you' : cm.author?.name}`}>
      <View style={c.head}>
        <View style={[c.avatar, { backgroundColor: tone.bg }, depth ? c.avatarSm : null]}>
          <Text style={[c.avatarText, { color: tone.color }]}>{initials(cm.author?.name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={c.nameRow}>
            <Text style={c.name} numberOfLines={1}>{cm.mine ? 'You' : cm.author?.name}</Text>
            {cm.author?.role ? (
              <View style={[c.role, { backgroundColor: tone.bg }]}>
                <Text style={[c.roleText, { color: tone.color }]}>{ROLE_LABEL[cm.author.role] || cm.author.role}</Text>
              </View>
            ) : null}
            {cm.isPinned ? (
              <View style={c.pinned}><Ionicons name="star" size={10} color={Colors.primary} /><Text style={c.pinnedText}>Pinned</Text></View>
            ) : null}
            {cm.visibility === 'staff' ? <View style={c.staff}><Text style={c.staffText}>Staff only</Text></View> : null}
          </View>
          <Text style={c.when}>{when(cm.createdAt)}{cm.isEdited ? ' · edited' : ''}</Text>
        </View>
      </View>

      {cm.body ? <Text style={c.body}>{cm.body}</Text> : null}
      <FileList files={cm.files || []} compact />

      <View style={c.actions}>
        {h.onLike ? (
          <Chip icon={cm.likedByMe ? 'heart' : 'heart-outline'} label={String(cm.likes || 0)} on={cm.likedByMe}
            onPress={() => h.onLike!(cm)} a11y={cm.likedByMe ? 'Unlike' : 'Like'} />
        ) : null}
        {h.onReply ? <Chip icon="return-down-forward-outline" label="Reply" onPress={() => h.onReply!(cm, parent)} /> : null}
        {cm.canEdit ? <Chip icon="create-outline" label="Edit" onPress={() => h.onEdit(cm)} a11y="Edit comment" /> : null}
        {cm.canPin && !depth ? (
          <Chip icon={cm.isPinned ? 'star' : 'star-outline'} label={cm.isPinned ? 'Unpin' : 'Pin'} on={cm.isPinned} onPress={() => h.onPin(cm)} />
        ) : null}
        {cm.canDelete ? <Chip icon="trash-outline" label="Delete" danger onPress={() => h.onDelete(cm)} a11y="Delete comment" /> : null}
      </View>

      {replies.length ? <View style={c.replies}>{replies}</View> : null}
    </View>
  );
}

/**
 * The whole discussion: a box to write in at the top, then the threads.
 * `adminSide` only changes what the delete question says — the server decides
 * what may be deleted.
 */
export function CommentsPanel({ docId, api, adminSide, onCount }: {
  docId: string; api: CommentApi; adminSide: boolean; onCount?: (n: number) => void;
}) {
  const [threads, setThreads] = useState<any[] | null>(null);
  const [failed, setFailed] = useState('');
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<any>(null);
  const [posting, setPosting] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = unwrap(await api.list(docId));
      setThreads(d?.threads || []);
      setFailed('');
      onCount?.(d?.summary?.total ?? 0);
    } catch (e: any) {
      setFailed(e?.message || 'The comments could not be loaded');
    }
  }, [docId, api]);

  useEffect(() => { setThreads(null); load(); }, [load]);

  const say = (e: any) => Alert.alert('Could not do that', e?.message || 'Something went wrong');

  const post = async () => {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    try {
      await api.add(docId, replyTo ? { body, parent: replyTo._id } : { body });
      setDraft(''); setReplyTo(null);
      await load();
    } catch (e) { say(e); } finally { setPosting(false); }
  };

  const saveEdit = async () => {
    const body = editText.trim();
    if (!body && !editing?.files?.length) return Alert.alert('Nothing to save', 'Write something, or delete the comment instead.');
    setSaving(true);
    try { await api.update(editing._id, { body }); setEditing(null); await load(); }
    catch (e) { say(e); } finally { setSaving(false); }
  };

  const h: Handlers = {
    // Replying under a deleted comment answers the reply itself — there is no
    // one to name on the deleted one. The server keeps it in the same thread.
    onReply: (cm, parent) => setReplyTo(parent && !parent.deleted ? parent : cm),
    onEdit: (cm) => { setEditing(cm); setEditText(cm.body || ''); },
    onPin: async (cm) => {
      try { await api.update(cm._id, { isPinned: !cm.isPinned }); await load(); } catch (e) { say(e); }
    },
    onDelete: async (cm) => {
      const title = cm.deleted ? 'Remove thread' : 'Delete comment';
      if (!(await confirmAsync(title, deleteText(cm, adminSide), 'Delete'))) return;
      try {
        await api.remove(cm._id);
        if (replyTo && String(replyTo._id) === String(cm._id)) setReplyTo(null);
        await load();
      } catch (e) { say(e); }
    },
    onLike: api.like ? async (cm) => {
      try { await api.like!(cm._id); await load(); } catch (e) { say(e); }
    } : undefined,
  };

  return (
    <View>
      <View style={c.composer}>
        {replyTo ? (
          <View style={c.replyTo}>
            <Ionicons name="return-down-forward-outline" size={13} color={Colors.textSecondary} />
            <Text style={c.replyToText} numberOfLines={1}>
              Replying to <Text style={{ fontWeight: '700' }}>{replyTo.mine ? 'your comment' : replyTo.author?.name}</Text>
            </Text>
            <TouchableOpacity onPress={() => setReplyTo(null)} accessibilityLabel="Cancel reply" hitSlop={8}>
              <Ionicons name="close" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ) : null}
        <TextInput
          style={c.composerInput} value={draft} onChangeText={setDraft} multiline maxLength={2000}
          placeholder={replyTo ? 'Write a reply…' : 'Write a comment or ask a question…'}
          placeholderTextColor={Colors.textLight} accessibilityLabel="Write a comment"
        />
        <TouchableOpacity style={[c.postBtn, (!draft.trim() || posting) && { opacity: 0.5 }]} onPress={post}
          disabled={!draft.trim() || posting} accessibilityRole="button" accessibilityLabel="Post comment">
          {posting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={c.postText}>{replyTo ? 'Post reply' : 'Post comment'}</Text>}
        </TouchableOpacity>
      </View>

      {failed ? <Text style={c.failed}>{failed}</Text> : null}
      {!threads && !failed ? <LoaderView /> : null}
      {threads && !threads.length ? <Empty icon="chatbubbles-outline" text="No comments yet" /> : null}
      {(threads || []).map((t) => <CommentCard key={t._id} cm={t} h={h} />)}

      <FormModal visible={!!editing} title="Edit your comment" onClose={saving ? () => {} : () => setEditing(null)}
        onSubmit={saveEdit} submitting={saving} submitLabel="Save">
        <Input label="Comment" value={editText} onChange={setEditText} multiline />
      </FormModal>
    </View>
  );
}

const c = StyleSheet.create({
  file: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
  },
  fileCompact: { padding: 8, backgroundColor: Colors.background },
  fileIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: TINT, alignItems: 'center', justifyContent: 'center' },
  fileName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  fileSize: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },

  composer: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg,
    padding: Spacing.sm, marginBottom: Spacing.md, gap: 8,
  },
  replyTo: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6,
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md,
  },
  replyToText: { flex: 1, fontSize: 12, color: Colors.textSecondary },
  composerInput: {
    minHeight: 64, maxHeight: 160, textAlignVertical: 'top', fontSize: 14, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: 10, backgroundColor: Colors.background,
  },
  postBtn: { alignSelf: 'flex-end', backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 9, minWidth: 110, alignItems: 'center' },
  postText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  failed: { fontSize: 13, color: Colors.danger, marginBottom: Spacing.sm },

  card: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg,
    padding: 12, marginBottom: 10,
  },
  reply: { borderWidth: 0, borderRadius: 0, padding: 0, paddingTop: 10, marginBottom: 0, backgroundColor: 'transparent' },
  replies: { marginTop: 8, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: Colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarSm: { width: 28, height: 28, borderRadius: 14 },
  avatarText: { fontSize: 12, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: 13.5, fontWeight: '700', color: Colors.text, maxWidth: '60%' },
  role: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5 },
  roleText: { fontSize: 10.5, fontWeight: '700' },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, backgroundColor: TINT },
  pinnedText: { fontSize: 10.5, fontWeight: '700', color: Colors.primary },
  staff: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, backgroundColor: Colors.surfaceAlt },
  staffText: { fontSize: 10.5, fontWeight: '700', color: Colors.textSecondary },
  when: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
  body: { fontSize: 14, lineHeight: 20, color: Colors.text, marginTop: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  chipOn: { borderColor: Colors.primary, backgroundColor: TINT },
  chipDanger: { borderColor: '#FECACA' },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },

  goneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  goneIcon: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border,
  },
  goneText: { fontSize: 13, fontStyle: 'italic', color: Colors.textSecondary, flexShrink: 1 },
});
