import type {
  MailingArco,
  MailingAutomazioneEmail,
  MailingCatalogoCampo,
  MailingGrafo,
  MailingGruppoRegole,
  MailingNodo,
  MailingReportNodo,
  MailingSegmento,
  MailingTag,
  MailingTipoNodo,
  MailingTipoTrigger,
  MailingTrigger,
} from '@/services/mailing-service'

/*
  Funzioni pure sul grafo delle automazioni email (tela del builder, elenco su mobile, validazione).
  Nessuna dipendenza da React o dal DOM: si possono provare con node (vedi script nello scratchpad).

  Convenzioni del grafo (contratto con il backend, §5 della specifica):
  - nodo.x / nodo.y = angolo in alto a sinistra della card, in pixel della tela (zoom 1).
  - Il primo nodo è quello senza archi entranti; il trigger non è un nodo: la tela lo disegna sopra il primo.
  - Ogni uscita ha al più un arco: CONDIZIONE ha le uscite SI e NO (arco.ramo), FINE nessuna, gli altri una (ramo null).
  - Più archi possono entrare nello stesso nodo (rami che si ricongiungono).
*/

export type Ramo = 'SI' | 'NO' | null

/** Dimensioni fisse della card di un nodo e passo della griglia dell'auto-layout. */
export const NODO_LARGHEZZA = 264
export const NODO_ALTEZZA = 104
export const PASSO_Y = 184
export const PASSO_X = 312
/** id riservato al nodo trigger disegnato in cima alla tela (non sta nel grafo). */
export const ID_TRIGGER = '__trigger__'

export const TIPI_NODO: MailingTipoNodo[] = [
  'EMAIL', 'ATTESA', 'ATTESA_FINO_A', 'CONDIZIONE', 'AGGIUNGI_TAG', 'RIMUOVI_TAG', 'NOTIFICA_STAFF', 'FINE',
]

// ───────────────────────── Navigazione ─────────────────────────

/** Uscite di un tipo di nodo: SI/NO per la condizione, nessuna per FINE, una (null) per gli altri. */
export function usciteDi(tipo: MailingTipoNodo): Ramo[] {
  if (tipo === 'CONDIZIONE') return ['SI', 'NO']
  if (tipo === 'FINE') return []
  return [null]
}

function mappaNodi(grafo: MailingGrafo): Map<string, MailingNodo> {
  return new Map(grafo.nodi.map((n) => [n.id, n]))
}

/** Archi validi (entrambi gli estremi esistono). */
function archiValidi(grafo: MailingGrafo): MailingArco[] {
  const ids = new Set(grafo.nodi.map((n) => n.id))
  return grafo.archi.filter((a) => ids.has(a.da) && ids.has(a.a))
}

/** Archi in uscita da un nodo, SI prima di NO. */
export function figli(grafo: MailingGrafo, nodoId: string): MailingArco[] {
  const ordine = (r: Ramo) => (r === 'SI' ? 0 : r === 'NO' ? 1 : 0)
  return archiValidi(grafo)
    .filter((a) => a.da === nodoId)
    .sort((x, y) => ordine(x.ramo) - ordine(y.ramo))
}

export function genitori(grafo: MailingGrafo, nodoId: string): MailingArco[] {
  return archiValidi(grafo).filter((a) => a.a === nodoId)
}

/** L'arco che parte da (da, ramo), se c'è. */
export function arcoDa(grafo: MailingGrafo, da: string, ramo: Ramo): MailingArco | null {
  return grafo.archi.find((a) => a.da === da && (a.ramo ?? null) === (ramo ?? null)) ?? null
}

/**
 * Il primo nodo: quello senza archi entranti. Se ce n'è più d'uno vince quello più in alto (poi più a sinistra),
 * gli altri risultano orfani. Null se il grafo è vuoto o ogni nodo ha un arco entrante (solo cicli).
 */
export function nodoIniziale(grafo: MailingGrafo): MailingNodo | null {
  const conEntrata = new Set(archiValidi(grafo).map((a) => a.a))
  const candidati = grafo.nodi.filter((n) => !conEntrata.has(n.id))
  if (!candidati.length) return null
  return [...candidati].sort((a, b) => a.y - b.y || a.x - b.x)[0]
}

/** Nodi raggiungibili da `da` (compreso), in ordine di visita in ampiezza, SI prima di NO. */
export function raggiungibili(grafo: MailingGrafo, da: string): string[] {
  const visti = new Set<string>([da])
  const coda = [da]
  for (let i = 0; i < coda.length; i++) {
    for (const arco of figli(grafo, coda[i])) {
      if (!visti.has(arco.a)) {
        visti.add(arco.a)
        coda.push(arco.a)
      }
    }
  }
  return coda
}

/**
 * Numero del passo (1, 2, 3…) in ordine di lettura: dall'inizio in ampiezza, SI prima di NO.
 * I nodi non collegati prendono i numeri successivi (ordinati per posizione).
 */
export function numerazione(grafo: MailingGrafo): Map<string, number> {
  const numeri = new Map<string, number>()
  const inizio = nodoIniziale(grafo)
  if (inizio) raggiungibili(grafo, inizio.id).forEach((id) => numeri.set(id, numeri.size + 1))
  ;[...grafo.nodi]
    .filter((n) => !numeri.has(n.id))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .forEach((n) => numeri.set(n.id, numeri.size + 1))
  return numeri
}

/** Antenati di un nodo (tutti i nodi da cui lo si raggiunge), escluso il nodo stesso. */
export function antenati(grafo: MailingGrafo, nodoId: string): Set<string> {
  const archi = archiValidi(grafo)
  const visti = new Set<string>()
  const pila = [nodoId]
  while (pila.length) {
    const id = pila.pop() as string
    for (const a of archi) {
      if (a.a === id && !visti.has(a.da)) {
        visti.add(a.da)
        pila.push(a.da)
      }
    }
  }
  visti.delete(nodoId)
  return visti
}

/** Nodi EMAIL a monte di un nodo, in ordine di passo: quelli citabili da una condizione "ha aperto/cliccato". */
export function emailAMonte(grafo: MailingGrafo, nodoId: string): MailingNodo[] {
  const sopra = antenati(grafo, nodoId)
  const numeri = numerazione(grafo)
  return grafo.nodi
    .filter((n) => n.tipo === 'EMAIL' && sopra.has(n.id))
    .sort((a, b) => (numeri.get(a.id) ?? 0) - (numeri.get(b.id) ?? 0))
}

/** Nodi che stanno su un ciclo (algoritmo di Tarjan sulle componenti fortemente connesse). */
export function nodiInCiclo(grafo: MailingGrafo): Set<string> {
  const archi = archiValidi(grafo)
  const adiacenti = new Map<string, string[]>()
  for (const n of grafo.nodi) adiacenti.set(n.id, [])
  for (const a of archi) adiacenti.get(a.da)?.push(a.a)
  let indice = 0
  const idx = new Map<string, number>()
  const basso = new Map<string, number>()
  const pila: string[] = []
  const inPila = new Set<string>()
  const risultato = new Set<string>()

  // Versione iterativa: con 60+ nodi la ricorsione andrebbe bene, ma così non ha limiti.
  for (const radice of grafo.nodi.map((n) => n.id)) {
    if (idx.has(radice)) continue
    const lavoro: { id: string; i: number }[] = [{ id: radice, i: 0 }]
    idx.set(radice, indice)
    basso.set(radice, indice++)
    pila.push(radice)
    inPila.add(radice)
    while (lavoro.length) {
      const cima = lavoro[lavoro.length - 1]
      const vicini = adiacenti.get(cima.id) ?? []
      if (cima.i < vicini.length) {
        const w = vicini[cima.i++]
        if (!idx.has(w)) {
          idx.set(w, indice)
          basso.set(w, indice++)
          pila.push(w)
          inPila.add(w)
          lavoro.push({ id: w, i: 0 })
        } else if (inPila.has(w)) {
          basso.set(cima.id, Math.min(basso.get(cima.id)!, idx.get(w)!))
        }
        continue
      }
      lavoro.pop()
      if (lavoro.length) {
        const padre = lavoro[lavoro.length - 1].id
        basso.set(padre, Math.min(basso.get(padre)!, basso.get(cima.id)!))
      }
      if (basso.get(cima.id) === idx.get(cima.id)) {
        const componente: string[] = []
        let w: string
        do {
          w = pila.pop() as string
          inPila.delete(w)
          componente.push(w)
        } while (w !== cima.id)
        const autoAnello = archi.some((a) => a.da === cima.id && a.a === cima.id)
        if (componente.length > 1 || autoAnello) componente.forEach((c) => risultato.add(c))
      }
    }
  }
  return risultato
}

// ───────────────────────── Configurazioni ─────────────────────────

export type UnitaAttesa = 'MINUTI' | 'ORE' | 'GIORNI'

/** Le email di un passo EMAIL (in EdoDoc una sola: config.emailId). */
export function emailDelPasso(config: Record<string, unknown> | null | undefined): number[] {
  const id = numeroDa(config?.emailId)
  return id != null ? [id] : []
}

export function numeroDa(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}

export function stringaDa(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

function arrayNumeri(v: unknown): number[] {
  return Array.isArray(v) ? v.map(numeroDa).filter((n): n is number => n != null) : []
}

export function minutiAttesa(config: Record<string, unknown>): number {
  const q = numeroDa(config.quantita) ?? 0
  const u = (config.unita as UnitaAttesa) ?? 'GIORNI'
  return q * (u === 'MINUTI' ? 1 : u === 'ORE' ? 60 : 1440)
}

function regoleDa(v: unknown): MailingGruppoRegole | null {
  if (!v || typeof v !== 'object') return null
  const g = v as MailingGruppoRegole
  return Array.isArray(g.condizioni) ? g : null
}

function contaFoglie(g: MailingGruppoRegole): number {
  return g.condizioni.reduce((t, c) => t + ('condizioni' in c ? contaFoglie(c as MailingGruppoRegole) : 1), 0)
}

/** Che cosa controlla una condizione: apertura/click di un'email a monte oppure una regola. */
export function tipoCondizione(config: Record<string, unknown>): 'APERTO' | 'CLICCATO' | 'REGOLA' | null {
  if (stringaDa(config.haAperto)) return 'APERTO'
  if (stringaDa(config.haCliccato)) return 'CLICCATO'
  const r = regoleDa(config.regole)
  if (r) return 'REGOLA'
  return null
}

/** Configurazione iniziale di un nodo nuovo; per la condizione propone l'ultima email a monte. */
export function configIniziale(tipo: MailingTipoNodo, emailSopra: MailingNodo | null = null): Record<string, unknown> {
  switch (tipo) {
    case 'EMAIL':
      return { emailId: null }
    case 'ATTESA':
      return { quantita: 1, unita: 'GIORNI' }
    case 'ATTESA_FINO_A':
      return { giorni: [1, 2, 3, 4, 5], ora: '09:00' }
    case 'CONDIZIONE':
      return emailSopra ? { haAperto: emailSopra.id } : {}
    case 'AGGIUNGI_TAG':
    case 'RIMUOVI_TAG':
      return { tagId: null }
    case 'NOTIFICA_STAFF':
      return { testo: '' }
    default:
      return {}
  }
}

// ───────────────────────── Validazione ─────────────────────────

export type Gravita = 'ERRORE' | 'AVVISO'

export type ProblemaGrafo = {
  /** Nodo a cui si riferisce; ID_TRIGGER per il trigger; null per problemi generali. */
  nodoId: string | null
  gravita: Gravita
  codice: string
  messaggio: string
}

const ORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d$/

function emailVuota(e: MailingAutomazioneEmail): boolean {
  const blocchi = e.design?.blocchi?.length ?? 0
  const testo = (e.html ?? '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '').trim()
  return blocchi === 0 && !testo
}

/**
 * Problemi del grafo, in ordine di passo. ERRORE impedisce l'attivazione, AVVISO no.
 * `email` = email dell'automazione (per sapere se il nodo EMAIL ha contenuto).
 */
export function valida(grafo: MailingGrafo, email: MailingAutomazioneEmail[] = []): ProblemaGrafo[] {
  const problemi: ProblemaGrafo[] = []
  const nodi = mappaNodi(grafo)
  const perId = new Map(email.map((e) => [e.id, e]))
  const numeri = numerazione(grafo)

  if (!grafo.nodi.length) {
    return [{ nodoId: null, gravita: 'ERRORE', codice: 'VUOTO', messaggio: 'Aggiungi almeno un passo sotto il trigger.' }]
  }

  const rotti = grafo.archi.filter((a) => !nodi.has(a.da) || !nodi.has(a.a))
  if (rotti.length) {
    problemi.push({ nodoId: null, gravita: 'AVVISO', codice: 'ARCO_ROTTO', messaggio: `${rotti.length === 1 ? 'Un collegamento punta' : `${rotti.length} collegamenti puntano`} a un passo che non esiste più: verrà ignorato.` })
  }

  const inizio = nodoIniziale(grafo)
  const collegati = new Set(inizio ? raggiungibili(grafo, inizio.id) : [])
  const ciclo = nodiInCiclo(grafo)

  for (const nodo of grafo.nodi) {
    const p = (gravita: Gravita, codice: string, messaggio: string) => problemi.push({ nodoId: nodo.id, gravita, codice, messaggio })
    const c = nodo.config ?? {}

    if (!collegati.has(nodo.id)) p('ERRORE', 'ORFANO', 'Questo passo non è collegato al percorso: nessuno ci arriverà.')
    if (ciclo.has(nodo.id)) p('ERRORE', 'CICLO', 'Il percorso torna indietro su questo passo e girerebbe all’infinito.')

    // Uscite: ognuna al più un arco, e del tipo giusto.
    const uscite = usciteDi(nodo.tipo)
    const archiFuori = grafo.archi.filter((a) => a.da === nodo.id && nodi.has(a.a))
    for (const r of new Set(archiFuori.map((a) => a.ramo ?? null))) {
      if (!uscite.includes(r)) p('ERRORE', 'USCITA_NON_VALIDA', nodo.tipo === 'FINE' ? 'Dopo la fine non può esserci un altro passo.' : 'Un collegamento esce da questo passo in modo non valido.')
      else if (archiFuori.filter((a) => (a.ramo ?? null) === r).length > 1) p('ERRORE', 'USCITA_DOPPIA', 'Da questo passo partono due strade per la stessa uscita.')
    }

    switch (nodo.tipo) {
      case 'EMAIL': {
        const id = numeroDa(c.emailId)
        const e = id != null ? perId.get(id) : undefined
        if (!e) p('ERRORE', 'EMAIL_SENZA_CONTENUTO', 'Email ancora da scrivere.')
        else {
          if (!e.oggetto?.trim()) p('ERRORE', 'EMAIL_SENZA_OGGETTO', 'Manca l’oggetto dell’email.')
          if (emailVuota(e)) p('ERRORE', 'EMAIL_VUOTA', 'L’email è vuota: aprila nell’editor e scrivi il contenuto.')
        }
        break
      }
      case 'ATTESA': {
        const q = numeroDa(c.quantita)
        if (q == null || q <= 0) p('ERRORE', 'ATTESA_NON_VALIDA', 'Indica quanto aspettare.')
        else if (minutiAttesa(c) > 365 * 1440) p('AVVISO', 'ATTESA_LUNGA', 'Un’attesa di oltre un anno: sicuro?')
        break
      }
      case 'ATTESA_FINO_A': {
        if (!arrayNumeri(c.giorni).filter((g) => g >= 1 && g <= 7).length) p('ERRORE', 'GIORNI_MANCANTI', 'Scegli almeno un giorno della settimana.')
        if (!ORA_VALIDA.test(String(c.ora ?? ''))) p('ERRORE', 'ORA_NON_VALIDA', 'Indica un orario valido.')
        break
      }
      case 'CONDIZIONE': {
        const tipo = tipoCondizione(c)
        if (!tipo) p('ERRORE', 'CONDIZIONE_VUOTA', 'Scegli che cosa deve controllare la condizione.')
        else if (tipo === 'REGOLA') {
          if (!contaFoglie(regoleDa(c.regole) as MailingGruppoRegole)) p('ERRORE', 'CONDIZIONE_VUOTA', 'Aggiungi almeno una regola alla condizione.')
        } else {
          const rif = String(tipo === 'APERTO' ? c.haAperto : c.haCliccato)
          const target = nodi.get(rif)
          if (!target || target.tipo !== 'EMAIL') p('ERRORE', 'CONDIZIONE_RIFERIMENTO', 'La condizione guarda un’email che non c’è più.')
          else if (!antenati(grafo, nodo.id).has(rif)) p('ERRORE', 'CONDIZIONE_RIFERIMENTO', `L’email del passo ${numeri.get(rif)} arriva dopo questa condizione: scegline una precedente.`)
        }
        const si = archiFuori.some((a) => a.ramo === 'SI')
        const no = archiFuori.some((a) => a.ramo === 'NO')
        if (!si && !no) p('ERRORE', 'CONDIZIONE_SENZA_RAMI', 'La condizione non porta da nessuna parte: aggiungi un passo sul ramo Sì o No.')
        else if (!si || !no) p('AVVISO', 'CONDIZIONE_SENZA_RAMO', `Chi risponde «${si ? 'No' : 'Sì'}» esce dal percorso.`)
        break
      }
      case 'AGGIUNGI_TAG':
      case 'RIMUOVI_TAG':
        if (numeroDa(c.tagId) == null) p('ERRORE', 'TAG_MANCANTE', 'Scegli il tag.')
        break
      case 'NOTIFICA_STAFF':
        if (!stringaDa(c.testo)) p('ERRORE', 'TESTO_MANCANTE', 'Scrivi il testo del task.')
        break
      default:
        break
    }
  }

  if (!grafo.nodi.some((n) => n.tipo === 'EMAIL')) {
    problemi.push({ nodoId: null, gravita: 'AVVISO', codice: 'NESSUNA_EMAIL', messaggio: 'Il percorso non invia nessuna email.' })
  }

  const ordine = (p: ProblemaGrafo) => (p.nodoId ? numeri.get(p.nodoId) ?? 999 : 0)
  return problemi.sort((a, b) => ordine(a) - ordine(b) || (a.gravita === b.gravita ? 0 : a.gravita === 'ERRORE' ? -1 : 1))
}

/** Parametri richiesti dal trigger. */
export function validaTrigger(trigger: MailingTrigger | null | undefined): ProblemaGrafo[] {
  const p = (codice: string, messaggio: string): ProblemaGrafo => ({ nodoId: ID_TRIGGER, gravita: 'ERRORE', codice, messaggio })
  if (!trigger?.tipo) return [p('TRIGGER_MANCANTE', 'Scegli che cosa fa partire l’automazione.')]
  const par = trigger.parametri ?? {}
  switch (trigger.tipo) {
    case 'TAG_AGGIUNTO':
      return numeroDa(par.tagId) == null ? [p('TRIGGER_TAG', 'Scegli il tag che fa partire l’automazione.')] : []
    case 'ENTRATA_SEGMENTO':
      return numeroDa(par.segmentoId) == null ? [p('TRIGGER_SEGMENTO', 'Scegli il segmento.')] : []
    case 'INATTIVO_DA_GIORNI': {
      const g = numeroDa(par.giorni)
      if (g == null || g < 1) return [p('TRIGGER_GIORNI', 'Indica dopo quanti giorni senza visite parte.')]
      const max = numeroDa(par.maxIniziali)
      return par.includiGiaInattivi === true && max != null && max < 1 ? [p('TRIGGER_MAX', 'Il numero massimo al giorno parte da 1.')] : []
    }
    case 'COMPLEANNO': {
      const g = numeroDa(par.giorniPrima) ?? 0
      return g < 0 || g > 60 ? [p('TRIGGER_GIORNI', 'I giorni di anticipo vanno da 0 a 60.')] : []
    }
    case 'VISITA_EFFETTUATA': {
      const n = numeroDa(par.numero)
      return n != null && n < 1 ? [p('TRIGGER_NUMERO', 'Il numero della visita parte da 1.')] : []
    }
    default:
      return []
  }
}

// ───────────────────────── Modifiche ─────────────────────────

export function nuovoIdNodo(): string {
  const casuale = Math.random().toString(36).slice(2, 8).padEnd(6, '0')
  return `n_${casuale}`
}

/**
 * Dove inserire un passo: dopo il nodo `da` sull'uscita `ramo` (da null = subito dopo il trigger).
 * Se su quell'uscita c'è già un arco, il nuovo passo si mette in mezzo.
 */
export type PuntoInserimento = { da: string | null; ramo: Ramo }

/** Sposta in basso di `dy` i nodi indicati. */
function sposta(nodi: MailingNodo[], ids: Set<string>, dy: number): MailingNodo[] {
  return nodi.map((n) => (ids.has(n.id) ? { ...n, y: n.y + dy } : n))
}

export function inserisciDopo(
  grafo: MailingGrafo,
  punto: PuntoInserimento,
  tipo: MailingTipoNodo,
  opzioni: { id?: string; config?: Record<string, unknown> } = {},
): { grafo: MailingGrafo; nodoId: string } {
  const id = opzioni.id ?? nuovoIdNodo()
  const nodi = mappaNodi(grafo)
  const da = punto.da != null ? nodi.get(punto.da) ?? null : null
  if (punto.da != null && !da) return { grafo, nodoId: '' }

  // Successivo attuale su quel punto.
  let successivo: MailingNodo | null = null
  let arcoVecchio: MailingArco | null = null
  if (da) {
    arcoVecchio = arcoDa(grafo, da.id, punto.ramo)
    successivo = arcoVecchio ? nodi.get(arcoVecchio.a) ?? null : null
  } else {
    successivo = nodoIniziale(grafo)
  }

  // Posizione: al posto del successivo (che scende di un passo con tutto ciò che segue), o sotto l'uscita.
  let x: number
  let y: number
  let nuoviNodi = grafo.nodi
  if (successivo) {
    x = successivo.x
    y = successivo.y
    const daSpostare = new Set(raggiungibili(grafo, successivo.id))
    if (da) daSpostare.delete(da.id)
    nuoviNodi = sposta(nuoviNodi, daSpostare, PASSO_Y)
  } else if (da) {
    const scarto = punto.ramo === 'SI' ? -PASSO_X / 2 : punto.ramo === 'NO' ? PASSO_X / 2 : 0
    x = da.x + scarto
    y = da.y + PASSO_Y
  } else {
    x = 0
    y = 0
  }

  const emailSopra = tipo === 'CONDIZIONE'
    ? (() => {
        if (!da) return null
        const sopra = [da, ...emailAMonte(grafo, da.id).reverse()]
        return sopra.find((n) => n.tipo === 'EMAIL') ?? null
      })()
    : null
  const nuovo: MailingNodo = { id, tipo, config: opzioni.config ?? configIniziale(tipo, emailSopra), x: Math.round(x), y: Math.round(y) }

  const archi = arcoVecchio ? grafo.archi.filter((a) => a !== arcoVecchio) : [...grafo.archi]
  if (da) archi.push({ da: da.id, a: id, ramo: punto.ramo })
  // FINE non ha uscite: se inserita in mezzo, ciò che seguiva resta staccato (la validazione lo segnala).
  // La UI non la propone sugli archi già collegati.
  const uscitaNuovo = usciteDi(tipo)[0]
  if (successivo && uscitaNuovo !== undefined) archi.push({ da: id, a: successivo.id, ramo: uscitaNuovo })
  return { grafo: { nodi: [...nuoviNodi, nuovo], archi }, nodoId: id }
}

/** Nodi che spariscono eliminando la condizione e scartando il ramo `ramoScartato`: quelli raggiungibili solo da lì. */
export function nodiDelRamo(grafo: MailingGrafo, condizioneId: string, ramoScartato: 'SI' | 'NO'): string[] {
  const arco = arcoDa(grafo, condizioneId, ramoScartato)
  if (!arco) return []
  const senza: MailingGrafo = { nodi: grafo.nodi, archi: grafo.archi.filter((a) => a !== arco) }
  const inizio = nodoIniziale(grafo)
  const vivi = new Set(inizio ? raggiungibili(senza, inizio.id) : [])
  vivi.delete(condizioneId)
  return raggiungibili(grafo, arco.a).filter((id) => id !== condizioneId && !vivi.has(id))
}

/**
 * Elimina un nodo e ricollega: chi arrivava al nodo prosegue con il suo successivo.
 * Per una condizione si tiene il ramo `ramoDaTenere` (default SI) e si eliminano i passi raggiungibili solo dall'altro.
 * I nodi che seguivano risalgono di un passo se il nodo eliminato stava sopra di loro.
 */
export function eliminaNodo(grafo: MailingGrafo, nodoId: string, ramoDaTenere: 'SI' | 'NO' = 'SI'): MailingGrafo {
  const nodo = grafo.nodi.find((n) => n.id === nodoId)
  if (!nodo) return grafo
  const daTogliere = new Set<string>([nodoId])
  let successivo: string | null = null
  if (nodo.tipo === 'CONDIZIONE') {
    const scartato = ramoDaTenere === 'SI' ? 'NO' : 'SI'
    nodiDelRamo(grafo, nodoId, scartato).forEach((id) => daTogliere.add(id))
    successivo = arcoDa(grafo, nodoId, ramoDaTenere)?.a ?? null
  } else {
    successivo = grafo.archi.find((a) => a.da === nodoId)?.a ?? null
  }
  if (successivo && daTogliere.has(successivo)) successivo = null

  const entranti = grafo.archi.filter((a) => a.a === nodoId && !daTogliere.has(a.da))
  let archi = grafo.archi.filter((a) => !daTogliere.has(a.da) && !daTogliere.has(a.a))
  if (successivo) {
    for (const e of entranti) {
      // Evita di creare un anello su se stesso o un'uscita doppia.
      if (e.da === successivo) continue
      if (archi.some((a) => a.da === e.da && (a.ramo ?? null) === (e.ramo ?? null))) continue
      archi.push({ da: e.da, a: successivo, ramo: e.ramo ?? null })
    }
  }

  let nodi = grafo.nodi.filter((n) => !daTogliere.has(n.id))
  if (successivo) {
    const seguito = new Set(raggiungibili({ nodi, archi }, successivo))
    entranti.forEach((e) => seguito.delete(e.da))
    const minY = Math.min(...nodi.filter((n) => seguito.has(n.id)).map((n) => n.y))
    if (Number.isFinite(minY) && minY > nodo.y) nodi = sposta(nodi, seguito, -Math.min(PASSO_Y, minY - nodo.y))
  }
  // Riferimenti delle condizioni a email eliminate: si lasciano, la validazione li segnala.
  archi = archi.filter((a, i, tutti) => tutti.findIndex((b) => b.da === a.da && b.a === a.a && (b.ramo ?? null) === (a.ramo ?? null)) === i)
  return { nodi, archi }
}

/** Collega (o ricollega) l'uscita (da, ramo) al nodo `a`. Rifiuta anelli su se stesso e archi verso nodi inesistenti. */
export function collega(grafo: MailingGrafo, da: string, ramo: Ramo, a: string): MailingGrafo {
  if (da === a || !grafo.nodi.some((n) => n.id === a) || !grafo.nodi.some((n) => n.id === da)) return grafo
  const archi = grafo.archi.filter((x) => !(x.da === da && (x.ramo ?? null) === (ramo ?? null)))
  archi.push({ da, a, ramo })
  return { ...grafo, archi }
}

export function scollega(grafo: MailingGrafo, da: string, ramo: Ramo): MailingGrafo {
  return { ...grafo, archi: grafo.archi.filter((x) => !(x.da === da && (x.ramo ?? null) === (ramo ?? null))) }
}

export function aggiornaNodo(grafo: MailingGrafo, nodoId: string, modifica: Partial<Pick<MailingNodo, 'config' | 'x' | 'y'>>): MailingGrafo {
  return { ...grafo, nodi: grafo.nodi.map((n) => (n.id === nodoId ? { ...n, ...modifica } : n)) }
}

/** Duplica un nodo (non i suoi archi) un po' più in basso a destra. */
export function duplicaNodo(grafo: MailingGrafo, nodoId: string, id = nuovoIdNodo()): { grafo: MailingGrafo; nodoId: string } {
  const n = grafo.nodi.find((x) => x.id === nodoId)
  if (!n) return { grafo, nodoId: '' }
  const config =
    n.tipo === 'EMAIL'
      ? { ...n.config, emailId: null }
      : JSON.parse(JSON.stringify(n.config ?? {}))
  return { grafo: { ...grafo, nodi: [...grafo.nodi, { ...n, id, config, x: n.x + 32, y: n.y + 32 }] }, nodoId: id }
}

// ───────────────────────── Layout ─────────────────────────

/**
 * Auto-layout verticale: livelli per profondità (cammino più lungo dall'inizio), larghezza dei sottoalberi per le x,
 * rami SI a sinistra e NO a destra, nodi in cui si ricongiungono più rami centrati sotto i genitori.
 * I nodi non collegati finiscono in una colonna a destra. Il primo nodo resta dov'era (la vista non salta).
 */
export function autoLayout(grafo: MailingGrafo): MailingGrafo {
  if (!grafo.nodi.length) return grafo
  const inizio = nodoIniziale(grafo)
  if (!inizio) return grafo
  const ciclo = nodiInCiclo(grafo)
  const archi = archiValidi(grafo)
  const raggiunti = raggiungibili(grafo, inizio.id)
  const insieme = new Set(raggiunti)

  // Profondità = cammino più lungo (ignorando gli archi che chiudono un ciclo).
  const profondita = new Map<string, number>([[inizio.id, 0]])
  const ingressi = new Map<string, number>()
  for (const id of raggiunti) ingressi.set(id, 0)
  const archiDag = archi.filter((a) => insieme.has(a.da) && insieme.has(a.a) && !(ciclo.has(a.da) && ciclo.has(a.a)))
  for (const a of archiDag) ingressi.set(a.a, (ingressi.get(a.a) ?? 0) + 1)
  const coda = raggiunti.filter((id) => (ingressi.get(id) ?? 0) === 0)
  const ordineTopo: string[] = []
  while (coda.length) {
    const id = coda.shift() as string
    ordineTopo.push(id)
    for (const a of archiDag.filter((x) => x.da === id)) {
      profondita.set(a.a, Math.max(profondita.get(a.a) ?? 0, (profondita.get(id) ?? 0) + 1))
      ingressi.set(a.a, (ingressi.get(a.a) ?? 1) - 1)
      if (ingressi.get(a.a) === 0) coda.push(a.a)
    }
  }
  // Nodi su cicli: profondità dalla visita in ampiezza.
  raggiunti.forEach((id, i) => {
    if (!profondita.has(id)) profondita.set(id, i)
  })

  // Albero di copertura: ogni nodo appartiene al primo genitore che lo visita (SI prima di NO).
  const proprietario = new Map<string, string>()
  const figliAlbero = new Map<string, string[]>()
  for (const id of raggiunti) figliAlbero.set(id, [])
  const visti = new Set([inizio.id])
  const codaAlbero = [inizio.id]
  while (codaAlbero.length) {
    const id = codaAlbero.shift() as string
    for (const a of figli(grafo, id)) {
      if (visti.has(a.a)) continue
      // Un nodo in cui confluiscono più rami viene "adottato" quando tutti i genitori sono stati visitati.
      visti.add(a.a)
      proprietario.set(a.a, id)
      figliAlbero.get(id)?.push(a.a)
      codaAlbero.push(a.a)
    }
  }

  // Larghezze dei sottoalberi (in colonne). Una condizione con un solo ramo riserva comunque lo spazio dell'altro.
  const larghezza = new Map<string, number>()
  const calcola = (id: string): number => {
    const nodo = grafo.nodi.find((n) => n.id === id)
    const f = figliAlbero.get(id) ?? []
    let w = f.reduce((t, c) => t + calcola(c), 0)
    if (nodo?.tipo === 'CONDIZIONE') {
      const archiF = figli(grafo, id)
      const posseduti = archiF.filter((a) => proprietario.get(a.a) === id)
      if (posseduti.length < 2) w += 1
    }
    w = Math.max(1, w)
    larghezza.set(id, w)
    return w
  }
  calcola(inizio.id)

  const colonna = new Map<string, number>()
  const posiziona = (id: string, sinistra: number) => {
    const w = larghezza.get(id) ?? 1
    colonna.set(id, sinistra + w / 2)
    const nodo = grafo.nodi.find((n) => n.id === id)
    const archiF = figli(grafo, id).filter((a) => proprietario.get(a.a) === id)
    let cursore = sinistra
    if (nodo?.tipo === 'CONDIZIONE' && archiF.length === 1 && archiF[0].ramo === 'NO') cursore += 1
    for (const a of archiF) {
      posiziona(a.a, cursore)
      cursore += larghezza.get(a.a) ?? 1
    }
  }
  posiziona(inizio.id, 0)

  // Confluenze: centra sotto la media dei genitori e trascina il proprio sottoalbero.
  for (const id of ordineTopo) {
    const entranti = archiDag.filter((a) => a.a === id)
    if (entranti.length < 2) continue
    const media = entranti.reduce((t, a) => t + (colonna.get(a.da) ?? 0), 0) / entranti.length
    const delta = media - (colonna.get(id) ?? 0)
    if (Math.abs(delta) < 0.01) continue
    const sotto = new Set<string>()
    const pila = [id]
    while (pila.length) {
      const c = pila.pop() as string
      sotto.add(c)
      ;(figliAlbero.get(c) ?? []).forEach((f) => pila.push(f))
    }
    sotto.forEach((c) => colonna.set(c, (colonna.get(c) ?? 0) + delta))
  }

  const zeroCol = colonna.get(inizio.id) ?? 0
  const posizioni = new Map<string, { x: number; y: number }>()
  for (const id of raggiunti) {
    posizioni.set(id, {
      x: Math.round(inizio.x + ((colonna.get(id) ?? 0) - zeroCol) * PASSO_X),
      y: Math.round(inizio.y + (profondita.get(id) ?? 0) * PASSO_Y),
    })
  }

  // Orfani in colonna a destra, in ordine.
  const destra = Math.max(...[...posizioni.values()].map((p) => p.x)) + PASSO_X + 48
  let riga = 0
  for (const n of [...grafo.nodi].filter((x) => !insieme.has(x.id)).sort((a, b) => a.y - b.y || a.x - b.x)) {
    posizioni.set(n.id, { x: destra, y: inizio.y + riga++ * PASSO_Y })
  }

  return { ...grafo, nodi: grafo.nodi.map((n) => ({ ...n, ...(posizioni.get(n.id) ?? {}) })) }
}

export type Rettangolo = { x: number; y: number; larghezza: number; altezza: number }

/** Rettangolo che contiene tutti i nodi (+ il trigger sopra il primo). */
export function limiti(grafo: MailingGrafo, conTrigger = true): Rettangolo {
  const punti = grafo.nodi.map((n) => ({ x: n.x, y: n.y }))
  const t = posizioneTrigger(grafo)
  if (conTrigger) punti.push(t)
  if (!punti.length) return { x: 0, y: 0, larghezza: NODO_LARGHEZZA, altezza: NODO_ALTEZZA }
  const minX = Math.min(...punti.map((p) => p.x))
  const minY = Math.min(...punti.map((p) => p.y))
  const maxX = Math.max(...punti.map((p) => p.x)) + NODO_LARGHEZZA
  const maxY = Math.max(...punti.map((p) => p.y)) + NODO_ALTEZZA + 56
  return { x: minX, y: minY, larghezza: maxX - minX, altezza: maxY - minY }
}

/** Posizione del trigger: sopra il primo nodo (o all'origine se il grafo è vuoto). */
export function posizioneTrigger(grafo: MailingGrafo): { x: number; y: number } {
  const inizio = nodoIniziale(grafo)
  return inizio ? { x: inizio.x, y: inizio.y - PASSO_Y } : { x: 0, y: -PASSO_Y }
}

/** Punto di uscita (in basso) di un nodo per il ramo dato, e punto d'ingresso (in alto). */
export function puntoUscita(n: { x: number; y: number; tipo?: MailingTipoNodo }, ramo: Ramo): { x: number; y: number } {
  const frazione = n.tipo === 'CONDIZIONE' ? (ramo === 'NO' ? 0.74 : 0.26) : 0.5
  return { x: n.x + NODO_LARGHEZZA * frazione, y: n.y + NODO_ALTEZZA }
}

export function puntoIngresso(n: { x: number; y: number }): { x: number; y: number } {
  return { x: n.x + NODO_LARGHEZZA / 2, y: n.y }
}

/** Curva di Bézier verticale tra due punti; se la destinazione sta sopra, gira attorno con un'ansa laterale. */
export function percorsoArco(p: { x: number; y: number }, q: { x: number; y: number }): string {
  const dy = q.y - p.y
  if (dy >= 24) {
    const c = Math.max(28, dy / 2)
    return `M${p.x},${p.y} C${p.x},${p.y + c} ${q.x},${q.y - c} ${q.x},${q.y}`
  }
  // Arco all'indietro: esce in basso, gira di lato fuori dalle card e rientra dall'alto.
  const xs = latoAnsa(p, q)
  return `M${p.x},${p.y} C${p.x},${p.y + 90} ${xs},${p.y + 90} ${xs},${(p.y + q.y) / 2} S${q.x},${q.y - 90} ${q.x},${q.y}`
}

function latoAnsa(p: { x: number; y: number }, q: { x: number; y: number }): number {
  return q.x < p.x ? Math.min(p.x, q.x) - NODO_LARGHEZZA * 0.8 : Math.max(p.x, q.x) + NODO_LARGHEZZA * 0.8
}

/** Punto a metà di una Bézier cubica (t = 0.5) per piazzare "+" ed etichette. */
export function puntoMedio(p: { x: number; y: number }, q: { x: number; y: number }): { x: number; y: number } {
  const dy = q.y - p.y
  if (dy >= 24) return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
  return { x: latoAnsa(p, q), y: (p.y + q.y) / 2 }
}

// ───────────────────────── Report ─────────────────────────

/**
 * Flusso su ciascun arco (persone passate di lì), dal report per nodo. Se la destinazione ha un solo arco entrante
 * è il suo "entrati"; nelle confluenze si divide in parti uguali (il backend non dà il dettaglio per arco).
 * Chiave: `${da}|${ramo}` (da = ID_TRIGGER per l'arco dal trigger al primo nodo).
 */
export function flussiArchi(grafo: MailingGrafo, report: MailingReportNodo[]): Map<string, number> {
  const perNodo = new Map(report.map((r) => [r.nodoId, r]))
  const archi = archiValidi(grafo)
  const flussi = new Map<string, number>()
  for (const a of archi) {
    const entranti = archi.filter((x) => x.a === a.a).length
    const entrati = perNodo.get(a.a)?.entrati ?? 0
    flussi.set(`${a.da}|${a.ramo ?? ''}`, entranti > 1 ? Math.round(entrati / entranti) : entrati)
  }
  const inizio = nodoIniziale(grafo)
  if (inizio) flussi.set(`${ID_TRIGGER}|`, perNodo.get(inizio.id)?.entrati ?? 0)
  return flussi
}

/** Durata minima del percorso più lungo in minuti (somma delle attese); ATTESA_FINO_A conta fino a 7 giorni. */
export function durataPercorso(grafo: MailingGrafo): number {
  const inizio = nodoIniziale(grafo)
  if (!inizio) return 0
  const ciclo = nodiInCiclo(grafo)
  const memo = new Map<string, number>()
  const peso = (n: MailingNodo) => (n.tipo === 'ATTESA' ? minutiAttesa(n.config ?? {}) : n.tipo === 'ATTESA_FINO_A' ? 1440 * 3.5 : 0)
  const nodi = mappaNodi(grafo)
  const visita = (id: string, pila: Set<string>): number => {
    if (memo.has(id)) return memo.get(id) as number
    if (pila.has(id) || ciclo.has(id)) return 0
    pila.add(id)
    const n = nodi.get(id)
    const resto = Math.max(0, ...figli(grafo, id).map((a) => visita(a.a, pila)))
    pila.delete(id)
    const v = (n ? peso(n) : 0) + resto
    memo.set(id, v)
    return v
  }
  return visita(inizio.id, new Set())
}

export function descriviDurata(minuti: number): string {
  if (minuti <= 0) return 'subito'
  if (minuti < 60) return `${Math.round(minuti)} min`
  if (minuti < 1440) {
    const ore = Math.round(minuti / 60)
    return ore === 1 ? '1 ora' : `${ore} ore`
  }
  const giorni = Math.round(minuti / 1440)
  if (giorni < 14) return giorni === 1 ? '1 giorno' : `${giorni} giorni`
  if (giorni < 60) return `${Math.round(giorni / 7)} settimane`
  return `${Math.round(giorni / 30)} mesi`
}

// ───────────────────────── Testi ─────────────────────────

export type ContestoDescrizioni = {
  tag?: MailingTag[]
  segmenti?: MailingSegmento[]
  catalogo?: MailingCatalogoCampo[]
}

const GIORNI_BREVI = ['', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
const GIORNI_LUNGHI = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica']

function etichettaOpzione(contesto: ContestoDescrizioni, campo: string, valore: unknown): string | null {
  if (valore == null || valore === '') return null
  const opz = contesto.catalogo?.find((c) => c.campo === campo)?.opzioni ?? []
  const trovata = opz.find((o) => o.valore === String(valore))
  return trovata?.etichetta ?? String(valore).toLowerCase().replace(/_/g, ' ')
}

function nomeTag(contesto: ContestoDescrizioni, id: unknown): string | null {
  const n = numeroDa(id)
  if (n == null) return null
  return contesto.tag?.find((t) => t.id === n)?.nome ?? `tag #${n}`
}

function nomeSegmento(contesto: ContestoDescrizioni, id: unknown): string | null {
  const n = numeroDa(id)
  if (n == null) return null
  return contesto.segmenti?.find((s) => s.id === n)?.nome ?? `segmento #${n}`
}

function ordinale(n: number): string {
  return `${n}ª`
}

export const ETICHETTE_TRIGGER: Record<MailingTipoTrigger, string> = {
  NUOVO_LEAD: 'Nuovo lead',
  CONOSCITIVA_PRENOTATA: 'Chiamata conoscitiva prenotata',
  CONOSCITIVA_SVOLTA: 'Chiamata conoscitiva svolta',
  ESITO_CONOSCITIVA: 'Esito della chiamata',
  PRIMA_VISITA_PRENOTATA: 'Prima visita prenotata',
  PRIMA_VISITA_EFFETTUATA: 'Prima visita effettuata',
  VISITA_EFFETTUATA: 'Visita effettuata',
  ACQUISTO: 'Percorso acquistato',
  TAG_AGGIUNTO: 'Tag aggiunto',
  COMPLEANNO: 'Compleanno',
  INATTIVO_DA_GIORNI: 'Paziente inattivo',
  ENTRATA_SEGMENTO: 'Entra in un segmento',
  ISCRIZIONE: 'Nuovo iscritto',
  MANUALE: 'A mano',
}

/** Esiti della chiamata conoscitiva (parametro `esito` di ESITO_CONOSCITIVA). */
export const ETICHETTE_ESITO_CONOSCITIVA: Record<string, string> = {
  INTERESSATO: 'Interessato',
  CI_PENSA: 'Ci pensa',
  ACQUISTATO: 'Ha acquistato',
  NON_ADATTO: 'Non adatto',
}

/** Percorsi acquistabili (parametro `tipoPercorso` di ACQUISTO). */
export const ETICHETTE_TIPO_PERCORSO: Record<string, string> = {
  METODO_BUSSOLA: 'Metodo Bussola',
  RINNOVO: 'Rinnovo',
  MANTENIMENTO: 'Mantenimento',
}

function etichettaDa(mappa: Record<string, string>, v: unknown): string | null {
  const s = stringaDa(v)
  return s ? mappa[s] ?? s : null
}

/** Il trigger in una frase: «Quando arriva un nuovo lead da Instagram». */
export function descriviTrigger(trigger: MailingTrigger | null | undefined, contesto: ContestoDescrizioni = {}): string {
  if (!trigger?.tipo) return 'Scegli che cosa fa partire l’automazione'
  const p = trigger.parametri ?? {}
  switch (trigger.tipo) {
    case 'NUOVO_LEAD': {
      // fonte: una stringa o un elenco (YOUTUBE, INSTAGRAM, MASTERCLASS, LIBRO, PASSAPAROLA, SITO, ALTRO)
      const fonti = (Array.isArray(p.fonte) ? p.fonte : [p.fonte]).map((f) => etichettaOpzione(contesto, 'fonte', f)).filter((f): f is string => !!f)
      return `Quando arriva un nuovo lead${fonti.length ? ` da ${fonti.length > 1 ? `${fonti.slice(0, -1).join(', ')} o ${fonti[fonti.length - 1]}` : fonti[0]}` : ''}`
    }
    case 'CONOSCITIVA_PRENOTATA':
      return 'Quando qualcuno prenota la chiamata conoscitiva'
    case 'CONOSCITIVA_SVOLTA':
      return 'Quando la chiamata conoscitiva è stata svolta'
    case 'ESITO_CONOSCITIVA': {
      const esito = etichettaDa(ETICHETTE_ESITO_CONOSCITIVA, p.esito)
      return esito ? `Quando la chiamata conoscitiva si chiude con «${esito}»` : 'Quando viene registrato l’esito della chiamata'
    }
    case 'PRIMA_VISITA_PRENOTATA':
      return 'Quando qualcuno prenota la prima visita'
    case 'PRIMA_VISITA_EFFETTUATA':
      return 'Quando un paziente ha fatto la prima visita'
    case 'VISITA_EFFETTUATA': {
      const n = numeroDa(p.numero)
      return n ? `Quando un paziente ha fatto la ${ordinale(n)} visita` : 'Dopo ogni visita effettuata'
    }
    case 'ACQUISTO': {
      const percorso = etichettaDa(ETICHETTE_TIPO_PERCORSO, p.tipoPercorso)
      return percorso ? `Quando un paziente acquista il percorso ${percorso}` : 'Quando un paziente acquista un percorso'
    }
    case 'TAG_AGGIUNTO': {
      const t = nomeTag(contesto, p.tagId)
      return t ? `Quando un contatto riceve il tag «${t}»` : 'Quando un contatto riceve un tag'
    }
    case 'COMPLEANNO': {
      const g = numeroDa(p.giorniPrima) ?? 0
      return g > 0 ? `${g === 1 ? 'Il giorno' : `${g} giorni`} prima del compleanno` : 'Il giorno del compleanno'
    }
    case 'INATTIVO_DA_GIORNI': {
      const g = numeroDa(p.giorni)
      const base = g ? `Quando un paziente non viene da ${g} giorni` : 'Quando un paziente non viene da un po’'
      return p.includiGiaInattivi === true ? `${base} (anche chi lo è già)` : base
    }
    case 'ENTRATA_SEGMENTO': {
      const s = nomeSegmento(contesto, p.segmentoId)
      return s ? `Quando un contatto entra nel segmento «${s}»` : 'Quando un contatto entra in un segmento'
    }
    case 'ISCRIZIONE':
      return 'Quando qualcuno si iscrive alla newsletter'
    case 'MANUALE':
      return 'Quando lo iscrivi tu (o un’altra automazione)'
    default:
      return 'Trigger sconosciuto'
  }
}

/** Uscita "prenota una visita qualsiasi" (usata dal modello riattivazione-dormienti). */
export const TIPO_USCITA_VISITA_PRENOTATA = 'VISITA_PRENOTATA'

/** La regola d'uscita in una frase. La disiscrizione fa sempre uscire e non serve dirlo qui. */
export function descriviUscita(uscita: MailingTrigger | null | undefined, contesto: ContestoDescrizioni = {}): string {
  if (!uscita?.tipo) return 'Nessuna uscita anticipata: arriva fino in fondo'
  const p = uscita.parametri ?? {}
  // VISITA_PRENOTATA (qualsiasi visita) esiste solo come uscita: non è nel tipo MailingTipoTrigger del contratto.
  if ((uscita.tipo as string) === TIPO_USCITA_VISITA_PRENOTATA) return 'Esce appena prenota una visita'
  switch (uscita.tipo) {
    case 'PRIMA_VISITA_PRENOTATA':
      return 'Esce appena prenota la prima visita'
    case 'PRIMA_VISITA_EFFETTUATA':
      return 'Esce appena fa la prima visita'
    case 'VISITA_EFFETTUATA':
      return 'Esce appena fa una visita'
    case 'CONOSCITIVA_PRENOTATA':
      return 'Esce appena prenota la chiamata conoscitiva'
    case 'ACQUISTO': {
      const percorso = etichettaDa(ETICHETTE_TIPO_PERCORSO, p.tipoPercorso)
      return percorso ? `Esce appena acquista il percorso ${percorso}` : 'Esce appena acquista un percorso'
    }
    case 'TAG_AGGIUNTO': {
      const t = nomeTag(contesto, p.tagId)
      return t ? `Esce se riceve il tag «${t}»` : 'Esce se riceve un tag'
    }
    case 'ENTRATA_SEGMENTO': {
      const s = nomeSegmento(contesto, p.segmentoId)
      return s ? `Esce se entra nel segmento «${s}»` : 'Esce se entra in un segmento'
    }
    default:
      return `Esce con: ${ETICHETTE_TRIGGER[uscita.tipo]?.toLowerCase() ?? uscita.tipo}`
  }
}

export const ETICHETTE_NODO: Record<MailingTipoNodo, string> = {
  EMAIL: 'Invia email',
  ATTESA: 'Aspetta',
  ATTESA_FINO_A: 'Aspetta fino a',
  CONDIZIONE: 'Condizione',
  AGGIUNGI_TAG: 'Aggiungi tag',
  RIMUOVI_TAG: 'Togli tag',
  NOTIFICA_STAFF: 'Crea task',
  FINE: 'Fine',
}

function elencoUmano(voci: string[]): string {
  if (voci.length <= 1) return voci[0] ?? ''
  return `${voci.slice(0, -1).join(', ')} e ${voci[voci.length - 1]}`
}

export function descriviGiorni(giorni: number[]): string {
  const g = [...new Set(giorni)].filter((x) => x >= 1 && x <= 7).sort()
  if (!g.length) return 'nessun giorno'
  if (g.length === 7) return 'qualsiasi giorno'
  if (g.join() === '1,2,3,4,5') return 'un giorno feriale'
  if (g.join() === '6,7') return 'il fine settimana'
  if (g.length === 1) return GIORNI_LUNGHI[g[0]]
  return elencoUmano(g.map((x) => GIORNI_BREVI[x]))
}

export function descriviAttesa(config: Record<string, unknown>): string {
  const q = numeroDa(config.quantita) ?? 0
  const u = (config.unita as UnitaAttesa) ?? 'GIORNI'
  if (q <= 0) return 'Quanto aspettare?'
  const unita = u === 'MINUTI' ? (q === 1 ? 'minuto' : 'minuti') : u === 'ORE' ? (q === 1 ? 'ora' : 'ore') : q === 1 ? 'giorno' : 'giorni'
  return `${q} ${unita}`
}

/**
 * Riassunto breve del nodo per la card: titolo e dettaglio.
 * `email` per l'oggetto, `numeri` per citare il passo delle condizioni.
 */
/** Testo della card di un passo. */
export type RiassuntoNodo = { titolo: string; dettaglio: string }

export function riassuntoNodo(
  nodo: MailingNodo,
  ctx: ContestoDescrizioni & { email?: MailingAutomazioneEmail[]; numeri?: Map<string, number>; descriviRegole?: (r: MailingGruppoRegole) => string },
): RiassuntoNodo {
  const c = nodo.config ?? {}
  switch (nodo.tipo) {
    case 'EMAIL': {
      const e = ctx.email?.find((x) => x.id === numeroDa(c.emailId))
      if (!e) return { titolo: 'Email da scrivere', dettaglio: 'Tocca per scegliere oggetto e contenuto' }
      return { titolo: e.oggetto?.trim() || 'Senza oggetto', dettaglio: e.preheader?.trim() || e.nome?.trim() || 'Nessuna anteprima' }
    }
    case 'ATTESA':
      return { titolo: `Aspetta ${descriviAttesa(c)}`, dettaglio: 'Poi prosegue al passo successivo' }
    case 'ATTESA_FINO_A': {
      const giorni = arrayNumeri(c.giorni)
      const ora = String(c.ora ?? '')
      return { titolo: `Aspetta ${descriviGiorni(giorni)}`, dettaglio: ORA_VALIDA.test(ora) ? `alle ${ora}` : 'Scegli l’orario' }
    }
    case 'CONDIZIONE': {
      const tipo = tipoCondizione(c)
      if (tipo === 'APERTO' || tipo === 'CLICCATO') {
        const rif = String(tipo === 'APERTO' ? c.haAperto : c.haCliccato)
        const n = ctx.numeri?.get(rif)
        return { titolo: tipo === 'APERTO' ? 'Ha aperto l’email?' : 'Ha cliccato un link?', dettaglio: n ? `Email del passo ${n}` : 'Email non trovata' }
      }
      if (tipo === 'REGOLA') {
        const r = regoleDa(c.regole) as MailingGruppoRegole
        const testo = ctx.descriviRegole ? ctx.descriviRegole(r) : `${contaFoglie(r)} regole`
        return { titolo: 'Corrisponde alla regola?', dettaglio: testo || 'Nessuna regola' }
      }
      return { titolo: 'Condizione da impostare', dettaglio: 'Scegli che cosa controllare' }
    }
    case 'AGGIUNGI_TAG':
    case 'RIMUOVI_TAG': {
      const t = nomeTag(ctx, c.tagId)
      return { titolo: t ? `«${t}»` : 'Tag da scegliere', dettaglio: nodo.tipo === 'AGGIUNGI_TAG' ? 'Aggiunge il tag al contatto' : 'Toglie il tag al contatto' }
    }
    case 'NOTIFICA_STAFF': {
      const testo = stringaDa(c.testo)
      return { titolo: testo ?? 'Task da scrivere', dettaglio: 'Crea un task per il dottore' }
    }
    case 'FINE':
      return { titolo: 'Fine del percorso', dettaglio: 'Il contatto ha completato l’automazione' }
    default:
      return { titolo: nodo.tipo, dettaglio: '' }
  }
}
