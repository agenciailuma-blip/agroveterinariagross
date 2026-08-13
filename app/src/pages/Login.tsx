import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '@/auth/AuthProvider'

export default function Login() {
  const { ingresar } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await ingresar(email.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo ingresar.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="relative grid min-h-full place-items-center overflow-hidden bg-marca-950 p-4">
      {/* Luces de fondo. Decorativas: no llevan texto ni foco. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <span
          className="luz size-[34rem] bg-marca-600/45"
          style={{ top: '-12%', left: '-10%' }}
        />
        <span
          className="luz size-[26rem] bg-verde-500/25"
          style={{ bottom: '-14%', right: '-6%', animationDelay: '-9s' }}
        />
        <span
          className="luz size-[20rem] bg-acento-400/12"
          style={{ top: '38%', right: '22%', animationDelay: '-17s' }}
        />
        <div
          className="absolute inset-0 opacity-[0.09]"
          style={{
            backgroundImage: 'url(/marca/pattern.svg)',
            backgroundSize: '620px',
          }}
        />
      </div>

      <div className="relative w-full max-w-sm">
        <img
          src="/marca/logo.svg"
          alt="Agroveterinaria Gross"
          className="mx-auto mb-8 h-16 w-auto brightness-0 invert"
        />

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl bg-papel/95 p-6 shadow-2xl ring-1 ring-white/10 backdrop-blur-sm"
        >
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-piedra-600">
              Correo
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-borde bg-white px-3 py-2.5 text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-piedra-600">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-borde bg-white px-3 py-2.5 text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-lg bg-marca-700 px-4 py-2.5 font-medium text-white transition-colors hover:bg-marca-600 focus:ring-2 focus:ring-marca-400/50 focus:outline-none disabled:opacity-60"
          >
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-marca-300/70">
          Sistema de gestión · ILUMA {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
