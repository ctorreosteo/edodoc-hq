import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Caricamento } from '@/components/stati'
import { useAuth } from '@/contexts/auth-context'
import { canAccessPlanner } from '@/lib/planner-access'

/** Guardia del Planner social: stessa regola della voce di menu (solo ADMIN). */
export const PlannerRoute: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { utente, pronto } = useAuth()

  if (!pronto) return <Caricamento etichetta="Verifica accesso…" />
  if (!canAccessPlanner(utente)) return <Navigate to="/" replace />

  return <>{children}</>
}
