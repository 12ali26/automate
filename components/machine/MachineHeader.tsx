/**
 * Common header for every machine-page state: large machine name (it's the
 * confirmation you scanned the right thing), code, and current location. When
 * the machine's current location is not the store, the location line turns
 * amber — it was last returned somewhere else and that's where it will be.
 */
export function MachineHeader({
  name,
  code,
  locationName,
  locationOffStore,
}: {
  name: string
  code: string
  locationName: string | null
  locationOffStore: boolean
}) {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-gray-950 break-words">
        {name}
      </h1>
      <p className="font-mono text-lg font-semibold text-gray-700">{code}</p>

      {locationName ? (
        locationOffStore ? (
          <p className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-md bg-amber-200 px-2.5 py-1 text-lg font-bold text-amber-950">
            <span aria-hidden>▲</span> at {locationName}
          </p>
        ) : (
          <p className="mt-1 text-lg font-semibold text-gray-800">at {locationName}</p>
        )
      ) : (
        <p className="mt-1 text-lg font-semibold text-gray-500">location unknown</p>
      )}
    </header>
  )
}
