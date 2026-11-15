/**
 * Micro-coriandoli per i momenti di soddisfazione (task completato, giornata chiusa).
 * Nessuna dipendenza: particelle DOM animate con la Web Animations API, rimosse a fine animazione.
 * Non fa nulla con prefers-reduced-motion.
 */

const COLORI = ['#22c55e', '#86efac', '#38bdf8', '#a78bfa', '#fbbf24', '#f472b6']

function movimentoRidotto(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * @param el elemento da cui partono i coriandoli (es. il cerchio di completamento); senza, il centro alto dello schermo
 * @param quanti numero di particelle (default 18; 40 per la "giornata chiusa")
 */
export function celebra(el?: HTMLElement | null, quanti = 18): void {
  if (typeof window === 'undefined' || typeof document === 'undefined' || movimentoRidotto()) return
  const r = el?.getBoundingClientRect()
  const x = r ? r.left + r.width / 2 : window.innerWidth / 2
  const y = r ? r.top + r.height / 2 : window.innerHeight * 0.3

  const strato = document.createElement('div')
  strato.setAttribute('aria-hidden', 'true')
  Object.assign(strato.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '10100',
    overflow: 'hidden',
  } satisfies Partial<CSSStyleDeclaration>)
  document.body.appendChild(strato)

  const forza = el ? 1 : 1.8
  let rimaste = quanti
  for (let i = 0; i < quanti; i++) {
    const p = document.createElement('span')
    const lato = 4 + Math.random() * 4
    const tondo = Math.random() > 0.5
    Object.assign(p.style, {
      position: 'absolute',
      left: `${x}px`,
      top: `${y}px`,
      width: `${lato}px`,
      height: `${tondo ? lato : lato * 0.45}px`,
      borderRadius: tondo ? '50%' : '1px',
      background: COLORI[i % COLORI.length],
      willChange: 'transform, opacity',
    } satisfies Partial<CSSStyleDeclaration>)
    strato.appendChild(p)

    const angolo = (Math.PI * 2 * i) / quanti + (Math.random() - 0.5) * 0.6
    const distanza = (36 + Math.random() * 46) * forza
    const dx = Math.cos(angolo) * distanza
    const dy = Math.sin(angolo) * distanza - 18 * forza
    const giro = (Math.random() - 0.5) * 540
    const anim = p.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.4) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${giro / 2}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + 34 * forza}px)) scale(0.8) rotate(${giro}deg)`, opacity: 0 },
      ],
      { duration: 700 + Math.random() * 350, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    )
    anim.onfinish = () => {
      p.remove()
      rimaste -= 1
      if (rimaste <= 0) strato.remove()
    }
  }
  // Rete di sicurezza se le animazioni non partono (tab in background)
  window.setTimeout(() => strato.remove(), 2000)
}
