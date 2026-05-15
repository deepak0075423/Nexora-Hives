import api from './axios';

export const getProfile    = ()              => api.get('/profile');
export const updateProfile = (data: object)  => api.put('/profile/update', data);
