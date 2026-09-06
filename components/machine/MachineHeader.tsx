/**
 * Machine name + code. The name is large — it's the confirmation you scanned
 * the right machine. The code is deliberately quiet: it only confirms the
 * scan, it isn't something you act on. Status and location are a separate
 * line (see MachineStatus).
 */
export function MachineHeader({ name, code }: { name: string; code: string }) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-gray-950 break-words">
        {name}
      </h1>
      <p className="font-mono text-sm font-medium text-gray-500">{code}</p>
    </header>
  )
}
