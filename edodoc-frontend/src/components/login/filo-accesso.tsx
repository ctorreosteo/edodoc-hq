const TRACCIATO = "M -60 742 C 180 842 340 610 560 676 S 860 884 1040 640 S 1230 170 1520 96"

/** Il filo della dashboard, già teso alla porta d'ingresso: si disegna una volta, poi lo percorre un riflesso. */
export function FiloAccesso() {
  return (
    <svg className="ac-filo" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="ac-tinta" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#F0944E" stopOpacity="0" />
          <stop offset="28%" stopColor="#F0944E" />
          <stop offset="100%" stopColor="#FFD2AE" />
        </linearGradient>
      </defs>
      <path className="ac-filo-traccia" d={TRACCIATO} pathLength={1000} stroke="url(#ac-tinta)" />
      <path className="ac-filo-riflesso" d={TRACCIATO} pathLength={1000} />
      <circle className="ac-filo-perla" cx="560" cy="676" r="6" />
      <circle className="ac-filo-perla" cx="1040" cy="640" r="6" />
    </svg>
  )
}
