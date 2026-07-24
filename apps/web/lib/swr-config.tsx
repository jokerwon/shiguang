'use client';

import { SWRConfig } from 'swr';
import { fetcher } from './fetcher';
import type { ReactNode } from 'react';

export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        dedupingInterval: 2000, // 2s 内并发请求自动去重
        revalidateOnFocus: true, // 标签页聚焦时刷新
        revalidateOnReconnect: true, // 网络恢复时刷新
        shouldRetryOnError: true,
        errorRetryCount: 3,
        errorRetryInterval: 5000, // 错误重试间隔 5s
        focusThrottleInterval: 10000, // 聚焦重新验证间隔 ≥10s
      }}
    >
      {children}
    </SWRConfig>
  );
}
