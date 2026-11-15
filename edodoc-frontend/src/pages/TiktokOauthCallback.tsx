import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { messaggioErrorePlanner, plannerService } from '@/services/planner-service'

/**
 * Callback OAuth TikTok del Planner social — route FE /oauth/tiktok/callback.
 * TikTok torna con ?code=&state= (o ?error=); lo state (con lo spazio) lo verifica il backend.
 */
export default function TiktokOauthCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const avviato = useRef(false)
  const [fase, setFase] = useState<'attesa' | 'ok' | 'errore'>('attesa')
  const [errore, setErrore] = useState<string | null>(null)
  const torna = () => navigate('/planner?tab=impostazioni', { replace: true })

  useEffect(() => {
    if (avviato.current) return
    avviato.current = true
    const code = params.get('code')
    const state = params.get('state')
    if (params.get('error')) {
      setFase('errore')
      setErrore(params.get('error') === 'access_denied' ? 'Hai annullato il consenso su TikTok.' : `TikTok: ${params.get('error_description') ?? params.get('error')}`)
      return
    }
    if (!code || !state) {
      setFase('errore')
      setErrore('Parametri mancanti: riparti da Planner > Impostazioni.')
      return
    }
    plannerService
      .completaTiktok(code, state)
      .then((a) => {
        setFase('ok')
        toast.success(a ? `Collegato: ${a.nome}` : 'Account TikTok collegato')
        window.setTimeout(torna, 1200)
      })
      .catch((e) => {
        setFase('errore')
        setErrore(messaggioErrorePlanner(e, 'Collegamento non riuscito'))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      {fase === 'attesa' ? <Loader2 className="size-10 animate-spin text-pink-600" /> : null}
      {fase === 'ok' ? <CheckCircle2 className="size-10 text-emerald-600" /> : null}
      {fase === 'errore' ? <AlertTriangle className="size-10 text-amber-600" /> : null}
      <div className="max-w-lg space-y-2">
        <p className="text-xl font-semibold">
          {fase === 'attesa' ? 'Collegamento di TikTok in corso…' : fase === 'ok' ? 'Account TikTok collegato' : 'Collegamento non riuscito'}
        </p>
        <p className="text-sm text-muted-foreground">{fase === 'errore' ? errore : fase === 'ok' ? 'Ti porto al Planner…' : 'Salvo l’autorizzazione.'}</p>
      </div>
      {fase === 'errore' ? <Button onClick={torna}>Torna al Planner</Button> : null}
    </div>
  )
}
