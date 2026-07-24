'use client';

import { request } from './api';

// SWR 通用 fetcher — 接收 URL 路径作为 key，复用现有的 request<T>() 封装
export async function fetcher<T = unknown>(path: string): Promise<T> {
  return request<T>(path);
}

// 用于带请求体的 SWR 调用（如 POST），key 格式为 [path, init]
export async function fetcherWithBody<T = unknown>([path, init]: [
  string,
  RequestInit,
]): Promise<T> {
  return request<T>(path, init);
}
