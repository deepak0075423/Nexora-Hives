import api from './axios';

// Timetable generation, configuration, versioning & publishing (school admin).
// Mirrors school-frontend/src/api/timetable.api.js so both clients stay in sync.

const base = '/admin/timetable';

// ── Meta & configuration ──────────────────────────────────────────────────────
export const getMeta    = (yearId?: string) => api.get(`${base}/meta`, { params: yearId ? { yearId } : {} });
export const getConfig  = (yearId?: string) => api.get(`${base}/config`, { params: yearId ? { yearId } : {} });
// Subjects, weekly capacity and saved period counts for one class + its sections.
export const getClassPlan = (classId: string, sectionIds?: string[], yearId?: string) =>
  api.get(`${base}/class-plan`, {
    params: {
      classId,
      ...(sectionIds?.length ? { sectionIds: sectionIds.join(',') } : {}),
      ...(yearId ? { yearId } : {}),
    },
  });
export const saveConfig = (data: object)    => api.put(`${base}/config`, data);

// ── Rooms ─────────────────────────────────────────────────────────────────────
export const getRooms   = (params?: object)          => api.get(`${base}/rooms`, { params });
export const createRoom = (data: object)             => api.post(`${base}/rooms`, data);
export const updateRoom = (id: string, d: object)    => api.put(`${base}/rooms/${id}`, d);
export const deleteRoom = (id: string)               => api.delete(`${base}/rooms/${id}`);

// ── Teacher availability ──────────────────────────────────────────────────────
export const getAvailability  = (yearId?: string)             => api.get(`${base}/availability`, { params: yearId ? { yearId } : {} });
export const saveAvailability = (teacherId: string, d: object) => api.put(`${base}/availability/${teacherId}`, d);

// ── Generation & versions ─────────────────────────────────────────────────────
export const generate         = (data: object)         => api.post(`${base}/generate`, data);
export const getVersions      = (params?: object)      => api.get(`${base}/versions`, { params });
export const getVersion       = (id: string)           => api.get(`${base}/versions/${id}`);
export const getProgress      = (id: string)           => api.get(`${base}/versions/${id}/progress`);
export const getConflicts     = (id: string)           => api.get(`${base}/versions/${id}/conflicts`);
export const deleteVersion    = (id: string)           => api.delete(`${base}/versions/${id}`);
export const validateVersion  = (id: string)           => api.post(`${base}/versions/${id}/validate`);
export const publishVersion   = (id: string, body?: object) => api.post(`${base}/versions/${id}/publish`, body ?? {});
// What publishing would overwrite or collide with, before committing to it.
export const publishPreview   = (id: string)           => api.get(`${base}/versions/${id}/publish-preview`);
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

// ── Merge groups — sections taught a subject together ─────────────────────────
export const getMerges   = (params?: object)      => api.get(`${base}/merges`, { params });
export const saveMerge   = (data: object)         => api.post(`${base}/merges`, data);
export const deleteMerge = (id: string)           => api.delete(`${base}/merges/${id}`);

// ── Reports over the published week ───────────────────────────────────────────
export const getTeacherWorkload = (yearId?: string) => api.get(`${base}/reports/teacher-workload`, { params: yearId ? { yearId } : {} });
export const getRoomUtilisation = (yearId?: string) => api.get(`${base}/reports/room-utilisation`, { params: yearId ? { yearId } : {} });
