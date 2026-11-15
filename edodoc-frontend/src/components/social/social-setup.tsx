import { CheckCircle2, Circle, KeyRound, Link2, Power, RefreshCw, ShieldCheck, Webhook } from 'lucide-react'
import type { SocialStato } from '@/services/social-service'

/*
  Mostrata finché l'integrazione non è utilizzabile: dice perché (il motivo arriva dal backend, senza mai
  nominare un secret) e cosa serve per accenderla. I passi rispecchiano SocialConfigService.
*/

const PERMESSI = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_read_user_content',
  'pages_manage_engagement',
  'pages_manage_posts',
  'pages_messaging',
  'read_insights',
  'instagram_basic',
  'instagram_manage_comments',
  'instagram_manage_insights',
  'instagram_manage_messages',
  'instagram_content_publish',
  'business_management',
]

export function SocialSetup({ stato, errore, onRiprova }: { stato: SocialStato | null; errore: string | null; onRiprova: () => void }) {
  const tokenOk = !!stato && stato.account.length > 0
  const passi = [
    {
      icona: KeyRound,
      titolo: 'Token di un System User',
      testo:
        'In Meta Business Suite → Impostazioni business → Utenti di sistema: crea un utente di sistema admin, assegnagli le pagine Facebook e gli account Instagram del dottore e genera un token che non scade con i permessi qui sotto. Va in META_SOCIAL_ACCESS_TOKEN.',
      fatto: tokenOk,
    },
    {
      icona: Link2,
      titolo: 'Instagram collegato alla pagina',
      testo: 'Ogni profilo Instagram deve essere un account professionale collegato alla sua pagina Facebook: è così che il gestionale lo trova da solo.',
      fatto: !!stato?.account.some((a) => a.instagramId),
    },
    {
      icona: Webhook,
      titolo: 'Webhook per il tempo reale',
      testo:
        'Nell’app Meta iscrivi /api/social/webhook agli oggetti Page (feed, messages) e Instagram (comments, mentions, messages) con META_SOCIAL_VERIFY_TOKEN. Senza webhook la pagina funziona lo stesso, aggiornandosi a intervalli regolari.',
      fatto: !!stato?.webhookConfigurato,
    },
    {
      icona: Power,
      titolo: 'Interruttore',
      testo: 'È spento finché non lo accendi: SOCIAL_INTEGRAZIONE_ABILITATA=true in Impostazioni (tabella config). La variabile d’ambiente con lo stesso nome, se presente, ha la precedenza.',
      fatto: !!stato?.utilizzabile,
    },
  ]

  return (
    <section className="so-setup" aria-label="Configurazione Meta">
      <div className="so-setup-head">
        <span className="so-setup-icon">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <div>
          <div className="so-titolo">Colleghiamo Facebook e Instagram</div>
          <p className="so-setup-motivo">{errore ?? stato?.motivo ?? 'L’integrazione con Meta non è ancora attiva.'}</p>
        </div>
        <button type="button" className="so-btn" onClick={onRiprova}>
          <RefreshCw className="size-4" aria-hidden /> Riprova
        </button>
      </div>

      <ol className="so-setup-passi">
        {passi.map((p, i) => {
          const Icona = p.icona
          return (
            <li key={p.titolo} data-fatto={p.fatto ? '' : undefined}>
              <span className="so-setup-num">{p.fatto ? <CheckCircle2 className="size-5" aria-label="Fatto" /> : <Circle className="size-5" aria-label="Da fare" />}</span>
              <div>
                <div className="so-setup-passo-titolo">
                  <Icona className="size-4" aria-hidden /> {i + 1}. {p.titolo}
                </div>
                <p>{p.testo}</p>
              </div>
            </li>
          )
        })}
      </ol>

      <div className="so-setup-permessi">
        <div className="so-etichetta">Permessi del token</div>
        <div className="so-chips">
          {PERMESSI.map((p) => (
            <code key={p} className="so-chip">
              {p}
            </code>
          ))}
        </div>
      </div>
    </section>
  )
}
