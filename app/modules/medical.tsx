/**
 * The Medical Room (Oct 2026) — one route, three readers: a teacher sends
 * students and follows them (components/medical/TeacherBody), a student sees
 * their own health record and a parent their children's
 * (components/medical/FamilyBody). Notifications open /modules/medical.
 */
import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { LoaderView } from '@/components/ui/kit';
import TeacherMedical from '@/components/medical/TeacherBody';
import FamilyMedical from '@/components/medical/FamilyBody';
import MedicalDesk from '@/components/medical/DeskBody';

const TITLE: Record<string, string> = { teacher: 'Medical Room', student: 'My Health', parent: 'Medical Information', school_admin: 'Medical Room' };

export default function MedicalScreen() {
  const { user } = useAuth();
  // A link can repeat a key (?tab=a&tab=b arrives as an array): the last one wins.
  const params = useLocalSearchParams<{ tab?: string | string[]; child?: string | string[]; focus?: string | string[] }>();
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[v.length - 1] : v) || undefined;
  const tab = one(params.tab);
  const child = one(params.child);
  const role = String(user?.role || '');
  return (
    <>
      <Stack.Screen options={{ title: TITLE[role] || 'Medical Room' }} />
      {/* The role decides which screen this is; nothing loads before it is known. */}
      {!role ? <LoaderView /> : null}
      {role === 'teacher' ? <TeacherMedical initialTab={tab} /> : null}
      {role === 'student' || role === 'parent' ? <FamilyMedical role={role} initialChild={child} initialTab={tab} /> : null}
      {role === 'school_admin' ? <MedicalDesk initialTab={tab} focus={one(params.focus)} /> : null}
    </>
  );
}
