import api, { BASE_URL } from './axios';

/**
 * ID cards on the phone (Oct 2026) — the same endpoints the web uses
 * (school-backend controllers/idCardPortal + idCardAdmin).
 */

/** role: student | teacher | parent — a parent's reply carries their children's cards too. */
export const myIdCards = (role: string) => api.get(`/${role}/id-cards`);
/** One of my cards (or, for a parent, a child's) as a PDF — the file the school prints. */
export const myIdCardPdf = (role: string, id: string) => api.get(`/${role}/id-cards/${id}/pdf`, { params: { layout: 'card' }, responseType: 'blob' });

// ─── The office ──────────────────────────────────────────────────────────────
export const idCardOverview = () => api.get('/admin/id-cards/overview');
/** The verification desk: a card number, a code, or a scanned link. */
export const lookupIdCard = (q: string) => api.get('/admin/id-cards/lookup', { params: { q } });
export const idCardActivity = (limit = 30) => api.get('/admin/id-cards/activity', { params: { limit, scans: '1' } });

/** Where the school's files (photos, logos) are served — the API's root, without /api. */
export const FILE_ROOT = String(BASE_URL).replace(/\/api\/?$/, '');
export const fileUrl = (p?: string | null) => (!p ? '' : /^(https?:|data:)/.test(p) ? p : `${FILE_ROOT}${p.startsWith('/') ? '' : '/'}${p}`);
/** A card's QR as a PNG from the server — public, cached, only for a code that exists. */
export const qrPngUrl = (code: string) => `${BASE_URL}/public/id-card/${encodeURIComponent(code)}/qr.png`;
