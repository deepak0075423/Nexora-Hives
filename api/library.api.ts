import api from './axios';

// ── Librarian / Admin (manage) ───────────────────────────────────────────────
export const getDashboard         = ()             => api.get('/library/dashboard');
export const getBooks             = (params?: object) => api.get('/library/books', { params });
export const getBook              = (id: string, params?: object) => api.get(`/library/books/${id}`, { params });
export const createBook           = (data: object) => api.post('/library/books', data);
export const updateBook           = (id: string, data: object) => api.put(`/library/books/${id}`, data);
export const deleteBook           = (id: string)   => api.delete(`/library/books/${id}`);

// Physical copies of a catalogue title — a book with no copies cannot be issued
export const addCopies            = (bookId: string, data: object) => api.post(`/library/books/${bookId}/copies`, data);
export const updateCopy           = (bookId: string, copyId: string, data: object) => api.put(`/library/books/${bookId}/copies/${copyId}`, data);
export const setCopyStatus        = (bookId: string, copyId: string, status: string, chargeLastBorrower = false, fineAmount?: number) =>
  api.patch(`/library/books/${bookId}/copies/${copyId}/status`, { status, chargeLastBorrower, fineAmount });
export const deleteCopy           = (bookId: string, copyId: string) => api.delete(`/library/books/${bookId}/copies/${copyId}`);
// Counter helpers — member typeahead and the barcode scanner
export const searchMembers        = (q: string, role?: string) => api.get('/library/members', { params: { q, role } });
export const scanCopy             = (code: string) => api.get('/library/scan', { params: { code } });

export const getIssuances         = (params?: object) => api.get('/library/issuances', { params });
export const getIssueForm         = (params?: object) => api.get('/library/issue', { params });
export const issueBook            = (data: object) => api.post('/library/issue', data);
export const getReturnForm        = (params?: object) => api.get('/library/return', { params });
export const returnBook           = (data: object) => api.post('/library/return', data);
export const renewBook            = (id: string)   => api.post(`/library/issuances/${id}/renew`);
export const getReservations      = (params?: object) => api.get('/library/reservations', { params });
export const markReservationReady = (id: string)   => api.post(`/library/reservations/${id}/mark-ready`);
export const cancelReservation    = (id: string, reason?: string) => api.delete(`/library/reservations/${id}`, { data: { reason } });
export const getFines             = (params?: object) => api.get('/library/fines', { params });
export const collectFine          = (id: string)   => api.post(`/library/fines/${id}/collect`);
export const waiveFine            = (id: string, data?: object) => api.post(`/library/fines/${id}/waive`, data ?? {});
export const getPolicy            = ()             => api.get('/library/policy');
export const updatePolicy         = (data: object) => api.put('/library/policy', data);
export const getAuditLog           = (params?: object) => api.get('/library/audit-log', { params });

// ── Reports ───────────────────────────────────────────────────────────────────
export const listReports           = () => api.get('/library/reports');
export const runReport             = (path: string, params?: object) => api.get(path, { params });

// ── Fines a member owes, and the receipts that follow ─────────────────────────
// The server decides whose fines the caller may see, so `userId` is a request a
// parent makes for a child, not a claim the client gets to assert.
export const getFineSummary       = (userId?: string) => api.get('/library/my-fines/summary', { params: { userId } });
export const listMyReceipts       = (userId?: string) => api.get('/library/my-fines/receipts', { params: { userId } });
// Asked for as data: the phone draws the receipt itself, having no HTML surface.
export const getFineReceipt       = (receiptNumber: string) =>
  api.get(`/library/receipts/${encodeURIComponent(receiptNumber)}`, { params: { format: 'json' } });

// ── Parent ────────────────────────────────────────────────────────────────────
export const getParentOverview    = () => api.get('/library/parent');

// ── Member self-service ───────────────────────────────────────────────────────
export const renewMyBook           = (id: string) => api.post(`/library/student/issuances/${id}/renew`);
export const renewTeacherBook      = (id: string) => api.post(`/library/teacher/issuances/${id}/renew`);
export const studentReserve        = (bookId: string) => api.post(`/library/student/books/${bookId}/reserve`);
export const teacherReserve        = (bookId: string) => api.post(`/library/teacher/books/${bookId}/reserve`);
