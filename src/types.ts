/** Formatos devolvidos pelo auth-service e pelo video-management-service. */

export const STATUSES = ['RECEIVED', 'PROCESSING', 'COMPLETED', 'ERROR'] as const

export type VideoStatus = (typeof STATUSES)[number]

/** O mesmo objeto chega por `GET /videos` e pelo WebSocket — é o `Video.serialize()` do serviço Python. */
export type Video = {
  id: string
  original_name: string
  status: VideoStatus
  zip_file_path: string | null
  error_message: string | null
  created_at: string | null
}

export type VideoPage = {
  items: Video[]
  page: number
  size: number
  total: number
}

/** Claims do JWT emitido pelo auth-service, lidas apenas para exibir quem está logado. */
export type Session = {
  token: string
  sub: string
  name: string
  email: string
  expiresAt: number
}

export type Credentials = {
  email: string
  password: string
}

export type Registration = Credentials & {
  name: string
}
