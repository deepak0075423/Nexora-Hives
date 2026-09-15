import api from '@/api/axios';

/**
 * The aptitude exam endpoints one exam screen reads, for whichever side is
 * looking. The teacher and school-admin routes share their shapes
 * (/teacher/exams/:id/… and /admin/exams/:id/…) — the server scopes what each
 * may read — so the workspace, report and analytics screens are one screen
 * each, not two.
 */

export type ExamSide = 'teacher' | 'admin';

export const sideForRole = (role?: string): ExamSide => (role === 'teacher' ? 'teacher' : 'admin');

export function examApi(side: ExamSide) {
  const base = side === 'teacher' ? '/teacher/exams' : '/admin/exams';
  return {
    side,
    detail:          (id: string) => api.get(`${base}/${id}`),
    meta:            () => api.get(`${base}/meta`),
    create:          (data: object) => api.post(base, data),
    update:          (id: string, data: object) => api.put(`${base}/${id}`, data),
    remove:          (id: string) => api.delete(`${base}/${id}`),
    publish:         (id: string) => api.post(`${base}/${id}/publish`),
    questions:       (id: string) => api.get(`${base}/${id}/questions`),
    addQuestion:     (id: string, data: object) => api.post(`${base}/${id}/questions`, data),
    updateQuestion:  (id: string, qid: string, data: object) => api.put(`${base}/${id}/questions/${qid}`, data),
    deleteQuestion:  (id: string, qid: string) => api.delete(`${base}/${id}/questions/${qid}`),
    submissions:     (id: string) => api.get(`${base}/${id}/submissions`),
    studentResponse: (id: string, studentId: string) => api.get(`${base}/${id}/submissions/${studentId}`),
    analytics:       (params?: object) => api.get(`${base}/analytics`, { params }),
    report:          (id: string) => api.get(`${base}/${id}/report`),
  };
}
