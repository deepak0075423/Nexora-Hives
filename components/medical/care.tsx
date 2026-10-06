/**
 * A visit looked at over time, on the nurse's phone (Oct 2026): another set
 * of readings (with alertness and pupils for a head injury), the triage
 * colour, the protocol's red flags and steps, and the injuries. The web has
 * the same (pages/medical/admin/mdCare.jsx); the rules are the server's.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import * as ImagePicker from 'expo-image-picker';
import { careLibrary, addVisitReading, setVisitTriage, setVisitProtocol, setVisitInjuries, getMedVisit, uploadMedDocument } from '@/api/medical.api';
import { unwrap, LoaderView } from '@/components/ui/kit';
import { Note, Btn, Sheet, Field, Box, Pill, Chips, Seg, Line, Pick, TINT, fmtTime, type Tone } from '@/components/medical/parts';

export const TRIAGE: Record<string, { label: string; tone: Tone; hint: string }> = {
  red: { label: 'Immediate', tone: 'red', hint: 'Call an ambulance now' },
  orange: { label: 'Very urgent', tone: 'orange', hint: 'Treat now, call the parents, think about hospital' },
  yellow: { label: 'Urgent', tone: 'amber', hint: 'See within 15 minutes' },
  green: { label: 'Standard', tone: 'green', hint: 'See within the hour' },
  blue: { label: 'Minor', tone: 'blue', hint: 'Advice and rest' },
};
const ORDER = ['red', 'orange', 'yellow', 'green', 'blue'];

export const TriagePill = ({ level }: { level?: string | null }) => (level && TRIAGE[level] ? <Pill tone={TRIAGE[level].tone}>{TRIAGE[level].label}</Pill> : null);

let libPromise: Promise<any> | null = null;
function useLibrary() {
  const [lib, setLib] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    libPromise = libPromise || careLibrary().then((r) => unwrap(r)).catch((e) => { libPromise = null; throw e; });
    libPromise.then((x) => { if (alive) setLib(x); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return lib;
}

/* ── A reading ────────────────────────────────────────────────────────────── */

type R = Record<string, string>;
const NUMS: [string, string, any][] = [
  ['pulse', 'Pulse / min', 'number-pad'], ['spo2', 'SpO₂ %', 'number-pad'], ['respRate', 'Breaths / min', 'number-pad'],
  ['bpSystolic', 'BP systolic', 'number-pad'], ['bpDiastolic', 'BP diastolic', 'number-pad'], ['glucose', 'Blood sugar mg/dL', 'number-pad'],
];

export function ReadingSheet({ visit, unit, onClose, onDone }: { visit: { _id: string; name?: string; protocolKey?: string | null } | null; unit: string; onClose: () => void; onDone: (out: any) => void }) {
  const [v, setV] = useState<R>({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  useEffect(() => { setV({}); setFail(''); setBusy(false); }, [visit]);
  const head = visit?.protocolKey === 'head_injury';
  const save = async () => {
    const body: any = { tempUnit: unit, note: v.note || '', avpu: v.avpu || undefined, pupils: v.pupils || undefined };
    for (const k of ['temperature', 'pulse', 'spo2', 'bpSystolic', 'bpDiastolic', 'respRate', 'painScore', 'glucose']) {
      if (v[k] !== undefined && String(v[k]).trim() !== '') body[k] = Number(v[k]);
    }
    setBusy(true); setFail('');
    try { onDone(unwrap(await addVisitReading(String(visit?._id), body))); } catch (err: any) { setFail(err?.message || 'The reading could not be saved'); setBusy(false); }
  };
  const neuro = (
    <>
      <Field label="Alertness (AVPU)" hint="Alert · Voice · Pain · Unresponsive">
        <Seg value={v.avpu} onChange={(x) => setV({ ...v, avpu: v.avpu === x ? '' : x })}
          options={[{ value: 'A', label: 'A' }, { value: 'V', label: 'V', tone: 'red' }, { value: 'P', label: 'P', tone: 'red' }, { value: 'U', label: 'U', tone: 'red' }]} />
      </Field>
      <Field label="Pupils">
        <Seg value={v.pupils} onChange={(x) => setV({ ...v, pupils: v.pupils === x ? '' : x })}
          options={[{ value: 'equal', label: 'Equal' }, { value: 'sluggish', label: 'Slow' }, { value: 'unequal', label: 'Unequal', tone: 'red' }]} />
      </Field>
    </>
  );
  return (
    <Sheet visible={!!visit} icon="thermometer-outline" tone="blue" title="Add a reading" subtitle={visit?.name} onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Cancel</Btn><Btn kind="primary" onPress={save} disabled={busy} block>{busy ? 'Saving…' : 'Save reading'}</Btn></>}>
      {head ? <Note tone="amber" icon="warning-outline">Head injury: check alertness and pupils every time.</Note> : null}
      {head ? neuro : null}
      <View style={st.grid}>
        <View style={st.cell}><Field label={`Temperature °${unit}`}><Box value={v.temperature || ''} onChange={(x) => setV({ ...v, temperature: x })} keyboardType="decimal-pad" placeholder="—" /></Field></View>
        {NUMS.map(([k, label, kb]) => (
          <View key={k} style={st.cell}><Field label={label}><Box value={v[k] || ''} onChange={(x) => setV({ ...v, [k]: x })} keyboardType={kb} placeholder="—" /></Field></View>
        ))}
      </View>
      <Field label="Pain (0 none – 10 worst)">
        <Chips clearable options={Array.from({ length: 11 }, (_, n) => ({ value: String(n), label: String(n) }))} value={v.painScore} onChange={(x) => setV({ ...v, painScore: x })} />
      </Field>
      {!head ? neuro : null}
      <Field label="Note"><Box value={v.note || ''} onChange={(x) => setV({ ...v, note: x })} placeholder="e.g. Vomited once, feeling better" maxLength={300} /></Field>
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

/* ── Triage, protocol, injuries ───────────────────────────────────────────── */

export function CareSheet({ visitId, onClose, onChanged, onEmergency }: { visitId: string | null; onClose: () => void; onChanged: (msg?: string) => void; onEmergency: (visitId: string, reasons: string[]) => void }) {
  const lib = useLibrary();
  const [v, setV] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  const [mark, setMark] = useState<{ region: string; kind: string; note: string; view: string } | null>(null);
  useEffect(() => {
    let alive = true;
    setV(null); setFail(''); setMark(null);
    if (!visitId) return undefined;
    getMedVisit(visitId).then((r) => { if (alive) setV(unwrap(r)); }).catch((err) => { if (alive) setFail(err?.message || 'The visit could not be loaded'); });
    return () => { alive = false; };
  }, [visitId]);
  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setFail('');
    try {
      const out = unwrap(await fn());
      const next = out?.visit || out;
      if (next?._id) setV(next);
      onChanged();
      if (out?.suggestEmergency && visitId) onEmergency(visitId, out?.visit?.triage?.reasons || []);
    } catch (err: any) { setFail(err?.message || 'It could not be saved'); } finally { setBusy(false); }
  };
  /** A photo of the injury: from the camera, or one already taken. Kept for the medical staff only. */
  const photo = async (camera: boolean) => {
    try {
      const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setFail(camera ? 'Allow the camera to take a photo' : 'Allow photo access to choose a photo'); return; }
      const res = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (res.canceled || !res.assets?.length) return;
      const a: any = res.assets[0];
      const fd = new FormData();
      if (a.file) fd.append('file', a.file);
      else fd.append('file', { uri: a.uri, name: a.fileName || `injury-${Date.now()}.jpg`, type: a.mimeType || 'image/jpeg' } as any);
      fd.append('type', 'incident_photo');
      fd.append('title', `Injury photo — ${v.number}`);
      fd.append('visibility', 'staff');
      fd.append('linkKind', 'visit');
      fd.append('linkId', String(v._id));
      await run(async () => { await uploadMedDocument(String(v.student?._id), fd); return getMedVisit(String(v._id)); });
    } catch (err: any) { setFail(err?.message || 'The photo could not be added'); }
  };
  const t = v?.triage || {};
  const p = v?.protocol?.key ? lib?.protocols?.find((x: any) => x.key === v.protocol.key) : null;
  const flags = new Set<string>(v?.protocol?.redFlags || []);
  const done = new Set<number>(v?.protocol?.stepsDone || []);
  const suggested = (v?.protocolSuggestions || []).map((k: string) => lib?.protocols?.find((x: any) => x.key === k)).filter(Boolean);
  const regions = lib?.regions || {};
  const kinds = lib?.injuryKinds || {};
  return (
    <Sheet visible={!!visitId} icon="medkit-outline" tone="red" title="Triage and protocol" subtitle={v ? `${v.student?.name || ''} · ${v.number}` : ''} onClose={onClose} busy={busy}
      footer={<Btn onPress={onClose} block>Done</Btn>}>
      {!v || !lib ? (fail ? null : <LoaderView />) : (
        <>
          <Field label="How urgent">
            <View style={st.triage}>
              {ORDER.map((l) => {
                const on = t.level === l; const c = TINT[TRIAGE[l].tone];
                return (
                  <TouchableOpacity key={l} disabled={busy} onPress={() => run(() => setVisitTriage(v._id, { level: l }))}
                    style={[st.triageBtn, { borderColor: c.fg }, on && { backgroundColor: c.fg }]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                    <Text style={[st.triageText, { color: on ? '#fff' : c.fg }]}>{TRIAGE[l].label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Field>
          <Line>{t.setBy ? `Set by ${t.setByName}${t.setAt ? ` at ${fmtTime(t.setAt)}` : ''}.` : `Following the suggestion${t.reasons?.length ? `: ${t.reasons.join(' · ')}` : ''}.`}</Line>
          {t.setBy ? <View style={{ alignSelf: 'flex-start', marginTop: 4 }}><Btn onPress={() => run(() => setVisitTriage(v._id, { level: 'auto' }))}>Follow the suggestion</Btn></View> : null}
          {t.level ? <Line tone={TRIAGE[t.level]?.tone} strong>{TRIAGE[t.level]?.hint}</Line> : null}

          <View style={st.rule} />
          {!p ? (
            <>
              <Text style={st.h}>PROTOCOL</Text>
              {suggested.length ? <Line>The reason points to:</Line> : null}
              <View style={st.wrap}>
                {suggested.slice(0, 3).map((x: any) => <Btn key={x.key} kind="primary" onPress={() => run(() => setVisitProtocol(v._id, { key: x.key }))}>{x.title}</Btn>)}
              </View>
              <Pick label="Choose a protocol" value="" placeholder="Choose a protocol…" options={lib.protocols.map((x: any) => ({ value: x.key, label: x.title }))}
                onChange={(k: string) => k && run(() => setVisitProtocol(v._id, { key: k }))} />
            </>
          ) : (
            <>
              <View style={st.protoHead}>
                <Text style={st.h}>{`PROTOCOL — ${p.title.toUpperCase()}`}</Text>
                <Text style={st.link} onPress={() => run(() => setVisitProtocol(v._id, { key: null }))}>Stop</Text>
              </View>
              <Text style={st.sub}>Red flags — any one raises the colour</Text>
              {p.redFlags.map((f: any) => {
                const on = flags.has(f.key); const c = TINT[TRIAGE[f.level]?.tone || 'red'];
                return (
                  <TouchableOpacity key={f.key} disabled={busy} style={[st.check, on && { backgroundColor: c.soft, borderColor: c.fg }]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                    onPress={() => { const n = new Set(flags); if (on) n.delete(f.key); else n.add(f.key); run(() => setVisitProtocol(v._id, { key: p.key, redFlags: [...n] })); }}>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? c.fg : Colors.textSecondary} />
                    <Text style={[st.checkText, on && { color: c.fg, fontWeight: '700' }]}>{f.label}</Text>
                    <TriagePill level={f.level} />
                  </TouchableOpacity>
                );
              })}
              <Text style={st.sub}>Steps</Text>
              {p.steps.map((x: string, i: number) => {
                const on = done.has(i);
                return (
                  <TouchableOpacity key={i} disabled={busy} style={st.check} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                    onPress={() => { const n = new Set(done); if (on) n.delete(i); else n.add(i); run(() => setVisitProtocol(v._id, { key: p.key, stepsDone: [...n] })); }}>
                    <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={on ? TINT.green.fg : Colors.textSecondary} />
                    <Text style={[st.checkText, on && { textDecorationLine: 'line-through', color: Colors.textSecondary }]}>{x}</Text>
                  </TouchableOpacity>
                );
              })}
              {p.sendHomeIf?.length ? <Line>{`Send home if: ${p.sendHomeIf.join('; ')}`}</Line> : null}
            </>
          )}

          <View style={st.rule} />
          <Text style={st.h}>INJURIES</Text>
          {(v.injuries || []).map((m: any, i: number) => (
            <View key={m.id} style={st.injury}>
              <Text style={st.injuryN}>{i + 1}</Text>
              <Text style={st.checkText}>{`${kinds[m.kind] || m.kind} — ${regions[m.region] || m.region}${m.view === 'back' ? ' (back)' : ''}${m.note ? ` · ${m.note}` : ''}`}</Text>
              <Text style={st.link} onPress={() => run(() => setVisitInjuries(v._id, (v.injuries || []).filter((x: any) => x.id !== m.id)))}>Remove</Text>
            </View>
          ))}
          {mark ? (
            <View style={st.markBox}>
              <Pick label="Where" value={mark.region} placeholder="Part of the body…" options={Object.entries(regions).map(([value, label]) => ({ value, label: String(label) }))} onChange={(x: string) => setMark({ ...mark, region: x })} />
              <Seg value={mark.view} onChange={(x) => setMark({ ...mark, view: x })} options={[{ value: 'front', label: 'Front' }, { value: 'back', label: 'Back' }]} />
              <Chips options={Object.entries(kinds).map(([value, label]) => ({ value, label: String(label) }))} value={mark.kind} onChange={(x) => setMark({ ...mark, kind: x })} />
              <Box value={mark.note} onChange={(x) => setMark({ ...mark, note: x })} placeholder="e.g. 3 cm graze, cleaned" maxLength={200} />
              <View style={st.wrap}>
                <Btn onPress={() => setMark(null)}>Cancel</Btn>
                <Btn kind="primary" disabled={!mark.region || busy} onPress={() => { const next = [...(v.injuries || []), { view: mark.view, region: mark.region, kind: mark.kind, note: mark.note }]; setMark(null); run(() => setVisitInjuries(v._id, next)); }}>Add</Btn>
              </View>
            </View>
          ) : <View style={{ alignSelf: 'flex-start' }}><Btn icon="add" onPress={() => setMark({ region: '', kind: 'bruise', note: '', view: 'front' })}>Mark an injury</Btn></View>}
          <View style={st.rule} />
          <Text style={st.h}>PHOTOS</Text>
          <Line>{(v.documentList || []).filter((d: any) => d.type === 'incident_photo').length
            ? `${(v.documentList || []).filter((d: any) => d.type === 'incident_photo').length} photo(s) on this visit — medical staff only`
            : 'No photos yet. They are kept for the medical staff only.'}</Line>
          <View style={st.wrap}>
            <Btn icon="camera-outline" disabled={busy} onPress={() => photo(true)}>Take a photo</Btn>
            <Btn icon="image-outline" disabled={busy} onPress={() => photo(false)}>Choose a photo</Btn>
          </View>
        </>
      )}
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 },
  cell: { flexBasis: '46%', flexGrow: 1 },
  triage: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  triageBtn: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1.5 },
  triageText: { fontSize: 12.5, fontWeight: '800' },
  rule: { height: 1, backgroundColor: Colors.divider, marginVertical: 12 },
  h: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.6, color: Colors.textSecondary, marginBottom: 6 },
  sub: { fontSize: 12, fontWeight: '700', color: Colors.text, marginTop: 6, marginBottom: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 },
  protoHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { fontSize: 12.5, fontWeight: '700', color: '#2F6BF0', paddingVertical: 4 },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 6 },
  checkText: { flex: 1, minWidth: 0, fontSize: 13, color: Colors.text, lineHeight: 18 },
  injury: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  injuryN: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#DC2626', color: '#fff', fontSize: 11, fontWeight: '800', textAlign: 'center', lineHeight: 20, overflow: 'hidden' },
  markBox: { gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
});
