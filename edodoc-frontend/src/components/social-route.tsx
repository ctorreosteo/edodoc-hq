import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Caricamento } from '@/components/stati'
import { useAuth } from '@/contexts/auth-context'
import { canAccessSocial } from '@/lib/social-access'

/** Guardia della pagina Meta: stessa regola della voce di menu (solo ADMIN). */
export const SocialRoute: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { utente, pronto } = useAuth()

  if (!pronto) return <Caricamento etichetta="Verifica accesso…" />
  if (!canAccessSocial(utente)) return <Navigate to="/" replace />

  return <>{children}</>
}
