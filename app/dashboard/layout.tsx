import { ensureProfile } from "@/actions/profile";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await ensureProfile();
  return <>{children}</>;
}
