import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, ExternalLink, Globe, Loader2, MousePointerClick, Plus, Trash2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { slugUtm } from '@/lib/planner-utm'
import { messaggioErrorePlanner, plannerService, type PlannerBio, type PlannerBioPulsante, type PlannerStato } from '@/services/planner-service'
import { BioVista } from './planner-bio-vista'

const nuovoId = () => Math.random().toString(36).slice(2, 10)

/**
 * Link in bio dello spazio: la pagina pubblica /bio/<indirizzo> da mettere nel profilo Instagram, con pulsanti e gli
 * ultimi post pubblicati. Anteprima dal vivo, visite e clic degli ultimi 30 giorni.
 */
export function PlannerBioEditor({ stato }: { stato: PlannerStato }) {
  const puo = stato.puoImpostare
  const [bio, setBio] = useState<PlannerBio | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [sporco, setSporco] = useState(false)

  useEffect(() => {
    setBio(null)
    plannerService
      .bio(stato.brandId)
      .then((b) => {
        setBio(b)
        setSporco(false)
      })
      .catch((err) => setErrore(messaggioErrorePlanner(err, 'Link in bio non disponibile')))
  }, [stato.brandId])

  if (errore) return <div className="pl-banner" data-tono="danger">{errore}</div>
  if (!bio) return <div className="pl-scheletro" style={{ height: 260 }} />

  const cambia = (patch: Partial<PlannerBio>) => {
    setBio((b) => (b ? { ...b, ...patch } : b))
    setSporco(true)
  }
  const cambiaPulsante = (i: number, patch: Partial<PlannerBioPulsante>) =>
    cambia({ pulsanti: bio.pulsanti.map((p, k) => (k === i ? { ...p, ...patch } : p)) })
  const sposta = (i: number, d: -1 | 1) => {
    const l = [...bio.pulsanti]
    const j = i + d
    if (j < 0 || j >= l.length) return
    ;[l[i], l[j]] = [l[j], l[i]]
    cambia({ pulsanti: l })
  }

  const indirizzo = `${window.location.origin}/bio/${bio.slug}`

  const salva = async () => {
    setSalvando(true)
    try {
      const b = await plannerService.salvaBio(stato.brandId, {
        slug: bio.slug,
        titolo: bio.titolo,
        descrizione: bio.descrizione,
        immagineUrl: bio.immagineUrl,
        colore: bio.colore,
        pulsanti: bio.pulsanti,
        mostraPost: bio.mostraPost,
        attiva: bio.attiva,
      })
      setBio(b)
      setSporco(false)
      toast.success(b.attiva ? 'Link in bio pubblicato' : 'Link in bio salvato (spento)')
    } catch (err) {
      toast.error(messaggioErrorePlanner(err, 'Link in bio non salvato'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="pl-bio-editor">
      <div className="pl-bio-editor-campi">
        <div className="pl-bio-indirizzo">
          <Globe className="size-4" />
          <span>{window.location.origin}/bio/</span>
          <input
            value={bio.slug}
            onChange={(e) => cambia({ slug: slugUtm(e.target.value) || e.target.value.toLowerCase() })}
            disabled={!puo}
            aria-label="Indirizzo della pagina"
          />
          <button type="button" className="pl-icon-btn" onClick={() => void navigator.clipboard.writeText(indirizzo).then(() => toast.success('Indirizzo copiato'))} title="Copia l'indirizzo">
            <Copy className="size-4" />
          </button>
          {bio.attiva && bio.id ? (
            <a className="pl-icon-btn" href={indirizzo} target="_blank" rel="noreferrer" title="Apri la pagina">
              <ExternalLink className="size-4" />
            </a>
          ) : null}
        </div>
        <div className="pl-campi">
          <label className="pl-campo">
            <span>Titolo</span>
            <input value={bio.titolo} onChange={(e) => cambia({ titolo: e.target.value })} disabled={!puo} maxLength={120} />
          </label>
          <label className="pl-campo">
            <span>Colore</span>
            <input type="color" value={bio.colore} onChange={(e) => cambia({ colore: e.target.value })} disabled={!puo} />
          </label>
          <label className="pl-campo pl-campo--largo">
            <span>Descrizione</span>
            <textarea rows={2} value={bio.descrizione ?? ''} onChange={(e) => cambia({ descrizione: e.target.value || null })} disabled={!puo} maxLength={500} />
          </label>
          <label className="pl-campo pl-campo--largo">
            <span>Foto (indirizzo dell'immagine, es. quella del profilo)</span>
            <input value={bio.immagineUrl ?? ''} onChange={(e) => cambia({ immagineUrl: e.target.value || null })} disabled={!puo} placeholder="https://…" />
          </label>
        </div>
        <div className="pl-bio-lista">
          <div className="pl-sezione-titolo">Pulsanti</div>
          {bio.pulsanti.map((p, i) => (
            <div key={p.id} className="pl-bio-riga">
              <input value={p.etichetta} onChange={(e) => cambiaPulsante(i, { etichetta: e.target.value })} placeholder="Prenota una visita" disabled={!puo} aria-label="Etichetta" />
              <input value={p.url} onChange={(e) => cambiaPulsante(i, { url: e.target.value })} placeholder="https://… · tel:… · mailto:…" disabled={!puo} aria-label="Link" />
              {puo ? (
                <>
                  <button type="button" className="pl-icon-btn" onClick={() => sposta(i, -1)} aria-label="Su" disabled={i === 0}>
                    <ArrowUp className="size-4" />
                  </button>
                  <button type="button" className="pl-icon-btn" onClick={() => sposta(i, 1)} aria-label="Giù" disabled={i === bio.pulsanti.length - 1}>
                    <ArrowDown className="size-4" />
                  </button>
                  <button type="button" className="pl-icon-btn" data-pericolo="" onClick={() => cambia({ pulsanti: bio.pulsanti.filter((_, k) => k !== i) })} aria-label="Togli">
                    <Trash2 className="size-4" />
                  </button>
                </>
              ) : null}
            </div>
          ))}
          {puo && bio.pulsanti.length < 12 ? (
            <button type="button" className="pl-btn" data-variante="mini-ghost" onClick={() => cambia({ pulsanti: [...bio.pulsanti, { id: nuovoId(), etichetta: '', url: '' }] })}>
              <Plus className="size-3.5" /> Pulsante
            </button>
          ) : null}
        </div>
        <div className="pl-form-riga">
          <label className="pl-switch-mini">
            <input type="checkbox" checked={bio.mostraPost} onChange={(e) => cambia({ mostraPost: e.target.checked })} disabled={!puo} />
            <span>Mostra gli ultimi post (portano al loro link, tracciato)</span>
          </label>
          <label className="pl-switch-mini">
            <input type="checkbox" checked={bio.attiva} onChange={(e) => cambia({ attiva: e.target.checked })} disabled={!puo} />
            <span>Pagina pubblica attiva</span>
          </label>
          {puo ? (
            <button type="button" className="pl-btn" data-variante="primario" onClick={() => void salva()} disabled={salvando || !sporco}>
              {salvando ? <Loader2 className="size-4 animate-spin" /> : null} Salva
            </button>
          ) : null}
        </div>
        {bio.id ? (
          <div className="pl-bio-numeri">
            <div>
              <b>{bio.visite30.toLocaleString('it-IT')}</b>
              <span>visite in 30 giorni</span>
            </div>
            <div>
              <b>{bio.clic30.reduce((t, c) => t + c.clic, 0).toLocaleString('it-IT')}</b>
              <span>clic</span>
            </div>
            <ul>
              {bio.clic30.slice(0, 6).map((c) => (
                <li key={c.chiave}>
                  <MousePointerClick className="size-3.5" /> {c.etichetta} <b>{c.clic}</b>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="pl-bio-telefono" aria-label="Anteprima">
        <BioVista
          bio={{
            titolo: bio.titolo || 'Titolo',
            descrizione: bio.descrizione,
            immagineUrl: bio.immagineUrl,
            colore: bio.colore,
            pulsanti: bio.pulsanti.filter((p) => p.etichetta.trim()).map((p) => ({ id: p.id, etichetta: p.etichetta })),
            post: [],
          }}
          hrefDi={null}
        />
      </div>
    </div>
  )
}
