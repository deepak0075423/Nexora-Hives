import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  motionFor, FRAMES, particlesFor, particleFrames, hasPlayed, markPlayed, prefersReducedMotion,
  type Frame, type Particle,
} from './emojiMotion';

const NATIVE = Platform.OS !== 'web';
const BOX = 76;

/** Keyframes → an Animated style: one interpolation per property that moves. */
function styleFor(t: Animated.Value, frames: Frame[]) {
  const input = frames.map((fr) => fr.at);
  const build = (key: keyof Frame, rest: number, unit = '') => {
    const out = frames.map((fr) => (fr[key] ?? rest) as number);
    if (out.every((v) => v === rest)) return null;
    return t.interpolate({ inputRange: input, outputRange: unit ? out.map((v) => `${v}${unit}`) : out });
  };
  const transform: any[] = [];
  const x = build('x', 0); if (x) transform.push({ translateX: x });
  const y = build('y', 0); if (y) transform.push({ translateY: y });
  const s = build('s', 1); if (s) transform.push({ scale: s });
  const sx = build('sx', 1); if (sx) transform.push({ scaleX: sx });
  const sy = build('sy', 1); if (sy) transform.push({ scaleY: sy });
  const r = build('r', 0, 'deg'); if (r) transform.push({ rotate: r });
  const k = build('k', 0, 'deg'); if (k) transform.push({ skewX: k });
  const o = build('o', 1);
  return { transform, ...(o ? { opacity: o } : {}) };
}

/** Where a particle starts, and what it is: an emoji, a letter, or a coloured bit. */
function ParticleBody({ p }: { p: Particle }) {
  switch (p.kind) {
    case 'burst': return <View style={[st.confetti, { backgroundColor: p.c }]} />;
    case 'spark': return <View style={[st.spark, { backgroundColor: p.c }]} />;
    case 'steam': return <View style={st.steam} />;
    case 'puff':  return <View style={st.puff} />;
    case 'zz':    return <Animated.Text style={st.zz}>{p.char}</Animated.Text>;
    default:      return <Animated.Text style={st.pEmoji}>{p.char}</Animated.Text>;
  }
}

const anchor = (p: Particle) => (p.kind === 'drop' ? BOX * 0.42 : p.kind === 'steam' ? BOX * 0.22 : BOX / 2);

/**
 * A message that is exactly one emoji: shown large and — when it arrived live
 * (`animate`) — played once with the animation that suits it, then left as the
 * plain emoji. Tapping plays it again. It never loops, never replays by itself
 * when a conversation is reopened, and stays still with Reduce Motion on.
 */
export default function AnimatedEmoji({ char, animate, playKey, onLongPress, size = 56 }: {
  char: string; animate: boolean; playKey?: string | null; onLongPress?: () => void; size?: number;
}) {
  const kind = useMemo(() => motionFor(char), [char]);
  const spec = FRAMES[kind];
  const [playing, setPlaying] = useState(() => animate && !hasPlayed(playKey) && !prefersReducedMotion());
  const [round, setRound] = useState(0);

  const main = useMemo(() => new Animated.Value(0), [round]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new round needs fresh values, so `round` is a deliberate dependency.
  const parts = useMemo(() => particlesFor(kind).map((p) => ({ p, v: new Animated.Value(0) })), [kind, round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing) return undefined;
    markPlayed(playKey);
    const anim = Animated.parallel([
      Animated.timing(main, { toValue: 1, duration: spec.ms, easing: Easing.linear, useNativeDriver: NATIVE }),
      ...parts.map(({ p, v }) => Animated.sequence([
        Animated.delay(p.delay),
        Animated.timing(v, { toValue: 1, duration: p.dur, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }),
      ])),
    ]);
    anim.start(({ finished }) => { if (finished) setPlaying(false); });
    return () => anim.stop();
  }, [playing, round]); // eslint-disable-line react-hooks/exhaustive-deps

  const replay = () => {
    if (prefersReducedMotion()) return;
    setRound((r) => r + 1);
    setPlaying(true);
  };

  const glyph = playing ? styleFor(main, spec.frames) : null;

  return (
    <Pressable onPress={replay} onLongPress={onLongPress} delayLongPress={350}
      accessibilityRole="image" accessibilityLabel={char} style={st.box}>
      <Animated.Text style={[{ fontSize: size, lineHeight: Math.round(size * 1.2) }, glyph, spec.origin ? { transformOrigin: spec.origin } : null]}>
        {char}
      </Animated.Text>
      {playing && parts.map(({ p, v }, i) => (
        <Animated.View key={`${round}-${i}`} pointerEvents="none"
          style={[st.particle, { top: anchor(p) - 30 }, styleFor(v, particleFrames(p))]}>
          <ParticleBody p={p} />
        </Animated.View>
      ))}
    </Pressable>
  );
}

const st = StyleSheet.create({
  box: { width: BOX, height: BOX, alignItems: 'center', justifyContent: 'center', overflow: 'visible', zIndex: 2 },
  particle: { position: 'absolute', left: BOX / 2 - 30, width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  pEmoji: { fontSize: 56, lineHeight: 64 },
  zz: { fontSize: 26, fontWeight: '800', color: '#6366F1' },
  confetti: { width: 7, height: 11, borderRadius: 2 },
  spark: { width: 9, height: 9, borderRadius: 5 },
  steam: { width: 12, height: 18, borderRadius: 9, backgroundColor: 'rgba(148,163,184,0.5)' },
  puff: { width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(203,213,225,0.95)' },
});
