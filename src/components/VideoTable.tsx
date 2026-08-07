import { useState } from 'react'
import { downloadUrl, isExpiredSession } from '../api'
import type { Session, Video } from '../types'
import { StatusBadge } from './StatusBadge'

const WHEN = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const formatDate = (iso: string | null) => (iso ? WHEN.format(new Date(iso)) : '—')

/**
 * O worker guarda a saída inteira do FFmpeg em `error_message` — uns 2 KB de banner de
 * versão e flags de compilação, com a causa real na última linha. É ela que vai na célula;
 * o resto fica no `<details>`, que é onde alguém procuraria de fato ao investigar a falha.
 */
function summarize(message: string): string {
  const lines = message.split('\n').filter((line) => line.trim())
  return lines[lines.length - 1] ?? message
}

type Props = {
  session: Session
  items: Video[]
  loading: boolean
  onExpired: () => void
}

export function VideoTable({ session, items, loading, onExpired }: Props) {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * O `.zip` não é servido por esta aplicação: o serviço devolve uma URL assinada do
   * object storage, com validade curta, e o navegador busca o arquivo direto de lá.
   */
  const download = async (video: Video) => {
    setPending(video.id)
    setError(null)
    try {
      window.location.href = await downloadUrl(session.token, video.id)
    } catch (cause) {
      if (isExpiredSession(cause)) {
        onExpired()
        return
      }
      setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o link.')
    } finally {
      setPending(null)
    }
  }

  if (!loading && items.length === 0) {
    return (
      <section className="card empty">
        <p className="empty__title">Nenhum vídeo por aqui</p>
        <p className="empty__hint">Envie o primeiro e acompanhe o processamento em tempo real.</p>
      </section>
    )
  }

  return (
    <section className="card">
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Arquivo</th>
              <th>Status</th>
              <th>Enviado em</th>
              <th className="table__actions">Resultado</th>
            </tr>
          </thead>
          <tbody className={loading ? 'table__body--loading' : undefined}>
            {items.map((video) => (
              <tr key={video.id}>
                <td>
                  <span className="table__name" title={video.original_name}>
                    {video.original_name}
                  </span>
                </td>
                <td>
                  <StatusBadge status={video.status} />
                </td>
                <td className="table__when">{formatDate(video.created_at)}</td>
                <td className="table__actions">
                  {video.status === 'COMPLETED' && (
                    <button
                      type="button"
                      className="button button--small"
                      disabled={pending === video.id}
                      onClick={() => void download(video)}
                    >
                      {pending === video.id ? 'Gerando…' : 'Baixar .zip'}
                    </button>
                  )}
                  {video.status === 'ERROR' &&
                    (video.error_message ? (
                      <details className="failure">
                        <summary title={summarize(video.error_message)}>{summarize(video.error_message)}</summary>
                        <pre className="failure__detail">{video.error_message}</pre>
                      </details>
                    ) : (
                      <span className="table__error">Falha no processamento</span>
                    ))}
                  {(video.status === 'RECEIVED' || video.status === 'PROCESSING') && (
                    <span className="table__waiting">aguarde…</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
