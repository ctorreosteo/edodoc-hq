import { List } from 'lucide-react'
import type { TaskLista } from '@/services/task-service'
import { ICONE_LISTA } from './task-lista-icone'

export function TaskListaIcona({ lista, size = 'md' }: { lista: Pick<TaskLista, 'icona' | 'colore'>; size?: 'sm' | 'md' | 'lg' }) {
  const Icon = (lista.icona && ICONE_LISTA[lista.icona]) || List
  return (
    <span className="tk-lista-icona" data-size={size} style={{ ['--tk-c' as string]: lista.colore }} aria-hidden>
      <Icon />
    </span>
  )
}
