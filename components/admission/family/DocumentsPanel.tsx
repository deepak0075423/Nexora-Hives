/**
 * Documents on a family's application (phone): what the school still needs —
 * uploaded here from the phone's files or its camera, or fetched from
 * DigiLocker — and every paper sent so far, each one openable.
 *
 * An upload goes through the server's own checks (type, size, a virus scan
 * where the school runs one); the server's answer is what the family sees.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { portal } from '@/api/admission.api';
import { openAdmissionFile, openAuth, pickFile, partOf } from '../files';
import { Panel, Btn, Row, Note, Line, Tag, Muted, Pick, useApi, DOC_STATUS, size, fmtTime, errMsg, say, unwrapList } from '../parts';

export default function DocumentsPanel({ appId, documents, status, onChanged }: { appId: string; documents: any; status: string; onChanged: () => void }) {
  const [busy, setBusy] = useState('');
  const reqs = unwrapList(documents?.requirements);
  const files = unwrapList(documents?.files);
  const nameOf = (key: string) => reqs.find((r) => r.key === key)?.name || key;
  const toUpload = [
    ...files.filter((f) => ['rejected', 'resubmission_required'].includes(f.status)).map((f) => ({ key: f.docKey, name: nameOf(f.docKey), reason: f.rejectionReason || 'The school asked for it again', req: reqs.find((r) => r.key === f.docKey) })),
    ...reqs.filter((r) => r.required && !files.some((f) => f.docKey === r.key)).map((r) => ({ key: r.key, name: r.name, reason: 'Not uploaded yet', req: r })),
  ];

  const upload = async (key: string, accept: string[] | undefined, from: 'files' | 'camera') => {
    try {
      const p = await pickFile(from, accept);
      if (!p) return;
      setBusy(key);
      const fd = new FormData();
      fd.append('docType', key);
      fd.append('file', partOf(p));
      await portal.upload(appId, fd);
      say('Uploaded', 'The school will check it again.');
      onChanged();
    } catch (e) { say('Not uploaded', errMsg(e)); } finally { setBusy(''); }
  };
  const open = (f: any) => openAdmissionFile(portal.docUrl(appId, f._id), f.originalName || `${f.docKey}.pdf`).catch((e) => say('Could not open it', errMsg(e)));

  return (
    <>
      {toUpload.length || status === 'documents_pending' ? (
        <>
          <DigiLocker appId={appId} requirements={reqs} onFetched={onChanged} />
          {toUpload.length ? (
            <Panel icon="cloud-upload-outline" tone="amber" title="Documents to upload" subtitle="A PDF or a clear photo of each">
              {toUpload.map((x, i) => (
                <View key={x.key} style={[st.need, i === toUpload.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={st.needName}>{x.name}</Text>
                  <Text style={st.needWhy}>{x.reason}</Text>
                  <Row>
                    <Btn kind="primary" icon="document-attach-outline" disabled={!!busy} onPress={() => upload(x.key, x.req?.accept, 'files')}>{busy === x.key ? 'Uploading…' : 'Choose a file'}</Btn>
                    {(x.req?.accept || ['jpg']).some((a: string) => ['jpg', 'jpeg', 'png'].includes(a)) ? <Btn icon="camera-outline" disabled={!!busy} onPress={() => upload(x.key, x.req?.accept, 'camera')}>Take a photo</Btn> : null}
                  </Row>
                  {x.req?.maxSizeMB ? <Muted>Up to {x.req.maxSizeMB} MB · {(x.req.accept || ['pdf', 'jpg', 'png']).join(', ').toUpperCase()}</Muted> : null}
                </View>
              ))}
            </Panel>
          ) : null}
        </>
      ) : null}
      <Panel icon="folder-open-outline" tone="teal" title="Documents">
        {files.length ? files.map((f, i) => (
          <Line key={f._id} last={i === files.length - 1} onPress={() => open(f)} right={<Tag map={DOC_STATUS} value={f.status} />}
            title={nameOf(f.docKey)} sub={[f.originalName, size(f.size)].filter(Boolean).join(' · ')} />
        )) : <Muted>No documents yet.</Muted>}
      </Panel>
    </>
  );
}

/**
 * "Fetch from DigiLocker": the family signs in at DigiLocker in the in-app
 * browser and allows it; DigiLocker sends them back to the app; then each
 * issued document is matched to a paper the school asks for. Nothing shows
 * where the school (or the platform) has DigiLocker off.
 */
function DigiLocker({ appId, requirements, onFetched }: { appId: string; requirements: any[]; onFetched: () => void }) {
  const { data, reload } = useApi<any>(() => portal.digilocker(appId), [appId]);
  const [busy, setBusy] = useState('');
  const [pick, setPick] = useState<Record<string, string>>({});
  if (!data?.available) return null;
  const connect = async () => {
    setBusy('connect');
    try {
      const r: any = await portal.digilockerStart(appId);
      await openAuth(r?.data?.url);
      await reload();
    } catch (e) { say('DigiLocker could not be opened', errMsg(e)); } finally { setBusy(''); }
  };
  const fetchOne = async (f: any) => {
    const docKey = pick[f.uri];
    if (!docKey) return;
    setBusy(f.uri);
    try {
      const r: any = await portal.digilockerImport(appId, { uri: f.uri, docKey });
      say(`${r?.data?.name || 'The document'} added from DigiLocker`, r?.data?.verified ? 'It counts as verified.' : 'The school will check it.');
      onFetched(); reload();
    } catch (e) { say('Not fetched', errMsg(e)); } finally { setBusy(''); }
  };
  const connected = data.status === 'connected';
  const issued = unwrapList(data.files);
  return (
    <Panel icon="shield-checkmark-outline" tone="teal" title="Fetch documents from DigiLocker"
      subtitle={connected ? `Connected${data.account?.name ? ` as ${data.account.name}` : ''} until ${fmtTime(data.expiresAt)}` : 'Documents issued to you — a birth certificate, mark sheets, a transfer certificate — straight from the issuer'}>
      {data.error ? <Note tone="red" icon="alert-circle-outline">{data.error}</Note> : null}
      {!connected ? (
        <Btn kind="primary" icon="open-outline" disabled={busy === 'connect'} onPress={connect}>{busy === 'connect' ? 'Opening DigiLocker…' : 'Connect DigiLocker'}</Btn>
      ) : issued.length ? (
        <View style={{ gap: 10 }}>
          {issued.map((f) => (
            <View key={f.uri} style={st.issued}>
              <Text style={st.needName}>{f.name}</Text>
              {f.issuer ? <Muted>{f.issuer}</Muted> : null}
              <Pick label={`Use ${f.name} as`} value={pick[f.uri] || ''} placeholder="Use as…" onChange={(v) => setPick({ ...pick, [f.uri]: v })}
                options={requirements.map((r) => ({ value: r.key, label: r.name }))} />
              <Btn kind="primary" disabled={!pick[f.uri] || busy === f.uri} onPress={() => fetchOne(f)}>{busy === f.uri ? 'Fetching…' : 'Fetch'}</Btn>
            </View>
          ))}
          {data.account && !data.account.dobMatchesStudent ? <Muted>This DigiLocker account’s date of birth is not the student’s — fine if it is a parent’s locker; the school sees the same.</Muted> : null}
        </View>
      ) : <Note tone="slate">No issued documents in this DigiLocker account.</Note>}
    </Panel>
  );
}

const st = StyleSheet.create({
  need: { gap: 6, paddingBottom: 12, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  needName: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  needWhy: { fontSize: 12, color: Colors.danger },
  issued: { gap: 6, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
});
