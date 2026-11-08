import type { Alimento, ContenutoDieta, Giornata, OpzionePasto, Pasto } from "@/types"

/** Id delle voci: servono solo all'editor (chiavi di React e focus), il backend li salva com'è. */
export const nuovoId = () => Math.random().toString(36).slice(2, 10)

export const nuovoAlimento = (): Alimento => ({ id: nuovoId(), nome: "", quantita: null, nota: null })
export const nuovaOpzione = (): OpzionePasto => ({ id: nuovoId(), nome: null, alimenti: [nuovoAlimento()], nota: null })
export const nuovoPasto = (nome = "Nuovo pasto", orario: string | null = null): Pasto => ({ id: nuovoId(), nome, orario, nota: null, opzioni: [nuovaOpzione()] })
export const nuovaGiornata = (nome: string): Giornata => ({
  id: nuovoId(), nome, nota: null,
  pasti: [nuovoPasto("Colazione", "07:30"), nuovoPasto("Spuntino", "10:30"), nuovoPasto("Pranzo", "13:00"), nuovoPasto("Merenda", "16:30"), nuovoPasto("Cena", "20:00")],
})

/** Copia profonda con id nuovi: una giornata o un pasto duplicato non condivide chiavi con l'originale. */
export function duplicaPasto(p: Pasto): Pasto {
  return { ...p, id: nuovoId(), opzioni: p.opzioni.map((o) => ({ ...o, id: nuovoId(), alimenti: o.alimenti.map((a) => ({ ...a, id: nuovoId() })) })) }
}
export function duplicaGiornata(g: Giornata, nome: string): Giornata {
  return { ...g, id: nuovoId(), nome, pasti: g.pasti.map(duplicaPasto) }
}

export const PASTI_SUGGERITI = ["Colazione", "Spuntino", "Pranzo", "Merenda", "Cena", "Pre-allenamento", "Post-allenamento", "Dopo cena"]
export const GIORNI_SETTIMANA = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"]

/** Le kcal scritte dal dottore vincono; senza, si stimano dai macronutrienti (4, 4, 9 kcal per grammo). */
export function kcalDaMacro(c: Pick<ContenutoDieta, "proteine" | "carboidrati" | "grassi">) {
  return (c.proteine ?? 0) * 4 + (c.carboidrati ?? 0) * 4 + (c.grassi ?? 0) * 9
}

export function ripartizione(c: Pick<ContenutoDieta, "proteine" | "carboidrati" | "grassi">) {
  const totale = kcalDaMacro(c)
  if (totale <= 0) return null
  const pct = (kcal: number) => Math.round((kcal * 100) / totale)
  return { totale, proteine: pct((c.proteine ?? 0) * 4), carboidrati: pct((c.carboidrati ?? 0) * 4), grassi: pct((c.grassi ?? 0) * 9) }
}

export function conteggi(c: ContenutoDieta) {
  const pasti = c.giornate.reduce((s, g) => s + g.pasti.length, 0)
  const alimenti = new Set<string>()
  for (const g of c.giornate) for (const p of g.pasti) for (const o of p.opzioni) for (const a of o.alimenti) {
    if (a.nome.trim()) alimenti.add(a.nome.trim().toLowerCase())
  }
  return { giornate: c.giornate.length, pasti, alimenti: alimenti.size }
}

/** Il backend restituisce le liste sempre presenti; qui si difende solo l'editor da contenuti vecchi o parziali. */
export function normalizza(c: Partial<ContenutoDieta>): ContenutoDieta {
  return {
    obiettivo: c.obiettivo ?? null, kcal: c.kcal ?? null, proteine: c.proteine ?? null, carboidrati: c.carboidrati ?? null,
    grassi: c.grassi ?? null, acquaLitri: c.acquaLitri ?? null, introduzione: c.introduzione ?? null,
    giornate: c.giornate ?? [], consigli: c.consigli ?? [], liberi: c.liberi ?? [], limitare: c.limitare ?? [],
    integrazione: c.integrazione ?? [], listaSpesa: c.listaSpesa ?? true,
  }
}

/** Primo aiuto alla scrittura: si aggiungono da soli gli alimenti già usati nelle altre diete. */
export const ALIMENTI_COMUNI = [
  "Acqua frizzante", "Albicocche", "Albume d'uovo", "Arance", "Avocado", "Banana", "Barrette proteiche", "Bresaola", "Broccoli",
  "Burro di arachidi 100%", "Caffè", "Cannellini", "Carciofi", "Carote", "Cavolfiore", "Ceci", "Cetrioli", "Cioccolato fondente 85%",
  "Cous cous integrale", "Crackers integrali", "Fagiolini", "Farro", "Fesa di tacchino", "Fette biscottate integrali", "Fiocchi d'avena",
  "Fiocchi di latte", "Finocchi", "Formaggio fresco spalmabile light", "Fragole", "Frutta di stagione", "Frutti di bosco", "Funghi",
  "Gallette di riso", "Grana Padano", "Hummus", "Insalata mista", "Kefir", "Kiwi", "Latte parzialmente scremato", "Lenticchie",
  "Mandorle", "Mela", "Melanzane", "Merluzzo", "Miele", "Mozzarella light", "Noci", "Nocciole", "Olio extravergine d'oliva",
  "Orata", "Orzo", "Pane di segale", "Pane integrale", "Parmigiano Reggiano", "Pasta di legumi", "Pasta integrale", "Patate",
  "Patate dolci", "Peperoni", "Pera", "Pesce spada", "Petto di pollo", "Piselli", "Pomodori", "Prosciutto crudo sgrassato",
  "Quinoa", "Ricotta", "Riso basmati", "Riso integrale", "Rucola", "Salmone", "Salmone affumicato", "Semi di chia", "Semi di lino",
  "Skyr bianco", "Spinaci", "Tofu al naturale", "Tonno al naturale", "Uova", "Verdure di stagione", "Verdure grigliate",
  "Yogurt greco 0%", "Yogurt bianco intero", "Zucca", "Zucchine",
]

export const QUANTITA_SUGGERITE = ["a piacere", "1 porzione", "1 frutto", "1 vasetto", "1 cucchiaino", "1 cucchiaio", "1 tazza"]
