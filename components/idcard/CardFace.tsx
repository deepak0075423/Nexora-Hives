/**
 * One face of an ID card on the phone (Oct 2026) — the web's IdCardFace and
 * the PDF's layout, laid out in "u": one hundredth of the card's width, so
 * the card is the same card at any size.
 *
 * The app has no SVG library, so the card's printed art — the curved header
 * with its gradient and security lines, the stripes — is the same SVG the web
 * draws, handed to expo-image as a data URI. Under it sits a plain band of
 * the school's colour: on a device that could not draw the SVG the header is
 * still coloured, and its white text still readable.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { fileUrl, qrPngUrl } from '@/api/idcards.api';

export const RATIO = 85.6 / 53.98;
const INK = '#0F172A';
const MUTED = '#64748B';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function shade(hex: string, amount: number) {
  const n = parseInt(String(hex || '#1b2a5e').slice(1), 16);
  const mix = (c: number) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  const parts = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.max(0, Math.min(255, mix(c))).toString(16).padStart(2, '0'));
  return `#${parts.join('')}`;
}

/** "14 May 2013" from a stored day ("2013-05-14" or UTC midnight). */
export const fmtDay = (d?: string | null) => {
  if (!d) return '';
  const s = /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00Z` : d;
  const x = new Date(s);
  return Number.isNaN(x.getTime()) ? '' : `${String(x.getUTCDate()).padStart(2, '0')} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
};
const fmtDate = (d?: string | null) => {
  const x = d ? new Date(d) : null;
  return x && !Number.isNaN(x.getTime()) ? `${String(x.getDate()).padStart(2, '0')} ${MONTHS[x.getMonth()]} ${x.getFullYear()}` : '';
};
const initials = (name?: string) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';

/* ── The printed art, as the web draws it ─────────────────────────────────── */

function patternPaths(kind: string, x: number, y: number, w: number, h: number) {
  if (kind === 'plain') return '';
  const rows = kind === 'waves' ? 5 : 14;
  const amp = kind === 'waves' ? h / 9 : h / 7;
  let out = '';
  for (let i = 0; i < rows; i += 1) {
    const base = y + (h * (i + 0.5)) / rows;
    const phase = (i % 2 ? 0.5 : 0) * (w / 3);
    let d = `M${(x - w / 3 + phase).toFixed(2)} ${base.toFixed(2)}`;
    for (let k = -1; k < 4; k += 1) {
      const sx = x + k * (w / 3) + phase;
      d += ` C${(sx + w / 12).toFixed(2)} ${(base - amp).toFixed(2)} ${(sx + w / 4).toFixed(2)} ${(base + amp).toFixed(2)} ${(sx + w / 3).toFixed(2)} ${base.toFixed(2)}`;
    }
    out += `<path d="${d}"/>`;
  }
  return out;
}
const lines = (kind: string, x: number, y: number, w: number, h: number, color: string, opacity: number) =>
  `<g fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${kind === 'waves' ? 0.6 : 0.16}">${patternPaths(kind, x, y, w, h)}</g>`;

function artSvg(look: any, side: string, landscape: boolean) {
  const p = look.primary || '#1b2a5e';
  const a = look.accent || '#2563eb';
  const pat = look.pattern || 'guilloche';
  const grad = `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(p, 0.08)}"/><stop offset="1" stop-color="${shade(p, -0.18)}"/></linearGradient>`;
  let body = '';
  let vb = '';
  if (!landscape && side === 'front') {
    vb = '0 0 100 158.52';
    const head = 'M0 0 H100 V38 Q50 48 0 38 Z';
    body = `<defs>${grad}<clipPath id="c"><path d="${head}"/></clipPath></defs>${lines(pat, 0, 46, 100, 100, p, 0.05)}<path d="${head}" fill="url(#g)"/><g clip-path="url(#c)">${lines(pat, 0, 0, 100, 44, '#ffffff', 0.1)}</g><path d="M0 38.6 Q50 48.6 100 38.6" fill="none" stroke="${a}" stroke-width="0.9"/>`;
  } else if (!landscape) {
    vb = '0 0 100 158.52';
    body = `<defs>${grad}<clipPath id="c"><rect width="100" height="20"/></clipPath></defs><rect width="100" height="20" fill="url(#g)"/><g clip-path="url(#c)">${lines(pat, 0, 0, 100, 20, '#ffffff', 0.1)}</g><rect y="20" width="100" height="0.8" fill="${a}"/>${lines(pat, 0, 22, 100, 120, p, 0.035)}<rect y="154.5" width="100" height="4.02" fill="${a}"/>`;
  } else if (side === 'front') {
    vb = '0 0 100 63.06';
    body = `<defs>${grad}<clipPath id="c"><rect width="100" height="18"/></clipPath></defs>${lines(pat, 0, 19, 100, 38, p, 0.05)}<rect width="100" height="18" fill="url(#g)"/><g clip-path="url(#c)">${lines(pat, 0, 0, 100, 18, '#ffffff', 0.1)}</g><rect y="18" width="100" height="0.7" fill="${a}"/>`;
  } else {
    vb = '0 0 100 63.06';
    body = `<defs>${grad}<clipPath id="c"><rect width="100" height="12"/></clipPath></defs><rect width="100" height="12" fill="url(#g)"/><g clip-path="url(#c)">${lines(pat, 0, 0, 100, 12, '#ffffff', 0.1)}</g><rect y="12" width="100" height="0.6" fill="${a}"/>${lines(pat, 0, 13, 100, 45, p, 0.035)}<rect y="60.06" width="100" height="3" fill="${a}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="none">${body}</svg>`;
}

const b64 = (s: string) => {
  try { return (globalThis as any).btoa(s); } catch { return ''; }
};

/* ── What prints ──────────────────────────────────────────────────────────── */

function frontFields(card: any, look: any): [string, string, boolean][] {
  const s = card.snapshot || {};
  const on = (k: string) => look.fields?.[k] === true;
  const out: [string, string, boolean][] = [];
  const add = (k: string, label: string, value: any, wide = false) => { if (on(k) && value) out.push([label, String(value), wide]); };
  if (card.kind === 'student') {
    add('admissionNo', 'Admission No.', s.holderCode);
    add('rollNo', 'Roll No.', s.rollNumber);
    add('dob', 'Date of Birth', fmtDay(s.dob));
    add('bloodGroup', 'Blood Group', s.bloodGroup);
  } else if (card.kind === 'parent') {
    add('parentId', 'Parent ID', s.holderCode);
    add('phone', 'Phone', s.phone);
    add('children', 'Parent of', (s.children || []).map((c: any) => c.name).join(', '), true);
  } else {
    add('employeeId', 'Employee ID', s.holderCode);
    add('department', 'Department', s.department);
    add('bloodGroup', 'Blood Group', s.bloodGroup);
    add('dob', 'Date of Birth', fmtDay(s.dob));
    add('joiningDate', 'Joined', fmtDay(s.joiningDate));
  }
  return out;
}
function backFields(card: any, look: any): [string, string][] {
  const s = card.snapshot || {};
  const on = (k: string) => look.fields?.[k] === true;
  const out: [string, string][] = [];
  if (card.kind === 'student') {
    if (on('parentName') && s.parentName) out.push(["Parent's Name", s.parentName]);
    if (on('emergencyPhone') && s.emergencyPhone) out.push(['Emergency Contact', s.emergencyPhone]);
    if (on('address') && s.address) out.push(['Home Address', s.address]);
  } else if (card.kind !== 'parent') {
    if (on('phone') && s.phone) out.push(['Phone', s.phone]);
    if (on('emergencyPhone') && s.emergencyPhone) out.push(['Emergency Contact', s.emergencyPhone]);
  }
  return out;
}
export function subLine(card: any) {
  const s = card?.snapshot || {};
  if (card?.kind === 'student') return [s.className, s.sectionName].filter(Boolean).join(' – ') || 'Student';
  if (card?.kind === 'parent') return s.relationship || 'Parent';
  return s.designation || (card?.kind === 'teacher' ? 'Teacher' : 'Staff');
}
const KIND_TITLE: Record<string, string> = { student: 'STUDENT', teacher: 'TEACHER', staff: 'STAFF', parent: 'PARENT' };
const STAMP: Record<string, string> = { expired: 'EXPIRED', blocked: 'BLOCKED', lost: 'REPORTED LOST', damaged: 'DAMAGED', reissued: 'REPLACED', cancelled: 'CANCELLED' };

/* ── The face ─────────────────────────────────────────────────────────────── */

export default function CardFace({ card, side = 'front', width, stamp = true }: { card: any; side?: 'front' | 'back'; width: number; stamp?: boolean }) {
  const look = useMemo(() => card?.design || {}, [card?.design]);
  const landscape = look.layout === 'landscape';
  const W = width;
  const H = landscape ? W / RATIO : W * RATIO;
  const u = W / 100;
  const art = useMemo(() => b64(artSvg(look, side, landscape)), [look, side, landscape]);
  const s = card?.snapshot || {};
  const primary = look.primary || '#1b2a5e';
  const accent = look.accent || '#2563eb';
  const accentInk = shade(accent, -0.12);
  const id = look.identity || {};
  const logo = look.showLogo && id.logo ? fileUrl(id.logo) : '';
  const photo = fileUrl(s.photo);
  const circle = look.photoShape === 'circle';
  const qrFront = look.qrOn === 'front';
  const t = (size: number, weight: any = '700', color = INK, extra: object = {}) => ({ fontSize: size * u, fontWeight: weight, color, ...extra });

  const Label = ({ children }: { children: React.ReactNode }) => <Text style={t(landscape ? 1.7 : 2.1, '600', MUTED, { letterSpacing: 0.07 * 2 * u, textTransform: 'uppercase' })} numberOfLines={1}>{children}</Text>;
  const Value = ({ children, lines = 1 }: { children: React.ReactNode; lines?: number }) => <Text style={t(landscape ? 2.55 : 3.1, '700', INK, { marginTop: 0.8 * u })} numberOfLines={lines}>{children}</Text>;

  const Photo = (box: { left: number; top: number; w: number; h: number; r: number; frame: number }) => (
    <View style={{ position: 'absolute', left: (box.left - box.frame) * u, top: (box.top - box.frame) * u, width: (box.w + 2 * box.frame) * u, height: (box.h + 2 * box.frame) * u, borderRadius: (box.r + box.frame) * u, backgroundColor: '#fff', padding: box.frame * u, shadowColor: '#0F172A', shadowOpacity: 0.18, shadowRadius: 2 * u, shadowOffset: { width: 0, height: u }, elevation: 3 }}>
      <View style={{ flex: 1, borderRadius: box.r * u, overflow: 'hidden', backgroundColor: shade(primary, 0.84), alignItems: 'center', justifyContent: 'center' }}>
        {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : <Text style={t(box.w * 0.34, '800', shade(primary, 0.28))}>{initials(s.name)}</Text>}
      </View>
    </View>
  );

  const Chip = ({ k = 1 }: { k?: number }) => {
    if (card.kind === 'student' && s.yearName) {
      const till = card.validUntil || (s.yearEnd ? `${s.yearEnd}T00:00:00Z` : null);
      return (
        <View style={{ alignItems: landscape ? 'center' : 'flex-start' }}>
          <View style={{ height: 5.6 * k * u, paddingHorizontal: 2.5 * k * u, borderRadius: 99, borderWidth: Math.max(0.5, 0.35 * u), borderColor: accent, backgroundColor: shade(accent, 0.9), justifyContent: 'center' }}>
            <Text style={t(2.7 * k, '800', shade(accent, -0.25))}>{s.yearName}</Text>
          </View>
          {look.showValidity && till ? <Text style={t(2.05 * k, '600', MUTED, { marginTop: 1.1 * k * u })} numberOfLines={1}>Valid till {fmtDay(till)}</Text> : null}
        </View>
      );
    }
    return (
      <View style={{ alignItems: landscape ? 'center' : 'flex-start' }}>
        <Text style={t(1.9 * k, '600', MUTED, { letterSpacing: 0.15 * u })}>CARD NO.</Text>
        <Text style={t(2.8 * k, '700', INK, { marginTop: 0.8 * k * u })} numberOfLines={1}>{card.number}</Text>
        {look.showValidity ? <Text style={t(2.05 * k, '600', MUTED, { marginTop: 0.8 * k * u })} numberOfLines={1}>Issued {fmtDate(card.issuedAt)}</Text> : null}
      </View>
    );
  };

  const Sign = ({ left, top, w, k = 1 }: { left: number; top: number; w: number; k?: number }) => {
    if (!look.showSignature) return null;
    const sig = look.signatory?.signature ? fileUrl(look.signatory.signature) : '';
    return (
      <View style={{ position: 'absolute', left: left * u, top: top * u, width: w * u, alignItems: 'center' }}>
        <View style={{ height: 7.2 * k * u, width: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
          {sig ? <Image source={{ uri: sig }} style={{ width: '100%', height: '100%' }} contentFit="contain" contentPosition="bottom" /> : null}
        </View>
        <View style={{ alignSelf: 'stretch', marginTop: 0.8 * k * u, borderTopWidth: Math.max(0.5, 0.22 * u), borderTopColor: '#94A3B8' }} />
        <Text style={t(2.1 * k, '600', MUTED, { marginTop: 0.8 * k * u })} numberOfLines={1}>{look.signatory?.title || 'Principal'}</Text>
      </View>
    );
  };

  const Stripe = ({ top, size }: { top: number; size: number }) => {
    const dup = Number(card.reissueNo) > 0 && ['lost', 'damaged'].includes(card.reissueReason);
    return (
      <View style={{ position: 'absolute', left: 0, right: 0, top: top * u, bottom: 0, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={t(size, '800', '#fff', { letterSpacing: 0.32 * size * u })}>{KIND_TITLE[card.kind]}</Text>
        {dup ? <Text style={[t(landscape ? 1.5 : 1.7, '700', 'rgba(255,255,255,0.88)'), { position: 'absolute', right: 3 * u, letterSpacing: 0.1 * u }]}>{card.reissueNo > 1 ? `DUPLICATE ${card.reissueNo}` : 'DUPLICATE'}</Text> : null}
      </View>
    );
  };

  const Qr = ({ size, pad, r }: { size: number; pad: number; r: number }) => (
    <View style={{ width: size * u, height: size * u, padding: pad * u, borderRadius: r * u, borderWidth: Math.max(0.5, 0.3 * u), borderColor: '#E2E8F0', backgroundColor: '#fff' }}>
      {card.code ? <Image source={{ uri: qrPngUrl(card.code) }} style={{ width: '100%', height: '100%' }} contentFit="contain" /> : null}
    </View>
  );

  const Stamp = () => (STAMP[card.status] && stamp && side === 'front' ? (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <View style={{ transform: [{ rotate: '-28deg' }], borderWidth: 0.8 * u, borderColor: 'rgba(220,38,38,0.55)', borderRadius: 2 * u, paddingHorizontal: 4 * u, paddingVertical: 1.2 * u, backgroundColor: 'rgba(255,255,255,0.14)' }}>
        <Text style={t(landscape ? 6.4 : 8.4, '800', 'rgba(220,38,38,0.62)', { letterSpacing: 0.6 * u })} numberOfLines={1}>{STAMP[card.status]}</Text>
      </View>
    </View>
  ) : null);

  const Slot = () => (landscape
    ? <View style={{ position: 'absolute', left: 45 * u, top: 1.6 * u, width: 10 * u, height: 2 * u, borderRadius: u, backgroundColor: 'rgba(15,23,42,0.55)' }} />
    : <View style={{ position: 'absolute', left: 42.8 * u, top: 4.5 * u, width: 14.4 * u, height: 3.6 * u, borderRadius: 1.8 * u, backgroundColor: 'rgba(15,23,42,0.55)' }} />);

  const returnBlock = (left: boolean, k = 1) => {
    const contact = [id.phone, id.email || id.website].filter(Boolean).join('  ·  ');
    const align = left ? 'left' : 'center';
    return (
      <View style={{ marginTop: (left ? 1.6 : 2.6) * u, alignSelf: 'stretch' }}>
        {look.showReturnAddress ? <Text style={t(left ? 1.6 : 1.9, '600', MUTED, { letterSpacing: 0.15 * u, textAlign: align })}>IF FOUND, PLEASE RETURN TO</Text> : null}
        <Text style={t((left ? 2.5 : 2.9) * k, '800', primary, { marginTop: 0.8 * u, textAlign: align })} numberOfLines={1}>{id.name}</Text>
        {id.address ? <Text style={t(left ? 2 : 2.35, '400', '#334155', { marginTop: 0.5 * u, textAlign: align, lineHeight: (left ? 2.5 : 2.95) * u })} numberOfLines={2}>{id.address}</Text> : null}
        {contact ? <Text style={t(left ? 2 : 2.35, '600', '#334155', { marginTop: 0.4 * u, textAlign: align })} numberOfLines={1}>{contact}</Text> : null}
      </View>
    );
  };

  let face: React.ReactNode;
  if (!landscape && side === 'front') {
    const fields = frontFields(card, look);
    const box = circle ? { left: 32, top: 44, w: 36, h: 36, r: 18, frame: 1.3 } : { left: 33, top: 43, w: 34, h: 41, r: 3, frame: 1.3 };
    face = (
      <>
        {logo ? (
          <View style={{ position: 'absolute', left: 43.6 * u, top: 9.1 * u, width: 12.8 * u, height: 12.8 * u, borderRadius: 6.4 * u, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <Image source={{ uri: logo }} style={{ width: 8.45 * u, height: 8.45 * u }} contentFit="contain" />
          </View>
        ) : null}
        <View style={{ position: 'absolute', left: 6 * u, width: 88 * u, ...(logo ? { top: 23.4 * u } : { top: 6 * u, height: 31 * u, justifyContent: 'center' }) }}>
          <Text style={t(4.3, '800', '#fff', { textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.08 * u, lineHeight: 4.9 * u })} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.74}>{id.name || 'School'}</Text>
          {id.tagline ? <Text style={t(2.4, '600', 'rgba(255,255,255,0.82)', { textAlign: 'center', marginTop: 0.6 * u })} numberOfLines={1}>{id.tagline}</Text> : null}
        </View>
        <Photo {...box} />
        <View style={{ position: 'absolute', left: 6 * u, width: 88 * u, top: (box.top + box.h + 4.4) * u, height: (circle ? 47.6 : 43.6) * u, overflow: 'hidden' }}>
          <Text style={t(5.3, '800', INK, { textAlign: 'center' })} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{s.name}</Text>
          <Text style={t(3.25, '700', accentInk, { textAlign: 'center', marginTop: 0.4 * u })} numberOfLines={1}>{subLine(card)}</Text>
          <View style={{ marginTop: 2.6 * u, paddingLeft: 3 * u, flexDirection: 'row', gap: 3 * u }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: qrFront ? 56 * u : 82 * u, rowGap: 1.4 * u, columnGap: 4 * u }}>
              {fields.map(([label, value, wide]) => (
                <View key={label} style={{ width: wide ? (qrFront ? 56 : 82) * u : (qrFront ? 56 : 39) * u }}>
                  <Label>{label}</Label>
                  <Value lines={wide ? 2 : 1}>{value}</Value>
                </View>
              ))}
            </View>
            {qrFront ? <Qr size={22} pad={1.5} r={1.6} /> : null}
          </View>
        </View>
        <View style={{ position: 'absolute', left: 8 * u, top: 136 * u, width: 46 * u }}><Chip /></View>
        <Sign left={60} top={132.5} w={32} />
        <Stripe top={150.5} size={3.1} />
      </>
    );
  } else if (!landscape) {
    const extras = backFields(card, look);
    face = (
      <>
        <Text style={[t(3.1, '800', '#fff', { textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.12 * u }), { position: 'absolute', left: 7 * u, width: 86 * u, top: 10.6 * u }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{id.name}</Text>
        <View style={{ position: 'absolute', left: 8 * u, width: 84 * u, top: (qrFront ? 29 : 26) * u, bottom: 8.6 * u, alignItems: 'center' }}>
          {!qrFront ? (
            <>
              <Qr size={46} pad={3} r={2.4} />
              <Text style={t(2.3, '600', MUTED, { marginTop: 2.2 * u })}>Scan to verify this card</Text>
              <Text style={t(3.3, '800', INK, { marginTop: 0.6 * u, letterSpacing: 0.2 * u })}>{card.number}</Text>
            </>
          ) : (
            <>
              <Text style={t(1.9, '600', MUTED, { letterSpacing: 0.15 * u })}>CARD NO.</Text>
              <Text style={t(4.2, '800', INK, { marginTop: u, letterSpacing: 0.25 * u })}>{card.number}</Text>
            </>
          )}
          {extras.length ? (
            <View style={{ alignSelf: 'stretch', marginTop: 3.4 * u, gap: 1.6 * u, paddingHorizontal: 2 * u }}>
              {extras.map(([label, value]) => (
                <View key={label}><Text style={t(1.9, '600', MUTED, { textTransform: 'uppercase', letterSpacing: 0.13 * u })}>{label}</Text><Text style={t(2.7, '700', INK, { marginTop: 0.8 * u })} numberOfLines={2}>{value}</Text></View>
              ))}
              <View style={{ marginTop: 0.8 * u, borderTopWidth: Math.max(0.5, 0.2 * u), borderTopColor: '#E2E8F0' }} />
            </View>
          ) : null}
          {returnBlock(false)}
          {look.backNote ? <Text style={t(2.1, '400', MUTED, { marginTop: 'auto', paddingTop: 2 * u, textAlign: 'center', lineHeight: 2.75 * u })} numberOfLines={4}>{look.backNote}</Text> : null}
        </View>
      </>
    );
  } else if (side === 'front') {
    const fields = frontFields(card, look).slice(0, qrFront ? 3 : 5);
    const box = circle ? { left: 5, top: 22.6, w: 22, h: 22, r: 11, frame: 1 } : { left: 5.5, top: 22.2, w: 21, h: 25, r: 2.2, frame: 1 };
    face = (
      <>
        {logo ? (
          <View style={{ position: 'absolute', left: 4.1 * u, top: 3.6 * u, width: 10.8 * u, height: 10.8 * u, borderRadius: 5.4 * u, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <Image source={{ uri: logo }} style={{ width: 7.1 * u, height: 7.1 * u }} contentFit="contain" />
          </View>
        ) : null}
        <View style={{ position: 'absolute', left: (logo ? 17.5 : 5) * u, width: (logo ? 78.5 : 91) * u, top: 0, height: 18 * u, justifyContent: 'center', paddingTop: u }}>
          <Text style={t(3.5, '800', '#fff', { textTransform: 'uppercase', letterSpacing: 0.07 * u, lineHeight: 4 * u })} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>{id.name || 'School'}</Text>
          {id.tagline ? <Text style={t(1.95, '600', 'rgba(255,255,255,0.82)', { marginTop: 0.3 * u })} numberOfLines={1}>{id.tagline}</Text> : null}
        </View>
        <Photo {...box} />
        <View style={{ position: 'absolute', left: 34 * u, width: 61 * u, top: 22 * u, height: 27 * u, overflow: 'hidden' }}>
          <Text style={t(4.3, '800', INK)} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{s.name}</Text>
          <Text style={t(2.75, '700', accentInk, { marginTop: 0.3 * u })} numberOfLines={1}>{subLine(card)}</Text>
          <View style={{ marginTop: 1.5 * u, flexDirection: 'row', gap: 3 * u }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: qrFront ? 38 * u : 61 * u, rowGap: 0.8 * u, columnGap: 3 * u }}>
              {fields.map(([label, value, wide]) => (
                <View key={label} style={{ width: wide ? (qrFront ? 38 : 61) * u : (qrFront ? 38 : 29) * u }}>
                  <Label>{label}</Label>
                  <Value>{value}</Value>
                </View>
              ))}
            </View>
            {qrFront ? <Qr size={19} pad={1.3} r={1.2} /> : null}
          </View>
        </View>
        <View style={{ position: 'absolute', left: 3 * u, width: 26 * u, top: (circle ? 47.6 : 49.6) * u }}><Chip k={0.78} /></View>
        {qrFront ? null : <Sign left={74} top={44.4} w={21} k={0.86} />}
        <Stripe top={58.3} size={2.3} />
      </>
    );
  } else {
    const extras = backFields(card, look);
    face = (
      <>
        <Text style={[t(2.7, '800', '#fff', { textTransform: 'uppercase', letterSpacing: 0.1 * u }), { position: 'absolute', left: 6 * u, width: 88 * u, top: 4.3 * u }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{id.name}</Text>
        {!qrFront ? (
          <View style={{ position: 'absolute', left: 5 * u, top: 16 * u, width: 29 * u, alignItems: 'center' }}>
            <Qr size={29} pad={2} r={1.8} />
            <Text style={t(1.9, '600', MUTED, { marginTop: 1.4 * u })}>Scan to verify</Text>
            <Text style={t(2.45, '800', INK, { marginTop: 0.4 * u })} numberOfLines={1}>{card.number}</Text>
          </View>
        ) : null}
        <View style={{ position: 'absolute', left: (qrFront ? 6 : 39) * u, width: (qrFront ? 88 : 56) * u, top: 15.6 * u, bottom: 4.6 * u }}>
          {qrFront ? <Text style={t(2.4, '700', INK, { marginBottom: 1.6 * u, letterSpacing: 0.1 * u })}>CARD NO.  {card.number}</Text> : null}
          {extras.map(([label, value]) => (
            <View key={label} style={{ marginBottom: 0.9 * u }}><Text style={t(1.6, '600', MUTED, { textTransform: 'uppercase', letterSpacing: 0.1 * u })}>{label}</Text><Text style={t(2.3, '700', INK, { marginTop: 0.6 * u })} numberOfLines={1}>{value}</Text></View>
          ))}
          {returnBlock(true)}
          {look.backNote ? <Text style={t(1.8, '400', MUTED, { marginTop: 'auto', paddingTop: u, lineHeight: 2.35 * u })} numberOfLines={3}>{look.backNote}</Text> : null}
        </View>
      </>
    );
  }

  return (
    <View style={{ width: W, height: H, borderRadius: (landscape ? 3.715 : 5.89) * u, overflow: 'hidden', backgroundColor: '#fff' }}>
      {/* The school's colour first — the header stays coloured if the art below cannot be drawn. */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: (landscape ? (side === 'front' ? 18 : 12) : (side === 'front' ? 38 : 20)) * u, backgroundColor: shade(primary, -0.06) }} />
      {art ? <Image source={{ uri: `data:image/svg+xml;base64,${art}` }} style={StyleSheet.absoluteFill} contentFit="fill" /> : null}
      <Slot />
      {face}
      <Stamp />
    </View>
  );
}
