import { memo, useMemo, useState, type CSSProperties } from 'react'
import { Briefcase, CalendarPlus, MapPin, Repeat, Video } from 'lucide-react'
import {
  aggiungiGiorni, durata, durataMinuti, etichettaGiorno, eventiDelGiorno, giorniTra, INIZIALI_LUN, inizioGiorno, inizioSettimana, inStriscia,
  maiuscola, nomeMese, ora, ordinaEventi, righeStriscia, stessoGiorno, type EventoVista,
} from './agenda-utils'
import type { Bozza } from './agenda-tempo'

// ───────────────────────── Mese ─────────────────────────

interface MeseProps {
  giorni: Date[]
  mese: number
  eventi: EventoVista[]
  adesso: Date
  selezionato: string | null
  onApri: (e: EventoVista, el: HTMLElement) => void
  onCrea: (b: Bozza, el: HTMLElement | null) => void
  onCambiaOrario: (e: EventoVista, start: Date, end: Date) => void
  onVaiGiorno: (d: Date) => void
}

const RIGHE_CELLA = 4

export const AgendaMese = memo(function AgendaMese({ giorni, mese, eventi, adesso, selezionato, onApri, onCrea, onCambiaOrario, onVaiGiorno }: MeseProps) {
  const settimane = useMemo(() => {
    const out: Date[][] = []
    for (let i = 0; i < giorni.length; i += 7) out.push(giorni.slice(i, i + 7))
    return out
  }, [giorni])
  const lunghi = useMemo(() => eventi.filter(inStriscia), [eventi])
  const brevi = useMemo(() => eventi.filter((e) => !inStriscia(e)).sort(ordinaEventi), [eventi])
  const [sopra, setSopra] = useState<number | null>(null)
  const [trascinato, setTrascinato] = useState<string | null>(null)

  const lascia = (giorno: Date, chiave: string) => {
    const ev = eventi.find((e) => e.chiave === chiave)
    if (!ev || !ev.modificabile) return
    const delta = giorniTra(ev.start, giorno)
    if (delta) onCambiaOrario(ev, aggiungiGiorni(ev.start, delta), aggiungiGiorni(ev.end, delta))
  }

  return (
    <div className="ag-mese" style={{ '--ag-settimane': settimane.length } as CSSProperties}>
      <div className="ag-mese-testa">
        {['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map((g) => (
          <span key={g}>{g}</span>
        ))}
      </div>
      <div className="ag-mese-corpo">
        {settimane.map((sett) => {
          const barre = righeStriscia(lunghi, sett)
          return (
            <div key={sett[0].getTime()} className="ag-mese-settimana">
              {sett.map((g, i) => {
                const fuori = g.getMonth() !== mese
                const oggi = stessoGiorno(g, adesso)
                const righeBarre = barre.filter((b) => b.da <= i && b.a >= i)
                const maxRiga = righeBarre.reduce((m, b) => Math.max(m, b.riga + 1), 0)
                const delGiorno = eventiDelGiorno(brevi, g).filter((e) => stessoGiorno(e.start, g))
                const spazio = Math.max(0, RIGHE_CELLA - maxRiga)
                const visibili = delGiorno.slice(0, delGiorno.length > spazio ? Math.max(0, spazio - 1) : spazio)
                const nascosti = delGiorno.length - visibili.length + righeBarre.filter((b) => b.riga >= RIGHE_CELLA).length
                return (
                  <div
                    key={g.getTime()}
                    className="ag-mese-cella"
                    data-fuori={fuori || undefined}
                    data-oggi={oggi || undefined}
                    data-weekend={g.getDay() === 0 || g.getDay() === 6 || undefined}
                    data-sopra={sopra === g.getTime() || undefined}
                    style={{ gridColumn: i + 1 }}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('.ag-mese-ev, .ag-barra, .ag-mese-num, .ag-mese-altri')) return
                      onCrea({ start: g, end: aggiungiGiorni(g, 1), tuttoIlGiorno: true }, null)
                    }}
                    onDragOver={(e) => {
                      if (!trascinato) return
                      e.preventDefault()
                      if (sopra !== g.getTime()) setSopra(g.getTime())
                    }}
                    onDragLeave={() => setSopra((s) => (s === g.getTime() ? null : s))}
                    onDrop={(e) => {
                      e.preventDefault()
                      setSopra(null)
                      lascia(g, e.dataTransfer.getData('text/agenda') || trascinato || '')
                      setTrascinato(null)
                    }}
                  >
                    <button type="button" className="ag-mese-num" onClick={() => onVaiGiorno(g)}>
                      {g.getDate() === 1 ? `${g.getDate()} ${nomeMese(g.getMonth()).slice(0, 3)}` : g.getDate()}
                    </button>
                    <div className="ag-mese-lista" style={{ paddingTop: `calc(${Math.min(maxRiga, RIGHE_CELLA)} * var(--ag-riga-mese))` }}>
                      {visibili.map((ev) => (
                        <button
                          key={ev.chiave}
                          type="button"
                          className="ag-mese-ev"
                          draggable={ev.modificabile}
                          data-sel={selezionato === ev.chiave || undefined}
                          data-risposta={ev.miaRisposta ?? undefined}
                          data-finito={ev.end <= adesso || undefined}
                          data-trascinato={trascinato === ev.chiave || undefined}
                          style={{ '--c': ev.colore } as CSSProperties}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/agenda', ev.chiave)
                            e.dataTransfer.effectAllowed = 'move'
                            setTrascinato(ev.chiave)
                          }}
                          onDragEnd={() => {
                            setTrascinato(null)
                            setSopra(null)
                          }}
                          onClick={(e) => onApri(ev, e.currentTarget)}
                        >
                          <i aria-hidden />
                          <time>{ora(ev.start)}</time>
                          <span>{ev.titolo || '(Senza titolo)'}</span>
                        </button>
                      ))}
                      {nascosti > 0 ? (
                        <button type="button" className="ag-mese-altri" onClick={() => onVaiGiorno(g)}>
                          +{nascosti} altri
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
              <div className="ag-mese-barre">
                {barre.filter((b) => b.riga < RIGHE_CELLA).map((b) => (
                  <button
                    key={b.evento.chiave}
                    type="button"
                    className="ag-barra"
                    draggable={b.evento.modificabile}
                    data-sel={selezionato === b.evento.chiave || undefined}
                    data-risposta={b.evento.miaRisposta ?? undefined}
                    data-tipo={b.evento.tipo}
                    data-continua={giorniTra(sett[0], b.evento.start) < 0 || undefined}
                    data-prosegue={giorniTra(sett[0], b.evento.tuttoIlGiorno ? aggiungiGiorni(b.evento.end, -1) : b.evento.end) > 6 || undefined}
                    style={{ gridColumn: `${b.da + 1} / ${b.a + 2}`, gridRow: b.riga + 1, '--c': b.evento.colore } as CSSProperties}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/agenda', b.evento.chiave)
                      setTrascinato(b.evento.chiave)
                    }}
                    onDragEnd={() => setTrascinato(null)}
                    onClick={(e) => onApri(b.evento, e.currentTarget)}
                  >
                    {b.evento.tipo === 'outOfOffice' ? <Briefcase aria-hidden /> : null}
                    <span>{b.evento.titolo || '(Senza titolo)'}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

// ───────────────────────── Mese sul telefono ─────────────────────────

interface MeseMobileProps {
  giorni: Date[]
  scelto: Date
  eventi: EventoVista[]
  adesso: Date
  selezionato: string | null
  onScegli: (d: Date) => void
  onApri: (e: EventoVista, el: HTMLElement) => void
  onCrea: (b: Bozza, el: HTMLElement | null) => void
}

/** Sul telefono le celle sono troppo piccole per i titoli: puntini colorati in griglia, il giorno toccato sotto. */
export const AgendaMeseMobile = memo(function AgendaMeseMobile({ giorni, scelto, eventi, adesso, selezionato, onScegli, onApri, onCrea }: MeseMobileProps) {
  const perGiorno = useMemo(() => {
    const m = new Map<number, EventoVista[]>()
    giorni.forEach((g) => m.set(g.getTime(), eventiDelGiorno(eventi, g).sort(ordinaEventi)))
    return m
  }, [giorni, eventi])
  const delGiorno = perGiorno.get(scelto.getTime()) ?? eventiDelGiorno(eventi, scelto).sort(ordinaEventi)
  const mese = scelto.getMonth()
  return (
    <div className="ag-mmese">
      <div className="ag-mmese-griglia">
        {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((g, i) => <span key={i} className="ag-mmese-dow">{g}</span>)}
        {giorni.map((g) => {
          const lista = perGiorno.get(g.getTime()) ?? []
          return (
            <button
              key={g.getTime()}
              type="button"
              className="ag-mmese-cella"
              data-fuori={g.getMonth() !== mese || undefined}
              data-oggi={stessoGiorno(g, adesso) || undefined}
              data-scelto={stessoGiorno(g, scelto) || undefined}
              onClick={() => onScegli(g)}
            >
              <strong>{g.getDate()}</strong>
              <span className="ag-mmese-punti" aria-label={lista.length ? `${lista.length} eventi` : undefined}>
                {lista.slice(0, 4).map((e) => (
                  <i key={e.chiave} style={{ '--c': e.colore } as CSSProperties} data-lungo={e.tuttoIlGiorno || undefined} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
      <section className="ag-mmese-giorno" key={scelto.getTime()}>
        <header>
          <strong>{etichettaGiorno(scelto, adesso)}</strong>
          <small>{delGiorno.length ? `${delGiorno.length} event${delGiorno.length === 1 ? 'o' : 'i'}` : 'Niente in programma'}</small>
        </header>
        {delGiorno.length ? (
          <ol>
            {delGiorno.map((ev) => (
              <li key={ev.chiave}>
                <button
                  type="button"
                  className="ag-elenco-ev"
                  data-sel={selezionato === ev.chiave || undefined}
                  data-finito={ev.end <= adesso || undefined}
                  data-risposta={ev.miaRisposta ?? undefined}
                  style={{ '--c': ev.colore } as CSSProperties}
                  onClick={(e) => onApri(ev, e.currentTarget)}
                >
                  <time>
                    {ev.tuttoIlGiorno ? 'Tutto il giorno' : (
                      <>
                        {stessoGiorno(ev.start, scelto) ? ora(ev.start) : '…'}
                        <small>{stessoGiorno(ev.end, scelto) ? ora(ev.end) : '…'}</small>
                      </>
                    )}
                  </time>
                  <i aria-hidden />
                  <span className="ag-elenco-testo">
                    <strong>{ev.titolo || '(Senza titolo)'}</strong>
                    {ev.luogo ? <small><MapPin aria-hidden />{ev.luogo}</small> : null}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <button
            type="button"
            className="ag-mmese-crea"
            onClick={() => onCrea({ start: new Date(scelto.getFullYear(), scelto.getMonth(), scelto.getDate(), 9), end: new Date(scelto.getFullYear(), scelto.getMonth(), scelto.getDate(), 10), tuttoIlGiorno: false }, null)}
          >
            <CalendarPlus aria-hidden /> Aggiungi un evento
          </button>
        )}
      </section>
    </div>
  )
})

// ───────────────────────── Anno ─────────────────────────

interface AnnoProps {
  anno: number
  eventi: EventoVista[]
  adesso: Date
  onVaiGiorno: (d: Date) => void
  onVaiMese: (d: Date) => void
}

/** Dodici mesi con l'intensità della giornata: ore occupate (gli eventi di tutto il giorno contano come un puntino). */
export const AgendaAnno = memo(function AgendaAnno({ anno, eventi, adesso, onVaiGiorno, onVaiMese }: AnnoProps) {
  const carico = useMemo(() => {
    const m = new Map<number, { minuti: number; n: number; giornata: boolean; titoli: string[] }>()
    for (const e of eventi) {
      if (e.miaRisposta === 'declined') continue
      let g = inizioGiorno(e.start)
      const fine = e.end
      let guardia = 0
      while (g < fine && guardia++ < 400) {
        const k = g.getTime()
        const v = m.get(k) ?? { minuti: 0, n: 0, giornata: false, titoli: [] }
        if (e.tuttoIlGiorno) v.giornata = true
        else {
          const g1 = aggiungiGiorni(g, 1)
          v.minuti += Math.max(0, (Math.min(fine.getTime(), g1.getTime()) - Math.max(e.start.getTime(), g.getTime())) / 60_000)
        }
        v.n++
        if (v.titoli.length < 4) v.titoli.push(e.titolo || '(Senza titolo)')
        m.set(k, v)
        g = aggiungiGiorni(g, 1)
      }
    }
    return m
  }, [eventi])

  return (
    <div className="ag-anno">
      {Array.from({ length: 12 }, (_, mi) => {
        const primo = new Date(anno, mi, 1)
        const inizio = inizioSettimana(primo)
        const celle = Array.from({ length: 42 }, (_, i) => aggiungiGiorni(inizio, i))
        let totale = 0
        celle.forEach((c) => {
          if (c.getMonth() === mi) totale += carico.get(c.getTime())?.n ?? 0
        })
        return (
          <section key={mi} className="ag-anno-mese" data-corrente={adesso.getFullYear() === anno && adesso.getMonth() === mi || undefined} style={{ '--i': mi } as CSSProperties}>
            <button type="button" className="ag-anno-titolo" onClick={() => onVaiMese(primo)}>
              {maiuscola(nomeMese(mi))}
              <small>{totale} eventi</small>
            </button>
            <div className="ag-anno-griglia">
              {INIZIALI_LUN.map((g, i) => (
                <span key={`t${i}`} className="ag-anno-dow">{g}</span>
              ))}
              {celle.map((c) => {
                const v = c.getMonth() === mi ? carico.get(c.getTime()) : undefined
                const livello = !v ? 0 : Math.min(4, Math.ceil(v.minuti / 120) + (v.minuti === 0 && v.n ? 1 : 0))
                return (
                  <button
                    key={c.getTime()}
                    type="button"
                    className="ag-anno-giorno"
                    data-fuori={c.getMonth() !== mi || undefined}
                    data-oggi={stessoGiorno(c, adesso) || undefined}
                    data-livello={livello}
                    data-giornata={v?.giornata || undefined}
                    disabled={c.getMonth() !== mi}
                    title={v ? `${v.n} event${v.n === 1 ? 'o' : 'i'}${v.minuti ? ` · ${durata(Math.round(v.minuti))}` : ''}\n${v.titoli.join('\n')}` : undefined}
                    onClick={() => onVaiGiorno(c)}
                  >
                    {c.getDate()}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
})

// ───────────────────────── Elenco ─────────────────────────

interface ElencoProps {
  giorni: Date[]
  eventi: EventoVista[]
  adesso: Date
  selezionato: string | null
  onApri: (e: EventoVista, el: HTMLElement) => void
  onCrea: (b: Bozza, el: HTMLElement | null) => void
}

export const AgendaElenco = memo(function AgendaElenco({ giorni, eventi, adesso, selezionato, onApri, onCrea }: ElencoProps) {
  const gruppi = useMemo(
    () =>
      giorni
        .map((g) => ({ giorno: g, eventi: eventiDelGiorno(eventi, g).sort(ordinaEventi) }))
        .filter((x) => x.eventi.length > 0 || stessoGiorno(x.giorno, adesso)),
    [giorni, eventi, adesso],
  )
  if (!gruppi.some((g) => g.eventi.length)) {
    return (
      <div className="ag-vuoto">
        <div className="ag-vuoto-orb" aria-hidden><CalendarPlus /></div>
        <h3>Sei libero</h3>
        <p>Nessun evento nelle prossime settimane.</p>
        <button type="button" className="ag-btn ag-btn--primario" onClick={() => onCrea({ start: new Date(new Date().setMinutes(0, 0, 0) + 3_600_000), end: new Date(new Date().setMinutes(0, 0, 0) + 7_200_000), tuttoIlGiorno: false }, null)}>
          Crea un evento
        </button>
      </div>
    )
  }
  return (
    <div className="ag-elenco">
      {gruppi.map(({ giorno, eventi: lista }, gi) => {
        const oggi = stessoGiorno(giorno, adesso)
        const occupati = lista.filter((e) => !e.tuttoIlGiorno && e.miaRisposta !== 'declined' && e.trasparenza !== 'transparent').reduce((s, e) => s + durataMinuti(e), 0)
        return (
          <section key={giorno.getTime()} className="ag-elenco-giorno" data-oggi={oggi || undefined} style={{ '--i': Math.min(gi, 12) } as CSSProperties}>
            <header>
              <span className="ag-elenco-num">{giorno.getDate()}</span>
              <div>
                <strong>{etichettaGiorno(giorno, adesso)}</strong>
                <small>
                  {lista.length ? `${lista.length} event${lista.length === 1 ? 'o' : 'i'}` : 'Niente in programma'}
                  {occupati ? ` · ${durata(occupati)} occupate` : ''}
                </small>
              </div>
            </header>
            <ol>
              {lista.map((ev) => {
                const inCorso = ev.start <= adesso && ev.end > adesso
                return (
                  <li key={ev.chiave}>
                    <button
                      type="button"
                      className="ag-elenco-ev"
                      data-sel={selezionato === ev.chiave || undefined}
                      data-finito={ev.end <= adesso || undefined}
                      data-in-corso={inCorso || undefined}
                      data-risposta={ev.miaRisposta ?? undefined}
                      style={{ '--c': ev.colore } as CSSProperties}
                      onClick={(e) => onApri(ev, e.currentTarget)}
                    >
                      <time>
                        {ev.tuttoIlGiorno || (ev.start < giorno && ev.end > aggiungiGiorni(giorno, 1)) ? (
                          'Tutto il giorno'
                        ) : (
                          <>
                            {stessoGiorno(ev.start, giorno) ? ora(ev.start) : '…'}
                            <small>{stessoGiorno(ev.end, giorno) ? ora(ev.end) : '…'}</small>
                          </>
                        )}
                      </time>
                      <i aria-hidden />
                      <span className="ag-elenco-testo">
                        <strong>{ev.titolo || '(Senza titolo)'}</strong>
                        {ev.luogo ? <small><MapPin aria-hidden />{ev.luogo}</small> : null}
                      </span>
                      <span className="ag-elenco-icone">
                        {inCorso ? <em className="ag-live">in corso</em> : null}
                        {ev.serieId ? <Repeat aria-label="Ricorrente" /> : null}
                        {ev.meet ? <Video aria-label="Meet" /> : null}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}
    </div>
  )
})
