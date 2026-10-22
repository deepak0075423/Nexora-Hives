/**
 * Selection lists as the school published them (phone): where this
 * application stands on each — and, for a lottery, its number in the draw and
 * the public page anyone can use to check the draw was fair
 * (school-backend services/admission/lottery.js).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '@/constants/theme';
import { portal } from '@/api/admission.api';
import { openWeb } from '../files';
import { Panel, Pill, Btn, Muted, Tag, useApi, DECISION, BRAND, fmtDate, unwrapList } from '../parts';

export default function ListsPanel({ appId, origin }: { appId: string; origin: string }) {
  const { data } = useApi<any[]>(() => portal.lists(appId), [appId]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const lists = unwrapList(data);
  if (!lists.length) return null;
  return (
    <Panel icon="list-outline" tone="violet" title="Selection lists" subtitle="As published by the school">
      {lists.map((l, i) => {
        const lottery = l.method !== 'merit';
        const mine = l.mine;
        const lines = unwrapList(l.lines);
        return (
          <View key={l._id} style={[st.list, i === 0 && { borderTopWidth: 0, marginTop: 0, paddingTop: 0 }]}>
            <View style={st.top}>
              <Text style={st.name}>{l.name}</Text>
              {lottery ? <Pill tone="indigo" icon="shuffle-outline">Lottery</Pill> : null}
            </View>
            <Muted>Published {fmtDate(l.publishedAt)}</Muted>
            {mine ? (
              <Pill tone={(DECISION[mine.decision] || { tone: 'slate' }).tone}>
                {`You: ${lottery && mine.decision === 'not_selected' ? 'not reached in the draw' : (DECISION[mine.decision]?.label || mine.decision)}${mine.waitPosition ? ` #${mine.waitPosition}` : ''}`}
              </Pill>
            ) : <Pill tone="slate">Not on this list</Pill>}
            {lottery && mine?.rank ? (
              <Text style={st.draw}>
                Your application was number <Text style={{ fontWeight: '800' }}>{mine.rank}</Text> in the draw{mine.score ? ` (with ${mine.score} priority points)` : ''}.
              </Text>
            ) : null}
            {lottery && l.drawUrl && origin ? <Btn icon="shield-checkmark-outline" onPress={() => openWeb(`${origin}${l.drawUrl}`)}>See the whole draw and how to check it</Btn> : null}
            {lines.length ? (
              <TouchableOpacity onPress={() => setOpen({ ...open, [l._id]: !open[l._id] })} accessibilityRole="button">
                <Text style={st.more}>{open[l._id] ? 'Hide the list' : `Show the whole list (${lines.length})`}</Text>
              </TouchableOpacity>
            ) : null}
            {open[l._id] ? lines.map((x, j) => (
              <View key={`${l._id}-${j}`} style={[st.row, x.mine && { backgroundColor: '#F5F5FF' }]}>
                <Text style={st.rank}>{x.rank ?? '—'}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.app}>{x.applicationNumber}{x.mine ? ' (you)' : ''}</Text>
                  {x.name ? <Muted>{x.name}{x.score != null ? ` · ${x.score}` : ''}</Muted> : x.score != null ? <Muted>{`Score ${x.score}`}</Muted> : null}
                </View>
                {x.decision === 'waitlisted' ? <Pill tone="amber">{`Waiting #${x.waitPosition || ''}`}</Pill> : <Tag map={DECISION} value={x.decision} />}
              </View>
            )) : null}
          </View>
        );
      })}
    </Panel>
  );
}

const st = StyleSheet.create({
  list: { gap: 6, borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: 12, marginTop: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.text },
  draw: { fontSize: 12.5, color: Colors.text, lineHeight: 18 },
  more: { fontSize: 12.5, fontWeight: '700', color: BRAND, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 8 },
  rank: { width: 30, fontSize: 12.5, fontWeight: '800', color: Colors.textSecondary },
  app: { fontSize: 12.5, fontWeight: '600', color: Colors.text },
});
