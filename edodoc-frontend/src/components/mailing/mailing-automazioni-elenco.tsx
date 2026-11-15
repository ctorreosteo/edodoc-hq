import { useMemo, useState, type ReactNode } from 'react'
import { CornerDownRight, LogOut, Plus, Zap } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { MailingGrafo, MailingTipoNodo, MailingTipoTrigger } from '@/services/mailing-service'
import { ID_TRIGGER, arcoDa, nodoIniziale, raggiungibili, type PuntoInserimento, type RiassuntoNodo } from '@/lib/mailing-grafo'
import { ICONA_TRIGGER, META_NODO } from './mailing-automazioni-meta'
import { MenuInserimento, type ReportCard } from './mailing-automazioni-nodi'
import type { ProblemiNodo } from './mailing-automazioni-tela'
import { formatCompatto, formatPercentuale } from './mailing-utils'

/*
  Vista per il telefono: i passi in colonna, nell'ordine in cui li vive il contatto. Le condizioni aprono due
  gruppi (Se sì / Se no); un passo in cui confluiscono più rami compare una volta sola, poi "continua al passo N".
*/

type Props = {
  grafo: MailingGrafo
  numeri: Map<string, number>
  riassunti: Map<string, RiassuntoNodo>
  problemi: Map<string, ProblemiNodo>
  trigger: { tipo: MailingTipoTrigger | null; descrizione: string; uscita: string; errori: number }
  selezionato: string | null
  report: Map<string, ReportCard> | null
  entratiTotali: number | null
  onSeleziona: (id: string) => void
  onInserisci: (punto: PuntoInserimento, tipo: MailingTipoNodo) => void
}

function Aggiungi({ punto, consentiFine, onInserisci, etichetta }: { punto: PuntoInserimento; consentiFine: boolean; onInserisci: Props['onInserisci']; etichetta: string }) {
  const [aperto, setAperto] = useState(false)
  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <button type="button" className="ml-au-el-piu" aria-label={etichetta}>
          <Plus className="size-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent data-vl="" data-vl-page="mailing" className="ml-popover ml-au-menu-popover" align="center" collisionPadding={12}>
        <MenuInserimento
          consentiFine={consentiFine}
          onScegli={(t) => {
            setAperto(false)
            onInserisci(punto, t)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export function ElencoPassi(p: Props) {
  const solaLettura = !!p.report
  const contenuto = useMemo(() => {
    const visti = new Set<string>()
    const inizio = nodoIniziale(p.grafo)
    const perId = new Map(p.grafo.nodi.map((n) => [n.id, n]))

    const connettore = (punto: PuntoInserimento, successivo: boolean, chiave: string, testo: string): ReactNode => (
      <div className="ml-au-el-connettore" key={`c-${chiave}`} data-fine={successivo ? undefined : ''}>
        <span className="ml-au-el-linea" aria-hidden />
        {solaLettura ? null : <Aggiungi punto={punto} consentiFine={!successivo} onInserisci={p.onInserisci} etichetta={testo} />}
      </div>
    )

    const catena = (id: string | null, chiave: string): ReactNode[] => {
      const out: ReactNode[] = []
      let corrente = id
      while (corrente) {
        const n = perId.get(corrente)
        if (!n) break
        if (visti.has(n.id)) {
          out.push(
            <div key={`v-${chiave}-${n.id}`} className="ml-au-el-salto">
              <CornerDownRight className="size-4" aria-hidden /> Continua al passo {p.numeri.get(n.id)}
            </div>,
          )
          break
        }
        visti.add(n.id)
        out.push(<Riga key={n.id} id={n.id} tipo={n.tipo} {...p} />)
        if (n.tipo === 'CONDIZIONE') {
          out.push(
            <div key={`rami-${n.id}`} className="ml-au-el-rami">
              {(['SI', 'NO'] as const).map((ramo) => {
                const a = arcoDa(p.grafo, n.id, ramo)
                return (
                  <div key={ramo} className="ml-au-el-ramo" data-ramo={ramo}>
                    <div className="ml-au-el-ramo-titolo">
                      <span className="ml-au-ramo" data-ramo={ramo}>{ramo === 'SI' ? 'Sì' : 'No'}</span>
                      {ramo === 'SI' ? 'Se sì' : 'Se no'}
                    </div>
                    {connettore({ da: n.id, ramo }, !!a, `${n.id}-${ramo}`, `Aggiungi un passo sul ramo ${ramo === 'SI' ? 'Sì' : 'No'} del passo ${p.numeri.get(n.id)}`)}
                    {a ? catena(a.a, `${chiave}-${ramo}`) : <div className="ml-au-el-esce">Esce dal percorso</div>}
                  </div>
                )
              })}
            </div>,
          )
          break
        }
        if (n.tipo === 'FINE') break
        const a = arcoDa(p.grafo, n.id, null)
        out.push(connettore({ da: n.id, ramo: null }, !!a, n.id, `Aggiungi un passo dopo il passo ${p.numeri.get(n.id)}`))
        corrente = a?.a ?? null
      }
      return out
    }

    const corpo = [
      connettore({ da: null, ramo: null }, !!inizio, ID_TRIGGER, 'Aggiungi un passo all’inizio'),
      ...catena(inizio?.id ?? null, 'r'),
    ]
    const collegati = new Set(inizio ? raggiungibili(p.grafo, inizio.id) : [])
    const orfani = p.grafo.nodi.filter((n) => !collegati.has(n.id) && !visti.has(n.id))
    return { corpo, orfani }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.grafo, p.numeri, p.riassunti, p.problemi, p.selezionato, p.report, solaLettura])

  const IconaT = p.trigger.tipo ? ICONA_TRIGGER[p.trigger.tipo] : Zap
  return (
    <div className="ml-au-elenco">
      <button type="button" className="ml-au-el-riga ml-au-el-trigger" aria-pressed={p.selezionato === ID_TRIGGER} data-errore={p.trigger.errori ? '' : undefined} onClick={() => p.onSeleziona(ID_TRIGGER)}>
        <span className="ml-au-nodo-icona" aria-hidden><IconaT className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="ml-au-el-tipo">Inizia{p.report ? ` · ${formatCompatto(p.entratiTotali ?? 0)} entrati` : ''}</span>
          <span className="ml-au-el-titolo">{p.trigger.descrizione}</span>
          <span className="ml-au-el-dettaglio"><LogOut className="size-3 inline" aria-hidden /> {p.trigger.uscita}</span>
        </span>
      </button>
      {contenuto.corpo}
      {contenuto.orfani.length ? (
        <div className="ml-au-el-orfani">
          <div className="ml-etichetta">Passi non collegati</div>
          {contenuto.orfani.map((n) => (
            <Riga key={n.id} id={n.id} tipo={n.tipo} {...p} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function Riga({ id, tipo, ...p }: Props & { id: string; tipo: MailingTipoNodo }) {
  const meta = META_NODO[tipo]
  const Icona = meta.icona
  const r = p.riassunti.get(id)
  const pr = p.problemi.get(id)
  const rep = p.report?.get(id)
  return (
    <button
      type="button"
      className="ml-au-el-riga"
      data-tipo={tipo}
      aria-pressed={p.selezionato === id}
      data-errore={!p.report && pr?.errori ? '' : undefined}
      data-avviso={!p.report && !pr?.errori && pr?.avvisi ? '' : undefined}
      onClick={() => p.onSeleziona(id)}
    >
      <span className="ml-au-nodo-icona" aria-hidden><Icona className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="ml-au-el-tipo">
          Passo {p.numeri.get(id)} · {meta.etichetta}
        </span>
        <span className="ml-au-el-titolo">{r?.titolo}</span>
        {p.report ? (
          <span className="ml-au-el-dettaglio">
            {formatCompatto(rep?.entrati ?? 0)} passati
            {rep?.inAttesa ? ` · ${formatCompatto(rep.inAttesa)} qui ora` : ''}
            {tipo === 'EMAIL' ? ` · aperte ${formatPercentuale(rep?.tassoApertura ?? null, 0)}` : ''}
          </span>
        ) : (
          <span className="ml-au-el-dettaglio">{!p.report && pr?.primo ? pr.primo : r?.dettaglio}</span>
        )}
      </span>
      {!p.report && pr && pr.errori + pr.avvisi ? (
        <span className="ml-au-nodo-problema ml-au-el-problema" data-gravita={pr.errori ? 'errore' : 'avviso'} aria-hidden>!</span>
      ) : null}
    </button>
  )
}
