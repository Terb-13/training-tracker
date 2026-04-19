/** Mifflin-St Jeor BMR for male — resting estimate used in daily deficit rollup. */
export function bmrMaleKg(weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
}
