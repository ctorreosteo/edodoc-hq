/*
  Ricorrenze che il calendario del Planner mostra come spunti: giornate mondiali della salute che c'entrano con
  nutrizione e mentalità, feste e date commerciali. Solo date certe: fisse, o calcolate con una regola nota (Pasqua, festa della
  mamma, Black Friday). Il tipo "salute" è quello che conta per il piano editoriale.
*/

export type TipoGiornata = "salute" | "festa" | "marketing"
export type Giornata = { giorno: string; nome: string; tipo: TipoGiornata }

const FISSE: [string, string, TipoGiornata][] = [
  ["01-01", "Capodanno", "festa"],
  ["02-04", "Giornata mondiale contro il cancro", "salute"],
  ["02-05", "Giornata nazionale di prevenzione dello spreco alimentare", "salute"],
  ["02-14", "San Valentino", "marketing"],
  ["03-04", "Giornata mondiale dell'obesità", "salute"],
  ["03-08", "Festa della donna", "festa"],
  ["03-19", "Festa del papà", "festa"],
  ["03-20", "Giornata internazionale della felicità", "marketing"],
  ["03-22", "Giornata mondiale dell'acqua", "salute"],
  ["04-06", "Giornata mondiale dell'attività fisica", "salute"],
  ["04-07", "Giornata mondiale della salute", "salute"],
  ["04-25", "Festa della Liberazione", "festa"],
  ["04-28", "Giornata mondiale per la salute e sicurezza sul lavoro", "salute"],
  ["05-01", "Festa dei lavoratori", "festa"],
  ["05-17", "Giornata mondiale dell'ipertensione", "salute"],
  ["05-31", "Giornata mondiale senza tabacco", "salute"],
  ["06-02", "Festa della Repubblica", "festa"],
  ["06-03", "Giornata mondiale della bicicletta", "salute"],
  ["06-07", "Giornata mondiale della sicurezza alimentare", "salute"],
  ["06-21", "Giornata internazionale dello yoga", "salute"],
  ["08-15", "Ferragosto", "festa"],
  ["09-21", "Giornata mondiale dell'Alzheimer", "salute"],
  ["09-29", "Giornata mondiale del cuore", "salute"],
  ["10-01", "Giornata internazionale delle persone anziane", "salute"],
  ["10-10", "Giornata mondiale della salute mentale", "salute"],
  ["10-16", "Giornata mondiale dell'alimentazione", "salute"],
  ["11-13", "Giornata mondiale della gentilezza", "marketing"],
  ["11-14", "Giornata mondiale del diabete", "salute"],
  ["12-03", "Giornata internazionale delle persone con disabilità", "salute"],
  ["12-08", "Immacolata", "festa"],
  ["12-24", "Vigilia di Natale", "festa"],
  ["12-25", "Natale", "festa"],
  ["12-26", "Santo Stefano", "festa"],
  ["12-31", "San Silvestro", "festa"],
]

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10)

/** Domenica di Pasqua (algoritmo di Meeus/Jones/Butcher). */
function pasqua(y: number): string {
  const a = y % 19
  const b = Math.floor(y / 100)
  const c = y % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mese = Math.floor((h + l - 7 * m + 114) / 31)
  const giorno = ((h + l - 7 * m + 114) % 31) + 1
  return iso(y, mese, giorno)
}

/** n-esimo giorno della settimana del mese (dow 0 = domenica); n = -1 l'ultimo. */
function ennesimo(y: number, mese: number, dow: number, n: number): string {
  if (n > 0) {
    const primo = new Date(Date.UTC(y, mese - 1, 1)).getUTCDay()
    return iso(y, mese, 1 + ((dow - primo + 7) % 7) + (n - 1) * 7)
  }
  const ultimoGiorno = new Date(Date.UTC(y, mese, 0))
  const diff = (ultimoGiorno.getUTCDay() - dow + 7) % 7
  return iso(y, mese, ultimoGiorno.getUTCDate() - diff)
}

function dellAnno(y: number): Giornata[] {
  const out: Giornata[] = FISSE.map(([md, nome, tipo]) => ({ giorno: `${y}-${md}`, nome, tipo }))
  const p = pasqua(y)
  const pasquetta = new Date(`${p}T00:00:00Z`)
  pasquetta.setUTCDate(pasquetta.getUTCDate() + 1)
  out.push({ giorno: p, nome: "Pasqua", tipo: "festa" })
  out.push({ giorno: pasquetta.toISOString().slice(0, 10), nome: "Pasquetta", tipo: "festa" })
  out.push({ giorno: ennesimo(y, 5, 0, 2), nome: "Festa della mamma", tipo: "festa" })
  out.push({ giorno: ennesimo(y, 5, 0, -1), nome: "Giornata nazionale del sollievo", tipo: "salute" })
  const ringraziamento = ennesimo(y, 11, 4, 4)
  const bf = new Date(`${ringraziamento}T00:00:00Z`)
  bf.setUTCDate(bf.getUTCDate() + 1)
  out.push({ giorno: bf.toISOString().slice(0, 10), nome: "Black Friday", tipo: "marketing" })
  return out
}

/** Le ricorrenze fra due giorni "yyyy-MM-dd" (inclusi), in ordine. */
export function giornateNelPeriodo(dal: string, al: string): Giornata[] {
  const anni = new Set<number>()
  for (let y = Number(dal.slice(0, 4)); y <= Number(al.slice(0, 4)); y++) anni.add(y)
  return [...anni]
    .flatMap(dellAnno)
    .filter((g) => g.giorno >= dal && g.giorno <= al)
    .sort((a, b) => a.giorno.localeCompare(b.giorno))
}
