import api from './axios';

// ─────────────────────────────────────────────────────────────────────────────
//  Hostel Management — mobile API surface.
//
//  Mirrors school-frontend/src/api/hostel.api.js. The phone shows the screens a
//  warden or a resident actually needs on the move — the roll call, the gate,
//  approvals, the pass — rather than the whole administrative console.
// ─────────────────────────────────────────────────────────────────────────────

// ── Admin / warden ────────────────────────────────────────────────────────────
export const getDashboard   = () => api.get('/hostel/admin/dashboard');
export const getMeta        = () => api.get('/hostel/admin/meta');
export const getHostels     = (params?: any) => api.get('/hostel/admin/hostels', { params });
export const getRooms       = (params?: any) => api.get('/hostel/admin/rooms', { params });
export const getOccupancy   = (params?: any) => api.get('/hostel/admin/occupancy', { params });
export const getAllocations = (params?: any) => api.get('/hostel/admin/allocations', { params });
export const getStudentProfile = (studentId: string) => api.get(`/hostel/admin/students/${studentId}/profile`);
// Room changes waiting for a decision — a warden's move, or a resident's request.
export const getTransferRequests   = (params?: any) => api.get('/hostel/admin/transfer-requests', { params });
export const decideTransferRequest = (id: string, d: any) => api.post(`/hostel/admin/transfer-requests/${id}/decide`, d);

// Roll call
export const getRegister    = (params: any) => api.get('/hostel/admin/attendance', { params });
export const markAttendance = (d: any) => api.post('/hostel/admin/attendance', d);

// Approvals
export const getAdmissions  = (params?: any) => api.get('/hostel/admin/admissions', { params });
export const decideAdmission = (id: string, d: any) => api.post(`/hostel/admin/admissions/${id}/decision`, d);
export const getLeaves      = (params?: any) => api.get('/hostel/admin/leaves', { params });
export const actOnLeave     = (id: string, d: any) => api.post(`/hostel/admin/leaves/${id}/act`, d);
export const getOutpasses   = (params?: any) => api.get('/hostel/admin/outpasses', { params });
export const actOnOutpass   = (id: string, d: any) => api.post(`/hostel/admin/outpasses/${id}/act`, d);

// The gate
export const verifyOutpass  = (token: string) => api.get(`/hostel/admin/outpasses/verify/${token}`);
export const gateScan       = (d: any) => api.post('/hostel/admin/outpasses/gate', d);
export const getLiveMovement = () => api.get('/hostel/admin/movements/live');
export const recordMovement = (d: any) => api.post('/hostel/admin/movements', d);

// Visitors
export const getVisitors    = (params?: any) => api.get('/hostel/admin/visitors', { params });
export const actOnVisitor   = (id: string, d: any) => api.post(`/hostel/admin/visitors/${id}/act`, d);

// Tickets
export const getComplaints  = (params?: any) => api.get('/hostel/admin/complaints', { params });
export const actOnComplaint = (id: string, d: any) => api.post(`/hostel/admin/complaints/${id}/act`, d);
export const createComplaint = (d: any) => api.post('/hostel/admin/complaints', d);
export const getMaintenance = (params?: any) => api.get('/hostel/admin/maintenance', { params });
export const actOnMaintenance = (id: string, d: any) => api.post(`/hostel/admin/maintenance/${id}/act`, d);
export const getIncidents   = (params?: any) => api.get('/hostel/admin/incidents', { params });
export const createIncident = (d: any) => api.post('/hostel/admin/incidents', d);
export const getInvoices    = (params?: any) => api.get('/hostel/admin/invoices', { params });

/** Attach a file. `file` is an expo-image-picker asset. */
export const uploadAttachment = (file: any, meta: Record<string, string> = {}) => {
  const form = new FormData();
  form.append('file', {
    uri: file.uri,
    name: file.fileName || `attachment-${Date.now()}.jpg`,
    type: file.mimeType || 'image/jpeg',
  } as any);
  Object.entries(meta).forEach(([k, v]) => v && form.append(k, v));
  return api.post('/hostel/admin/attachments', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// ── Student & parent portal ───────────────────────────────────────────────────
// One factory for both, because the endpoints are identical in shape — the
// server resolves a parent's child from their own profile.
const portal = (role: 'student' | 'parent' | 'teacher') => ({
  myHostel:      (params?: any) => api.get(`/hostel/${role}/my-hostel`, { params }),
  hostels:       (params?: any) => api.get(`/hostel/${role}/hostels`, { params }),
  apply:         (d: any) => api.post(`/hostel/${role}/apply`, d),
  attendance:    (params?: any) => api.get(`/hostel/${role}/attendance`, { params }),
  leaves:        (params?: any) => api.get(`/hostel/${role}/leaves`, { params }),
  applyLeave:    (d: any) => api.post(`/hostel/${role}/leaves`, d),
  actOnLeave:    (id: string, d: any) => api.post(`/hostel/${role}/leaves/${id}/act`, d),
  outpasses:     (params?: any) => api.get(`/hostel/${role}/outpasses`, { params }),
  applyOutpass:  (d: any) => api.post(`/hostel/${role}/outpasses`, d),
  cancelOutpass: (id: string) => api.post(`/hostel/${role}/outpasses/${id}/cancel`),
  visitors:      (params?: any) => api.get(`/hostel/${role}/visitors`, { params }),
  requestVisitor: (d: any) => api.post(`/hostel/${role}/visitors`, d),
  fees:          (params?: any) => api.get(`/hostel/${role}/fees`, { params }),
  complaints:    (params?: any) => api.get(`/hostel/${role}/complaints`, { params }),
  raiseComplaint: (d: any) => api.post(`/hostel/${role}/complaints`, d),
  actOnComplaint: (id: string, d: any) => api.post(`/hostel/${role}/complaints/${id}/act`, d),
  mess:          (params?: any) => api.get(`/hostel/${role}/mess`, { params }),
  /** "I will not be at this meal": { date, meal, undo }. */
  skipMeal:      (d: any) => api.post(`/hostel/${role}/mess/skip`, d),
  /** Ask to change room: { reason, preference }. The office decides where. */
  roomChange:    (d: any) => api.post(`/hostel/${role}/room-change`, d),
  record:        (params?: any) => api.get(`/hostel/${role}/record`, { params }),
  uploadAttachment: (file: any, meta: Record<string, string> = {}) => {
    const form = new FormData();
    form.append('file', {
      uri: file.uri,
      name: file.fileName || `attachment-${Date.now()}.jpg`,
      type: file.mimeType || 'image/jpeg',
    } as any);
    Object.entries(meta).forEach(([k, v]) => v && form.append(k, v));
    return api.post(`/hostel/${role}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
});

export const student = {
  ...portal('student'),
  /** The gate pass, including its rendered QR image as a data URI. */
  outpassPass: (id: string) => api.get(`/hostel/student/outpasses/${id}/pass`),
};

export const parent = {
  ...portal('parent'),
  children: () => api.get('/hostel/parent/children'),
  /** Consent to, or decline, a child's outpass: { action: 'parent_approve' | 'parent_reject', student }. */
  actOnOutpass: (id: string, d: any) => api.post(`/hostel/parent/outpasses/${id}/act`, d),
};

/** A member of staff who lives in the hostel — the resident's screen, for themselves. */
export const teacher = {
  ...portal('teacher'),
  outpassPass: (id: string) => api.get(`/hostel/teacher/outpasses/${id}/pass`),
};

// ── Paying a hostel bill (student, parent for a child, resident teacher) ─────
/** What is owed, what was paid, every receipt and refund. `student` is for a parent only. */
export const getMyFeeSummary  = (student?: string) => api.get('/hostel/my-fees/summary', { params: { student } });
/** Opens a gateway order; the reply carries `checkoutPath`, the hosted page to pay it on. */
export const createFeeOrder   = (d: { student?: string; invoiceIds?: string[] }) => api.post('/hostel/my-fees/order', d);
/** What became of an order once its checkout page has closed. */
export const checkFeePayment  = (d: { orderId: string; student?: string }) => api.post('/hostel/my-fees/check', d);
/** A receipt / a refund voucher, as data — the phone draws the document itself. */
export const getFeeReceipt    = (receiptNumber: string, invoice?: string) =>
  api.get(`/hostel/receipts/${encodeURIComponent(receiptNumber)}`, { params: { format: 'json', invoice } });
export const getRefundVoucher = (voucherNumber: string) =>
  api.get(`/hostel/refunds/${encodeURIComponent(voucherNumber)}`, { params: { format: 'json' } });
