import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ADR-0015：转译 workspace 共享域层源码（Next 打包时消费 TS 源码）
  transpilePackages: ["@shiguang/domain"],
};

export default nextConfig;
