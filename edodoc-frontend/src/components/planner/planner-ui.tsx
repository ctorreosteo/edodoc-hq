import type { CSSProperties, ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { FaFacebook, FaGoogle, FaInstagram, FaLinkedin, FaPinterest, FaThreads, FaTiktok, FaXTwitter, FaYoutube } from 'react-icons/fa6'
import type { IconType } from 'react-icons'
import { INFO_CANALE } from '@/lib/planner-canali'
import { ETICHETTA_STATO, ETICHETTA_STATO_CANALE } from '@/lib/planner-formato'
import type { PlannerCanale, PlannerStatoCanale, PlannerStatoPost } from '@/services/planner-service'

/* Mattoni visivi del Planner social: stile in src/style/lux-planner.css, sotto [data-vl-page="planner"]. */

const ICONE: Record<PlannerCanale, IconType> = {
  FACEBOOK: FaFacebook,
  INSTAGRAM: FaInstagram,
  YOUTUBE: FaYoutube,
  GOOGLE_BUSINESS: FaGoogle,
  TIKTOK: FaTiktok,
  LINKEDIN: FaLinkedin,
  X: FaXTwitter,
  THREADS: FaThreads,
  PINTEREST: FaPinterest,
}

/** Icona del canale nel suo colore di marca (data-c in CSS: X e Threads diventano bianchi nei temi scuri). */
export function IconaCanale({ canale, className = 'size-3.5', neutra = false }: { canale: PlannerCanale; className?: string; neutra?: boolean }) {
  const Icona = ICONE[canale]
  return (
    <Icona
      className={`pl-ico ${className}`}
      data-c={canale}
      data-neutra={neutra ? '' : undefined}
      aria-label={INFO_CANALE[canale].nome}
      role="img"
    />
  )
}

/** Avatar di una destinazione: la foto del profilo se c'è, con il badge del canale. */
export function AvatarCanale({
  canale,
  immagine,
  nome,
  dimensione = 'md',
}: {
  canale: PlannerCanale
  immagine?: string | null
  nome?: string | null
  dimensione?: 'sm' | 'md' | 'lg'
}) {
  return (
    <span className="pl-avatar" data-dim={dimensione} style={{ '--pl-c': INFO_CANALE[canale].colore } as CSSProperties} aria-hidden>
      {immagine ? (
        <>
          <img src={immagine} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <span className="pl-avatar-badge">
            <IconaCanale canale={canale} className="size-2.5" />
          </span>
        </>
      ) : (
        // Senza foto il logo del canale dice già tutto; il nome resta accanto (title per chi passa sopra)
        <span className="pl-avatar-logo" title={nome ?? undefined}>
          <IconaCanale canale={canale} className="size-4" />
        </span>
      )}
    </span>
  )
}

const TONO_STATO: Record<PlannerStatoPost, string> = {
  IDEA: 'violet',
  BOZZA: 'muted',
  IN_APPROVAZIONE: 'warn',
  PROGRAMMATO: 'info',
  IN_PUBBLICAZIONE: 'info',
  DA_COMPLETARE: 'warn',
  PUBBLICATO: 'ok',
  PARZIALE: 'danger',
  ERRORE: 'danger',
}

export function ChipStato({ stato, compatto = false }: { stato: PlannerStatoPost; compatto?: boolean }) {
  return (
    <span className="pl-chip" data-tono={TONO_STATO[stato]} data-compatto={compatto ? '' : undefined} data-pulsa={stato === 'IN_PUBBLICAZIONE' ? '' : undefined}>
      <span className="pl-chip-dot" aria-hidden />
      {ETICHETTA_STATO[stato]}
    </span>
  )
}

const TONO_STATO_CANALE: Record<PlannerStatoCanale, string> = {
  IN_ATTESA: 'muted',
  IN_PUBBLICAZIONE: 'info',
  DA_PUBBLICARE: 'warn',
  PUBBLICATO: 'ok',
  ERRORE: 'danger',
}

export function ChipStatoCanale({ stato }: { stato: PlannerStatoCanale }) {
  return (
    <span className="pl-chip" data-tono={TONO_STATO_CANALE[stato]} data-pulsa={stato === 'IN_PUBBLICAZIONE' ? '' : undefined}>
      <span className="pl-chip-dot" aria-hidden />
      {ETICHETTA_STATO_CANALE[stato]}
    </span>
  )
}

/**
 * Finestra del Planner (composer, dettaglio, impostazioni): Radix Dialog con fuoco intrappolato ed Esc, montata in
 * portale con data-vl, così ha i token della pagina. variante "piena" = quasi tutto lo schermo, "laterale" = pannello.
 */
export function FinestraPlanner({
  aperta,
  onChiudi,
  titolo,
  descrizione,
  variante = 'laterale',
  children,
  chiudiConEsc = true,
}: {
  aperta: boolean
  onChiudi: () => void
  titolo: string
  descrizione?: string
  variante?: 'piena' | 'laterale' | 'centrata' | 'palette'
  children: ReactNode
  chiudiConEsc?: boolean
}) {
  return (
    <DialogPrimitive.Root open={aperta} onOpenChange={(o) => (!o ? onChiudi() : undefined)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="pl-overlay" data-vl="" data-vl-page="planner" />
        <DialogPrimitive.Content
          className="pl-finestra"
          data-variante={variante}
          data-vl=""
          data-vl-page="planner"
          onEscapeKeyDown={(e) => {
            if (!chiudiConEsc) e.preventDefault()
          }}
        >
          <DialogPrimitive.Title className="sr-only">{titolo}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{descrizione ?? titolo}</DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function ChiudiFinestra({ onClick, etichetta = 'Chiudi' }: { onClick: () => void; etichetta?: string }) {
  return (
    <button type="button" className="pl-icon-btn" onClick={onClick} aria-label={etichetta} title={`${etichetta} (Esc)`}>
      <X className="size-4" />
    </button>
  )
}

export function Vuoto({ icona, titolo, testo, azione }: { icona: ReactNode; titolo: string; testo?: ReactNode; azione?: ReactNode }) {
  return (
    <div className="pl-vuoto">
      <div className="pl-vuoto-icona" aria-hidden>
        {icona}
      </div>
      <div className="pl-vuoto-titolo">{titolo}</div>
      {testo ? <div className="pl-vuoto-testo">{testo}</div> : null}
      {azione ? <div className="pl-vuoto-azione">{azione}</div> : null}
    </div>
  )
}
