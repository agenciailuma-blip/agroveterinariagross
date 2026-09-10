export default function EnConstruccion({ titulo }: { titulo: string }) {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight text-tinta">{titulo}</h1>
      <div className="rounded-xl border border-dashed border-borde bg-white p-12 text-center">
        <p className="text-sm text-piedra-500">
          Este módulo todavía no está desarrollado. Las reglas y los datos ya están en la base.
        </p>
      </div>
    </div>
  )
}
