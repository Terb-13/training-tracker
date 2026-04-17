import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@garmin/fitsdk", "adm-zip"],
};

export default nextConfig;
