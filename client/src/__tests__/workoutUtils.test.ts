import {
  validateTimes,
  buildWorkoutPayload,
  capitalizeWorkoutType,
  getStatusLabel,
  getStatusColor,
  formatDuration,
  formatHeartRate,
  formatCalories,
  formatRpe,
  isCompletedWorkout,
} from "../utils/workoutUtils";

describe("validateTimes", () => {
  test("returns true when end time is after start time", () => {
    const start = new Date("2026-01-01T10:00:00.000Z");
    const end = new Date("2026-01-01T11:00:00.000Z");

    expect(validateTimes(start, end)).toBe(true);
  });

  test("returns false when end time is before start time", () => {
    const start = new Date("2026-01-01T11:00:00");
    const end = new Date("2026-01-01T10:00:00");

    expect(validateTimes(start, end)).toBe(false);
  });
});

describe("buildWorkoutPayload", () => {
  it("creates payload correctly", () => {
    const start = new Date("2026-01-01T10:00:00");
    const end = new Date("2026-01-01T11:00:00");

    const payload = buildWorkoutPayload(
      "running",
      start,
      end,
      7,
      "150",
      "450"
    );

    expect(payload.actual_type).toBe("running");
    expect(payload.actual_start_time).toBe(start.toISOString());
    expect(payload.actual_end_time).toBe(end.toISOString());
    expect(payload.actual_rpe).toBe(7);
    expect(payload.heart_rate_avg).toBe(150);
    expect(payload.calories_burned).toBe(450);
    expect(payload.data_source).toBe("manual");
  });
});

  test("sets heart rate and calories to null when empty", () => {
    const payload = buildWorkoutPayload(
      "cycling",
      new Date("2026-01-01T10:00:00"),
      new Date("2026-01-01T11:00:00"),
      5,
      "",
      ""
    );

    expect(payload.heart_rate_avg).toBeNull();
    expect(payload.calories_burned).toBeNull();
  });


describe("capitalizeWorkoutType", () => {
  test("capitalizes workout type", () => {
    expect(capitalizeWorkoutType("running")).toBe("Running");
  });

  test("returns empty string", () => {
    expect(capitalizeWorkoutType("")).toBe("");
  });
});

describe("getStatusLabel", () => {
  test("completed", () => {
    expect(getStatusLabel("completed")).toBe("Completed");
  });

  test("planned", () => {
    expect(getStatusLabel("planned")).toBe("Planned");
  });

  test("skipped", () => {
    expect(getStatusLabel("skipped")).toBe("Skipped");
  });

  test("unknown status", () => {
    expect(getStatusLabel("hello")).toBe("hello");
  });
});

describe("getStatusColor", () => {
  test("completed colour", () => {
    expect(getStatusColor("completed")).toBe("#01696f");
  });

  test("planned colour", () => {
    expect(getStatusColor("planned")).toBe("#f0a500");
  });

  test("skipped colour", () => {
    expect(getStatusColor("skipped")).toBe("#cc3333");
  });

  test("default colour", () => {
    expect(getStatusColor("abc")).toBe("#888");
  });
});

describe("formatDuration", () => {
  test("formats duration", () => {
    expect(formatDuration(45)).toBe("45 minutes");
  });

  test("handles null", () => {
    expect(formatDuration(null)).toBe("—");
  });
});

describe("formatHeartRate", () => {
  test("formats heart rate", () => {
    expect(formatHeartRate(160)).toBe("160 bpm");
  });

  test("handles null", () => {
    expect(formatHeartRate(null)).toBe("—");
  });
});

describe("formatCalories", () => {
  test("formats calories", () => {
    expect(formatCalories(500)).toBe("500 kcal");
  });

  test("handles null", () => {
    expect(formatCalories(null)).toBe("—");
  });
});

describe("formatRpe", () => {
  test("formats rpe", () => {
    expect(formatRpe(8)).toBe("8 / 10");
  });

  test("handles null", () => {
    expect(formatRpe(null)).toBe("—");
  });
});

describe("isCompletedWorkout", () => {
  test("completed", () => {
    expect(isCompletedWorkout("completed")).toBe(true);
  });

  test("planned", () => {
    expect(isCompletedWorkout("planned")).toBe(false);
  });
});