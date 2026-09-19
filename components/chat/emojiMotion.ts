/**
 * Animated single-emoji messages — the phone's port of the web chat's
 * pages/chat/emojiMotion.js.
 *
 * A message that is exactly ONE emoji shows large and, when it arrives live
 * (sent or received — never when history loads), plays one short animation
 * that suits the emoji: a heart beats, a hand waves, fire flickers, a party
 * popper bursts. It plays once and settles to the plain emoji. Two emoji, or
 * an emoji with text, is an ordinary message.
 *
 * The web's CSS keyframes are kept here as data (`FRAMES`), and AnimatedEmoji
 * drives them with React Native's Animated — no animation library.
 */
import { AccessibilityInfo } from 'react-native';

// ── Is this message one emoji? ────────────────────────────────────────────────

const ZWJ = String.fromCharCode(0x200d);

// One emoji "character" as people see it: skin tones, variation selectors and
// ZWJ families fold into one; flags are two regional indicators; keycaps are a
// digit/#/* with U+20E3. Built from a string so no invisible character ever
// sits in the source.
let ONE_EMOJI_RE: RegExp | null = null;
let NORMALIZE_RE: RegExp | null = null;
try {
  ONE_EMOJI_RE = new RegExp(
    '^(?:'
    + '\\p{Regional_Indicator}\\p{Regional_Indicator}'
    + '|[#*0-9]\\uFE0F?\\u20E3'
    + '|\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})*(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})*)*'
    + ')$',
    'u',
  );
  NORMALIZE_RE = new RegExp('[\\uFE0F\\u{1F3FB}-\\u{1F3FF}]', 'gu');
} catch {
  // An engine without Unicode property escapes: no big emoji, no animation —
  // every message stays an ordinary bubble rather than the screen crashing.
}

const TEXT_SYMBOLS = new Set(['©', '®', '™', '‼', '⁉', '↔', '↕', '▪', '▫', '◻', '◼']);

/** The emoji, when the message is exactly one — otherwise null. */
export function singleEmoji(text?: string | null): string | null {
  if (!ONE_EMOJI_RE || typeof text !== 'string') return null;
  const t = text.trim();
  if (!t || t.length > 32) return null;
  if (!ONE_EMOJI_RE.test(t)) return null;
  if (TEXT_SYMBOLS.has(t)) return null;
  return t;
}

// ── Which animation ───────────────────────────────────────────────────────────

const normalize = (e: string) => (NORMALIZE_RE ? e.replace(NORMALIZE_RE, '') : e);

export type Kind =
  | 'heart' | 'love' | 'kiss' | 'laugh' | 'smile' | 'wink' | 'thumbs' | 'thumbsDown' | 'wave' | 'clap'
  | 'pray' | 'muscle' | 'fire' | 'party' | 'gift' | 'sad' | 'shock' | 'boom' | 'angry' | 'think'
  | 'cool' | 'sleep' | 'sparkle' | 'stamp' | 'no' | 'eyes' | 'rocket' | 'sun' | 'cold' | 'hot'
  | 'sick' | 'ball' | 'steam' | 'handshake' | 'flip' | 'glow' | 'ring' | 'ghost' | 'pop';

const GROUPS: Partial<Record<Kind, string>> = {
  heart:      '❤ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💖 💗 💓 💞 💕 💘 💝 ❣ 💟 ♥ 🩷 🩵 🩶',
  love:       '😍 🥰 😻 🤩',
  kiss:       '😘 😗 😙 😚 💋',
  laugh:      '😂 🤣 😆 😹 😁 😄 😅',
  smile:      '😀 😃 😊 🙂 😇 ☺ 😺 😸 🤗 🫠',
  wink:       '😉 😜 😝 😛 🤪 😋',
  thumbs:     '👍 👌 🤙 ✌ 🤞 🫡 🤘',
  thumbsDown: '👎',
  wave:       '👋 🖐 ✋ 🤚 🫶',
  clap:       '👏 🙌 🤲 🙆',
  pray:       '🙏',
  muscle:     '💪 🦾',
  fire:       '🔥',
  party:      '🎉 🎊 🥳 🎈 🪅 🎆 🎇',
  gift:       '🎁 🎂 🍰 🧁 🍫 🍭',
  sad:        '😢 😭 😥 😞 😔 😿 🥺 😓 ☹ 🙁 😟 😕 🥲',
  shock:      '😮 😯 😲 😱 😳 🙀 😨 😰 😧 😦',
  boom:       '🤯 💥 💣',
  angry:      '😡 😠 🤬 😤 👿 💢',
  think:      '🤔 🧐 🤨 🫤 😐 😑',
  cool:       '😎 🤓 🕶',
  sleep:      '😴 💤 🥱 😪',
  sparkle:    '⭐ 🌟 ✨ 💫 🌠',
  stamp:      '💯 ✅ ✔ ☑ 🏆 🥇 🎯 🏅',
  no:         '❌ 🚫 ⛔ 🙅 ❎',
  eyes:       '👀 👁',
  rocket:     '🚀 ✈ 🛫',
  sun:        '☀ 🌞 🌈 🌻 🌸 🌼',
  cold:       '🥶 ❄ ☃ ⛄',
  hot:        '🥵 🌶',
  sick:       '🤢 🤮 🤒 😷 🤧',
  ball:       '⚽ 🏀 🏐 🏈 🎾 ⚾ 🥎 🏏',
  steam:      '☕ 🍵 🍜 🍲',
  handshake:  '🤝',
  flip:       '📚 📖 📝 📒 📓 ✏ 🖊',
  glow:       '💡 🔦 ⚡',
  ring:       '🔔 🛎 ⏰',
  ghost:      '👻 🙈 🙉 🙊 🫣',
};

const BY_EMOJI = new Map<string, Kind>();
for (const [kind, list] of Object.entries(GROUPS)) {
  for (const e of (list as string).split(' ')) BY_EMOJI.set(normalize(e), kind as Kind);
}
// Heart-on-fire and mending heart are ZWJ sequences; join them in code.
BY_EMOJI.set(normalize(`❤${ZWJ}🔥`), 'heart');
BY_EMOJI.set(normalize(`❤${ZWJ}🩹`), 'heart');

/** The animation for this emoji; anything unlisted gets a friendly pop. */
export function motionFor(emoji?: string | null): Kind {
  if (!emoji) return 'pop';
  const n = normalize(emoji);
  const hit = BY_EMOJI.get(n);
  if (hit) return hit;
  // A family or a profession (ZWJ sequence) animates like its first person.
  const first = [...n.split(ZWJ)[0]][0];
  return (first && BY_EMOJI.get(first)) || 'pop';
}

// ── Keyframes ─────────────────────────────────────────────────────────────────
// Each stop is a whole state: anything a stop leaves out is at rest (no move,
// scale 1, no rotation, fully visible) — which is how the web's CSS keyframes
// were written too.

export type Frame = { at: number; x?: number; y?: number; s?: number; sx?: number; sy?: number; r?: number; k?: number; o?: number };
type Spec = { ms: number; origin?: string; frames: Frame[] };

const f = (at: number, v: Omit<Frame, 'at'> = {}): Frame => ({ at, ...v });
const IN = (s = 0.3) => f(0, { s, o: 0 });

export const FRAMES: Record<Kind, Spec> = {
  pop:        { ms: 1000, frames: [IN(0.2), f(0.4, { s: 1.25 }), f(0.6, { s: 0.9 }), f(0.78, { s: 1.06 }), f(1)] },
  heart:      { ms: 1500, frames: [IN(0.2), f(0.14, { s: 1.1 }), f(0.24, { s: 0.92 }), f(0.36, { s: 1.3 }), f(0.46, { s: 0.98 }), f(0.58, { s: 1.22 }), f(0.7), f(1)] },
  love:       { ms: 1500, frames: [IN(0.2), f(0.3, { s: 1.2, r: -6 }), f(0.45, { s: 0.95, r: 4 }), f(0.6, { y: -5, s: 1.1, r: -3 }), f(0.76), f(1)] },
  kiss:       { ms: 1400, frames: [IN(0.2), f(0.3, { s: 1.1 }), f(0.45, { x: -3, s: 0.95, r: -10 }), f(0.56, { x: 4, s: 1.12, r: 6 }), f(0.76), f(1)] },
  laugh:      { ms: 1400, origin: '50% 80%', frames: [IN(), f(0.16, { s: 1.08 }), f(0.26, { y: -6, r: -14 }), f(0.36, { r: 12 }), f(0.46, { y: -6, r: -12 }), f(0.56, { r: 10 }), f(0.66, { y: -3, r: -7 }), f(0.78, { r: 4 }), f(0.9, { r: -2 }), f(1)] },
  smile:      { ms: 1100, frames: [IN(), f(0.35, { y: -6, s: 1.15 }), f(0.55, { s: 0.95 }), f(0.72, { y: -3, s: 1.04 }), f(1)] },
  wink:       { ms: 1200, frames: [IN(), f(0.3, { s: 1.1 }), f(0.5, { s: 1.05, r: -14 }), f(0.64, { r: 6 }), f(0.8, { r: -2 }), f(1)] },
  thumbs:     { ms: 1200, origin: '50% 90%', frames: [f(0, { y: 18, s: 0.3, r: -45, o: 0 }), f(0.4, { y: -10, s: 1.25, r: 12 }), f(0.6, { s: 0.94, r: -6 }), f(0.78, { s: 1.05, r: 3 }), f(1)] },
  thumbsDown: { ms: 1200, origin: '50% 10%', frames: [f(0, { y: -18, s: 0.3, r: 45, o: 0 }), f(0.4, { y: 10, s: 1.2, r: -10 }), f(0.6, { s: 0.95, r: 5 }), f(1)] },
  wave:       { ms: 1600, origin: '75% 85%', frames: [IN(), f(0.14), f(0.24, { r: 24 }), f(0.36, { r: -10 }), f(0.48, { r: 24 }), f(0.6, { r: -8 }), f(0.72, { r: 18 }), f(0.84, { r: -4 }), f(1)] },
  clap:       { ms: 1400, frames: [IN(), f(0.18), f(0.28, { sx: 1.18, sy: 0.86 }), f(0.36, { sx: 0.9, sy: 1.08 }), f(0.44, { sx: 1.18, sy: 0.86 }), f(0.52, { sx: 0.92, sy: 1.06 }), f(0.6, { sx: 1.14, sy: 0.9 }), f(0.7, { sx: 0.97, sy: 1.03 }), f(1)] },
  pray:       { ms: 1400, origin: '50% 100%', frames: [IN(), f(0.28, { s: 1.06 }), f(0.46, { y: 6, s: 0.96, r: -3 }), f(0.62, { s: 1.04 }), f(0.78, { y: 4, s: 0.98 }), f(1)] },
  muscle:     { ms: 1300, frames: [IN(), f(0.25, { s: 1.1 }), f(0.38, { s: 1.3, r: -10 }), f(0.5), f(0.62, { s: 1.25, r: -8 }), f(0.76), f(1)] },
  fire:       { ms: 1600, origin: '50% 100%', frames: [f(0, { sx: 0.4, sy: 0.1, o: 0 }), f(0.18, { sx: 1.08, sy: 1.25 }), f(0.28, { sx: 0.95, sy: 0.9, k: 4 }), f(0.38, { sx: 1.05, sy: 1.2, k: -4 }), f(0.48, { sx: 0.97, sy: 0.94, k: 3 }), f(0.58, { sx: 1.04, sy: 1.14, k: -3 }), f(0.7, { sx: 0.99, sy: 0.97, k: 1 }), f(0.84, { sx: 1.02, sy: 1.05 }), f(1)] },
  party:      { ms: 1500, origin: '30% 80%', frames: [f(0, { s: 0.2, r: -40, o: 0 }), f(0.3, { s: 1.3, r: 12 }), f(0.45, { s: 0.92, r: -6 }), f(0.6, { s: 1.06, r: 3 }), f(0.8, { s: 0.99, r: -1 }), f(1)] },
  gift:       { ms: 1400, frames: [IN(), f(0.14), f(0.2, { r: -8 }), f(0.26, { r: 8 }), f(0.32, { r: -8 }), f(0.38, { r: 6 }), f(0.44), f(0.58, { y: -8, s: 1.3 }), f(0.72, { s: 0.95 }), f(0.86, { s: 1.03 }), f(1)] },
  sad:        { ms: 1800, origin: '50% 90%', frames: [IN(), f(0.22, { s: 1.04 }), f(0.4, { y: 6, r: -7, s: 0.96 }), f(0.62, { y: 8, r: -8, s: 0.95 }), f(0.82, { y: 3, r: -3 }), f(1)] },
  shock:      { ms: 1200, frames: [IN(), f(0.22, { s: 1.35 }), f(0.3, { x: -5, s: 1.32 }), f(0.36, { x: 5, s: 1.32 }), f(0.42, { x: -4, s: 1.3 }), f(0.48, { x: 4, s: 1.3 }), f(0.54, { x: -2, s: 1.28 }), f(0.6, { s: 1.2 }), f(0.78, { s: 0.96 }), f(1)] },
  boom:       { ms: 1400, frames: [IN(0.2), f(0.3, { s: 0.85 }), f(0.38, { x: -2, s: 0.8 }), f(0.44, { x: 2, s: 0.8 }), f(0.52, { s: 1.55 }), f(0.62, { s: 0.9 }), f(0.76, { s: 1.08 }), f(1)] },
  angry:      { ms: 1400, frames: [IN(), f(0.18, { s: 1.15 }), f(0.24, { x: -6, r: -4 }), f(0.3, { x: 6, r: 4 }), f(0.36, { x: -6, r: -4 }), f(0.42, { x: 6, r: 4 }), f(0.48, { x: -4 }), f(0.54, { x: 4 }), f(0.62), f(1)] },
  think:      { ms: 1500, origin: '50% 85%', frames: [IN(), f(0.25, { s: 1.05 }), f(0.4, { r: -14 }), f(0.56, { y: -2, r: -14 }), f(0.7, { r: 8 }), f(0.85, { r: -3 }), f(1)] },
  cool:       { ms: 1200, frames: [f(0, { y: -36, s: 0.8, o: 0 }), f(0.4, { y: 5, s: 1.06 }), f(0.55, { y: -3 }), f(0.7, { r: -6 }), f(0.85, { r: 2 }), f(1)] },
  sleep:      { ms: 2100, origin: '50% 90%', frames: [IN(), f(0.2), f(0.4, { r: -7 }), f(0.6, { r: 6 }), f(0.8, { r: -4 }), f(1)] },
  sparkle:    { ms: 1400, frames: [f(0, { s: 0.2, r: -200, o: 0 }), f(0.5, { s: 1.25, r: 18 }), f(0.7, { s: 0.95, r: -6 }), f(0.85, { s: 1.04, r: 2 }), f(1)] },
  stamp:      { ms: 1000, frames: [f(0, { s: 2.6, o: 0 }), f(0.35, { s: 0.86 }), f(0.5, { s: 1.1 }), f(0.66, { s: 0.97 }), f(0.82, { s: 1.02 }), f(1)] },
  no:         { ms: 1200, frames: [IN(), f(0.25, { s: 1.1 }), f(0.34, { x: -9, r: -8 }), f(0.43, { x: 9, r: 8 }), f(0.52, { x: -7, r: -5 }), f(0.61, { x: 7, r: 5 }), f(0.7, { x: -3 }), f(0.8), f(1)] },
  eyes:       { ms: 1400, frames: [IN(), f(0.22, { s: 1.05 }), f(0.34, { x: -7 }), f(0.52, { x: -7 }), f(0.64, { x: 7 }), f(0.82, { x: 7 }), f(1)] },
  rocket:     { ms: 1400, frames: [f(0, { x: -40, y: 40, s: 0.5, o: 0 }), f(0.4, { x: 5, y: -8, s: 1.12 }), f(0.55), f(0.65, { x: -2, y: 2 }), f(0.75, { x: 2, y: -2 }), f(0.85, { x: -1, y: 1 }), f(1)] },
  sun:        { ms: 1500, frames: [f(0, { s: 0.3, r: -120, o: 0 }), f(0.55, { s: 1.15, r: 15 }), f(0.78, { s: 0.97, r: -4 }), f(1)] },
  cold:       { ms: 1400, frames: [IN(), f(0.2, { s: 1.05 }), ...[0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7].map((at, i) => f(at, { x: (i % 2 ? 1 : -1) * (at > 0.52 ? 2 : 3) })), f(0.76), f(1)] },
  hot:        { ms: 1400, origin: '50% 100%', frames: [IN(), f(0.25, { s: 1.05 }), f(0.4, { sx: 1.08, sy: 0.9 }), f(0.55, { sx: 0.95, sy: 1.06, r: -3 }), f(0.7, { sx: 1.04, sy: 0.95, r: 3 }), f(0.85), f(1)] },
  sick:       { ms: 1400, frames: [IN(), f(0.25, { s: 1.02 }), f(0.4, { y: 3, r: -9 }), f(0.55, { y: 1, r: 7 }), f(0.7, { y: 3, r: -5 }), f(0.85, { r: 2 }), f(1)] },
  ball:       { ms: 1400, frames: [f(0, { y: -70, r: -180, o: 0 }), f(0.3, { sx: 1.12, sy: 0.88 }), f(0.45, { y: -26, sx: 0.95, sy: 1.05, r: 90 }), f(0.6, { sx: 1.06, sy: 0.94, r: 180 }), f(0.72, { y: -9, r: 270 }), f(0.84, { sx: 1.02, sy: 0.98, r: 340 }), f(1, { r: 360 })] },
  steam:      { ms: 1100, frames: [IN(), f(0.35, { y: -6, s: 1.15 }), f(0.55, { s: 0.95 }), f(0.72, { y: -3, s: 1.04 }), f(1)] },
  handshake:  { ms: 1200, frames: [IN(), f(0.25, { s: 1.05 }), f(0.35, { y: -7 }), f(0.45, { y: 5 }), f(0.55, { y: -6 }), f(0.65, { y: 4 }), f(0.75, { y: -2 }), f(1)] },
  flip:       { ms: 1200, frames: [IN(), f(0.3, { s: 1.05 }), f(0.5, { s: 1.05, sx: -1 }), f(0.7, { s: 1.05 }), f(0.85, { s: 0.98 }), f(1)] },
  glow:       { ms: 1400, frames: [IN(), f(0.3, { s: 1.15 }), f(0.5, { s: 1.05 }), f(0.7), f(1)] },
  ring:       { ms: 1400, origin: '50% 8%', frames: [IN(), f(0.16), f(0.26, { r: 18 }), f(0.36, { r: -16 }), f(0.46, { r: 13 }), f(0.56, { r: -10 }), f(0.66, { r: 7 }), f(0.76, { r: -4 }), f(0.86, { r: 2 }), f(1)] },
  ghost:      { ms: 1300, frames: [IN(), f(0.3, { s: 1.1 }), f(0.45, { y: -6, r: -6 }), f(0.6, { y: 2, r: 6 }), f(0.75, { y: -3, r: -3 }), f(1)] },
};

// ── Particles ─────────────────────────────────────────────────────────────────

export type ParticleKind = 'rise' | 'zz' | 'burst' | 'spark' | 'drop' | 'twinkle' | 'steam' | 'puff';
export type Particle = { kind: ParticleKind; char?: string; dx: number; dy: number; s?: number; r?: number; c?: string; delay: number; dur: number };

const CONFETTI = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

/** The little things that fly off the emoji (same set and timing as the web). */
export function particlesFor(kind: Kind): Particle[] {
  const P = (k: ParticleKind, char: string | undefined, v: Omit<Particle, 'kind' | 'char'>): Particle => ({ kind: k, char, ...v });
  switch (kind) {
    case 'heart':
    case 'love':
      return [
        P('rise', '❤️', { dx: -34, dy: -78, s: 0.42, delay: 350, dur: 1100 }),
        P('rise', '💕', { dx: 30, dy: -90, s: 0.38, delay: 500, dur: 1100 }),
        P('rise', '❤️', { dx: 6, dy: -104, s: 0.3, delay: 650, dur: 1000 }),
        P('rise', '💗', { dx: -12, dy: -70, s: 0.28, delay: 800, dur: 900 }),
      ];
    case 'kiss':
      return [P('rise', '❤️', { dx: 46, dy: -50, s: 0.45, delay: 450, dur: 1000 })];
    case 'party':
      return Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        const rr = 58 + (i % 3) * 14;
        return P('burst', undefined, {
          dx: Math.round(Math.cos(a) * rr), dy: Math.round(Math.sin(a) * rr) - 18,
          r: (i % 2 ? 1 : -1) * (140 + i * 20), c: CONFETTI[i % CONFETTI.length],
          delay: 250 + (i % 4) * 30, dur: 1200,
        });
      });
    case 'boom':
      return Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return P('spark', undefined, { dx: Math.round(Math.cos(a) * 62), dy: Math.round(Math.sin(a) * 62), c: i % 2 ? '#f97316' : '#facc15', delay: 450, dur: 800 });
      });
    case 'sad':
      return [
        P('drop', '💧', { dx: -12, dy: 44, s: 0.34, delay: 550, dur: 1000 }),
        P('drop', '💧', { dx: 14, dy: 40, s: 0.28, delay: 900, dur: 900 }),
      ];
    case 'sleep':
      return [
        P('zz', 'z', { dx: 26, dy: -40, s: 0.55, delay: 300, dur: 1300 }),
        P('zz', 'z', { dx: 40, dy: -62, s: 0.7, delay: 700, dur: 1300 }),
        P('zz', 'Z', { dx: 56, dy: -86, s: 0.85, delay: 1100, dur: 1100 }),
      ];
    case 'sparkle':
    case 'clap':
    case 'gift':
    case 'pray':
      return [
        P('twinkle', '✨', { dx: -40, dy: -30, s: 0.42, delay: 250, dur: 900 }),
        P('twinkle', '✨', { dx: 42, dy: -22, s: 0.36, delay: 400, dur: 900 }),
        P('twinkle', '✨', { dx: 30, dy: 34, s: 0.3, delay: 550, dur: 800 }),
        P('twinkle', '✨', { dx: -34, dy: 30, s: 0.28, delay: 700, dur: 700 }),
      ];
    case 'cool':
      return [P('twinkle', '✨', { dx: 30, dy: -22, s: 0.4, delay: 550, dur: 700 })];
    case 'angry':
      return [P('twinkle', '💢', { dx: 34, dy: -32, s: 0.45, delay: 300, dur: 1000 })];
    case 'glow':
      return [
        P('twinkle', '✨', { dx: -30, dy: -30, s: 0.34, delay: 400, dur: 800 }),
        P('twinkle', '✨', { dx: 32, dy: -26, s: 0.3, delay: 550, dur: 800 }),
      ];
    case 'steam':
      return [
        P('steam', undefined, { dx: -8, dy: -64, delay: 300, dur: 1400 }),
        P('steam', undefined, { dx: 8, dy: -72, delay: 600, dur: 1300 }),
        P('steam', undefined, { dx: 0, dy: -60, delay: 900, dur: 1000 }),
      ];
    case 'rocket':
      return [
        P('puff', undefined, { dx: -34, dy: 30, delay: 200, dur: 900 }),
        P('puff', undefined, { dx: -48, dy: 44, delay: 320, dur: 900 }),
        P('puff', undefined, { dx: -26, dy: 42, delay: 440, dur: 900 }),
      ];
    case 'cold':
      return [
        P('twinkle', '❄️', { dx: -38, dy: -26, s: 0.34, delay: 350, dur: 1000 }),
        P('twinkle', '❄️', { dx: 38, dy: -10, s: 0.3, delay: 600, dur: 900 }),
      ];
    default:
      return [];
  }
}

/** Keyframes for one particle, from its own offsets. */
export function particleFrames(p: Particle): Frame[] {
  const s = p.s ?? 1;
  switch (p.kind) {
    case 'rise':
    case 'zz':
    case 'steam':
      return [f(0, { s: s * 0.4, o: 0 }), f(0.2, { x: p.dx * 0.2, y: p.dy * 0.2, s, o: 1 }), f(1, { x: p.dx, y: p.dy, s, o: 0 })];
    case 'burst':
      return [f(0, { s: 0.3 }), f(0.55, { x: p.dx, y: p.dy, r: p.r ?? 0 }), f(1, { x: p.dx, y: p.dy + 36, s: 0.9, r: (p.r ?? 0) * 1.6, o: 0 })];
    case 'spark':
      return [f(0, { s: 0.2 }), f(1, { x: p.dx, y: p.dy, s: 1.1, o: 0 })];
    case 'drop':
      return [f(0, { x: p.dx, s: 0, o: 0 }), f(0.25, { x: p.dx, s, o: 1 }), f(1, { x: p.dx, y: p.dy, s, o: 0 })];
    case 'twinkle':
      return [f(0, { x: p.dx, y: p.dy, s: 0, r: -30, o: 0 }), f(0.45, { x: p.dx, y: p.dy, s, r: 10 }), f(1, { x: p.dx, y: p.dy, s: 0, r: 40, o: 0 })];
    case 'puff':
      return [f(0, { s: 0.3, o: 0 }), f(0.3, { x: p.dx * 0.3, y: p.dy * 0.3, s: 0.69 }), f(1, { x: p.dx, y: p.dy, s: 1.6, o: 0 })];
    default:
      return [f(0), f(1)];
  }
}

/** Total play time: the emoji's own motion or its last particle, whichever ends later. */
export function durationOf(kind: Kind) {
  const own = FRAMES[kind]?.ms ?? 1000;
  const parts = particlesFor(kind).reduce((m, p) => Math.max(m, p.delay + p.dur), 0);
  return Math.max(own, parts);
}

// Messages whose animation already played on this device this session, so
// reopening a conversation never replays them.
const played = new Set<string>();
export const hasPlayed = (key?: string | null) => !!key && played.has(key);
export const markPlayed = (key?: string | null) => { if (key) played.add(key); };

// Reduced motion: read once, then follow the system setting.
let reduced = false;
AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { reduced = !!v; }).catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => { reduced = !!v; });
export const prefersReducedMotion = () => reduced;
