import api from './axios';

// `childId` selects which child's detail block the server builds.
export const getDashboard       = (childId?: string) =>
  api.get('/parent/dashboard', childId ? { params: { childId } } : undefined);
export const getModules         = () => api.get('/parent/modules');
export const getChildClass      = () => api.get('/parent/child-class');
export const getChildAttendance = () => api.get('/parent/child-attendance');
// `child` picks which child; the reply lists `children` to switch between.
export const getChildAttendanceOverview = (params?: object) => api.get('/parent/child-attendance/overview', { params });
export const getChildCorrections = (params?: object) => api.get('/parent/child-attendance/requests', { params });
// `child` picks which child; the reply lists `children` to switch between.
export const getExamResults     = (params?: object) => api.get('/parent/exams', { params });
export const getResults         = () => api.get('/parent/results');
export const getResultDetail    = (id: string) => api.get(`/parent/results/${id}`);
export const getClassTests      = () => api.get('/parent/results/class-tests');
export const getDocuments       = () => api.get('/parent/documents');
export const getDocument        = (id: string) => api.get(`/parent/documents/${id}`);
export const getHolidays        = () => api.get('/parent/holidays');

// Timetable — ONE child's week. `child` picks which; the reply lists `children`
// to switch between and always names the child it answered for, so one child's
// week can never render under another's name.
export const getTimetable       = (params?: object) => api.get('/parent/timetable', { params });

// Fees
export const getParentFees      = () => api.get('/fees/parent/fees');
export const getChildFees       = (childId: string) => api.get(`/fees/parent/child/${childId}/fees`);

// Teacher feedback — whether each child has given it, never what they said.
export const getChildrenFeedback = () => api.get('/parent/feedback');
