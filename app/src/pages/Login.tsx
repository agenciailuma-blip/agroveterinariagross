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
    <div className="grid min-h-full place-items-center bg-linear-to-br from-marca-800 to-marca-950 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Agroveterinaria Gross
          </h1>
          <p className="mt-1 text-sm text-marca-200">Sistema de gestión</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-xl bg-white p-6 shadow-xl ring-1 ring-black/5"
        >
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
              Correo
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20"
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
            className="w-full rounded-lg bg-marca-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-marca-700 focus:ring-2 focus:ring-marca-500/40 focus:outline-none disabled:opacity-60"
          >
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-marca-300">
          ILUMA · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
