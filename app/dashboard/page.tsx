import { TrainingDashboard } from "@/components/dashboard/training-dashboard";
import { loadDashboardData } from "@/lib/data/dashboard-data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const data = await loadDashboardData(user.id);

  return <TrainingDashboard data={data} userEmail={user.email ?? null} />;
}
