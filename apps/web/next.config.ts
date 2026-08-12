import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ADR-0015：转译 workspace 共享域层源码（Metro/Next 双端转译策略）
  transpilePackages: ["@shiguang/domain"],
};

export default nextConfig;
