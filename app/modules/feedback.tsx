import React, { useCallback, useState } from 'react';
import { Stack } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import ModuleDisabled from '@/components/ModuleDisabled';
import { LoaderView } from '@/components/ui/kit';
import StudentFeedback from '@/components/feedback/StudentFeedback';
import ParentFeedback from '@/components/feedback/ParentFeedback';

/**
 * Teacher Feedback — one route, one screen per role. A student gives feedback;
 * a parent sees whether each child has. Each screen loads its own endpoint.
 */
export default function FeedbackScreen() {
  const { user } = useAuth();
  const [blocked, setBlocked] = useState(false);
  const onBlocked = useCallback(() => setBlocked(true), []);
  const title = 'Teacher Feedback';

  if (blocked) return <><Stack.Screen options={{ title }} /><ModuleDisabled /></>;
  // Wait for the user record — firing before the role is known would hit the wrong role's API.
  if (!user?.role) return <><Stack.Screen options={{ title }} /><LoaderView /></>;

  return (
    <>
      <Stack.Screen options={{ title }} />
      {user.role === 'parent' ? <ParentFeedback onBlocked={onBlocked} /> : <StudentFeedback onBlocked={onBlocked} />}
    </>
  );
}
