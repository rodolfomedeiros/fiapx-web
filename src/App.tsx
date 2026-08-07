import { useCallback, useEffect, useState } from 'react'
import { AuthPanel } from './components/AuthPanel'
import { StatusBadge } from './components/StatusBadge'
import { UploadPanel } from './components/UploadPanel'
import { VideoTable } from './components/VideoTable'
import { clearSession, loadSession, saveSession } from './session'
import { STATUSES, type Session, type VideoStatus } from './types'
import { PAGE_SIZE, useVideos } from './useVideos'

const CONNECTION_LABEL = {
  live: 'tempo real',
  connecting: 'conectando…',
  offline: 'reconectando…',
} as const

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession)
  const [status, setStatus] = useState<VideoStatus | null>(null)
  const [page, setPage] = useState(1)
  const [expired, setExpired] = useState(false)

  const signOut = useCallback(() => {
    clearSession()
    setSession(null)
    setStatus(null)
    setPage(1)
  }, [])

  const onExpired = useCallback(() => {
    setExpired(true)
    signOut()
  }, [signOut])

  const { items, total, loading, error, connection, reload } = useVideos({ session, status, page, onExpired })

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Apagar um filtro pode deixar menos páginas do que a que está aberta.
  useEffect(() => {
    if (page > pages) setPage(pages)
  }, [page, pages])

  if (!session) {
    return (
      <>
        {expired && (
          <p className="banner" role="alert">
            Sua sessão expirou. Entre novamente.
          </p>
        )}
        <AuthPanel
          onAuthenticated={(next) => {
            saveSession(next)
            setSession(next)
            setExpired(false)
          }}
        />
      </>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <p className="brand">
          FIAP<span className="brand__x">X</span>
        </p>
        <div className="topbar__right">
          <span className={`pulse pulse--${connection}`} title={CONNECTION_LABEL[connection]}>
            <span className="pulse__dot" aria-hidden="true" />
            {CONNECTION_LABEL[connection]}
          </span>
          <span className="topbar__user">{session.name}</span>
          <button type="button" className="button button--ghost" onClick={signOut}>
            Sair
          </button>
        </div>
      </header>

      <main className="content">
        <UploadPanel session={session} onAccepted={reload} onExpired={onExpired} />

        <section className="toolbar">
          <div className="filters" role="group" aria-label="Filtrar por status">
            <button
              type="button"
              className={status === null ? 'chip chip--active' : 'chip'}
              onClick={() => {
                setStatus(null)
                setPage(1)
              }}
            >
              Todos
            </button>
            {STATUSES.map((option) => (
              <button
                key={option}
                type="button"
                className={status === option ? 'chip chip--active' : 'chip'}
                onClick={() => {
                  setStatus(option)
                  setPage(1)
                }}
              >
                <StatusBadge status={option} animated={false} />
              </button>
            ))}
          </div>
          <span className="toolbar__count">
            {total} {total === 1 ? 'vídeo' : 'vídeos'}
          </span>
        </section>

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        <VideoTable session={session} items={items} loading={loading} onExpired={onExpired} />

        {pages > 1 && (
          <nav className="pager" aria-label="Paginação">
            <button
              type="button"
              className="button button--small"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Anterior
            </button>
            <span className="pager__position">
              {page} de {pages}
            </span>
            <button
              type="button"
              className="button button--small"
              disabled={page >= pages}
              onClick={() => setPage((current) => current + 1)}
            >
              Próxima
            </button>
          </nav>
        )}
      </main>
    </div>
  )
}
