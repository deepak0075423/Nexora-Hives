/**
 * The Medical Room desk (Oct 2026) — for the school admin and for a teacher
 * whose designation makes them the module's admin (a nurse). The body is
 * components/medical/DeskBody. Notifications open ?tab=requests | room |
 * round | incidents | alerts | lookup | campaigns | outbreaks | illness, with
 * &focus=<id> naming the record (an outbreak, a student's card).
 */
import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import MedicalDesk from '@/components/medical/DeskBody';

export default function AdminMedicalScreen() {
  // A link can repeat a key (?tab=a&tab=b arrives as an array): the last one wins.
  const { tab, focus } = useLocalSearchParams<{ tab?: string | string[]; focus?: string | string[] }>();
  const one = Array.isArray(tab) ? tab[tab.length - 1] : tab;
  const which = Array.isArray(focus) ? focus[focus.length - 1] : focus;
  return (
    <>
      <Stack.Screen options={{ title: 'Medical Room' }} />
      <MedicalDesk initialTab={one || undefined} focus={which || undefined} />
    </>
  );
}
