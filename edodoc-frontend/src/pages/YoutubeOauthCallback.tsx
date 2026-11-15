import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/youtube'
import { toast } from '@/lib/toast'
import { youtubeService } from '@/services/youtube-service'

/**
 * Callback OAuth Google del canale YouTube — route FE /oauth/youtube/callback.
 * Google torna con ?code=&state= (o ?error=); lo state lo verifica il backend.
 */
export default function YoutubeOauthCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const avviato = useRef(false)
  const [fase, setFase] = useState<'attesa' | 'ok' | 'errore'>('attesa')
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    if (avviato.current) return
    avviato.current = true
    const code = params.get('code')
    const state = params.get('state')
    if (params.get('error')) {
      setFase('errore')
      setErrore(params.get('error') === 'access_denied' ? 'Hai annullato il consenso su Google.' : `Google: ${params.get('error')}`)
      return
    }
    if (!code || !state) {
      setFase('errore')
      setErrore('Parametri mancanti: riparti dalla pagina YouTube.')
      return
    }
    youtubeService
      .completaConsenso(code, state)
      .then((s) => {
        setFase('ok')
        toast.success(s.canale ? `Collegato: ${s.canale.titolo}` : 'Canale collegato')
        window.setTimeout(() => navigate('/youtube', { replace: true }), 1200)
      })
      .catch((e) => {
        setFase('errore')
        setErrore(errorMessage(e, 'Collegamento non riuscito'))
      })
  }, [params, navigate])

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      {fase === 'attesa' ? <Loader2 className="size-10 animate-spin text-red-600" /> : null}
      {fase === 'ok' ? <CheckCircle2 className="size-10 text-emerald-600" /> : null}
      {fase === 'errore' ? <AlertTriangle className="size-10 text-amber-600" /> : null}
      <div className="max-w-lg space-y-2">
        <p className="text-xl font-semibold">
          {fase === 'attesa' ? 'Collegamento del canale in corso…' : fase === 'ok' ? 'Canale YouTube collegato' : 'Collegamento non riuscito'}
        </p>
        <p className="text-sm text-muted-foreground">{fase === 'errore' ? errore : fase === 'ok' ? 'Ti porto alla pagina YouTube…' : 'Salvo l’autorizzazione.'}</p>
      </div>
      {fase === 'errore' ? <Button onClick={() => navigate('/youtube', { replace: true })}>Torna a YouTube</Button> : null}
    </div>
  )
}
