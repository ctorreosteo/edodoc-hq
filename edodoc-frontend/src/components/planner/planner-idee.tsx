import { useCallback, useEffect, useMemo, useState, type CSSProperties, type DragEvent } from 'react'
import { Lightbulb, MessageSquare, Plus, Sparkles } from 'lucide-react'
import { toast } from '@/lib/toast'
import { CANALI } from '@/lib/planner-canali'
import { quandoBreve } from '@/lib/planner-tempo'
import { messaggioErrorePlanner, plannerService, urlMedia, type PlannerPost, type PlannerStato, type PlannerStatoPost } from '@/services/planner-service'
import { IconaCanale } from './planner-ui'

type Colonna = { id: string; titolo: string; stati: PlannerStatoPost[]; nota: string; tono: string; trascinabile?: PlannerStatoPost }

const COLONNE: Colonna[] = [
  { id: 'idee', titolo: 'Idee', stati: ['IDEA'], nota: 'Spunti da sviluppare', tono: 'violet', trascinabile: 'IDEA' },
  { id: 'bozze', titolo: 'Bozze', stati: ['BOZZA'], nota: 'In scrittura', tono: 'muted', trascinabile: 'BOZZA' },
  { id: 'approvazione', titolo: 'Da approvare', stati: ['IN_APPROVAZIONE'], nota: 'Aspettano un responsabile', tono: 'warn' },
  { id: 'programmati', titolo: 'Programmati', stati: ['PROGRAMMATO', 'IN_PUBBLICAZIONE'], nota: 'Escono da soli', tono: 'info' },
  { id: 'sistemare', titolo: 'Da sistemare', stati: ['DA_COMPLETARE', 'PARZIALE', 'ERRORE'], nota: 'A mano o in errore', tono: 'danger' },
  { id: 'pubblicati', titolo: 'Pubblicati', stati: ['PUBBLICATO'], nota: 'Ultime due settimane', tono: 'ok' },
]

export function PlannerIdee({
  stato,
  generazione,
  onApri,
  onNuovo,
  onGeneraAi,
  onCambiato,
}: {
  stato: PlannerStato
  generazione: number
  onApri: (p: PlannerPost) => void
  onNuovo: () => void
  onGeneraAi: () => void
  onCambiato: () => void
}) {
  const [post, setPost] = useState<PlannerPost[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [nuovaIdea, setNuovaIdea] = useState('')
  const [sopra, setSopra] = useState<string | null>(null)

  const carica = useCallback(async () => {
    try {
      setErrore(null)
      setPost(await plannerService.board(stato.brandId))
    } catch (err) {
      setErrore(messaggioErrorePlanner(err, 'Idee non disponibili'))
    }
  }, [stato.brandId])

  useEffect(() => {
    void carica()
  }, [carica, generazione])

  const colori = useMemo(() => new Map(stato.etichette.map((e) => [e.id, e.colore])), [stato.etichette])

  const aggiungiIdea = async () => {
    const t = nuovaIdea.trim()
    if (!t) return
    try {
      const p = await plannerService.salva(null, {
        brandId: stato.brandId,
        titolo: t,
        testo: null,
        primoCommento: null,
        link: null,
        etichettaId: null,
        note: null,
        responsabileId: null,
        programmatoAlle: null,
        azione: 'IDEA',
        canali: [],
        mediaIds: [],
      })
      setPost((l) => [p, ...(l ?? [])])
      setNuovaIdea('')
      onCambiato()
    } catch (err) {
      toast.error(messaggioErrorePlanner(err, 'Idea non salvata'))
    }
  }

  const suDrop = async (e: DragEvent, col: Colonna) => {
    e.preventDefault()
    setSopra(null)
    const id = Number(e.dataTransfer.getData('text/planner-idea'))
    const p = post?.find((x) => x.id === id)
    if (!p || !col.trascinabile || p.stato === col.trascinabile) return
    if (p.stato !== 'IDEA' && p.stato !== 'BOZZA') {
      toast.message('Questo post si cambia dal post stesso', { description: 'Fra le colonne si spostano idee e bozze.' })
      return
    }
    const minimo = Math.min(0, ...(post ?? []).filter((x) => x.stato === col.trascinabile).map((x) => x.posizione))
    const prima = post
    setPost((l) => (l ?? []).map((x) => (x.id === id ? { ...x, stato: col.trascinabile!, posizione: minimo - 1 } : x)))
    try {
      await plannerService.ordina([{ id, stato: col.trascinabile, posizione: minimo - 1 }])
      onCambiato()
    } catch (err) {
      setPost(prima)
      toast.error(messaggioErrorePlanner(err, 'Non spostato'))
    }
  }

  return (
    <div className="pl-idee">
      <div className="pl-barra">
        <div className="pl-sezione-nota">Trascina fra Idee e Bozze; apri una scheda per scriverla, programmarla o approvarla.</div>
        {stato.aiDisponibile ? (
          <button type="button" className="pl-btn" data-variante="ai" onClick={onGeneraAi}>
            <Sparkles className="size-4" /> Genera idee con l'AI
          </button>
        ) : null}
        <button type="button" className="pl-btn" data-variante="primario" onClick={onNuovo}>
          <Plus className="size-4" /> Nuovo post
        </button>
      </div>
      {errore ? (
        <div className="pl-banner" data-tono="danger">
          {errore}
        </div>
      ) : null}
      <div className="pl-colonne">
        {COLONNE.map((col) => {
          const voci = (post ?? []).filter((p) => col.stati.includes(p.stato))
          return (
            <section
              key={col.id}
              className="pl-colonna"
              data-tono={col.tono}
              data-sopra={sopra === col.id ? '' : undefined}
              onDragOver={(e) => {
                if (!col.trascinabile || !e.dataTransfer.types.includes('text/planner-idea')) return
                e.preventDefault()
                setSopra(col.id)
              }}
              onDragLeave={() => setSopra((s) => (s === col.id ? null : s))}
              onDrop={(e) => void suDrop(e, col)}
            >
              <header className="pl-colonna-testa">
                <span className="pl-colonna-dot" />
                <b>{col.titolo}</b>
                <span className="pl-colonna-n">{post ? voci.length : '·'}</span>
                <span className="pl-colonna-nota">{col.nota}</span>
              </header>
              {col.id === 'idee' ? (
                <form
                  className="pl-idea-veloce"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void aggiungiIdea()
                  }}
                >
                  <Lightbulb className="size-4" />
                  <input value={nuovaIdea} onChange={(e) => setNuovaIdea(e.target.value)} placeholder="Annota un'idea e premi Invio" aria-label="Nuova idea" maxLength={200} />
                </form>
              ) : null}
              <div className="pl-colonna-voci">
                {post == null
                  ? Array.from({ length: 2 }, (_, i) => <div key={i} className="pl-scheda pl-scheletro" style={{ height: 84 }} />)
                  : voci.map((p) => {
                      const m = p.media[0]
                      const canali = [...new Set(p.canali.map((c) => c.canale))].sort((a, b) => CANALI.indexOf(a) - CANALI.indexOf(b))
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className="pl-scheda"
                          draggable={p.stato === 'IDEA' || p.stato === 'BOZZA'}
                          onDragStart={(e) => e.dataTransfer.setData('text/planner-idea', String(p.id))}
                          onClick={() => onApri(p)}
                          style={{ '--pl-r': p.etichettaId ? colori.get(p.etichettaId) : 'transparent' } as CSSProperties}
                        >
                          {m ? <img className="pl-scheda-img" src={urlMedia(m.anteprimaUrl ?? m.url)} alt="" loading="lazy" /> : null}
                          <b className="pl-scheda-titolo">{p.titolo || p.testo || 'Senza titolo'}</b>
                          {p.note && p.stato === 'IDEA' ? <span className="pl-scheda-nota">{p.note.replace(/^Idea AI: /, '')}</span> : null}
                          <span className="pl-scheda-piede">
                            <span className="pl-cal-post-icone">
                              {canali.map((c) => (
                                <IconaCanale key={c} canale={c} className="size-3" />
                              ))}
                            </span>
                            {p.programmatoAlle ? <span>{quandoBreve(p.pubblicatoIl ?? p.programmatoAlle)}</span> : null}
                            {p.commenti ? (
                              <span>
                                <MessageSquare className="inline size-3" /> {p.commenti}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      )
                    })}
                {post && voci.length === 0 ? <div className="pl-colonna-vuota">Niente qui</div> : null}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
