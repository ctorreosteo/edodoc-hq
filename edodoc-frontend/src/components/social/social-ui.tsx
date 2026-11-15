import { Facebook, Instagram } from 'lucide-react'
import type { SocialPiattaforma } from '@/services/social-service'
import { iniziali, tintaPer } from './social-utils'

/* Mattoni visivi condivisi dalla pagina Social. */

/** Icona della piattaforma nel suo colore (token --so-fb / --so-ig di lux-social.css). */
export function IconaPiattaforma({ piattaforma, className = 'size-3.5' }: { piattaforma: SocialPiattaforma; className?: string }) {
  return piattaforma === 'FACEBOOK' ? (
    <Facebook className={`so-ico-fb ${className}`} aria-label="Facebook" />
  ) : (
    <Instagram className={`so-ico-ig ${className}`} aria-label="Instagram" />
  )
}

/** Freccia e percentuale colorate (verde su, rosso giù). Il segno è anche nel testo: mai solo colore. */
export function Delta({ valore, className = '' }: { valore: number | null; className?: string }) {
  if (valore == null) return null
  const su = valore > 0.0005
  const giu = valore < -0.0005
  const tono = su ? 'su' : giu ? 'giu' : 'piatto'
  const testo = `${su ? '▲' : giu ? '▼' : '■'} ${Math.abs(valore * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`
  return (
    <span className={`so-delta ${className}`} data-tono={tono} title="Rispetto al periodo precedente">
      {testo}
    </span>
  )
}

/** Avatar del contatto social: foto Meta se c'è (spesso assente per privacy), altrimenti iniziali. */
export function AvatarSocial({
  nome,
  src,
  piattaforma,
  dimensione = 'md',
}: {
  nome: string | null | undefined
  src?: string | null
  piattaforma?: SocialPiattaforma
  dimensione?: 'sm' | 'md' | 'lg'
}) {
  return (
    <span className="so-avatar" data-dim={dimensione} style={{ ['--so-hue' as string]: tintaPer(nome) }} aria-hidden>
      {src ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = 'none')} /> : null}
      <span className="so-avatar-iniziali">{iniziali(nome)}</span>
      {piattaforma ? (
        <span className="so-avatar-badge" data-p={piattaforma}>
          <IconaPiattaforma piattaforma={piattaforma} className="size-2.5" />
        </span>
      ) : null}
    </span>
  )
}
