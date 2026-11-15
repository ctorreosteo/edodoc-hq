import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Film, Image as ImageIcon, Loader2, PenSquare, Search, Tag, Trash2, Upload } from 'lucide-react'
import { toast } from '@/lib/toast'
import { messaggioErrorePlanner, plannerService, urlMedia, type PlannerMedia } from '@/services/planner-service'
import { ChiudiFinestra, FinestraPlanner, Vuoto } from './planner-ui'
import { dimensioneFile, durata } from '@/lib/planner-formato'

type Filtro = 'TUTTI' | 'IMMAGINE' | 'VIDEO'

/**
 * Libreria media del Planner. Come scheda: caricare, cercare, etichettare, eliminare, partire da un media per un
 * post. Come selettore (modalitaScelta) dentro il composer: scegliere uno o più media da aggiungere.
 */
export function PlannerLibreria(props: {
  modalitaScelta?: boolean
  aperta?: boolean
  onChiudi?: () => void
  giaScelti?: number[]
  onScegli?: (m: PlannerMedia[]) => void
  onNuovoPost?: (m: PlannerMedia[]) => void
}) {
  const { modalitaScelta = false, aperta = false, onChiudi, giaScelti = [], onScegli, onNuovoPost } = props
  const [media, setMedia] = useState<PlannerMedia[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('TUTTI')
  const [cerca, setCerca] = useState('')
  const [scelti, setScelti] = useState<number[]>([])
  const [caricamento, setCaricamento] = useState<{ n: number; frazione: number } | null>(null)
  const [trascina, setTrascina] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const attivo = !modalitaScelta || aperta

  const carica = useCallback(async () => {
    try {
      setErrore(null)
      setMedia(await plannerService.media(filtro, cerca.trim()))
    } catch (err) {
      setErrore(messaggioErrorePlanner(err, 'Libreria non disponibile'))
    }
  }, [filtro, cerca])

  useEffect(() => {
    if (!attivo) return
    const id = window.setTimeout(() => void carica(), cerca ? 250 : 0)
    return () => window.clearTimeout(id)
  }, [attivo, carica, cerca])

  useEffect(() => {
    if (aperta) setScelti([])
  }, [aperta])

  const caricaFile = async (files: FileList | File[]) => {
    const lista = [...files].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))
    let i = 0
    for (const f of lista) {
      i++
      setCaricamento({ n: i, frazione: 0 })
      try {
        const nuovo = await plannerService.caricaMedia(f, {}, (fr) => setCaricamento({ n: i, frazione: fr }))
        setMedia((m) => [nuovo, ...(m ?? [])])
        if (modalitaScelta) setScelti((s) => [...s, nuovo.id])
      } catch (err) {
        toast.error(`${f.name}: ${messaggioErrorePlanner(err, 'caricamento non riuscito')}`)
      }
    }
    setCaricamento(null)
  }

  const elimina = async (m: PlannerMedia) => {
    if (!window.confirm(`Eliminare ${m.nomeFile ?? 'questo media'} dalla libreria?`)) return
    try {
      await plannerService.eliminaMedia(m.id)
      setMedia((l) => (l ?? []).filter((x) => x.id !== m.id))
      toast.success('Media eliminato')
    } catch (err) {
      toast.error(messaggioErrorePlanner(err, 'Media non eliminato'))
    }
  }

  const etichetta = async (m: PlannerMedia) => {
    const tag = window.prompt('Etichette del media (es. ricette, studio, mindset):', m.tag ?? '')
    if (tag == null) return
    try {
      const nuovo = await plannerService.tagMedia(m.id, tag)
      setMedia((l) => (l ?? []).map((x) => (x.id === m.id ? nuovo : x)))
    } catch (err) {
      toast.error(messaggioErrorePlanner(err, 'Etichette non salvate'))
    }
  }

  const alterna = (id: number) => setScelti((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const corpo = (
    <div
      className="pl-libreria"
      data-trascina={trascina ? '' : undefined}
      onDragOver={(e) => {
        e.preventDefault()
        setTrascina(true)
      }}
      onDragLeave={() => setTrascina(false)}
      onDrop={(e) => {
        e.preventDefault()
        setTrascina(false)
        if (e.dataTransfer.files.length) void caricaFile(e.dataTransfer.files)
      }}
    >
      <div className="pl-barra">
        <div className="pl-cerca">
          <Search className="size-4" />
          <input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca per nome o etichetta" aria-label="Cerca nella libreria" />
        </div>
        <div className="pl-seg" role="radiogroup" aria-label="Tipo">
          {(
            [
              ['TUTTI', 'Tutti'],
              ['IMMAGINE', 'Immagini'],
              ['VIDEO', 'Video'],
            ] as [Filtro, string][]
          ).map(([v, e]) => (
            <button key={v} type="button" role="radio" aria-checked={filtro === v} data-on={filtro === v ? '' : undefined} onClick={() => setFiltro(v)}>
              {e}
            </button>
          ))}
        </div>
        <button type="button" className="pl-btn" data-variante="primario" onClick={() => input.current?.click()} disabled={!!caricamento}>
          {caricamento ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {caricamento ? `Carico ${caricamento.n}… ${Math.round(caricamento.frazione * 100)}%` : 'Carica'}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept="image/jpeg,image/png,video/mp4,video/quicktime"
          onChange={(e) => {
            if (e.target.files) void caricaFile(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {errore ? (
        <div className="pl-banner" data-tono="danger">
          {errore}
        </div>
      ) : media == null ? (
        <div className="pl-griglia-media">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="pl-media-card pl-scheletro" />
          ))}
        </div>
      ) : media.length === 0 ? (
        <Vuoto
          icona={<ImageIcon className="size-6" />}
          titolo={cerca ? 'Nessun media trovato' : 'La libreria è vuota'}
          testo="Trascina qui foto e video (JPG, PNG, MP4, MOV fino a 100 MB): li ritrovi per tutti i post."
        />
      ) : (
        <div className="pl-griglia-media">
          {media.map((m) => {
            const scelto = scelti.includes(m.id)
            const gia = giaScelti.includes(m.id)
            return (
              <div key={m.id} className="pl-media-card" data-scelto={scelto ? '' : undefined} data-gia={gia ? '' : undefined}>
                <button
                  type="button"
                  className="pl-media-card-img"
                  onClick={() => (modalitaScelta ? !gia && alterna(m.id) : window.open(urlMedia(m.url), '_blank'))}
                  aria-label={modalitaScelta ? (scelto ? 'Togli dalla scelta' : 'Scegli') : 'Apri'}
                >
                  {m.tipo === 'VIDEO' && !m.anteprimaUrl ? (
                    <video src={urlMedia(m.url)} muted preload="metadata" />
                  ) : (
                    <img src={urlMedia(m.anteprimaUrl ?? m.url)} alt="" loading="lazy" />
                  )}
                  {m.tipo === 'VIDEO' ? (
                    <span className="pl-media-tile-durata">
                      <Film className="size-3" /> {durata(m.durataSecondi)}
                    </span>
                  ) : null}
                  {modalitaScelta ? <span className="pl-media-card-check">{gia ? 'Già nel post' : <Check className="size-3.5" />}</span> : null}
                </button>
                <div className="pl-media-card-info">
                  <span className="pl-media-card-nome" title={m.nomeFile ?? ''}>
                    {m.nomeFile ?? (m.tipo === 'VIDEO' ? 'Video' : 'Immagine')}
                  </span>
                  <span className="pl-media-card-meta">
                    {m.larghezza && m.altezza ? `${m.larghezza}×${m.altezza} · ` : ''}
                    {dimensioneFile(m.byteDimensione)}
                    {m.usi ? ` · in ${m.usi} post` : ''}
                  </span>
                  {m.tag ? <span className="pl-media-card-tag">{m.tag}</span> : null}
                </div>
                {!modalitaScelta ? (
                  <div className="pl-media-card-azioni">
                    {onNuovoPost ? (
                      <button type="button" onClick={() => onNuovoPost([m])} title="Nuovo post con questo media">
                        <PenSquare className="size-3.5" />
                      </button>
                    ) : null}
                    <button type="button" onClick={() => void etichetta(m)} title="Etichette">
                      <Tag className="size-3.5" />
                    </button>
                    <button type="button" onClick={() => void elimina(m)} title={m.usi ? 'Usato in un post: toglilo prima dal post' : 'Elimina'} data-pericolo="">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
      {trascina ? <div className="pl-rilascia">Rilascia per caricare</div> : null}
    </div>
  )

  if (!modalitaScelta) return corpo

  return (
    <FinestraPlanner aperta={aperta} onChiudi={() => onChiudi?.()} titolo="Libreria media" variante="centrata">
      <div className="pl-finestra-testa">
        <div>
          <div className="pl-finestra-titolo">Libreria media</div>
          <div className="pl-sezione-nota">Scegli uno o più media, nell'ordine in cui vuoi pubblicarli</div>
        </div>
        <ChiudiFinestra onClick={() => onChiudi?.()} />
      </div>
      <div className="pl-finestra-corpo">{corpo}</div>
      <div className="pl-finestra-piede">
        <span className="pl-sezione-nota">{scelti.length ? `${scelti.length} scelti` : 'Nessuno scelto'}</span>
        <button
          type="button"
          className="pl-btn"
          data-variante="primario"
          disabled={!scelti.length}
          onClick={() => onScegli?.(scelti.map((id) => (media ?? []).find((m) => m.id === id)).filter((m): m is PlannerMedia => !!m))}
        >
          Aggiungi al post
        </button>
      </div>
    </FinestraPlanner>
  )
}
