import { DiscoveryClient } from './discovery-client'

// 首页推荐是个性化端点（需认证），token 在 localStorage 里 RSC 拿不到，
// 因此数据获取下沉到 DiscoveryClient 内走 SWR（ADR-0005）
export default function DiscoveryPage() {
  return <DiscoveryClient />
}
