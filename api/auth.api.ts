import api from './axios';

export const login          = (data: { email: string; password: string }) => api.post('/auth/login', data);
export const logout         = () => api.post('/auth/logout');
export const getMe          = () => api.get('/auth/me');
export const refreshToken   = (data: { refreshToken: string }) => api.post('/auth/refresh', data);
export const forgotPassword = (data: { email: string }) => api.post('/auth/forgot-password', data);
export const verifyOtp      = (data: { email: string; otp: string }) => api.post('/auth/verify-otp', data);
export const newPassword    = (data: { email: string; otp: string; password: string }) => api.post('/auth/new-password', data);
export const resetPassword  = (data: { currentPassword: string; newPassword: string }) => api.post('/auth/reset-password', data);
