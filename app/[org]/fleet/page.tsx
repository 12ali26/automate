import { FleetView } from '@/components/fleet/FleetView'
import { withOrgContext } from '@/lib/auth/org-context'
import { requireStaffSession } from '@/lib/auth/session'
import * as machinesRepo from '@/lib/repos/machines'

// A browse screen, not a transaction surface: 30s of staleness is fine and
// keeps it fast. (The machine page stays no-store — a stale state there causes
// a failed checkout.)
export const revalidate = 30

export default async function FleetPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const { org } = await requireStaffSession(slug)

  const machines = await withOrgContext(org.id, (tx) => machinesRepo.listForFleet(tx))

  return <FleetView machines={machines} />
}
