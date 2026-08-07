import { useRef, useState } from 'react'
import { isExpiredSession, uploadVideo } from '../api'
import type { Session } from '../types'

/** Os mesmos formatos aceitos por `config.ALLOWED_EXTENSIONS`, e o mesmo teto de `MAX_UPLOAD_BYTES`. */
const EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm']
const MAX_BYTES = 500 * 1024 * 1024

type Props = {
  session: Session
  onAccepted: () => void
  onExpired: () => void
}

export function UploadPanel({ session, onAccepted, onExpired }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const abort = useRef<(() => void) | null>(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const sending = progress !== null

  const send = async (file: File) => {
    // Rejeitar aqui evita subir 600 MB para receber um 413 no fim.
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!EXTENSIONS.includes(extension)) {
      setMessage({ kind: 'error', text: `Formato não suportado. Use ${EXTENSIONS.join(', ')}.` })
      return
    }
    if (file.size > MAX_BYTES) {
      setMessage({ kind: 'error', text: 'O arquivo passa do limite de 500 MB.' })
      return
    }

    setMessage(null)
    setProgress(0)
    const upload = uploadVideo(session.token, file, setProgress)
    abort.current = upload.abort
    try {
      await upload.accepted
      setMessage({ kind: 'ok', text: `“${file.name}” entrou na fila de processamento.` })
      onAccepted()
    } catch (cause) {
      if (isExpiredSession(cause)) {
        onExpired()
        return
      }
      setMessage({ kind: 'error', text: cause instanceof Error ? cause.message : 'O envio falhou.' })
    } finally {
      abort.current = null
      setProgress(null)
      if (input.current) input.current.value = ''
    }
  }

  const drop = (event: React.DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file && !sending) void send(file)
  }

  return (
    <section className="card">
      <div
        className={`dropzone${dragging ? ' dropzone--over' : ''}${sending ? ' dropzone--busy' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <input
          ref={input}
          type="file"
          accept={EXTENSIONS.join(',')}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void send(file)
          }}
        />

        {sending ? (
          <div className="upload">
            <div className="upload__bar">
              <div className="upload__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="upload__label">
              Enviando… {Math.round(progress * 100)}%
              <button type="button" className="button button--ghost" onClick={() => abort.current?.()}>
                Cancelar
              </button>
            </p>
          </div>
        ) : (
          <>
            <p className="dropzone__title">Arraste um vídeo aqui</p>
            <p className="dropzone__hint">{EXTENSIONS.join(' · ')} — até 500 MB</p>
            <button type="button" className="button button--primary" onClick={() => input.current?.click()}>
              Escolher arquivo
            </button>
          </>
        )}
      </div>

      {message && (
        <p className={message.kind === 'ok' ? 'notice' : 'alert'} role="status">
          {message.text}
        </p>
      )}
    </section>
  )
}
