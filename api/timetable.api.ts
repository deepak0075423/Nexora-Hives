import api from './axios';

// Timetable generation, configuration, versioning & publishing (school admin).
// Mirrors school-frontend/src/api/timetable.api.js so both clients stay in sync.

const base = '/admin/timetable';

// ── Meta & configuration ──────────────────────────────────────────────────────
export const getMeta    = (yearId?: string) => api.get(`${base}/meta`, { params: yearId ? { yearId } : {} });
export const getConfig  = (yearId?: string) => api.get(`${base}/config`, { params: yearId ? { yearId } : {} });
export const saveConfig = (data: object)    => api.put(`${base}/config`, data);

// ── Rooms ─────────────────────────────────────────────────────────────────────
export const getRooms   = (params?: object)          => api.get(`${base}/rooms`, { params });
export const createRoom = (data: object)             => api.post(`${base}/rooms`, data);
export const updateRoom = (id: string, d: object)    => api.put(`${base}/rooms/${id}`, d);
export const deleteRoom = (id: string)               => api.delete(`${base}/rooms/${id}`);

// ── Teacher availability ──────────────────────────────────────────────────────
export const getAvailability  = (yearId?: string)             => api.get(`${base}/availability`, { params: yearId ? { yearId } : {} });
export const saveAvailability = (teacherId: string, d: object) => api.put(`${base}/availability/${teacherId}`, d);

// ── Subject requirements ──────────────────────────────────────────────────────
export const getRequirements   = (sectionId: string, yearId?: string) =>
  api.get(`${base}/requirements`, { params: { sectionId, ...(yearId ? { yearId } : {}) } });
export const saveRequirements  = (sectionId: string, data: object) => api.put(`${base}/requirements/${sectionId}`, data);
export const seedRequirements  = (data: object)                    => api.post(`${base}/requirements/seed`, data);

// ── Generation & versions ─────────────────────────────────────────────────────
export const generate         = (data: object)         => api.post(`${base}/generate`, data);
export const getVersions      = (params?: object)      => api.get(`${base}/versions`, { params });
export const getVersion       = (id: string)           => api.get(`${base}/versions/${id}`);
export const getProgress      = (id: string)           => api.get(`${base}/versions/${id}/progress`);
export const getConflicts     = (id: string)           => api.get(`${base}/versions/${id}/conflicts`);
export const deleteVersion    = (id: string)           => api.delete(`${base}/versions/${id}`);
export const validateVersion  = (id: string)           => api.post(`${base}/versions/${id}/validate`);
export const publishVersion   = (id: string)           => api.post(`${base}/versions/${id}/publish`);
export const regenerate       = (id: string, d?: object) => api.post(`${base}/versions/${id}/regenerate`, d ?? {});
export const duplicateVersion = (id: string)           => api.post(`${base}/versions/${id}/duplicate`, {});
export const restoreVersion   = (id: string)           => api.post(`${base}/versions/${id}/restore`, {});
export const archiveVersion   = (id: string)           => api.post(`${base}/versions/${id}/archive`, {});

// ── Entries (manual editing) ──────────────────────────────────────────────────
export const createEntry = (id: string, d: object)                  => api.post(`${base}/versions/${id}/entries`, d);
export const moveEntry   = (id: string, entryId: string, d: object) => api.post(`${base}/versions/${id}/entries/${entryId}/move`, d);
export const updateEntry = (id: string, entryId: string, d: object) => api.put(`${base}/versions/${id}/entries/${entryId}`, d);
export const deleteEntry = (id: string, entryId: string)            => api.delete(`${base}/versions/${id}/entries/${entryId}`);

// ── Audit ─────────────────────────────────────────────────────────────────────
export const getAudit = (params?: object) => api.get(`${base}/audit`, { params });
