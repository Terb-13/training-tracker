/** Shared profile defaults — not a server action (keeps "use server" files export-only async fns). */
export const DEFAULT_PROFILE = {
  height_cm: 170,
  age: 33,
  target_calories: 3000,
  starting_weight_lbs: 204.2,
  wednesday_lunch_relax: true,
} as const;
