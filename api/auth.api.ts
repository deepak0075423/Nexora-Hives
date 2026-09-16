import api from './axios';

export const login          = (data: { email: string; password: string }) => api.post('/auth/login', data);
export const logout         = () => api.post('/auth/logout');
export const getMe          = () => api.get('/auth/me');
export const refreshToken   = (data: { refreshToken: string }) => api.post('/auth/refresh', data);
export const forgotPassword = (data: { email: string }) => api.post('/auth/forgot-password', data);
export const verifyOtp      = (data: { email: string; otp: string }) => api.post('/auth/verify-otp', data);
export const newPassword    = (data: { resetToken: string; password: string }) => api.post('/auth/new-password', data);
export const resetPassword  = (data: { currentPassword: string; newPassword: string }) => api.post('/auth/reset-password', data);
// One address can hold posts at several schools, in several roles. /login stops
// and asks which one when there is more than one; /select finishes that sign-in,
// and /accounts + /switch are the same choice made later, without signing out.
export const selectAccount  = (data: { selectionToken: string; userId: string }) => api.post('/auth/select', data);
export const listAccounts   = () => api.get('/auth/accounts');
export const switchAccount  = (userId: string) => api.post('/auth/switch', { userId });

/** One post behind a sign-in: a role at a school. */
export interface AccountOption {
  id: string;
  name: string;
  email: string;
  role: string;
  current?: boolean;
  school?: { _id: string; name: string; logo?: string; code?: string } | null;
}
