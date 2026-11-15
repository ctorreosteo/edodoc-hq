import { useState } from 'react'
import { ArrowRight, Check, Loader2, Lock, Pencil, Plus, Tags, Trash2, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { mailingService, messaggioErroreMailing, type MailingTag } from '@/services/mailing-service'
import { ConfermaMailing } from './mailing-dialog'
import { TagPill, Vuoto } from './mailing-ui'
import { coloreTag, formatNumero } from './mailing-utils'

/* Gestione dei tag: rinomina, colore, elimina (non quelli di sistema, che arrivano dal gestionale). */

const PALETTE = ['#6250d6', '#15966a', '#e05a26', '#2a78d6', '#d55181', '#0f766e', '#a16207', '#64748b', '#b42323', '#7c3aed']

function aHex(colore: string): string {
  return /^#[0-9a-f]{6}$/i.test(colore) ? colore : '#6250d6'
}

export function MailingTagGestione({
  tag,
  onTagCambiati,
  onVediContatti,
}: {
  tag: MailingTag[]
  onTagCambiati: (t: MailingTag[]) => void
  onVediContatti: (id: number) => void
}) {
  const [modifica, setModifica] = useState<{ id: number | null; nome: string; colore: string } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [elimina, setElimina] = useState<MailingTag | null>(null)
  const sistema = tag.filter((t) => t.sistema)
  const manuali = tag.filter((t) => !t.sistema)

  const salva = async () => {
    if (!modifica || !modifica.nome.trim()) return
    setSalvando(true)
    try {
      if (modifica.id) {
        const t = await mailingService.aggiornaTag(modifica.id, modifica.nome.trim(), modifica.colore)
        onTagCambiati(tag.map((x) => (x.id === t.id ? { ...t, contatti: t.contatti ?? x.contatti } : x)))
      } else {
        const t = await mailingService.creaTag(modifica.nome.trim(), modifica.colore)
        onTagCambiati([...tag, t])
      }
      setModifica(null)
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Tag non salvato'))
    } finally {
      setSalvando(false)
    }
  }

  const eliminaTag = async () => {
    if (!elimina) return
    try {
      await mailingService.eliminaTag(elimina.id)
      onTagCambiati(tag.filter((t) => t.id !== elimina.id))
      toast.success('Tag eliminato')
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Tag non eliminato'))
      return false
    }
  }

  const riga = (t: MailingTag) => {
    const inModifica = modifica?.id === t.id
    return (
      <li key={t.id} className="ml-tag-riga" data-modifica={inModifica ? '' : undefined}>
        {inModifica && modifica ? (
          <FormTag valore={modifica} onChange={setModifica} onSalva={() => void salva()} onAnnulla={() => setModifica(null)} salvando={salvando} />
        ) : (
          <>
            <TagPill tag={t} />
            <span className="ml-tag-riga-conta">{t.contatti != null ? `${formatNumero(t.contatti)} contatti` : ''}</span>
            <span className="ml-tag-riga-azioni">
              {t.contatti ? (
                <button type="button" className="ml-btn ml-btn--sm ml-btn--ghost" onClick={() => onVediContatti(t.id)}>
                  Vedi <ArrowRight className="size-3.5" aria-hidden />
                </button>
              ) : null}
              {t.sistema ? (
                <span className="ml-tag-sistema" title="Tag di sistema: lo gestisce il gestionale e non si può modificare">
                  <Lock className="size-3.5" aria-hidden /> automatico
                </span>
              ) : (
                <>
                  <button type="button" className="ml-btn ml-btn--sm ml-btn--ghost ml-btn--icona" onClick={() => setModifica({ id: t.id, nome: t.nome, colore: aHex(coloreTag(t)) })} aria-label={`Modifica ${t.nome}`}>
                    <Pencil className="size-3.5" aria-hidden />
                  </button>
                  <button type="button" className="ml-btn ml-btn--sm ml-btn--ghost ml-btn--icona" onClick={() => setElimina(t)} aria-label={`Elimina ${t.nome}`}>
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </>
              )}
            </span>
          </>
        )}
      </li>
    )
  }

  return (
    <div className="ml-tag-gestione">
      <section className="ml-card">
        <div className="ml-card-testa">
          <div>
            <div className="ml-card-titolo">
              <Tags className="size-4" aria-hidden /> I tuoi tag
            </div>
            <div className="ml-card-sottotitolo">Etichette libere per raggruppare i contatti a mano (eventi, interessi, provenienza).</div>
          </div>
          {modifica?.id == null && modifica ? null : (
            <button type="button" className="ml-btn ml-btn--sm ml-btn--pieno" onClick={() => setModifica({ id: null, nome: '', colore: PALETTE[manuali.length % PALETTE.length] })}>
              <Plus className="size-3.5" aria-hidden /> Nuovo tag
            </button>
          )}
        </div>
        {modifica && modifica.id == null ? (
          <div className="ml-tag-riga" data-modifica="">
            <FormTag valore={modifica} onChange={setModifica} onSalva={() => void salva()} onAnnulla={() => setModifica(null)} salvando={salvando} />
          </div>
        ) : null}
        {manuali.length === 0 && !modifica ? (
          <Vuoto icona={<Tags />} titolo="Nessun tag manuale" testo="Crea un tag e aggiungilo ai contatti dalla loro scheda, o a tutti quelli di un import CSV." />
        ) : (
          <ul className="ml-tag-righe">{manuali.map(riga)}</ul>
        )}
      </section>

      {sistema.length ? (
        <section className="ml-card">
          <div className="ml-card-testa">
            <div>
              <div className="ml-card-titolo">
                <Lock className="size-4" aria-hidden /> Tag automatici
              </div>
              <div className="ml-card-sottotitolo">Li assegna il gestionale (paziente, lead, fonte, percorsi acquistati): sempre aggiornati, non si modificano.</div>
            </div>
          </div>
          <ul className="ml-tag-righe">{sistema.map(riga)}</ul>
        </section>
      ) : null}

      <ConfermaMailing
        open={!!elimina}
        onOpenChange={(v) => !v && setElimina(null)}
        icona={<Trash2 className="size-5" aria-hidden />}
        titolo={`Eliminare il tag «${elimina?.nome ?? ''}»?`}
        testo={
          elimina?.contatti
            ? `Verrà tolto da ${formatNumero(elimina.contatti)} contatti. I segmenti e le automazioni che lo usano andranno ricontrollati.`
            : 'Il tag non è assegnato a nessuno.'
        }
        conferma="Elimina"
        pericolo
        onConferma={eliminaTag}
      />
    </div>
  )
}

function FormTag({
  valore,
  onChange,
  onSalva,
  onAnnulla,
  salvando,
}: {
  valore: { id: number | null; nome: string; colore: string }
  onChange: (v: { id: number | null; nome: string; colore: string }) => void
  onSalva: () => void
  onAnnulla: () => void
  salvando: boolean
}) {
  return (
    <form
      className="ml-tag-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSalva()
      }}
    >
      <label className="ml-tag-colore" title="Colore" style={{ background: valore.colore }}>
        <span className="sr-only">Colore</span>
        <input type="color" value={valore.colore} onChange={(e) => onChange({ ...valore, colore: e.target.value })} />
      </label>
      <div className="ml-tag-palette" aria-hidden>
        {PALETTE.slice(0, 6).map((c) => (
          <button key={c} type="button" tabIndex={-1} style={{ background: c }} data-scelto={valore.colore === c ? '' : undefined} onClick={() => onChange({ ...valore, colore: c })} />
        ))}
      </div>
      <label className="sr-only" htmlFor="ml-tag-nome">Nome del tag</label>
      <input
        id="ml-tag-nome"
        className="ml-input flex-1"
        value={valore.nome}
        onChange={(e) => onChange({ ...valore, nome: e.target.value })}
        placeholder="Nome del tag"
        autoFocus
        maxLength={60}
        onKeyDown={(e) => e.key === 'Escape' && onAnnulla()}
      />
      <button type="submit" className="ml-btn ml-btn--sm ml-btn--pieno ml-btn--icona" disabled={!valore.nome.trim() || salvando} aria-label="Salva">
        {salvando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
      </button>
      <button type="button" className="ml-btn ml-btn--sm ml-btn--ghost ml-btn--icona" onClick={onAnnulla} aria-label="Annulla">
        <X className="size-3.5" aria-hidden />
      </button>
    </form>
  )
}
