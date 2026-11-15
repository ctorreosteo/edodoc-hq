import { useEffect, useState, type CSSProperties } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from '@/lib/toast'
import { CANALI, INFO_CANALE } from '@/lib/planner-canali'
import { giornateNelPeriodo } from '@/lib/planner-giornate'
import { etichettaGiorno, inizioSettimana, oggiRoma, piuGiorni } from '@/lib/planner-tempo'
import { messaggioErrorePlanner, plannerService, type PlannerCanale, type PlannerPost, type PlannerStato } from '@/services/planner-service'
import { ChiudiFinestra, FinestraPlanner, IconaCanale } from './planner-ui'

/**
 * «Genera il piano»: l'AI guarda rubriche e obiettivi, giornate del periodo e post già in calendario, e crea le idee
 * che mancano come idee nel calendario (da sviluppare, non si pubblica niente da solo).
 */
export function PlannerGeneraAi({
  aperta,
  onChiudi,
  stato,
  onCreate,
}: {
  aperta: boolean
  onChiudi: () => void
  stato: PlannerStato
  onCreate: (idee: PlannerPost[]) => void
}) {
  const lunediProssimo = piuGiorni(inizioSettimana(oggiRoma()), 7)
  const [dal, setDal] = useState(lunediProssimo)
  const [al, setAl] = useState(piuGiorni(lunediProssimo, 27))
  const [quante, setQuante] = useState(12)
  const [indicazioni, setIndicazioni] = useState('')
  const [canali, setCanali] = useState<PlannerCanale[]>(['INSTAGRAM', 'FACEBOOK'])
  const [caricamento, setCaricamento] = useState(false)

  useEffect(() => {
    if (!aperta) return
    const disponibili = new Set(stato.destinazioni.map((d) => d.canale))
    setCanali((c) => c.filter((x) => disponibili.has(x)))
  }, [aperta, stato.destinazioni])

  const giornate = dal && al && al >= dal ? giornateNelPeriodo(dal, al).filter((g) => g.tipo !== 'festa' || g.nome.includes('mamma') || g.nome.includes('papà')) : []

  const genera = async () => {
    if (!canali.length) {
      toast.error('Scegli almeno un canale.')
      return
    }
    setCaricamento(true)
    try {
      const idee = await plannerService.ideeAi({
        brandId: stato.brandId,
        dal,
        al,
        quante,
        indicazioni,
        canali,
        giornate: giornate.map((g) => `${g.giorno} ${g.nome}`),
      })
      toast.success(`${idee.length} idee nel calendario`, { description: 'Le trovi come idee nei giorni proposti: aprile per scriverle.' })
      onCreate(idee)
    } catch (err) {
      toast.error(messaggioErrorePlanner(err, 'Idee non generate'))
    } finally {
      setCaricamento(false)
    }
  }

  return (
    <FinestraPlanner aperta={aperta} onChiudi={onChiudi} titolo="Genera il piano con l'AI" variante="centrata">
      <div className="pl-finestra-testa">
        <div>
          <div className="pl-finestra-titolo">
            <Sparkles className="inline size-5" /> Genera il piano con l'AI
          </div>
          <div className="pl-sezione-nota">Idee concrete per il periodo, bilanciate sulle rubriche e sulle giornate da ricordare.</div>
        </div>
        <ChiudiFinestra onClick={onChiudi} />
      </div>
      <div className="pl-finestra-corpo">
        <div className="pl-campi">
          <label className="pl-campo">
            <span>Dal</span>
            <input type="date" value={dal} onChange={(e) => setDal(e.target.value)} />
          </label>
          <label className="pl-campo">
            <span>Al</span>
            <input type="date" value={al} min={dal} max={piuGiorni(dal, 62)} onChange={(e) => setAl(e.target.value)} />
          </label>
          <label className="pl-campo">
            <span>Quante idee: {quante}</span>
            <input type="range" min={3} max={30} value={quante} onChange={(e) => setQuante(Number(e.target.value))} />
          </label>
          <div className="pl-campo pl-campo--largo">
            <span>Canali</span>
            <div className="pl-filtro-canali">
              {CANALI.filter((c) => stato.destinazioni.some((d) => d.canale === c)).map((c) => {
                const on = canali.includes(c)
                return (
                  <button
                    key={c}
                    type="button"
                    className="pl-filtro-canale"
                    data-on={on ? '' : undefined}
                    style={{ '--pl-c': INFO_CANALE[c].colore } as CSSProperties}
                    onClick={() => setCanali((l) => (on ? l.filter((x) => x !== c) : [...l, c]))}
                    title={INFO_CANALE[c].nome}
                  >
                    <IconaCanale canale={c} className="size-3.5" />
                  </button>
                )
              })}
            </div>
          </div>
          <label className="pl-campo pl-campo--largo">
            <span>Indicazioni (facoltative)</span>
            <textarea
              rows={3}
              value={indicazioni}
              onChange={(e) => setIndicazioni(e.target.value)}
              placeholder="Es. spingere le prime visite nutrizionali, più reel, un post a settimana sulle domande dei pazienti"
            />
          </label>
        </div>
        {giornate.length ? (
          <div className="pl-ai-giornate">
            <span className="pl-sezione-nota">Giornate del periodo che l'AI terrà presenti:</span>
            <div>
              {giornate.map((g) => (
                <span key={g.giorno + g.nome} className="pl-giornata" data-tipo={g.tipo}>
                  <span>
                    {etichettaGiorno(g.giorno)} · {g.nome}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="pl-finestra-piede">
        <span className="pl-sezione-nota">Rubriche considerate: {stato.etichette.map((e) => e.nome).join(', ') || 'nessuna'}</span>
        <button type="button" className="pl-btn" data-variante="ai" onClick={() => void genera()} disabled={caricamento}>
          {caricamento ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {caricamento ? 'Penso al piano…' : `Genera ${quante} idee`}
        </button>
      </div>
    </FinestraPlanner>
  )
}
