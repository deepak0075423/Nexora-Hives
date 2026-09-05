import api from './axios';

// `childId` selects which child's detail block the server builds.
export const getDashboard       = (childId?: string) =>
  api.get('/parent/dashboard', childId ? { params: { childId } } : undefined);
export const getModules         = () => api.get('/parent/modules');
export const getChildClass      = () => api.get('/parent/child-class');
export const getChildAttendance = () => api.get('/parent/child-attendance');
export const getExamResults     = () => api.get('/parent/exams');
export const getResults         = () => api.get('/parent/results');
export const getResultDetail    = (id: string) => api.get(`/parent/results/${id}`);
export const getClassTests      = () => api.get('/parent/results/class-tests');
export const getDocuments       = () => api.get('/parent/documents');
export const getDocument        = (id: string) => api.get(`/parent/documents/${id}`);
export const getHolidays        = () => api.get('/parent/holidays');

// Fees
export const getParentFees      = () => api.get('/fees/parent/fees');
export const getChildFees       = (childId: string) => api.get(`/fees/parent/child/${childId}/fees`);
