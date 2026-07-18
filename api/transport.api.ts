import api from './axios';

// ── Student (self) ────────────────────────────────────────────────────────────
export const studentTransport  = () => api.get('/transport/student/transport');
export const studentTrack      = () => api.get('/transport/student/track');
export const studentAttendance = () => api.get('/transport/student/attendance');
export const studentInvoices   = () => api.get('/transport/student/invoices');

// ── Parent ────────────────────────────────────────────────────────────────────
export const parentChildren    = () => api.get('/transport/parent/children');
export const parentTransport   = (studentId: string) => api.get('/transport/parent/transport', { params: { studentId } });
export const parentTrack       = (studentId: string) => api.get('/transport/parent/track', { params: { studentId } });
export const parentAttendance  = (studentId: string) => api.get('/transport/parent/attendance', { params: { studentId } });
export const parentInvoices    = (studentId: string) => api.get('/transport/parent/invoices', { params: { studentId } });
export const parentRequests    = () => api.get('/transport/parent/requests');
export const parentCreateRequest = (d: any) => api.post('/transport/parent/requests', d);
export const parentCreateComplaint = (d: any) => api.post('/transport/parent/complaints', d);

// ── Admin / Transport Manager ─────────────────────────────────────────────────
export const getDashboard = () => api.get('/transport/admin/dashboard');
export const getVehicles  = (params?: any) => api.get('/transport/admin/vehicles', { params });
export const getRoutes    = (params?: any) => api.get('/transport/admin/routes', { params });
export const getLiveTrips = () => api.get('/transport/admin/trips/live');
export const getStaff     = (params?: any) => api.get('/transport/admin/staff', { params });
