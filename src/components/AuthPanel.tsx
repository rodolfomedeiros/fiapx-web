import { useState } from 'react'
import { login, register } from '../api'
import { sessionFromToken } from '../session'
import type { Session } from '../types'

type Mode = 'login' | 'register'

export function AuthPanel({ onAuthenticated }: { onAuthenticated: (session: Session) => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const swap = (next: Mode) => {
    setMode(next)
    setError(null)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // Cadastrar não emite token: o serviço de autenticação separa criar a conta de
      // abrir a sessão. O login logo em seguida poupa o usuário de digitar duas vezes.
      if (mode === 'register') await register({ name, email, password })
      const { access_token } = await login({ email, password })
      const session = sessionFromToken(access_token)
      if (!session) throw new Error('O servidor devolveu um token que não foi possível ler.')
      onAuthenticated(session)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível entrar.')
      setBusy(false)
    }
  }

  return (
    <main className="auth">
      <div className="auth__card">
        <header className="auth__header">
          <p className="brand">
            FIAP<span className="brand__x">X</span>
          </p>
          <p className="auth__tagline">Envie um vídeo e receba os quadros extraídos em um .zip</p>
        </header>

        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'tab tab--active' : 'tab'}
            onClick={() => swap('login')}
          >
            Entrar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'tab tab--active' : 'tab'}
            onClick={() => swap('register')}
          >
            Criar conta
          </button>
        </div>

        <form className="auth__form" onSubmit={submit}>
          {mode === 'register' && (
            <label className="field">
              <span className="field__label">Nome</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={100}
                autoComplete="name"
                placeholder="Ana Souza"
              />
            </label>
          )}

          <label className="field">
            <span className="field__label">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              placeholder="ana@example.com"
            />
          </label>

          <label className="field">
            <span className="field__label">Senha</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              maxLength={128}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={mode === 'register' ? 'ao menos 8 caracteres' : '••••••••'}
            />
          </label>

          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta e entrar'}
          </button>
        </form>
      </div>
    </main>
  )
}
