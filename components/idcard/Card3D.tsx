/**
 * An ID card you can turn over, on the phone (Oct 2026) — the web's 3D card
 * with the phone's own tools: both faces in one place with their backs
 * hidden, turned on the Y axis with perspective.
 *
 *   tap            it flips over
 *   drag sideways  it spins with your finger, and settles on whichever face
 *                  the swipe carries it to (a vertical drag still scrolls)
 *
 * With `lanyard` it hangs from the school's strap and clip, drops in when it
 * appears and swings to rest. Reduce Motion turns the drop and the swing off.
 * Animated on the native driver throughout.
 */
import React, { useEffect, useImperativeHandle, useMemo, useRef, forwardRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import CardFace, { RATIO, shade } from './CardFace';

export type Card3DHandle = { flip: () => void };

function Lanyard({ card, width, strap }: { card: any; width: number; strap: number }) {
  const look = card?.design || {};
  const name = String(look.identity?.name || 'School').toUpperCase();
  const sw = Math.round(width * 0.11);
  const words = Array.from({ length: 5 }, () => name).join('   •   ');
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: -strap * 1.2, height: strap * 2.2, alignItems: 'center' }}>
      <View style={{ width: sw, height: strap * 2.2 - width * 0.07, backgroundColor: look.primary || '#1b2a5e', overflow: 'hidden', alignItems: 'center',
        borderLeftWidth: 2, borderRightWidth: 2, borderColor: shade(look.primary || '#1b2a5e', -0.35) }}>
        {/* A long line turned upright: centred on the strap before it turns. */}
        <Text numberOfLines={1} style={{ position: 'absolute', top: strap * 1.1 - sw / 2, left: sw / 2 - strap * 1.1, width: strap * 2.2, height: sw, lineHeight: sw, transform: [{ rotate: '90deg' }], color: 'rgba(255,255,255,0.78)', fontSize: Math.max(7, sw * 0.36), fontWeight: '800', letterSpacing: 2, textAlign: 'center' }}>{words}</Text>
      </View>
      {/* Crimp, swivel and the ring through the slot. */}
      <View style={{ position: 'absolute', bottom: width * 0.055, width: sw + 8, height: width * 0.06, borderRadius: 4, backgroundColor: '#D7DCE4', borderWidth: 1, borderColor: '#8A929E' }} />
      <View style={{ position: 'absolute', bottom: width * 0.012, width: width * 0.05, height: width * 0.05, borderRadius: 99, borderWidth: Math.max(2, width * 0.012), borderColor: '#B9C0CB' }} />
    </View>
  );
}

const Card3D = forwardRef<Card3DHandle, {
  card: any; width: number; lanyard?: boolean; flipped?: boolean; onFlip?: (back: boolean) => void; entrance?: boolean;
}>(function Card3D({ card, width, lanyard = false, flipped, onFlip, entrance = true }, ref) {
  const landscape = card?.design?.layout === 'landscape';
  const w = landscape ? Math.round(width * 1.3) : width;
  const h = Math.round(landscape ? w / RATIO : w * RATIO);
  const strap = lanyard ? Math.round(width * 0.36) : 0;
  const [reduced, setReduced] = useState(false);

  const rot = useRef(new Animated.Value(0)).current;      // degrees about Y, continuous
  const base = useRef(flipped ? 180 : 0);
  const drop = useRef(new Animated.Value(entrance ? -1 : 0)).current;
  const swing = useRef(new Animated.Value(entrance && lanyard ? 9 : 0)).current;
  const onFlipRef = useRef(onFlip);
  onFlipRef.current = onFlip;

  useEffect(() => {
    rot.setValue(base.current);
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((r) => {
      if (!alive) return;
      setReduced(r);
      if (r) { drop.setValue(0); swing.setValue(0); return; }
      Animated.spring(drop, { toValue: 0, friction: 6, tension: 38, useNativeDriver: true }).start();
      if (lanyard) Animated.spring(swing, { toValue: 0, friction: 1.6, tension: 18, useNativeDriver: true }).start();
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settle = (to: number, velocity = 0) => {
    const before = Math.round(base.current / 180) % 2 !== 0;
    base.current = to;
    Animated.spring(rot, { toValue: to, velocity, friction: reduced ? 12 : 7, tension: reduced ? 120 : 42, useNativeDriver: true }).start();
    const after = Math.round(to / 180) % 2 !== 0;
    if (before !== after) onFlipRef.current?.(after);
    if (lanyard && !reduced) {
      swing.setValue(velocity ? Math.max(-6, Math.min(6, velocity * 0.6)) : 4);
      Animated.spring(swing, { toValue: 0, friction: 1.8, tension: 20, useNativeDriver: true }).start();
    }
  };
  const flip = () => settle(base.current + 180);
  useImperativeHandle(ref, () => ({ flip }));

  useEffect(() => {
    if (flipped === undefined) return;
    const back = Math.round(base.current / 180) % 2 !== 0;
    if (flipped !== back) flip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped]);

  const pan = useMemo(() => PanResponder.create({
    // Only a sideways drag is ours; up and down still scroll the screen.
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
    onPanResponderMove: (_, g) => rot.setValue(base.current + g.dx * 0.7),
    onPanResponderRelease: (_, g) => {
      const at = base.current + g.dx * 0.7;
      const projected = at + g.vx * 160;
      rot.setValue(at);
      settle(Math.round(projected / 180) * 180, g.vx * 8);
    },
    onPanResponderTerminate: () => settle(base.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [reduced]);

  const front = rot.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'], extrapolate: 'extend' });
  const back = rot.interpolate({ inputRange: [0, 360], outputRange: ['180deg', '540deg'], extrapolate: 'extend' });
  const swingDeg = swing.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] });
  const total = strap + h;

  return (
    <View style={{ width: w + 32, height: total + 34, alignSelf: 'center' }}>
      <Animated.View style={{
        position: 'absolute', left: 16, top: 0, width: w, height: total,
        // Swing about the top of the strap: move the pivot up, turn, move back.
        transform: [
          { translateY: drop.interpolate({ inputRange: [-1, 0], outputRange: [-(total + 40), 0] }) },
          { translateY: -total / 2 }, { rotate: swingDeg }, { translateY: total / 2 },
        ],
      }}>
        {lanyard ? <Lanyard card={card} width={width} strap={strap} /> : null}
        <View style={{ position: 'absolute', left: 0, top: strap, width: w, height: h }} {...pan.panHandlers}>
          <Pressable onPress={flip} accessibilityRole="button" accessibilityLabel={`${card?.snapshot?.name || 'ID'} card. Double tap to turn it over.`} style={{ flex: 1 }}>
            <Animated.View style={[st.face, { transform: [{ perspective: 1400 }, { rotateY: front }] }]}>
              <CardFace card={card} side="front" width={w} />
            </Animated.View>
            <Animated.View style={[st.face, { transform: [{ perspective: 1400 }, { rotateY: back }] }]}>
              <CardFace card={card} side="back" width={w} />
            </Animated.View>
          </Pressable>
        </View>
      </Animated.View>
      <View pointerEvents="none" style={{ position: 'absolute', left: 16 + w * 0.18, width: w * 0.64, bottom: 10, height: 10, borderRadius: 99, backgroundColor: 'rgba(0,0,0,0.14)' }} />
    </View>
  );
});

const st = StyleSheet.create({
  face: {
    position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backfaceVisibility: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  },
});

export default Card3D;
