import { signOutAction } from '@/lib/auth/actions'
import { requireStaffSession } from '@/lib/auth/session'

// Placeholder for Stage 2. The real fleet view is Stage 5.
export default async function FleetPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  const { session } = await requireStaffSession(slug)

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Fleet</h1>
        <p className="mt-1 text-gray-600">Signed in as {session.fullName}</p>
      </div>

      <p className="rounded-xl border border-dashed border-gray-300 p-4 text-gray-500">
        The fleet view is built in a later stage.
      </p>

      <form action={signOutAction.bind(null, slug)} className="mt-auto">
        <button
          type="submit"
          className="w-full rounded-xl border border-gray-300 bg-white px-5 py-4 text-lg font-semibold text-gray-800 active:bg-gray-100"
        >
          Sign out
        </button>
      </form>
    </main>
  )
}
