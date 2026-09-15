import React, { useCallback, useState } from 'react';
import { Stack } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import ModuleDisabled from '@/components/ModuleDisabled';
import { LoaderView } from '@/components/ui/kit';
import TeacherExams from '@/components/exams/TeacherExams';
import StudentExams from '@/components/exams/StudentExams';
import ParentExams from '@/components/exams/ParentExams';

/**
 * Aptitude Exams — one route, one screen per role. Each role's screen lives in
 * components/exams and loads its own endpoint; this file only picks which.
 */
export default function ExamsScreen() {
  const { user } = useAuth();
  const [blocked, setBlocked] = useState(false);
  const onBlocked = useCallback(() => setBlocked(true), []);

  const title = user?.role === 'teacher' ? 'Aptitude Exams' : user?.role === 'parent' ? 'Exam Results' : 'My Aptitude Exams';

  if (blocked) return <><Stack.Screen options={{ title: 'Aptitude Exams' }} /><ModuleDisabled /></>;

  // Wait for the user record — firing before role is known would hit the wrong role's API.
  if (!user?.role) return <><Stack.Screen options={{ title }} /><LoaderView /></>;

  return (
    <>
      <Stack.Screen options={{ title }} />
      {user.role === 'teacher' ? <TeacherExams onBlocked={onBlocked} />
        : user.role === 'parent' ? <ParentExams onBlocked={onBlocked} />
        : <StudentExams onBlocked={onBlocked} />}
    </>
  );
}
