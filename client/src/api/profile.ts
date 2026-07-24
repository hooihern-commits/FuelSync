import api from './client';

export async function updateProfile(name: string) {
  const res = await api.patch('/users/profile', { name });
  return res.data;
}

export async function changePassword(current_password: string, new_password: string) {
  const res = await api.patch('/users/password', { current_password, new_password });
  return res.data;
}
