import type { MailingCampagna, MailingCampagnaInput, MailingPubblico, MailingStatoCampagna, MailingTestAb } from '@/services/mailing-service'
import { normalizzaDocumento, renderEmail } from '@/lib/mailing-render'

/* Utilità delle campagne condivise da elenco, procedura guidata e report (senza componenti). */

export const STATI_IN_CORSO: MailingStatoCampagna[] = ['IN_INVIO', 'TEST_AB', 'IN_PAUSA']
export const STATI_MODIFICABILI: MailingStatoCampagna[] = ['BOZZA', 'PROGRAMMATA']
export const STATI_ELIMINABILI: MailingStatoCampagna[] = ['BOZZA', 'ANNULLATA', 'PROGRAMMATA']

export function haReport(stato: MailingStatoCampagna): boolean {
  return !STATI_MODIFICABILI.includes(stato)
}

export function pubblicoVuoto(): MailingPubblico {
  return { tutti: true, segmentiIds: [], tagIds: [], regole: null, esclusiSegmentiIds: [], esclusiTagIds: [] }
}

export function testAbVuoto(oggetto: string | null, preheader: string | null): MailingTestAb {
  return {
    varianti: [
      { chiave: 'A', oggetto: oggetto ?? '', preheader },
      { chiave: 'B', oggetto: '', preheader },
    ],
    percentualeTest: 20,
    metrica: 'APERTURE',
    oreAttesa: 4,
    vincitore: null,
    decisoIl: null,
  }
}

/** HTML definitivo: con A/B l'oggetto e il preheader "principali" sono quelli della variante A. */
export function htmlCampagna(c: MailingCampagna): string | null {
  if (!c.design) return c.html
  return renderEmail(normalizzaDocumento(c.design), { preheader: c.preheader, titolo: c.oggetto })
}

export function inputDa(c: MailingCampagna): MailingCampagnaInput {
  return {
    nome: c.nome.trim() || 'Campagna senza nome',
    mittenteId: c.mittenteId,
    categoriaId: c.categoriaId,
    oggetto: c.oggetto,
    preheader: c.preheader,
    design: c.design,
    html: htmlCampagna(c),
    pubblico: c.pubblico,
    testAb: c.testAb,
    invioIntelligente: c.invioIntelligente,
    utmCampaign: c.utmCampaign?.trim() || null,
  }
}

export function slug(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** Data/ora locale "yyyy-MM-ddTHH:mm" per <input type="datetime-local">. */
export function perInputLocale(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function nomeNuovaCampagna(): string {
  return `Campagna del ${new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`
}

/** Il documento ha contenuti veri (non solo il piè di pagina)? */
export function haContenuto(c: Pick<MailingCampagna, 'design' | 'html'>): boolean {
  if (c.design) return c.design.blocchi.some((b) => b.tipo !== 'piedipagina')
  return !!c.html?.trim()
}

export const EMOJI_OGGETTO = ['✨', '🌿', '💆', '🧘', '🦴', '💪', '❤️', '🙂', '😊', '🙏', '👋', '📅', '⏰', '📍', '📣', '🎉', '🎁', '☀️', '🍂', '❄️', '🌸', '✅', '👉', '⭐', '💡', '📝', '🏃', '🚶', '🛌', '💬']

/** Passo Dettagli completo: nome, mittente e oggetto (di ogni variante, se c'è l'A/B). */
export function dettagliCompleti(c: MailingCampagna): boolean {
  const oggettoOk = c.testAb ? c.testAb.varianti.every((v) => v.oggetto.trim()) : !!c.oggetto?.trim()
  return !!c.nome.trim() && !!c.mittenteId && oggettoOk
}

