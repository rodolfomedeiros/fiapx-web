import type { VideoStatus } from '../types'

const LABELS: Record<VideoStatus, string> = {
  RECEIVED: 'Na fila',
  PROCESSING: 'Processando',
  COMPLETED: 'Concluído',
  ERROR: 'Falhou',
}

/**
 * `animated={false}` nos filtros: ali o selo é o nome de uma opção, e um spinner girando
 * anunciaria um trabalho em curso que não existe. O ponto colorido entra no lugar dele.
 */
export function StatusBadge({ status, animated = true }: { status: VideoStatus; animated?: boolean }) {
  const spinning = animated && status === 'PROCESSING'
  return (
    <span className={`badge badge--${status.toLowerCase()}${spinning ? ' badge--spinning' : ''}`}>
      {spinning && <span className="badge__spinner" aria-hidden="true" />}
      {LABELS[status]}
    </span>
  )
}
