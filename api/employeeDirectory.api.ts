import api from './axios';

// Employee Directory — one API for school admins and teachers. The backend
// resolves the caller's level from the designation matrix and returns only the
// fields that level is entitled to, so nothing here branches on role: a block
// the caller may not see is simply absent from the response.
const base = '/employee-directory';

export const getMeta       = ()                 => api.get(`${base}/meta`);
export const getDashboard  = ()                 => api.get(`${base}/dashboard`);
export const getEmployees  = (params?: object)  => api.get(`${base}/employees`, { params });
export const getEmployee   = (id: string)       => api.get(`${base}/employees/${id}`);
export const getTimetable  = (id: string)       => api.get(`${base}/employees/${id}/timetable`);
export const getAttendance = (id: string)       => api.get(`${base}/employees/${id}/attendance`);
export const getLeave      = (id: string)       => api.get(`${base}/employees/${id}/leave`);

// Returns ONE unmasked value and is audited server-side. Never called to
// pre-fill a screen — only from an explicit action by the user.
export const revealField   = (id: string, field: string) => api.post(`${base}/employees/${id}/reveal`, { field });

export const updateEmployment = (id: string, body: object) => api.put(`${base}/employees/${id}/employment`, body);
export const setVerification  = (id: string, body: object) => api.put(`${base}/employees/${id}/verification`, body);

export const getDepartments  = () => api.get(`${base}/departments`);
export const getDesignations = () => api.get(`${base}/designations`);
export const getOrgStructure = () => api.get(`${base}/org-structure`);
export const getVerificationQueue = () => api.get(`${base}/verification`);

export const getResponsibilities  = (params?: object) => api.get(`${base}/responsibilities`, { params });
export const createResponsibility = (body: object)    => api.post(`${base}/responsibilities`, body);
export const removeResponsibility = (id: string)      => api.delete(`${base}/responsibilities/${id}`);

export const listReports = ()                              => api.get(`${base}/reports`);
export const getReport   = (type: string, params?: object) => api.get(`${base}/reports/${type}`, { params });

// Employee documents — the office reviews each one and chases what is owed.
export const getDocumentDesk        = ()                                  => api.get(`${base}/document-desk`);
export const reviewEmployeeDocument = (id: string, key: string, body: object) => api.put(`${base}/employees/${id}/documents/${key}/review`, body);
export const sendDocumentReminders  = (body: object)                     => api.post(`${base}/document-reminders`, body);

// My Documents — a member of staff's own paperwork. `file` is a FormData part
// (components/admission/files.partOf: {uri,name,type} on a phone, a File in a browser).
export const getMyDocuments   = ()                       => api.get(`${base}/me/documents`);
export const uploadMyDocument = (key: string, file: any) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post(`${base}/me/documents/${key}`, fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 });
};
