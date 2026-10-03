/**
 * A class test, set or corrected on the phone (Oct 2026) — the web's
 * ClassTestForm, on the same endpoints and rules: a test is set in a section
 * and subject the teacher teaches (GET /teacher/results/test-options); the
 * pass mark is within the maximum; a test's details change only while it is a
 * draft or reopened, and never to a maximum below a mark already given (the
 * server says so if it is).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as R from '@/api/results.api';
import { FormModal, Input, Select, unwrap } from '@/components/ui/kit';
import { DayPicker } from '@/components/attendance/parts';

/** Today on the phone's own calendar, as YYYY-MM-DD. */
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayKey = (v: any) => (v ? new Date(v).toISOString().slice(0, 10) : '');

export default function ClassTestForm({ visible, test, onClose, onSaved }: {
  visible: boolean; test?: any; onClose: () => void; onSaved: (saved: any) => void;
}) {
  const editing = !!test;
  const [options, setOptions] = useState<any[]>([]);
  const [f, setF] = useState({ pick: '', title: '', testDate: todayKey(), maxMarks: '20', passingMarks: '8', topic: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setError('');
    if (editing) {
      setF({
        pick: '', title: test.title || '', testDate: dayKey(test.testDate) || todayKey(),
        maxMarks: String(test.maxMarks ?? ''), passingMarks: String(test.passingMarks ?? ''),
        topic: test.topic || '', description: test.description || '',
      });
      return;
    }
    setF({ pick: '', title: '', testDate: todayKey(), maxMarks: '20', passingMarks: '8', topic: '', description: '' });
    R.testOptions().then((res) => {
      const list = unwrap(res) || [];
      setOptions(list);
      // This year's first; a teacher with one section and subject has nothing to choose.
      if (list.length) setF((s) => ({ ...s, pick: `${list[0].sectionId}:${list[0].subjectId}` }));
    }).catch((e: any) => setError(e?.message || 'Your sections could not be loaded'));
    // Filled once as it opens — never again while someone is typing in it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const choices = useMemo(() => options.map((o) => ({
    value: `${o.sectionId}:${o.subjectId}`,
    label: `${[o.className, o.sectionName].filter(Boolean).join(' – ')} · ${o.subjectName}${o.current ? '' : ` (${o.yearName})`}`,
  })), [options]);

  const submit = async () => {
    const title = f.title.trim();
    const max = Number(f.maxMarks); const pass = Number(f.passingMarks);
    if (!editing && !f.pick) return setError('Choose the class and subject');
    if (!title) return setError('Give the test a name');
    if (!Number.isFinite(max) || max < 1 || max > 1000) return setError('Maximum marks must be between 1 and 1000');
    if (f.passingMarks === '' || !Number.isFinite(pass) || pass < 0) return setError('Pass marks cannot be blank or negative');
    if (pass > max) return setError(`Pass marks cannot be more than the maximum (${max})`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.testDate)) return setError('Choose the day of the test');
    const body = { title, testDate: f.testDate, maxMarks: max, passingMarks: pass, topic: f.topic.trim(), description: f.description.trim() };
    setBusy(true); setError('');
    try {
      const res = editing
        ? await R.updateTest(String(test._id), body)
        : await R.createTest({ ...body, sectionId: f.pick.split(':')[0], subjectId: f.pick.split(':')[1] });
      onSaved(unwrap(res));
    } catch (e: any) {
      setError(e?.message || 'The test could not be saved');
    } finally { setBusy(false); }
  };

  return (
    <FormModal visible={visible} title={editing ? 'Test details' : 'New class test'} onClose={onClose} onSubmit={submit}
      submitting={busy} submitLabel={editing ? 'Save Details' : 'Create Test'}>
      {error ? <Text style={s.error}>{error}</Text> : null}
      {editing ? (
        <Text style={s.fixed}>{[test.subjectName, [test.className, test.sectionName].filter(Boolean).join(' – ')].filter(Boolean).join(' · ')}</Text>
      ) : options.length ? (
        <Select label="Class and subject" value={f.pick} options={choices} onChange={(v) => setF((x) => ({ ...x, pick: v }))} />
      ) : (
        <Text style={s.hint}>{error ? '' : 'Loading your classes…'}</Text>
      )}
      <Input label="Test name" value={f.title} onChange={(v) => setF((x) => ({ ...x, title: v }))} placeholder="e.g. Fractions quiz" />
      <Text style={s.label}>Day of the test</Text>
      <View style={{ marginBottom: Spacing.md }}>
        <DayPicker value={f.testDate} onChange={(k) => setF((x) => ({ ...x, testDate: k }))} />
      </View>
      <View style={s.two}>
        <View style={{ flex: 1 }}>
          <Input label="Maximum marks" value={f.maxMarks} onChange={(v) => setF((x) => ({ ...x, maxMarks: v }))} keyboardType="numeric" />
        </View>
        <View style={{ flex: 1 }}>
          <Input label="Pass marks" value={f.passingMarks} onChange={(v) => setF((x) => ({ ...x, passingMarks: v }))} keyboardType="numeric" />
        </View>
      </View>
      <Input label="Topic (optional)" value={f.topic} onChange={(v) => setF((x) => ({ ...x, topic: v }))} placeholder="e.g. Chapter 3" />
      <Input label="Notes (optional)" value={f.description} onChange={(v) => setF((x) => ({ ...x, description: v }))} multiline />
    </FormModal>
  );
}

const s = StyleSheet.create({
  error: { fontSize: 12, color: Colors.danger, backgroundColor: Colors.dangerLight, padding: 10, borderRadius: Radius.md, marginBottom: 12 },
  fixed: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 12 },
  hint: { fontSize: 12, color: Colors.textSecondary, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  two: { flexDirection: 'row', gap: 10 },
});
