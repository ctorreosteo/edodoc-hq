import { format, parseISO } from "date-fns"
import { it } from "date-fns/locale"
import { useEffect, useRef } from "react"
import { kcalDaMacro, ripartizione } from "@/lib/dieta"
import type { ContenutoDieta, Pasto } from "@/types"
import "@/style/diete-foglio.css"

const LETTERE = "ABCDEFGH"
const pieno = (s?: string | null) => !!s && s.trim().length > 0
const dataLunga = (iso: string) => format(parseISO(iso), "d MMMM yyyy", { locale: it })

export type DatiFoglio = {
  titolo: string
  paziente: string | null
  dataInizio: string | null
  contenuto: ContenutoDieta
  consegnataIl: string | null
  medico: string
  titoliMedico: string
}

function PastoFoglio({ pasto, numero, attivo, onApri }: { pasto: Pasto; numero: number; attivo: boolean; onApri: () => void }) {
  const opzioni = pasto.opzioni.filter((o) => o.alimenti.some((a) => pieno(a.nome)) || pieno(o.nota))
  const vuoto = opzioni.length === 0 && !pieno(pasto.nota)
  return (
    <button type="button" className="fg-pasto" data-attivo={attivo ? "" : undefined} data-vuoto={vuoto ? "" : undefined}
      data-foglio-pasto={pasto.id} onClick={onApri} title="Modifica questo pasto">
      <span className="fg-pasto-lato">
        <span className="fg-pasto-n">{String(numero).padStart(2, "0")}</span>
        <span className="fg-pasto-nome">{pasto.nome || "Pasto"}</span>
        {pasto.orario ? <span className="fg-pasto-ora">{pasto.orario}</span> : null}
        {opzioni.length > 1 ? <span className="fg-pasto-scelta">{opzioni.length} alternative a scelta</span> : null}
      </span>
      <span className="fg-pasto-corpo">
        {vuoto ? (
          <span className="fg-fantasma" aria-label="Pasto ancora vuoto"><i /><i /><i /></span>
        ) : opzioni.map((o, i) => (
          <span key={o.id} className="fg-opzione">
            {i > 0 ? <span className="fg-oppure"><span>oppure</span></span> : null}
            {opzioni.length > 1 || pieno(o.nome) ? (
              <span className="fg-op-testa">
                {opzioni.length > 1 ? <span className="fg-lettera-op">{LETTERE[i] ?? "·"}</span> : null}
                {pieno(o.nome) ? <span className="fg-op-nome">{o.nome}</span> : null}
              </span>
            ) : null}
            {o.alimenti.filter((a) => pieno(a.nome)).map((a) => (
              <span key={a.id} className="fg-alimento">
                <span className="fg-al-nome">{a.nome}{pieno(a.nota) ? <small>{a.nota}</small> : null}</span>
                <span className="fg-al-q">{a.quantita}</span>
              </span>
            ))}
          </span>
        ))}
        {pieno(pasto.nota) ? <span className="fg-pasto-nota">{pasto.nota}</span> : null}
      </span>
    </button>
  )
}

function Testa({ occhiello, titolo, nota }: { occhiello: string; titolo: string; nota?: string | null }) {
  return (
    <div className="fg-testa">
      <span className="fg-occhiello">{occhiello}</span>
      <span className="fg-testa-titolo">{titolo}</span>
      {pieno(nota) ? <span className="fg-testa-nota">{nota}</span> : null}
      <span className="fg-tratto" />
    </div>
  )
}

/**
 * Il PDF del paziente in miniatura, ricomposto a ogni tasto. Stesse proporzioni dell'A4 (le misure sono in
 * millimetri di carta grazie alle unità del contenitore) e stessi blocchi; l'impaginazione esatta resta quella del PDF.
 * Un clic su un pasto porta al pasto nell'editor; il pasto su cui si scrive si illumina qui.
 */
export function FoglioDieta({ dati, pastoAttivo, onApriPasto }: { dati: DatiFoglio; pastoAttivo: string | null; onApriPasto: (giornata: number, pastoId: string) => void }) {
  const scorri = useRef<HTMLDivElement>(null)
  const c = dati.contenuto
  const kcal = c.kcal ?? (kcalDaMacro(c) || null)
  const r = ripartizione(c)
  const acqua = c.acquaLitri != null && c.acquaLitri > 0
  const sintesi = pieno(c.introduzione) || kcal != null || r != null || acqua
  const consigli = c.consigli.filter((k) => pieno(k.titolo) || pieno(k.testo))
  const liberi = c.liberi.filter(pieno)
  const limitare = c.limitare.filter(pieno)
  const integrazione = c.integrazione.filter((i) => pieno(i.nome))
  const indicazioni = consigli.length + liberi.length + limitare.length + integrazione.length > 0
  const spesa = c.listaSpesa ? [...new Map(c.giornate.flatMap((g) => g.pasti.flatMap((p) => p.opzioni.flatMap((o) => o.alimenti)))
    .filter((a) => pieno(a.nome)).map((a) => [a.nome.trim().toLowerCase(), a.nome.trim().charAt(0).toUpperCase() + a.nome.trim().slice(1)])).values()]
    .sort((a, b) => a.localeCompare(b, "it")) : []
  let pagina = 1

  // Il pasto su cui il dottore scrive resta in vista anche nel foglio, senza strappi se è già visibile
  useEffect(() => {
    const box = scorri.current
    if (!box || !pastoAttivo) return
    const el = box.querySelector<HTMLElement>(`[data-foglio-pasto="${pastoAttivo}"]`)
    if (!el) return
    const sopra = el.getBoundingClientRect().top - box.getBoundingClientRect().top
    const sotto = sopra + el.offsetHeight
    if (sopra < 0 || sotto > box.clientHeight) box.scrollTo({ top: box.scrollTop + sopra - 24, behavior: "smooth" })
  }, [pastoAttivo])

  // Appena la dieta diventa consegnata il foglio torna alla copertina: il timbro va visto mentre si posa
  const consegnaPrima = useRef(dati.consegnataIl)
  useEffect(() => {
    if (dati.consegnataIl && dati.consegnataIl !== consegnaPrima.current) scorri.current?.scrollTo({ top: 0, behavior: "smooth" })
    consegnaPrima.current = dati.consegnataIl
  }, [dati.consegnataIl])

  const piede = () => <span className="fg-piede"><span>{dati.medico}{dati.paziente ? ` · ${dati.paziente}` : ""}</span><b>{++pagina}</b></span>

  return (
    <div className="fg-scorri" ref={scorri}>
      <div className="fg-fogli">
        <section className="fg-pagina fg-copertina" aria-label="Copertina">
          <span className="fg-cop-triangolo" aria-hidden />
          <span className="fg-cop-anello" aria-hidden />
          <img className="fg-cop-logo" src="/logo.png" alt="" />
          <span className="fg-cop-centro">
            <span className="fg-occhiello">Piano alimentare personalizzato</span>
            <span className="fg-cop-titolo">{dati.titolo || "Senza titolo"}</span>
            {dati.paziente ? <span className="fg-cop-per">per <b>{dati.paziente}</b></span> : null}
            <span className="fg-cop-tratto" />
          </span>
          {dati.dataInizio || kcal || pieno(c.obiettivo) ? (
            <span className="fg-cop-dati">
              {dati.dataInizio ? <span><small>Dal</small>{dataLunga(dati.dataInizio)}</span> : null}
              {kcal ? <span><small>Energia</small>{kcal.toLocaleString("it-IT")} kcal al giorno</span> : null}
              {pieno(c.obiettivo) ? <span><small>Obiettivo</small>{c.obiettivo}</span> : null}
            </span>
          ) : null}
          <span className="fg-cop-firma"><b>{dati.medico}</b>{dati.titoliMedico}</span>
          {dati.consegnataIl ? (
            <span className="fg-timbro" key={dati.consegnataIl}>
              <small>Consegnata</small>
              {format(parseISO(dati.consegnataIl), "d MMM yyyy", { locale: it })}
            </span>
          ) : null}
        </section>

        {sintesi ? (
          <section className="fg-pagina" aria-label="Sintesi">
            <Testa occhiello="Il tuo piano" titolo="Prima di iniziare" />
            {pieno(c.introduzione) ? (
              <div className="fg-lettera">
                {c.introduzione!.split(/\n+/).filter(pieno).map((p, i) => <p key={i}>{p}</p>)}
                <b className="fg-firma">{dati.medico}</b>
              </div>
            ) : null}
            {kcal || acqua ? (
              <div className="fg-numeri">
                {kcal ? <div className="fg-kcal"><small>Energia giornaliera</small><span>{kcal.toLocaleString("it-IT")}<em> kcal</em></span></div> : null}
                {acqua ? <div className="fg-acqua"><small>Acqua</small><span>{String(c.acquaLitri).replace(".", ",")}<em> litri</em></span></div> : null}
              </div>
            ) : null}
            {r ? (
              <div className="fg-macro">
                <small>Ripartizione dei macronutrienti</small>
                <div className="fg-barra">
                  {r.proteine ? <i data-m="p" style={{ width: `${r.proteine}%` }} /> : null}
                  {r.carboidrati ? <i data-m="c" style={{ width: `${r.carboidrati}%` }} /> : null}
                  {r.grassi ? <i data-m="g" style={{ width: `${r.grassi}%` }} /> : null}
                </div>
                <div className="fg-macro-voci">
                  {([["Proteine", c.proteine, r.proteine, "p"], ["Carboidrati", c.carboidrati, r.carboidrati, "c"], ["Grassi", c.grassi, r.grassi, "g"]] as const).map(([nome, g, pct, m]) => (
                    <span key={nome}><b><i data-m={m} />{nome}</b><span>{g ?? 0}<em> g</em></span><small>{pct}% dell'energia</small></span>
                  ))}
                </div>
              </div>
            ) : null}
            {piede()}
          </section>
        ) : null}

        {c.giornate.map((g, gi) => (
          <section key={g.id} className="fg-pagina" aria-label={g.nome}>
            <Testa occhiello={c.giornate.length > 1 ? "La giornata" : "I tuoi pasti"} titolo={g.nome || "Giornata tipo"} nota={g.nota} />
            {g.pasti.map((p, i) => (
              <PastoFoglio key={p.id} pasto={p} numero={i + 1} attivo={p.id === pastoAttivo} onApri={() => onApriPasto(gi, p.id)} />
            ))}
            {piede()}
          </section>
        ))}

        {indicazioni ? (
          <section className="fg-pagina" aria-label="Indicazioni">
            <Testa occhiello="Indicazioni" titolo="Le regole del gioco" />
            {consigli.length ? (
              <div className="fg-consigli">
                {consigli.map((k, i) => (
                  <span key={k.id}><em>{String(i + 1).padStart(2, "0")}</em><b>{k.titolo}</b><small>{k.testo}</small></span>
                ))}
              </div>
            ) : null}
            {liberi.length || limitare.length ? (
              <div className="fg-due">
                {liberi.length ? <div data-tono="liberi"><b>Liberi</b>{liberi.map((v) => <span key={v}>{v}</span>)}</div> : null}
                {limitare.length ? <div data-tono="limitare"><b>Da limitare</b>{limitare.map((v) => <span key={v}>{v}</span>)}</div> : null}
              </div>
            ) : null}
            {integrazione.length ? (
              <div className="fg-integrazione">
                <small>Integrazione</small>
                {integrazione.map((x) => <span key={x.id}><b>{x.nome}</b><span>{x.dose}</span><span>{x.quando}</span></span>)}
              </div>
            ) : null}
            {piede()}
          </section>
        ) : null}

        {spesa.length >= 3 ? (
          <section className="fg-pagina" aria-label="Lista della spesa">
            <Testa occhiello="Da portare al supermercato" titolo="Lista della spesa" />
            <div className="fg-spesa">{spesa.map((v) => <span key={v}><i />{v}</span>)}</div>
            {piede()}
          </section>
        ) : null}
      </div>
    </div>
  )
}
