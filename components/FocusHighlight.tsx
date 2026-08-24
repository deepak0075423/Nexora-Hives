import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, ScrollView, LayoutChangeEvent } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors } from '@/constants/theme';

const FLASH_MS = 3800;

/**
 * The record a notification was about, flagged on arrival.
 *
 * Following a notification usually lands on a list — the regularization
 * requests, the leave queue, the substitutions — where the row that prompted it
 * is one of twenty. The link carries `?focus=<id>`; wrapping a row in
 * <FocusRow id={row._id}> scrolls to it and highlights it for a few seconds, so
 * arriving actually answers the question the notification raised.
 *
 * Web does the same thing through the DOM (school-frontend
 * hooks/useFocusHighlight.js); React Native has no such query, so rows opt in.
 */

/** The id this screen was asked to focus, or null. */
export function useFocusId(): string | null {
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  return focus ? String(focus) : null;
}

export function FocusRow({
  id, children, scrollRef, offset = 80,
}: {
  id?: string | null;
  children: React.ReactNode;
  /** The list's ScrollView, when the row should also be scrolled into view */
  scrollRef?: React.RefObject<ScrollView | null>;
  offset?: number;
}) {
  const focusId  = useFocusId();
  const isTarget = !!id && !!focusId && String(id) === focusId;
  const flash    = useRef(new Animated.Value(0)).current;
  const [y, setY] = useState<number | null>(null);
  const scrolled = useRef(false);

  useEffect(() => {
    if (!isTarget) return;
    // Fully lit, then fading — the row is unmistakable on arrival without
    // staying coloured forever.
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 220, useNativeDriver: false }),
      Animated.delay(1600),
      Animated.timing(flash, { toValue: 0, duration: FLASH_MS - 1820, useNativeDriver: false }),
    ]).start();
  }, [isTarget, flash]);

  useEffect(() => {
    // The row's position is only known once it has laid out, which is why this
    // waits on `y` rather than firing with the highlight.
    if (!isTarget || y == null || scrolled.current || !scrollRef?.current) return;
    scrolled.current = true;
    scrollRef.current.scrollTo({ y: Math.max(0, y - offset), animated: true });
  }, [isTarget, y, scrollRef, offset]);

  const onLayout = (e: LayoutChangeEvent) => {
    if (isTarget) setY(e.nativeEvent.layout.y);
  };

  if (!isTarget) return <View onLayout={onLayout}>{children}</View>;

  return (
    <Animated.View
      onLayout={onLayout}
      style={{
        borderRadius: 12,
        backgroundColor: flash.interpolate({
          inputRange: [0, 1],
          outputRange: ['rgba(0,0,0,0)', Colors.primary + '2E'],
        }),
        borderLeftWidth: 3,
        borderLeftColor: flash.interpolate({
          inputRange: [0, 1],
          outputRange: ['rgba(0,0,0,0)', Colors.primary],
        }) as any,
      }}
    >
      {children}
    </Animated.View>
  );
}

export default FocusRow;
