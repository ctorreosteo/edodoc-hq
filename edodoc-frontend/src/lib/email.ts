export type TipoEmail = "SOLLECITO_PAGAMENTO" | "DATI_FATTURAZIONE" | "FATTURA"

export type RichiestaEmail = { tipo: TipoEmail; pazienteId?: number | null; pagamentoId?: number | null; fatturaId?: number | null }

export const EMAIL: Record<TipoEmail, { voce: string; titolo: string; bottone: string; toast: string }> = {
  SOLLECITO_PAGAMENTO: { voce: "Sollecito pagamento", titolo: "Sollecito pagamento", bottone: "Invia sollecito", toast: "Sollecito inviato" },
  DATI_FATTURAZIONE: { voce: "Richiesta dati fatturazione", titolo: "Richiesta dati fatturazione", bottone: "Invia richiesta", toast: "Richiesta inviata" },
  FATTURA: { voce: "Fattura", titolo: "Invia fattura", bottone: "Invia fattura", toast: "Fattura inviata" },
}

/** Testo di un modello → HTML per l'editor: righe vuote = paragrafi, a capo = <br>. */
export function testoInHtml(testo: string): string {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return testo
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("")
}
