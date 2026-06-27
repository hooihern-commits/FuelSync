import api from '../api/client';

export const planWorkout = async (
  workoutType: string,
  plannedTime: Date,
  plannedRpe: number
) => {
  const response = await api.post('/workouts', {
    planned_type: workoutType,
    planned_time: plannedTime.toISOString(),
    planned_rpe:  plannedRpe,
  });
  return response.data;
};

export const logWorkout = async (payload: {
  actual_type:       string;
  actual_start_time: string;
  actual_end_time:   string;
  actual_rpe:        number;
  heart_rate_avg:    number | null;
  calories_burned:   number | null;
  data_source:       string;
}) => {
  const response = await api.post('/workouts/log', payload);
  return response.data;
};

export const updateWorkout = async (
  id: string,
  payload: {
    actual_type:       string;
    actual_start_time: string;
    actual_end_time:   string;
    actual_rpe:        number;
    heart_rate_avg:    number | null;
    calories_burned:   number | null;
    data_source:       string;
  }
) => {
  const response = await api.patch(`/workouts/${id}`, payload);
  return response.data;
};

export const skipWorkout = async (id: string) => {
  const response = await api.post(`/workouts/${id}/skip`);
  return response.data;
};

export const fetchPlannedWorkouts = async () => {
  const response = await api.get('/workouts', { params: { status: 'planned' } });
  return response.data.workouts ?? [];
};

export const fetchWorkouts = async () => {
  const response = await api.get('/workouts');
  return response.data.workouts ?? [];
};

export const getPreSuggestion = async (workoutId: number | string) => {
  const response = await api.post('/suggestions/pre', { workout_id: workoutId });
  return response.data;
};

export const getPostSuggestion = async (workoutId: number | string) => {
  const response = await api.post('/suggestions/post', { workout_id: workoutId });
  return response.data;
};