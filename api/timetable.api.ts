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
// Copy one year's plan into another. Without `apply` it only reports what would move.
export const carryForward = (data: object) => api.post(`${base}/carry-forward`, data);

// ── Rooms ─────────────────────────────────────────────────────────────────────
export const getRooms   = (params?: object)          => api.get(`${base}/rooms`, { params });
// The Rooms screen's own read: rooms plus the tiles and filters around them.
export const getRoomsOverview = (params?: object)    => api.get(`${base}/rooms/overview`, { params });
export const getRoomSchedule  = (id: string, yearId?: string) =>
  api.get(`${base}/rooms/${id}/schedule`, { params: yearId ? { yearId } : {} });
export const importRooms      = (rooms: object[])    => api.post(`${base}/rooms/import`, { rooms });
export const createRoom = (data: object)             => api.post(`${base}/rooms`, data);
export const updateRoom = (id: string, d: object)    => api.put(`${base}/rooms/${id}`, d);
export const deleteRoom = (id: string)               => api.delete(`${base}/rooms/${id}`);

// ── Teacher availability ──────────────────────────────────────────────────────
export const getAvailability  = (yearId?: string)             => api.get(`${base}/availability`, { params: yearId ? { yearId } : {} });
// Availability plus the load it has to accommodate.
export const getAvailabilityOverview = (yearId?: string)      => api.get(`${base}/availability/overview`, { params: yearId ? { yearId } : {} });
// Without `apply` this only reports the weekday patterns it found.
export const importAvailability = (data: object)              => api.post(`${base}/availability/import`, data);
export const saveAvailability = (teacherId: string, d: object) => api.put(`${base}/availability/${teacherId}`, d);

// ── Generation & versions ─────────────────────────────────────────────────────
export const generate         = (data: object)         => api.post(`${base}/generate`, data);
// Dry run of an unsaved plan: the problems a run would hit, before generating.
export const preflight        = (data: object)         => api.post(`${base}/preflight`, data);
export const getVersions      = (params?: object)      => api.get(`${base}/versions`, { params });
export const getVersion       = (id: string)           => api.get(`${base}/versions/${id}`);
export const getProgress      = (id: string)           => api.get(`${base}/versions/${id}/progress`);
export const getConflicts     = (id: string)           => api.get(`${base}/versions/${id}/conflicts`);
export const deleteVersion    = (id: string)           => api.delete(`${base}/versions/${id}`);
export const validateVersion  = (id: string)           => api.post(`${base}/versions/${id}/validate`);
export const publishVersion   = (id: string, body?: object) => api.post(`${base}/versions/${id}/publish`, body ?? {});
// What publishing would overwrite or collide with, before committing to it.
export const publishPreview   = (id: string)           => api.get(`${base}/versions/${id}/publish-preview`);
// Rename a version or change its notes.
export const updateVersion    = (id: string, d: object) => api.put(`${base}/versions/${id}`, d);
// Slot-by-slot differences between two versions.
export const compareVersions  = (id: string, other: string) => api.get(`${base}/versions/${id}/compare/${other}`);
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

// ── Reports over the published week ───────────────────────────────────────────
// One call per tab: each returns its tiles, its charts and its table together.
export const getReportOverview  = (yearId?: string) => api.get(`${base}/reports/overview`, { params: yearId ? { yearId } : {} });
export const getSubjectSplit    = (yearId?: string) => api.get(`${base}/reports/subject-distribution`, { params: yearId ? { yearId } : {} });
export const getFreePeriods     = (yearId?: string) => api.get(`${base}/reports/free-periods`, { params: yearId ? { yearId } : {} });
export const getLiveConflicts   = (yearId?: string) => api.get(`${base}/reports/conflicts`, { params: yearId ? { yearId } : {} });
export const getYearComparison  = (yearId?: string, compareTo?: string) =>
  api.get(`${base}/reports/year-comparison`, {
    params: { ...(yearId ? { yearId } : {}), ...(compareTo ? { compareTo } : {}) },
  });
