/** Realistic placeholders until Garmin + MacrosFirst sync — LOTOJA 2026 prep */

export const START_WEIGHT_LBS = 204.2;
export const TARGET_WEEKLY_LOSS_MAX = 1;
export const TARGET_WEEKLY_LOSS_MIN = 0.5;

/** ~0.6–0.8 lb/wk — inside safe 0.5–1.0 band */
export const weightSeries = [
  { date: "Apr 7", weight: 203.8 },
  { date: "Apr 8", weight: 203.7 },
  { date: "Apr 9", weight: 203.5 },
  { date: "Apr 10", weight: 203.4 },
  { date: "Apr 11", weight: 203.2 },
  { date: "Apr 12", weight: 203.1 },
  { date: "Apr 13", weight: 203.0 },
];

/** Corridor vs start weight for chart (fat-loss runway) */
export const projectedFatLossSeries = weightSeries.map((row, i) => ({
  ...row,
  trendLow: START_WEIGHT_LBS - TARGET_WEEKLY_LOSS_MAX * ((i + 1) / 7),
  trendHigh: START_WEIGHT_LBS - TARGET_WEEKLY_LOSS_MIN * ((i + 1) / 7),
}));

export const weeklyRhythmScores = [
  { week: "Mar 17", score: 78 },
  { week: "Mar 24", score: 82 },
  { week: "Mar 31", score: 80 },
  { week: "Apr 7", score: 85 },
];

export const cyclingWeek = {
  volumeHours: 6.8,
  zone2Hours: 4.2,
  longestRideMiles: 62,
  wkgTrend: [
    { week: "Mar 17", wkg: 2.85 },
    { week: "Mar 24", wkg: 2.88 },
    { week: "Mar 31", wkg: 2.9 },
    { week: "Apr 7", wkg: 2.92 },
  ],
};

export const garminStrengthSessions = [
  {
    label: "Chest/Triceps",
    last: "Apr 11",
    durationMin: 48,
    loadHint: "32 lb DB — press + dips pattern",
  },
  {
    label: "Back/Biceps",
    last: "Apr 9",
    durationMin: 52,
    loadHint: "Rows + curls — Garmin strength",
  },
  {
    label: "Shoulders/Core",
    last: "Apr 13",
    durationMin: 44,
    loadHint: "Arnold + planks — morning slot",
  },
] as const;

export const garminAutoRhythm = {
  sleepH: 6.7,
  hrvMs: 52,
  restingHr: 54,
  recoveryScore: 82,
};

export const nutritionPlaceholder = {
  caloriesAvg: 2780,
  proteinG: 165,
  carbsG: 310,
  fatG: 88,
  deficitVsTarget: 220,
};

export const lotojaReadiness = 71;

export function buildWeeklyGrokPayload(input: {
  profile: {
    height_cm: number;
    age: number;
    target_calories: number;
    starting_weight_lbs: number;
    wednesday_lunch_relax: boolean;
  } | null;
  familyLoad: number;
  workLoad: number;
  userEmail?: string | null;
  weightSeries?: { date: string; weight: number }[];
  cycling?: typeof cyclingWeek;
  strength?: readonly { label: string; last: string; durationMin: number; loadHint: string }[];
  garminHealth?: typeof garminAutoRhythm;
  nutrition?: typeof nutritionPlaceholder;
  lotojaReadinessPct?: number;
}) {
  const last7 = (input.weightSeries ?? weightSeries).slice(-7);
  const cyc = input.cycling ?? cyclingWeek;
  const str = input.strength ?? garminStrengthSessions;
  const gh = input.garminHealth ?? garminAutoRhythm;
  const nut = input.nutrition ?? nutritionPlaceholder;
  const lr = input.lotojaReadinessPct ?? lotojaReadiness;
  return {
    meta: {
      app: "LOTOJA 2026 Team Training OS",
      window: "last_7_days",
      generatedAt: new Date().toISOString(),
      user: input.userEmail ?? "session",
    },
    profile: input.profile,
    routine: {
      morningBlock: "Peloton + dumbbells <90 min, done before 7:00 a.m. market open",
      wednesdayLunchRelax: input.profile?.wednesday_lunch_relax ?? true,
    },
    loads: { family: input.familyLoad, work: input.workLoad },
    weight_lbs: last7,
    cycling: cyc,
    strength: str,
    garminHealth: gh,
    nutrition: nut,
    scores: {
      rhythmWeeklyAvg: 84,
      lotojaReadinessPct: lr,
    },
  };
}
