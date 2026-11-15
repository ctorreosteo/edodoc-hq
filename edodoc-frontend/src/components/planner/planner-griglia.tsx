import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Clock, Heart, Images, MessageCircle, Play } from 'lucide-react'
import { toast } from '@/lib/toast'
import { compatto } from '@/lib/planner-formato'
import { localeRoma, quandoBreve } from '@/lib/planner-tempo'
import { messaggioErrorePlanner, plannerService, urlMedia, type PlannerPost, type PlannerStato } from '@/services/planner-service'
import { socialService, type SocialContenuto } from '@/services/social-service'
import { AvatarCanale, ChipStato, Vuoto } from './planner-ui'

const IN_ARRIVO = new Set(['BOZZA', 'IN_APPROVAZIONE', 'PROGRAMMATO'])

/**
 * Griglia Instagram: il profilo come apparirà, con i post in arrivo (programmati, da approvare, bozze con un giorno)
 * sopra quelli già usciti, letti da Meta. Trascinando un post in arrivo su un altro si scambiano i loro orari.
 */
export function PlannerGriglia({ stato, generazione, onApri }: { stato: PlannerStato; generazione: number; onApri: (p: PlannerPost) => void }) {
  const profili = useMemo(() => stato.destinazioni.filter((d) => d.canale === 'INSTAGRAM' && d.account), [stato.destinazioni])
  const [scelto, setScelto] = useState<string | null>(null)
  const [arrivo, setArrivo] = useState<PlannerPost[] | null>(null)
  const [usciti, setUsciti] = useState<SocialContenuto[] | null>(null)
  const [erroreMeta, setErroreMeta] = useState<string | null>(null)
  const [sopra, setSopra] = useState<number | null>(null)
  const profilo = profili.find((p) => p.account === scelto) ?? profili[0] ?? null

  const carica = useCallback(async () => {
    if (!profilo) return
    try {
      const board = await plannerService.board(stato.brandId)
      setArrivo(
        board
          .filter((p) => IN_ARRIVO.has(p.stato) && p.programmatoAlle && p.media.length > 0)
          .filter((p) => p.canali.some((c) => c.canale === 'INSTAGRAM' && c.account === profilo.account && c.formato !== 'STORIA'))
          .sort((a, b) => (b.programmatoAlle ?? '').localeCompare(a.programmatoAlle ?? '')),
      )
    } catch (err) {
      toast.error(messaggioErrorePlanner(err, 'Post in arrivo non disponibili'))
      setArrivo([])
    }
    if (profilo.automatica) {
      try {
        setUsciti(await socialService.contenuti(profilo.account!, 'INSTAGRAM', 24))
        setErroreMeta(null)
      } catch (err) {
        setUsciti([])
        setErroreMeta(messaggioErrorePlanner(err, 'Post usciti non disponibili'))
      }
    } else {
      setUsciti([])
      setErroreMeta('Il profilo non è collegato a Meta: qui vedi solo i post in arrivo.')
    }
  }, [profilo, stato.brandId])

  useEffect(() => {
    void carica()
  }, [carica, generazione])

  const scambia = async (da: PlannerPost, a: PlannerPost) => {
    if (da.id === a.id || !da.programmatoAlle || !a.programmatoAlle) return
    const oraDa = localeRoma(da.programmatoAlle)
    const oraA = localeRoma(a.programmatoAlle)
    const prima = arrivo
    setArrivo((l) =>
      (l ?? [])
        .map((p) => (p.id === da.id ? { ...p, programmatoAlle: a.programmatoAlle } : p.id === a.id ? { ...p, programmatoAlle: da.programmatoAlle } : p))
        .sort((x, y) => (y.programmatoAlle ?? '').localeCompare(x.programmatoAlle ?? '')),
    )
    try {
      await plannerService.sposta(da.id, oraA)
      await plannerService.sposta(a.id, oraDa)
      toast.success('Orari scambiati', { description: `${da.titolo ?? 'Post'} ↔ ${a.titolo ?? 'post'}` })
    } catch (err) {
      setArrivo(prima)
      toast.error(messaggioErrorePlanner(err, 'Orari non scambiati'))
      void carica()
    }
  }

  if (!profilo) {
    return (
      <Vuoto
        icona={<Images className="size-6" />}
        titolo="Nessun profilo Instagram in questo spazio"
        testo="Collega un profilo Instagram professionale alla pagina Meta, oppure spostalo in questo spazio dalle impostazioni."
      />
    )
  }

  return (
    <div className="pl-griglia-ig">
      <div className="pl-barra">
        {profili.length > 1 ? (
          <div className="pl-seg" role="radiogroup" aria-label="Profilo">
            {profili.map((p) => (
              <button key={p.account} type="button" role="radio" aria-checked={p.account === profilo.account} data-on={p.account === profilo.account ? '' : undefined} onClick={() => setScelto(p.account)}>
                {p.nome}
              </button>
            ))}
          </div>
        ) : null}
        <span className="pl-sezione-nota">
          <ArrowLeftRight className="inline size-3.5" /> Trascina un post in arrivo su un altro per scambiarne gli orari. I post usciti arrivano da Instagram.
        </span>
      </div>

      <div className="pl-telefono-ig">
        <div className="pl-ig-profilo">
          <AvatarCanale canale="INSTAGRAM" immagine={profilo.immagine} nome={profilo.nome} dimensione="lg" />
          <div>
            <b>{profilo.nome}</b>
            <span>{profilo.dettaglio}</span>
          </div>
          <div className="pl-ig-numeri">
            <span>
              <b>{arrivo?.length ?? '·'}</b> in arrivo
            </span>
            <span>
              <b>{usciti?.length ?? '·'}</b> recenti
            </span>
          </div>
        </div>

        <div className="pl-ig-griglia">
          {arrivo == null ? Array.from({ length: 6 }, (_, i) => <div key={i} className="pl-ig-tile pl-scheletro" />) : null}
          {arrivo?.map((p) => {
            const m = p.media[0]
            return (
              <button
                key={p.id}
                type="button"
                className="pl-ig-tile"
                data-arrivo=""
                data-sopra={sopra === p.id ? '' : undefined}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/planner-griglia', String(p.id))}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes('text/planner-griglia')) return
                  e.preventDefault()
                  setSopra(p.id)
                }}
                onDragLeave={() => setSopra((s) => (s === p.id ? null : s))}
                onDrop={(e) => {
                  e.preventDefault()
                  setSopra(null)
                  const da = arrivo.find((x) => x.id === Number(e.dataTransfer.getData('text/planner-griglia')))
                  if (da) void scambia(da, p)
                }}
                onClick={() => onApri(p)}
                title={p.titolo ?? p.testo ?? ''}
              >
                <img src={urlMedia(m.anteprimaUrl ?? m.url)} alt="" loading="lazy" />
                {m.tipo === 'VIDEO' ? <Play className="pl-ig-tipo size-4" /> : p.media.length > 1 ? <Images className="pl-ig-tipo size-4" /> : null}
                <span className="pl-ig-quando">
                  <Clock className="size-3" /> {quandoBreve(p.programmatoAlle)}
                </span>
                {p.stato !== 'PROGRAMMATO' ? (
                  <span className="pl-ig-stato">
                    <ChipStato stato={p.stato} compatto />
                  </span>
                ) : null}
              </button>
            )
          })}
          {usciti?.map((c) => (
            <a key={c.id} className="pl-ig-tile" href={c.link ?? undefined} target="_blank" rel="noreferrer" title={c.testo ?? ''}>
              {c.immagine ? <img src={c.immagine} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="pl-ig-senza">{c.tipo}</span>}
              {c.tipo === 'REEL' || c.tipo === 'VIDEO' ? <Play className="pl-ig-tipo size-4" /> : c.tipo === 'CAROSELLO' ? <Images className="pl-ig-tipo size-4" /> : null}
              <span className="pl-ig-numeri-tile">
                <span>
                  <Heart className="size-3.5" /> {compatto(c.miPiace)}
                </span>
                <span>
                  <MessageCircle className="size-3.5" /> {compatto(c.commenti)}
                </span>
              </span>
            </a>
          ))}
        </div>
        {erroreMeta ? <div className="pl-sezione-nota pl-ig-nota">{erroreMeta}</div> : null}
        {arrivo?.length === 0 && usciti?.length === 0 ? (
          <div className="pl-sezione-nota pl-ig-nota">Niente in arrivo su questo profilo: programma un post con un'immagine.</div>
        ) : null}
      </div>
    </div>
  )
}
