/**
 * Sessão guardada no navegador.
 *
 * As claims são lidas do JWT sem verificar a assinatura, e isso é intencional: servem só
 * para exibir o nome de quem entrou e para descartar um token já vencido antes de gastar
 * uma requisição. Quem valida o token de verdade é o auth-service, pela introspecção que
 * o serviço de vídeos faz a cada chamada — nada aqui decide acesso a coisa alguma.
 */
import type { Session } from './types'

const STORAGE_KEY = 'fiapx.session'

type Claims = {
  sub?: string
  name?: string
  email?: string
  exp?: number
}

function decodeClaims(token: string): Claims | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as Claims
  } catch {
    return null
  }
}

export function sessionFromToken(token: string): Session | null {
  const claims = decodeClaims(token)
  if (!claims?.sub || !claims.exp) return null
  return {
    token,
    sub: claims.sub,
    name: claims.name ?? claims.email ?? 'usuário',
    email: claims.email ?? '',
    expiresAt: claims.exp * 1000,
  }
}

/** Devolve a sessão salva, ou nada se ela não existir, estiver corrompida ou já ter vencido. */
export function loadSession(): Session | null {
  const token = window.localStorage.getItem(STORAGE_KEY)
  if (!token) return null
  const session = sessionFromToken(token)
  if (!session || session.expiresAt <= Date.now()) {
    clearSession()
    return null
  }
  return session
}

export function saveSession(session: Session): void {
  window.localStorage.setItem(STORAGE_KEY, session.token)
}

export function clearSession(): void {
  window.localStorage.removeItem(STORAGE_KEY)
}
