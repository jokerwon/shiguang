import { fetchRecommended } from '@/lib/api'
import { DiscoveryClient } from './discovery-client'

export default async function DiscoveryPage() {
  const { today, quick } = await fetchRecommended()

  return <DiscoveryClient today={today} quick={quick} />
}
