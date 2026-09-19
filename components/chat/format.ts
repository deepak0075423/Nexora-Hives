/**
 * Chat formatting — times, names, avatars, the line under a name. The same
 * rules the web chat uses (school-frontend/src/pages/chat/chatFormat.js), so a
 * conversation reads the same on the phone and in the browser.
 */
import { BASE_URL } from '@/api/axios';

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d: string | Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const daysAgo = (d: string | Date) => Math.round((startOfDay(new Date()).getTime() - startOfDay(d).getTime()) / DAY);

/** "09:12 am" */
export function clock(d?: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
}

/** List timestamp: "09:12 am" today, "Yesterday", "6 Sept", "6 Sept 2025" */
export function listTime(d?: string | null) {
  if (!d) return '';
  const dt = new Date(d);
  const ago = daysAgo(dt);
  if (ago <= 0) return clock(d);
  if (ago === 1) return 'Yesterday';
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  if (dt.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return dt.toLocaleDateString('en-IN', opts);
}

/** Day separator: "Today", "Yesterday", "8 Sept 2026" */
export function dayLabel(d: string) {
  const ago = daysAgo(d);
  if (ago <= 0) return 'Today';
  if (ago === 1) return 'Yesterday';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const sameDay = (a: string, b: string) => startOfDay(a).getTime() === startOfDay(b).getTime();

export function lastSeen(d?: string | null) {
  if (!d) return 'Offline';
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return 'Last seen just now';
  if (mins < 60) return `Last seen ${mins} min ago`;
  const ago = daysAgo(d);
  if (ago <= 0) return `Last seen today at ${clock(d)}`;
  if (ago === 1) return `Last seen yesterday at ${clock(d)}`;
  return `Last seen ${new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
}

// Backend role names (the app's own user.role says 'admin' for school_admin).
export const ROLE_LABEL: Record<string, string> = {
  school_admin: 'School Admin',
  super_admin:  'Super Admin',
  teacher:      'Teacher',
  student:      'Student',
  parent:       'Parent',
};

/** The app's role name → the backend's, for comparing against chat data. */
export const backendRole = (role?: string) =>
  role === 'admin' ? 'school_admin' : role === 'super-admin' ? 'super_admin' : (role || '');

// ── Avatars ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#3b3fb6', '#c99a2e', '#8b7cf0', '#25a35a', '#e2435f', '#4338ca', '#0e8fc6', '#d9661f'];

export function avatarColor(seed = '') {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** "Teacher 10" → "T1", "Anita Sharma" → "AS"; groups take one letter. */
export function initials(name = '', single = false) {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const first = (w: string) => [...w][0]?.toUpperCase() ?? '';
  if (single || words.length === 1) return first(words[0]);
  return first(words[0]) + first(words[1]);
}

export const isGroup = (chat: any) => !!chat && (chat.type === 'group' || chat.type === 'broadcast');

export function chatName(chat: any) {
  if (!chat) return '';
  return chat.displayName || chat.name || (chat.type === 'direct' ? 'Direct chat' : 'Group');
}

/** "Anita Sharma" → "Anita"; "Mr. Rahul Verma" → "Mr. Rahul". */
export function shortName(name = '') {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return /^(mr|mrs|ms|miss|dr|prof|sir)\.?$/i.test(words[0]) && words[1] ? `${words[0]} ${words[1]}` : words[0];
}

export function previewText(chat: any, myId: string) {
  const m = chat?.lastMessage;
  if (!m) return chat?.type === 'direct' ? 'Say hello 👋' : (chat?.description || 'No messages yet');
  if (m.isDeleted) return 'This message was deleted';
  const body = m.content || (m.type === 'image' ? 'Photo' : m.hasAttachments || m.type === 'file' ? 'Attachment' : '');
  if (m.sender && String(m.sender._id) === String(myId)) return `You: ${body}`;
  if (isGroup(chat) && m.sender?.name) return `${shortName(m.sender.name)}: ${body}`;
  return body;
}

/** The line(s) under a direct conversation's name, by who the other person is. */
export function personLine(person: any): string[] {
  if (!person) return [];
  switch (person.role) {
    case 'teacher': {
      const parts: string[] = [];
      if (person.subjects?.length) parts.push(`Teaches: ${person.subjects.join(', ')}`);
      else if (person.designation) parts.push(person.designation);
      if (person.classes?.length) parts.push(`Classes: ${person.classes.join(', ')}`);
      return parts.length ? parts : ['Teacher'];
    }
    case 'student': {
      const parts: string[] = [];
      if (person.className) parts.push(`Class ${person.className}`);
      else if (person.pendingClass) parts.push(`Class ${person.pendingClass} · section pending`);
      else parts.push('Student');
      if (person.rollNumber) parts.push(`Roll No. ${person.rollNumber}`);
      return parts;
    }
    case 'parent': {
      const kids = (person.children || []).map((k: any) => (k.className ? `${k.name} (${k.className})` : k.name));
      return [kids.length ? `Parent of ${kids.join(', ')}` : 'Parent'];
    }
    default:
      return [ROLE_LABEL[person.role] || ''];
  }
}

/** A short message keeps its time beside it; a longer one puts it underneath. */
export const fitsInline = (msg: any) =>
  !msg.isDeleted && !(msg.attachments || []).length && !msg.replyTo && !msg.isForwarded
  && !/\n/.test(msg.content || '') && [...(msg.content || '')].length <= 18;

/** A fresh id for one send attempt (Hermes has no crypto.randomUUID). */
export function newClientId() {
  const g: any = globalThis as any;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  const r = () => Math.random().toString(36).slice(2, 10);
  return `m${Date.now().toString(36)}${r()}${r()}`;
}

const FILE_BASE = BASE_URL.replace(/\/api\/?$/, '');
export const fileHref = (u?: string) => (!u ? '' : u.startsWith('http') ? u : `${FILE_BASE}${u.startsWith('/') ? '' : '/'}${u}`);

export const errText = (e: any) => e?.data?.message ?? e?.message ?? 'Something went wrong';

// The chat module's colours — the web chat's indigo, so both read as one product.
export const C = {
  brand: '#4F46E5',
  brandDark: '#4338CA',
  brandSoft: '#EEF0FE',
  brandMuted: '#7D72F2',
  ink: '#111827',
  ink2: '#1F2937',
  ink3: '#4B5563',
  muted: '#6B7280',
  faint: '#9CA3AF',
  line: '#E6E8EF',
  line2: '#EEF0F4',
  field: '#E1E4EC',
  canvas: '#F7F8FB',
  bubbleIn: '#EDEFF5',
  bubbleOut: '#E8E7FC',
  online: '#22C55E',
  danger: '#DC2626',
  amberBg: '#FFF7E6',
  amberInk: '#92400E',
};
