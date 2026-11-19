import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { buscarPorNumero, type PapelEncontrado } from '@/lib/api/buscarPorNumero'
import { abrirComprobante, abrirNoFiscal } from '@/lib/escritorio'
import { enCastellano } from '@/lib/errores'
import { moneda } from '@/lib/tipos'
import { campoDeFiltro } from '@/estilos'

/*
  La barra de arriba de Comprobantes: un número y aparece qué papel es,
  sea del tipo que sea (auditoría de integralidad, punto 8). Las
  pestañas siguen siendo el archivo de cada tipo; esto es para cuando
  no se sabe en cuál buscar.
*/

const fechaCorta = (dia: string) => new Date(`${dia.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR')

export default function BuscarPapel() {
  const { tienePermiso } = useAuth()
  const navegar = useNavigate()
  const [texto, setTexto] = useState('')
  const [buscado, setBuscado] = useState('')

  const permisos = {
    facturas: tienePermiso('facturacion.ver'),
    noFiscales: tienePermiso('facturacion.no_fiscal_ver'),
    recibos: ['cuentacorriente.ver', 'cuentacorriente.cobrar', 'fiados.ver'].some((p) => tienePermiso(p)),
  }

  const resultado = useQuery({
    queryKey: ['buscar-papel', buscado, permisos],
    queryFn: () => buscarPorNumero(buscado, permisos),
    enabled: !!buscado.trim(),
  })

  function abrir(p: PapelEncontrado) {
    if (p.papel.tipo === 'comprobante') void abrirComprobante(p.papel.id)
    else if (p.papel.tipo === 'no_fiscal') void abrirNoFiscal(p.papel.id)
    else navegar(`/recibo/${p.papel.id}`)
  }

  const filas = resultado.data ?? []

  return (
    <div className="mb-4 space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setBuscado(texto)
        }}
        className="flex gap-2"
      >
        <input
          type="search"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            if (!e.target.value.trim()) setBuscado('')
          }}
          placeholder="Buscar cualquier papel por número: 123, 1-123, PRE 0001-00000012…"
          aria-label="Buscar cualquier papel por número"
          inputMode="text"
          className={`${campoDeFiltro} min-w-0 flex-1`}
        />
        <button type="submit" disabled={!texto.trim()} className="shrink-0 rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-40">
          Buscar
        </button>
      </form>

      {buscado.trim() && (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
          {resultado.isPending ? (
            <p className="px-4 py-3 text-sm text-piedra-400">Buscando…</p>
          ) : resultado.isError ? (
            <p role="alert" className="px-4 py-3 text-sm text-red-700">
              {enCastellano(resultado.error, 'No se pudo buscar.')}
            </p>
          ) : !filas.length ? (
            <p className="px-4 py-3 text-sm text-piedra-500">
              Ningún papel con ese número. Se escribe con números: «123», «1-123» o «0001-00000123».
            </p>
          ) : (
            <ul className="divide-y divide-piedra-100">
              {filas.map((p) => (
                <li key={`${p.papel.tipo}-${p.papel.id}`}>
                  <button
                    onClick={() => abrir(p)}
                    className="flex w-full flex-wrap items-start justify-between gap-x-4 gap-y-0.5 px-4 py-2.5 text-left hover:bg-marca-50"
                  >
                    <span className="min-w-0 flex-1 basis-56">
                      <span className="block text-sm text-tinta">
                        <span className="font-medium">{p.clase}</span>{' '}
                        <span className="font-mono text-xs">{p.numero}</span>
                        {p.anulado && <span className="ml-2 text-xs font-medium text-red-700">anulado</span>}
                      </span>
                      <span className="block truncate text-xs text-piedra-500">
                        {p.quien} · {fechaCorta(p.fecha)}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-sm tabular-nums ${p.anulado ? 'text-piedra-400 line-through' : 'text-tinta'}`}
                    >
                      {moneda.format(p.total)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
