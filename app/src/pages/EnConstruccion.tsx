export default function EnConstruccion({ titulo }: { titulo: string }) {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">{titulo}</h1>
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <p className="text-sm text-slate-500">
          Este módulo todavía no está desarrollado. Las reglas y los datos ya están en la base.
        </p>
      </div>
    </div>
  )
}
