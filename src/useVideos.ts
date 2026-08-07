/**
 * Lista de vídeos e sua atualização em tempo real.
 *
 * A lista vem de `GET /videos`; a partir daí, cada transição de estado chega pelo
 * WebSocket, então a tela nunca faz polling.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { isExpiredSession, isVideo, listVideos, openUpdates } from './api'
import type { Session, Video, VideoStatus } from './types'

export const PAGE_SIZE = 10

/**
 * O Nginx encerra conexões ociosas, e um WebSocket em que ninguém fala fica ocioso o
 * tempo todo. O serviço lê e descarta o que o cliente manda — é para isso que serve o
 * laço de `receive_text` do lado de lá —, então um texto curto de tempos em tempos
 * mantém a conexão de pé sem custo.
 */
const HEARTBEAT_MS = 25_000

const RECONNECT_MIN_MS = 1_000
const RECONNECT_MAX_MS = 15_000

export type Connection = 'connecting' | 'live' | 'offline'

type Options = {
  session: Session | null
  status: VideoStatus | null
  page: number
  onExpired: () => void
}

export function useVideos({ session, status, page, onExpired }: Options) {
  const [items, setItems] = useState<Video[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connection, setConnection] = useState<Connection>('connecting')

  // Refs porque o WebSocket é montado uma vez por sessão e não deve reconectar a cada
  // troca de filtro ou de página — mas seu handler precisa enxergar os valores atuais.
  const statusRef = useRef(status)
  statusRef.current = status
  const expiredRef = useRef(onExpired)
  expiredRef.current = onExpired
  const reloadRef = useRef<() => void>(() => {})

  const token = session?.token ?? null

  const reload = useCallback(
    (signal?: AbortSignal) => {
      if (!token) return
      setLoading(true)
      listVideos(token, { page, size: PAGE_SIZE, status, signal })
        .then((result) => {
          if (signal?.aborted) return
          setItems(result.items)
          setTotal(result.total)
          setError(null)
        })
        .catch((cause: unknown) => {
          if (signal?.aborted || (cause instanceof DOMException && cause.name === 'AbortError')) return
          if (isExpiredSession(cause)) {
            expiredRef.current()
            return
          }
          setError(cause instanceof Error ? cause.message : 'Não foi possível carregar seus vídeos.')
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false)
        })
    },
    [token, page, status],
  )
  reloadRef.current = () => reload()

  useEffect(() => {
    if (!token) {
      setItems([])
      setTotal(0)
      return
    }
    const controller = new AbortController()
    reload(controller.signal)
    return () => controller.abort()
  }, [token, reload])

  useEffect(() => {
    if (!token) {
      setConnection('offline')
      return
    }

    let socket: WebSocket | null = null
    let heartbeat: number | undefined
    let retry: number | undefined
    let delay = RECONNECT_MIN_MS
    let closed = false

    const scheduleRetry = () => {
      retry = window.setTimeout(connect, delay)
      delay = Math.min(delay * 2, RECONNECT_MAX_MS)
    }

    const connect = () => {
      setConnection('connecting')
      socket = openUpdates(token)
      let opened = false

      socket.addEventListener('open', () => {
        opened = true
        delay = RECONNECT_MIN_MS
        setConnection('live')
        heartbeat = window.setInterval(() => socket?.send('ping'), HEARTBEAT_MS)
      })

      socket.addEventListener('message', (event: MessageEvent<string>) => {
        let update: unknown
        try {
          update = JSON.parse(event.data)
        } catch {
          return
        }
        if (!isVideo(update)) return
        const video = update

        // Com um filtro ativo, a transição pode tirar o vídeo da lista ou trazer outro
        // para ela — nesse caso só o servidor sabe qual é a página correta. Sem filtro,
        // a ordem é por data de criação e não muda, então basta trocar o item no lugar.
        if (statusRef.current !== null) {
          reloadRef.current()
          return
        }
        setItems((current) => {
          const index = current.findIndex((item) => item.id === video.id)
          if (index === -1) {
            // Vídeo que ainda não está nesta página: só o servidor sabe onde ele entra.
            reloadRef.current()
            return current
          }
          const next = [...current]
          next[index] = video
          return next
        })
      })

      socket.addEventListener('close', (event) => {
        window.clearInterval(heartbeat)
        if (closed) return
        setConnection('offline')

        // O serviço recusa o token *antes* de aceitar o handshake, e um handshake
        // recusado chega ao navegador como 1006, sem código de aplicação — o 1008 que o
        // servidor pede só apareceria se a recusa viesse com o socket já aberto. Ou
        // seja: pelo código de fechamento não dá para separar token morto de servidor
        // fora do ar. Quem decide é uma requisição autenticada barata, e insistir contra
        // uma recusa só repetiria a recusa.
        if (event.code === 1008) {
          expiredRef.current()
          return
        }
        if (opened) {
          scheduleRetry()
          return
        }
        void listVideos(token, { page: 1, size: 1 }).then(
          () => {
            if (!closed) scheduleRetry()
          },
          (cause: unknown) => {
            if (closed) return
            if (isExpiredSession(cause)) expiredRef.current()
            else scheduleRetry()
          },
        )
      })
    }

    connect()

    return () => {
      closed = true
      window.clearInterval(heartbeat)
      window.clearTimeout(retry)
      socket?.close()
    }
  }, [token])

  return { items, total, loading, error, connection, reload: useCallback(() => reload(), [reload]) }
}
