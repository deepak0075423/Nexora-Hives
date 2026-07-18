import { BASE_URL } from '@/api/axios';

// Backend origin that serves /uploads (API base minus the /api suffix).
const UPLOADS_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');

// School logo URL — handles both storage formats:
// bare filename ("169...png") and path ("/uploads/images/169...png").
export function schoolLogoUrl(school?: { logo?: string } | null): string | null {
  const logo = school?.logo;
  if (!logo) return null;
  if (/^https?:\/\//.test(logo)) return logo;
  if (logo.startsWith('/uploads')) return `${UPLOADS_ORIGIN}${logo}`;
  return `${UPLOADS_ORIGIN}/uploads/images/${logo}`;
}
