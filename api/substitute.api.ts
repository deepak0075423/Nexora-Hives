import api from './axios';

// Substitute subject teachers. Part of the timetable module, so every endpoint
// sits behind the same module flag and designation permission as the rest of
// /admin/timetable. Mirrors school-frontend/src/api/substitute.api.js so both
// clients stay in sync.

const base = '/admin/substitutions';

// ── The day board ─────────────────────────────────────────────────────────────
// date: 'YYYY-MM-DD'. Reading the board also runs detection, so opening the
// screen is enough to surface a newly-marked absence.
export const getBoard = (date?: string) => api.get(base, { params: date ? { date } : {} });

// Detect + auto-fill on demand. force ignores the school's autoAssign switch.
export const runAutoAssign = (date?: string, force = false) =>
  api.post(`${base}/run`, { date, force });

// ── Assign / change / cancel ──────────────────────────────────────────────────
export const getCandidates = (id: string) => api.get(`${base}/${id}/candidates`);
export const assign = (id: string, substituteTeacherId: string, remarks?: string, force = false) =>
  api.post(`${base}/${id}/assign`, { substituteTeacherId, remarks, force });
export const updateRemarks = (id: string, remarks: string) =>
  api.put(`${base}/${id}/remarks`, { remarks });
export const cancel = (id: string, note?: string) =>
  api.delete(`${base}/${id}`, { data: { note } });

// ── Manual flow (neither attendance nor leave enabled) ────────────────────────
export const getSchedulableTeachers = (date?: string) =>
  api.get(`${base}/schedulable-teachers`, { params: date ? { date } : {} });
export const getTeacherPeriods = (teacherId: string, date?: string) =>
  api.get(`${base}/teacher-periods`, { params: { teacherId, date } });
export const createManual = (data: object) => api.post(`${base}/manual`, data);

// ── Workload & reporting ──────────────────────────────────────────────────────
export const getWorkload = (date?: string, teacherIds?: string[]) =>
  api.get(`${base}/workload`, {
    params: { date, ...(teacherIds?.length ? { teacherIds: teacherIds.join(',') } : {}) },
  });
export const getReport  = (from: string, to: string) => api.get(`${base}/report`, { params: { from, to } });
export const getHistory = (date?: string) => api.get(`${base}/history`, { params: { date } });

// ── Settings ──────────────────────────────────────────────────────────────────
export const getSettings  = ()             => api.get(`${base}/settings`);
export const saveSettings = (data: object) => api.put(`${base}/settings`, data);

// ── Teacher side ──────────────────────────────────────────────────────────────
export const getMySubstitutions = (from?: string, to?: string) =>
  api.get('/teacher/substitutions', {
    params: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
  });
