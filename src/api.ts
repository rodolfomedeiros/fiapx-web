/**
 * Cliente das rotas expostas pelo gateway: `/auth/*` vai para o auth-service e
 * `/videos/*` para o video-management-service.
 *
 * A base é vazia de propósito. Em produção o mesmo Nginx serve esta aplicação e
 * encaminha as duas rotas, e em desenvolvimento o proxy do Vite reproduz isso — nos
 * dois casos as chamadas saem na mesma origem, sem CORS e sem token atravessando domínio.
 */
import type { Credentials, Registration, Video, VideoPage, VideoStatus } from './types'

const BASE = import.meta.env.VITE_GATEWAY_URL ?? ''

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Um 401 significa que o token expirou ou foi revogado: quem chamou deve encerrar a sessão. */
export function isExpiredSession(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

/**
 * Extrai a mensagem do corpo do erro. FastAPI responde `{"detail": ...}` — string nas
 * exceções da aplicação e lista de objetos nos erros de validação —, enquanto o Spring
 * omite `message` por padrão. Daí o mapa de mensagens por status a cargo de quem chama.
 */
async function fail(response: Response, fallbacks: Record<number, string>): Promise<never> {
  let detail: unknown
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object') {
      detail = 'detail' in body ? body.detail : 'message' in body ? body.message : undefined
    }
  } catch {
    // Corpo vazio ou que não é JSON — sobra o mapa de mensagens.
  }
  if (Array.isArray(detail)) detail = detail[0]?.msg
  const message =
    typeof detail === 'string' && detail
      ? detail
      : (fallbacks[response.status] ?? `A requisição falhou (HTTP ${response.status}).`)
  throw new ApiError(response.status, message)
}

async function request<T>(path: string, init: RequestInit, fallbacks: Record<number, string> = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, init)
  } catch {
    throw new ApiError(0, 'Não foi possível falar com o servidor. Ele está no ar?')
  }
  if (!response.ok) await fail(response, fallbacks)
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

export function register(input: Registration): Promise<{ id: string; name: string; email: string }> {
  return request(
    '/auth/register',
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) },
    {
      400: 'Confira os dados: a senha precisa de 8 a 128 caracteres e o e-mail deve ser válido.',
      409: 'Este e-mail já está cadastrado.',
    },
  )
}

export function login(input: Credentials): Promise<{ access_token: string; token_type: string; expires_in: number }> {
  return request(
    '/auth/login',
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) },
    { 400: 'Informe um e-mail e uma senha.', 401: 'E-mail ou senha incorretos.' },
  )
}

export function listVideos(
  token: string,
  options: { page: number; size: number; status?: VideoStatus | null; signal?: AbortSignal },
): Promise<VideoPage> {
  const query = new URLSearchParams({ page: String(options.page), size: String(options.size) })
  if (options.status) query.set('status', options.status)
  return request(`/videos?${query}`, { headers: bearer(token), signal: options.signal }, { 401: 'Sessão expirada.' })
}

export async function downloadUrl(token: string, id: string): Promise<string> {
  const { url } = await request<{ url: string; expires_in: number }>(
    `/videos/${id}/download`,
    { headers: bearer(token) },
    { 404: 'Vídeo não encontrado.', 409: 'O processamento ainda não terminou.' },
  )
  return url
}

export type Upload = {
  accepted: Promise<{ id: string; status: VideoStatus }>
  abort: () => void
}

/**
 * O upload usa XMLHttpRequest, e não fetch, porque só ele informa o progresso do corpo
 * enviado — que é o que dá sinal de vida a um arquivo de centenas de megabytes.
 */
export function uploadVideo(token: string, file: File, onProgress: (ratio: number) => void): Upload {
  const form = new FormData()
  form.append('file', file)

  const xhr = new XMLHttpRequest()
  const accepted = new Promise<{ id: string; status: VideoStatus }>((resolve, reject) => {
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText))
        return
      }
      let detail: unknown
      try {
        detail = JSON.parse(xhr.responseText)?.detail
      } catch {
        // Resposta sem corpo JSON — vale o mapa abaixo.
      }
      const fallbacks: Record<number, string> = {
        401: 'Sessão expirada.',
        413: 'O arquivo passa do limite de 500 MB.',
        400: 'Formato não suportado. Use mp4, avi, mov, mkv, wmv, flv ou webm.',
      }
      const message =
        typeof detail === 'string' && detail
          ? detail
          : (fallbacks[xhr.status] ?? `O envio falhou (HTTP ${xhr.status}).`)
      reject(new ApiError(xhr.status, message))
    })
    xhr.addEventListener('error', () => reject(new ApiError(0, 'A conexão caiu durante o envio.')))
    xhr.addEventListener('abort', () => reject(new ApiError(0, 'Envio cancelado.')))
  })

  xhr.open('POST', `${BASE}/videos/upload`)
  xhr.setRequestHeader('Authorization', `Bearer ${token}`)
  xhr.send(form)

  return { accepted, abort: () => xhr.abort() }
}

/**
 * O token vai na query string porque a API de WebSocket do navegador não deixa enviar
 * headers. O serviço aceita as duas formas justamente por isso.
 */
export function openUpdates(token: string): WebSocket {
  const base = BASE || window.location.origin
  const url = new URL('/videos/ws', base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('token', token)
  return new WebSocket(url)
}

export function isVideo(value: unknown): value is Video {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as Video).id === 'string' &&
    typeof (value as Video).status === 'string'
  )
}
