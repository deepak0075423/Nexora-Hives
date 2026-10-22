/**
 * The offer on a family's application (phone): what it is, the letter, and the
 * family's answer. Accepting at one branch of a group of schools can withdraw
 * the family's open applications at the others — their choice, ticked by
 * default, because those seats can then go to other families
 * (school-backend services/admission/groups.js).
 */
import React, { useState } from 'react';
import { Text } from 'react-native';
import { portal } from '@/api/admission.api';
import { confirmAsync } from '@/components/ui/kit';
import { openAdmissionFile } from '../files';
import { Panel, Facts, Fact, Btn, Row, Note, Sheet, Field, Box, Tick, Muted, money, fmtDate, fmtDateTime, errMsg, say, unwrapList } from '../parts';

export default function OfferPanel({ appId, offer, onChanged }: { appId: string; offer: any; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');
  const [elsewhere, setElsewhere] = useState<any[] | null>(null);
  const [withdrawOthers, setWithdrawOthers] = useState(true);
  if (!offer || !['issued', 'accepted'].includes(offer.status)) return null;

  const respond = async (accept: boolean, why = '', others = false) => {
    setBusy(true);
    try {
      const r: any = await portal.respond(appId, accept, why, others);
      const gone = r?.data?.withdrawnElsewhere;
      setDeclining(false); setElsewhere(null); setNote('');
      say(accept ? 'Offer accepted' : 'Offer declined',
        accept ? `The seat is held for you.${gone ? ` ${gone} application${gone === 1 ? '' : 's'} at the other branches withdrawn.` : ''} The admission fee comes next.` : 'The school has been told.');
      onChanged();
    } catch (e) { say('Not sent', errMsg(e)); } finally { setBusy(false); }
  };
  const accept = async () => {
    // Open applications at the other branches of the school's group, if any.
    let others: any[] = [];
    try { others = unwrapList((await portal.group() as any)?.data?.applications).filter((a: any) => a.open && String(a._id) !== String(appId)); } catch { /* not in a group */ }
    if (others.length) { setWithdrawOthers(true); setElsewhere(others); return; }
    if (await confirmAsync('Accept the offer?', 'The seat is held for you; the admission fee comes next.', 'Accept')) respond(true);
  };
  const letter = () => openAdmissionFile(portal.offerUrl(appId), `offer-${offer.offerNumber}.pdf`).catch((e) => say('Could not open the letter', errMsg(e)));

  return (
    <Panel icon="sparkles-outline" tone="teal" title={offer.status === 'issued' ? 'You have been offered a seat' : 'Offer accepted'}
      right={<Btn icon="document-text-outline" onPress={letter}>Letter</Btn>}>
      <Facts>
        <Fact k="Offer" v={offer.offerNumber} />
        {offer.status === 'issued' ? <Fact k="Answer by" v={fmtDateTime(offer.respondBy)} /> : null}
        <Fact k="Admission fee" v={money(offer.feeAmount)} />
        <Fact k="Pay by" v={fmtDate(offer.feeDueAt)} />
      </Facts>
      {offer.canRespond ? (
        <Row>
          <Btn kind="primary" icon="checkmark-circle-outline" disabled={busy} onPress={accept}>Accept the offer</Btn>
          <Btn disabled={busy} onPress={() => setDeclining(true)}>Decline</Btn>
        </Row>
      ) : offer.status === 'issued' ? <Note tone="slate">Please contact the admission office to answer this offer.</Note> : null}

      <Sheet visible={declining} icon="close-circle-outline" tone="red" title="Decline the offer?" subtitle="The seat goes to the next family on the waiting list. This cannot be undone here."
        onClose={() => setDeclining(false)} busy={busy}
        footer={<><Btn block onPress={() => setDeclining(false)}>Keep the offer</Btn><Btn block kind="stop" disabled={busy || !note.trim()} onPress={() => respond(false, note.trim())}>Decline</Btn></>}>
        <Field label="Please tell the school why" required>
          <Box value={note} onChange={setNote} multiline maxLength={300} placeholder="For example, we are moving to another city" />
        </Field>
      </Sheet>

      <Sheet visible={!!elsewhere} icon="checkmark-circle-outline" tone="green" title="Accept the offer" onClose={() => setElsewhere(null)} busy={busy}
        footer={<><Btn block onPress={() => setElsewhere(null)}>Cancel</Btn><Btn block kind="primary" disabled={busy} onPress={() => respond(true, '', withdrawOthers)}>Accept</Btn></>}>
        <Text style={{ fontSize: 13.5, lineHeight: 19, marginBottom: 10 }}>
          You also have {elsewhere?.length} open application{elsewhere?.length === 1 ? '' : 's'} at other branches: {(elsewhere || []).map((a) => a.schoolName).join(', ')}.
        </Text>
        <Tick on={withdrawOthers} onChange={setWithdrawOthers} label="Withdraw them — this frees the seats for other families" />
        <Muted>Leave it unticked to keep them open; you can withdraw each later.</Muted>
      </Sheet>
    </Panel>
  );
}
