export const validateTimes = (
  startTime: Date,
  endTime: Date
): boolean => {
  return endTime > startTime;
};

export const buildWorkoutPayload = (
  logType: string,
  startTime: Date,
  endTime: Date,
  actualRpe: number,
  heartRate: string,
  calories: string
) => ({
  actual_type: logType,
  actual_start_time: startTime.toISOString(),
  actual_end_time: endTime.toISOString(),
  actual_rpe: actualRpe,
  heart_rate_avg: heartRate ? Number(heartRate) : null,
  calories_burned: calories ? Number(calories) : null,
  data_source: "manual",
});

export const capitalizeWorkoutType = (type: string): string => {
  if (!type) return "";
  return type.charAt(0).toUpperCase() + type.slice(1);
};

export const getStatusLabel = (status: string): string => {
  switch (status) {
    case "completed":
      return "Completed";
    case "planned":
      return "Planned";
    case "skipped":
      return "Skipped";
    default:
      return status;
  }
};

export const getStatusColor = (status: string): string => {
  switch (status) {
    case "completed":
      return "#01696f";
    case "planned":
      return "#f0a500";
    case "skipped":
      return "#cc3333";
    default:
      return "#888";
  }
};

export const formatDuration = (
  duration: number | null
): string => {
  return duration == null ? "—" : `${duration} minutes`;
};

export const formatHeartRate = (
  heartRate: number | null
): string => {
  return heartRate == null ? "—" : `${heartRate} bpm`;
};

export const formatCalories = (
  calories: number | null
): string => {
  return calories == null ? "—" : `${calories} kcal`;
};

export const formatRpe = (
  rpe: number | null
): string => {
  return rpe == null ? "—" : `${rpe} / 10`;
};

export const isCompletedWorkout = (
  status: string
): boolean => {
  return status === "completed";
};