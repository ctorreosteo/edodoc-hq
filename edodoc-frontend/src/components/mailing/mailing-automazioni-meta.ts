import {
  AlarmClock,
  Cake,
  CalendarCheck,
  CalendarClock,
  CalendarHeart,
  Clock,
  Flag,
  GitBranch,
  Hand,
  HeartHandshake,
  Hourglass,
  ListTodo,
  Mail,
  Moon,
  Phone,
  PhoneCall,
  PhoneForwarded,
  ShoppingBag,
  Sparkles,
  Stethoscope,
  Tag,
  TagsIcon,
  UserPlus,
  Users,
  UserRoundPlus,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import type { MailingTipoNodo, MailingTipoTrigger } from '@/services/mailing-service'
import { ETICHETTE_NODO } from '@/lib/mailing-grafo'

/* Icone, etichette e colori dei tipi di nodo, dei trigger e dei modelli (tela, elenco, galleria). */

export type MetaNodo = { etichetta: string; icona: LucideIcon; descrizione: string; gruppo: string }

export const META_NODO: Record<MailingTipoNodo, MetaNodo> = {
  EMAIL: { etichetta: ETICHETTE_NODO.EMAIL, icona: Mail, descrizione: 'Manda un’email scritta da te', gruppo: 'Messaggi' },
  ATTESA: { etichetta: ETICHETTE_NODO.ATTESA, icona: Hourglass, descrizione: 'Minuti, ore o giorni prima del passo dopo', gruppo: 'Tempo' },
  ATTESA_FINO_A: { etichetta: ETICHETTE_NODO.ATTESA_FINO_A, icona: CalendarClock, descrizione: 'Un giorno della settimana a un’ora precisa', gruppo: 'Tempo' },
  CONDIZIONE: { etichetta: ETICHETTE_NODO.CONDIZIONE, icona: GitBranch, descrizione: 'Divide il percorso in Sì e No', gruppo: 'Logica' },
  AGGIUNGI_TAG: { etichetta: ETICHETTE_NODO.AGGIUNGI_TAG, icona: Tag, descrizione: 'Etichetta il contatto', gruppo: 'Azioni' },
  RIMUOVI_TAG: { etichetta: ETICHETTE_NODO.RIMUOVI_TAG, icona: TagsIcon, descrizione: 'Toglie un’etichetta', gruppo: 'Azioni' },
  NOTIFICA_STAFF: { etichetta: ETICHETTE_NODO.NOTIFICA_STAFF, icona: ListTodo, descrizione: 'Crea un task per il dottore nella pagina Task', gruppo: 'Azioni' },
  FINE: { etichetta: ETICHETTE_NODO.FINE, icona: Flag, descrizione: 'Il percorso finisce qui', gruppo: 'Fine' },
}

export const ICONA_TRIGGER: Record<MailingTipoTrigger, LucideIcon> = {
  NUOVO_LEAD: UserPlus,
  CONOSCITIVA_PRENOTATA: PhoneCall,
  CONOSCITIVA_SVOLTA: Phone,
  ESITO_CONOSCITIVA: PhoneForwarded,
  PRIMA_VISITA_PRENOTATA: CalendarCheck,
  PRIMA_VISITA_EFFETTUATA: Stethoscope,
  VISITA_EFFETTUATA: HeartHandshake,
  ACQUISTO: ShoppingBag,
  TAG_AGGIUNTO: Tag,
  COMPLEANNO: Cake,
  INATTIVO_DA_GIORNI: Moon,
  ENTRATA_SEGMENTO: Users,
  ISCRIZIONE: UserRoundPlus,
  MANUALE: Hand,
}

/** Icona dei modelli: il backend manda una parola chiave libera; si riconoscono le più probabili. */
export function iconaModello(icona: string | null | undefined, chiave = ''): LucideIcon {
  const s = `${icona ?? ''} ${chiave}`.toLowerCase()
  if (/compleann|cake|torta/.test(s)) return Cake
  if (/riattiv|dorm|sveglia|alarm|inattiv/.test(s)) return AlarmClock
  if (/acquist|percorso|bussola|shopping|carrello|bag/.test(s)) return ShoppingBag
  if (/conoscitiv|chiamat|telefon|phone/.test(s)) return PhoneCall
  if (/prima.?visita|dopo.?visita|calendar|visita/.test(s)) return CalendarHeart
  if (/benvenut|lead|hand|mano|welcome/.test(s)) return Sparkles
  if (/mail/.test(s)) return Mail
  if (/clock|attesa/.test(s)) return Clock
  return Workflow
}

/** Tinta (gradi HSL) dei modelli per l'illustrazione, stabile per icona. */
export function tintaModello(icona: string | null | undefined, chiave = ''): string {
  const s = `${icona ?? ''} ${chiave}`.toLowerCase()
  if (/compleann|cake|torta/.test(s)) return 'compleanno'
  if (/riattiv|dorm|sveglia|alarm|inattiv/.test(s)) return 'riattivazione'
  if (/acquist|percorso|bussola|shopping|carrello|bag/.test(s)) return 'acquisto'
  if (/conoscitiv|chiamat|telefon|phone|prima.?visita|dopo.?visita|calendar|visita/.test(s)) return 'visita'
  if (/benvenut|lead|hand|mano|welcome/.test(s)) return 'benvenuto'
  return 'altro'
}

