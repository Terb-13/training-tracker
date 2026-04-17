export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          height_cm: number;
          age: number;
          target_calories: number;
          starting_weight_lbs: number;
          wednesday_lunch_relax: boolean;
          garmin_email: string | null;
          garmin_password_encrypted: string | null;
          garmin_tokens_encrypted: string | null;
          garmin_last_sync_at: string | null;
          max_hr: number | null;
          garmin_wellness: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          height_cm?: number;
          age?: number;
          target_calories?: number;
          starting_weight_lbs?: number;
          wednesday_lunch_relax?: boolean;
          garmin_email?: string | null;
          garmin_password_encrypted?: string | null;
          garmin_tokens_encrypted?: string | null;
          garmin_last_sync_at?: string | null;
          max_hr?: number | null;
          garmin_wellness?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          height_cm?: number;
          age?: number;
          target_calories?: number;
          starting_weight_lbs?: number;
          wednesday_lunch_relax?: boolean;
          garmin_email?: string | null;
          garmin_password_encrypted?: string | null;
          garmin_tokens_encrypted?: string | null;
          garmin_last_sync_at?: string | null;
          max_hr?: number | null;
          garmin_wellness?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      activities: {
        Row: {
          id: string;
          user_id: string;
          garmin_activity_id: number;
          activity_type: string | null;
          activity_name: string | null;
          start_time_gmt: string;
          duration_sec: number | null;
          distance_m: number | null;
          calories: number | null;
          avg_hr: number | null;
          max_hr: number | null;
          max_power: number | null;
          avg_power: number | null;
          elevation_gain_m: number | null;
          sport_type_key: string | null;
          fit_sport: string | null;
          fit_sub_sport: string | null;
          total_work_j: number | null;
          normalized_power: number | null;
          training_stress_score: number | null;
          total_ascent_m: number | null;
          total_descent_m: number | null;
          num_laps: number | null;
          total_timer_time_sec: number | null;
          raw_data: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          garmin_activity_id: number;
          activity_type?: string | null;
          activity_name?: string | null;
          start_time_gmt: string;
          duration_sec?: number | null;
          distance_m?: number | null;
          calories?: number | null;
          avg_hr?: number | null;
          max_hr?: number | null;
          max_power?: number | null;
          avg_power?: number | null;
          elevation_gain_m?: number | null;
          sport_type_key?: string | null;
          fit_sport?: string | null;
          fit_sub_sport?: string | null;
          total_work_j?: number | null;
          normalized_power?: number | null;
          training_stress_score?: number | null;
          total_ascent_m?: number | null;
          total_descent_m?: number | null;
          num_laps?: number | null;
          total_timer_time_sec?: number | null;
          raw_data?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          garmin_activity_id?: number;
          activity_type?: string | null;
          activity_name?: string | null;
          start_time_gmt?: string;
          duration_sec?: number | null;
          distance_m?: number | null;
          calories?: number | null;
          avg_hr?: number | null;
          max_hr?: number | null;
          max_power?: number | null;
          avg_power?: number | null;
          elevation_gain_m?: number | null;
          sport_type_key?: string | null;
          fit_sport?: string | null;
          fit_sub_sport?: string | null;
          total_work_j?: number | null;
          normalized_power?: number | null;
          training_stress_score?: number | null;
          total_ascent_m?: number | null;
          total_descent_m?: number | null;
          num_laps?: number | null;
          total_timer_time_sec?: number | null;
          raw_data?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      body_composition: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          weight_lbs: number;
          body_fat_pct: number | null;
          muscle_mass_lbs: number | null;
          source: string;
          raw: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          weight_lbs: number;
          body_fat_pct?: number | null;
          muscle_mass_lbs?: number | null;
          source?: string;
          raw?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          weight_lbs?: number;
          body_fat_pct?: number | null;
          muscle_mass_lbs?: number | null;
          source?: string;
          raw?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      strength_sessions: {
        Row: {
          id: string;
          user_id: string;
          garmin_activity_id: number;
          label: string;
          started_at: string;
          duration_sec: number;
          volume_kg: number | null;
          exercise_summary: Json | null;
          raw_data: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          garmin_activity_id: number;
          label: string;
          started_at: string;
          duration_sec: number;
          volume_kg?: number | null;
          exercise_summary?: Json | null;
          raw_data?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          garmin_activity_id?: number;
          label?: string;
          started_at?: string;
          duration_sec?: number;
          volume_kg?: number | null;
          exercise_summary?: Json | null;
          raw_data?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      strength_exercises: {
        Row: {
          id: string;
          user_id: string;
          garmin_activity_id: number;
          activity_name: string | null;
          workout_name: string;
          exercise_name: string;
          set_number: number;
          reps: number | null;
          weight_lbs: number | null;
          weight_kg: number | null;
          rest_seconds: number | null;
          notes: string | null;
          sort_index: number;
          raw: Json | null;
          raw_data: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          garmin_activity_id: number;
          activity_name?: string | null;
          workout_name: string;
          exercise_name: string;
          set_number?: number;
          reps?: number | null;
          weight_lbs?: number | null;
          weight_kg?: number | null;
          rest_seconds?: number | null;
          notes?: string | null;
          sort_index?: number;
          raw?: Json | null;
          raw_data?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          garmin_activity_id?: number;
          activity_name?: string | null;
          workout_name?: string;
          exercise_name?: string;
          set_number?: number;
          reps?: number | null;
          weight_lbs?: number | null;
          weight_kg?: number | null;
          rest_seconds?: number | null;
          notes?: string | null;
          sort_index?: number;
          raw?: Json | null;
          raw_data?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      daily_deficit: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          active_calories: number;
          resting_calories_est: number;
          calories_in: number | null;
          deficit_kcal: number | null;
          projected_weekly_loss_lbs: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          active_calories?: number;
          resting_calories_est?: number;
          calories_in?: number | null;
          deficit_kcal?: number | null;
          projected_weekly_loss_lbs?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          active_calories?: number;
          resting_calories_est?: number;
          calories_in?: number | null;
          deficit_kcal?: number | null;
          projected_weekly_loss_lbs?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      calculate_projected_loss: {
        Args: { p_user_id: string };
        Returns: number | null;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
