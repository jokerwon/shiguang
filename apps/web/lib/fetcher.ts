'use client';

import { request } from './api';

// SWR 通用 fetcher — 接收 URL 路径作为 key，复用现有的 request<T>() 封装
export async function fetcher<T = unknown>(path: string): Promise<T> {
  return request<T>(path);
}

