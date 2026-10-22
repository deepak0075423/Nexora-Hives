/**
 * Marking an exam or interview a teacher evaluates (or sits on the panel of),
 * on the phone (Oct 2026): the same results board as the office — marks per
 * subject, absent, staff-only remarks, and submitting them — limited by the
 * server to the candidates and actions that are theirs.
 */
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Page } from '@/components/admission/parts';
import { Results } from './admin/admission-exam';

export default function AdmissionDutyExam() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Page title="Marks">
      <Results examId={String(id)} onChanged={() => {}} />
    </Page>
  );
}
