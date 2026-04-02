import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Allow dev server + HMR WebSocket when opening the app on your LAN (e.g. phone at http://192.168.x.x:3000). */
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
};

export default nextConfig;
