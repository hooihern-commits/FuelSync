import api from './client';

export interface BodyMetric {
  id: number;
  height_cm: number | null;
  weight_kg: number;
  logged_at: string;
}

export async function logBodyMetrics(height_cm: number | null, weight_kg: number) {
  const res = await api.post<BodyMetric>('/body-metrics', { height_cm, weight_kg });
  return res.data;
}

export async function getLatestMetrics() {
  const res = await api.get<BodyMetric | null>('/body-metrics/latest');
  return res.data;
}

export async function completeOnboarding(age?: number) {
  const res = await api.patch('/users/onboarding', age != null ? { age } : {});
  return res.data;
}