import axios from 'axios';
import * as Localization from 'expo-localization';
import { getToken } from '../storage/token';

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
});

api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const tz = Localization.getCalendars()[0]?.timeZone ?? 'UTC';
  config.headers['X-Timezone'] = tz;
  return config;
});

export default api;