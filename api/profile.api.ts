import api from './axios';

export const getProfile   = () => api.get('/profile');
export const updateProfile = (data: FormData) => api.put('/profile', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const uploadAvatar  = (data: FormData) => api.post('/profile/avatar', data, { headers: { 'Content-Type': 'multipart/form-data' } });
