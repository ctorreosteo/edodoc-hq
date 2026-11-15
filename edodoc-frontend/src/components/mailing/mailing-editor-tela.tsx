import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { ETICHETTE_BLOCCO } from '@/lib/mailing-render'

/*
  Tela dell'editor: un iframe con l'HTML VERO di renderEmail (opzione editor: data-blocco-id sui blocchi).
  Lo script interno (in sandbox, senza same-origin) gestisce hover, selezione, barra azioni flottante,
  tasti e file trascinati, e parla con il genitore via postMessage. Gli aggiornamenti non ricaricano
  l'iframe: si sostituiscono solo i blocchi cambiati, così niente sfarfallio né scroll perso.
*/

export type RettangoloBlocco = { id: string; top: number; bottom: number; left: number; right: number; annidato: boolean }
export type RettangoloColonna = { chiave: string; top: number; bottom: number; left: number; right: number }
export type RettangoliTela = { blocchi: RettangoloBlocco[]; colonne: RettangoloColonna[] }

export type AzioneTela = 'su' | 'giu' | 'duplica' | 'elimina' | 'genitore'

export type TastoTela = { key: string; meta: boolean; ctrl: boolean; shift: boolean; alt: boolean }

export type TelaHandle = {
  /** Rettangoli dei blocchi in coordinate del documento dell'iframe (px CSS, prima della scala). */
  rettangoli: () => RettangoliTela
  elemento: () => HTMLIFrameElement | null
  scala: () => number
}

const SCRIPT = (accento: string, etichette: Record<string, string>) => `
(function(){
  var ACC=${JSON.stringify(accento)};
  var ET=${JSON.stringify(etichette)};
  var sel=null, hov=null, hovEsterno=null, raf=0;
  function invia(m){ m.__ml=1; parent.postMessage(m,'*'); }
  var ov=document.createElement('div'); ov.id='__ml_ov';
  ov.innerHTML='<style>'+
    'html{scroll-behavior:auto}body{user-select:none;-webkit-user-select:none;cursor:default}'+
    '[data-blocco-id]{cursor:pointer}a{cursor:pointer}'+
    '#__ml_ov{position:absolute;top:0;left:0;width:0;height:0;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif}'+
    '.mlb{position:absolute;pointer-events:none;border-radius:6px;transition:top .14s cubic-bezier(.2,0,0,1),left .14s cubic-bezier(.2,0,0,1),width .14s cubic-bezier(.2,0,0,1),height .14s cubic-bezier(.2,0,0,1),opacity .12s}'+
    '.mlb-h{box-shadow:0 0 0 1.5px '+ACC+'80;background:'+ACC+'0d}'+
    '.mlb-s{box-shadow:0 0 0 2px '+ACC+',0 0 0 6px '+ACC+'26}'+
    '.mlt{position:absolute;display:flex;gap:2px;padding:3px;border-radius:10px;background:#101614;box-shadow:0 8px 24px -8px rgba(0,0,0,.5);pointer-events:auto;transform-origin:right bottom;animation:mlin .16s cubic-bezier(.2,.9,.25,1.15)}'+
    '.mlt button{all:unset;width:28px;height:28px;display:grid;place-items:center;border-radius:7px;color:#fff;cursor:pointer}'+
    '.mlt button:hover{background:rgba(255,255,255,.14)}.mlt button[data-p]:hover{background:#e5484d}'+
    '.mlt button:disabled{opacity:.35;cursor:default;background:none}'+
    '.mlt svg{width:15px;height:15px}'+
    '.mll{position:absolute;padding:2px 8px;border-radius:6px;background:'+ACC+';color:#fff;font-size:11px;font-weight:600;letter-spacing:.02em;pointer-events:none;white-space:nowrap;animation:mlin .16s ease}'+
    '.mld{position:absolute;left:0;right:0;pointer-events:none;border:2px dashed '+ACC+';border-radius:12px;background:'+ACC+'14}'+
    '@keyframes mlin{from{opacity:0;transform:translateY(3px) scale(.96)}to{opacity:1;transform:none}}'+
    '</style><div class="mlb mlb-h" style="opacity:0"></div><div class="mlb mlb-s" style="opacity:0"></div><div class="mll" style="display:none"></div><div class="mlt" style="display:none"></div><div class="mld" style="display:none"></div>';
  document.documentElement.appendChild(ov);
  var bH=ov.children[1], bS=ov.children[2], lab=ov.children[3], tb=ov.children[4], dz=ov.children[5];
  var I={
    su:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>',
    giu:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    duplica:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/></svg>',
    elimina:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    genitore:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>'
  };
  function el(id){ if(!id) return null; var l=document.querySelectorAll('[data-blocco-id]'); for(var i=0;i<l.length;i++){ if(l[i].getAttribute('data-blocco-id')===id) return l[i]; } return null; }
  function blocco(n){ while(n&&n.nodeType===1){ if(n.hasAttribute('data-blocco-id')) return n; n=n.parentElement; } return null; }
  function annidato(e){ return !!(e.parentElement&&e.parentElement.closest('[data-blocco-id]')); }
  function fratelli(e){ var p=e.parentElement&&e.parentElement.closest('[data-colonna]'); var l=Array.prototype.slice.call((p||document).querySelectorAll('[data-blocco-id]')); return l.filter(function(x){ return p ? x.parentElement.closest('[data-colonna]')===p && x.parentElement.closest('[data-blocco-id]')===e.parentElement.closest('[data-blocco-id]') : !annidato(x); }); }
  function r(e){ var b=e.getBoundingClientRect(); return {top:b.top+scrollY,left:b.left+scrollX,width:b.width,height:b.height}; }
  function metti(box,q,pad){ box.style.top=(q.top-pad)+'px'; box.style.left=(q.left-pad)+'px'; box.style.width=(q.width+pad*2)+'px'; box.style.height=(q.height+pad*2)+'px'; box.style.opacity='1'; }
  function tipoDi(e){ return e.getAttribute('data-tipo')||''; }
  function disegna(){
    raf=0;
    var h=el(hovEsterno)||hov; var s=el(sel);
    if(h&&h!==s){ metti(bH,r(h),2); } else bH.style.opacity='0';
    if(s){
      var q=r(s); metti(bS,q,2);
      var nome=ET[s.getAttribute('data-tipo-blocco')]||'Blocco';
      lab.textContent=nome; lab.style.display='block'; lab.style.top=Math.max(0,q.top-24)+'px'; lab.style.left=(q.left-2)+'px';
      var fr=fratelli(s), i=fr.indexOf(s), ann=annidato(s);
      tb.innerHTML=(ann?'<button data-a="genitore" title="Seleziona le colonne">'+I.genitore+'</button>':'')+
        '<button data-a="su" title="Sposta su"'+(i<=0?' disabled':'')+'>'+I.su+'</button>'+
        '<button data-a="giu" title="Sposta giù"'+(i>=fr.length-1?' disabled':'')+'>'+I.giu+'</button>'+
        '<button data-a="duplica" title="Duplica (⌘D)">'+I.duplica+'</button>'+
        '<button data-a="elimina" data-p="1" title="Elimina (Canc)">'+I.elimina+'</button>';
      tb.style.display='flex';
      var w=tb.offsetWidth||150; var top=q.top-36; if(top<0) top=q.top+6;
      tb.style.top=top+'px'; tb.style.left=Math.max(4,Math.min(document.documentElement.clientWidth-w-4,q.left+q.width-w+2))+'px';
    } else { bS.style.opacity='0'; tb.style.display='none'; lab.style.display='none'; }
  }
  function ridisegna(){ if(!raf) raf=requestAnimationFrame(disegna); }
  function etichetta(){ var l=document.querySelectorAll('[data-blocco-id]'); for(var i=0;i<l.length;i++){ var id=l[i].getAttribute('data-blocco-id'); if(TIPI[id]) l[i].setAttribute('data-tipo-blocco',TIPI[id]); } }
  var TIPI={};
  function misura(){
    var bl=[], co=[];
    document.querySelectorAll('[data-blocco-id]').forEach(function(e){ var q=r(e); bl.push({id:e.getAttribute('data-blocco-id'),top:q.top,bottom:q.top+q.height,left:q.left,right:q.left+q.width,annidato:annidato(e)}); });
    document.querySelectorAll('[data-colonna]').forEach(function(e){ var q=r(e); co.push({chiave:e.getAttribute('data-colonna'),top:q.top,bottom:q.top+q.height,left:q.left,right:q.left+q.width}); });
    invia({tipo:'misure',altezza:Math.ceil(document.documentElement.scrollHeight),blocchi:bl,colonne:co});
    ridisegna();
  }
  var tm=0; function misuraPresto(){ clearTimeout(tm); tm=setTimeout(misura,30); }
  function primoLivello(rad){ return Array.prototype.filter.call(rad.querySelectorAll('[data-blocco-id]'),function(e){ return !annidato(e); }); }
  function scheletro(body){ var c=body.cloneNode(true); primoLivello(c).forEach(function(e){ e.innerHTML=''; }); return c.innerHTML; }
  function attributi(e){ var o=[]; for(var i=0;i<e.attributes.length;i++) o.push(e.attributes[i].name+'='+e.attributes[i].value); return o.join('|'); }
  function aggiorna(html){
    var n=new DOMParser().parseFromString(html,'text/html');
    var pieno = document.head.innerHTML!==n.head.innerHTML || attributi(document.body)!==attributi(n.body) || scheletro(document.body)!==scheletro(n.body);
    if(pieno){
      document.head.innerHTML=n.head.innerHTML;
      while(document.body.attributes.length) document.body.removeAttribute(document.body.attributes[0].name);
      for(var i=0;i<n.body.attributes.length;i++) document.body.setAttribute(n.body.attributes[i].name,n.body.attributes[i].value);
      document.body.innerHTML=n.body.innerHTML;
    } else {
      var vec=primoLivello(document.body), nuo=primoLivello(n.body);
      for(var j=0;j<vec.length;j++){ if(vec[j].outerHTML!==nuo[j].outerHTML) vec[j].replaceWith(document.importNode(nuo[j],true)); }
    }
    if(hov&&!document.contains(hov)) hov=null;
    etichetta(); misura();
  }
  window.addEventListener('message',function(e){
    if(e.source!==parent) return; var d=e.data||{}; if(!d.__ml) return;
    if(d.tipo==='html'){ TIPI=d.tipi||TIPI; sel=d.selezione||null; aggiorna(d.html); }
    else if(d.tipo==='selezione'){ sel=d.id||null; ridisegna(); }
    else if(d.tipo==='evidenzia'){ hovEsterno=d.id||null; ridisegna(); }
    else if(d.tipo==='zona'){ if(d.top==null){ dz.style.display='none'; } else { dz.style.display='block'; dz.style.top=d.top+'px'; dz.style.left=d.left+'px'; dz.style.width=d.width+'px'; dz.style.height=d.height+'px'; dz.style.right='auto'; } }
  });
  document.addEventListener('click',function(e){
    e.preventDefault();
    var b=e.target.closest&&e.target.closest('.mlt button');
    if(b){ if(!b.disabled) invia({tipo:'azione',azione:b.getAttribute('data-a'),id:sel}); return; }
    var k=blocco(e.target); sel=k?k.getAttribute('data-blocco-id'):null; ridisegna(); invia({tipo:'click',id:sel});
  },true);
  document.addEventListener('dblclick',function(e){ var k=blocco(e.target); if(k) invia({tipo:'doppio',id:k.getAttribute('data-blocco-id')}); },true);
  document.addEventListener('mousemove',function(e){ if(e.target.closest&&e.target.closest('.mlt')) return; var k=blocco(e.target); if(k!==hov){ hov=k; ridisegna(); } },true);
  document.addEventListener('mouseleave',function(){ hov=null; ridisegna(); });
  document.addEventListener('submit',function(e){ e.preventDefault(); },true);
  document.addEventListener('keydown',function(e){
    var k=e.key, mod=e.metaKey||e.ctrlKey;
    var gestito = k==='Delete'||k==='Backspace'||k==='ArrowUp'||k==='ArrowDown'||k==='Escape'||(mod&&(k==='d'||k==='D'||k==='z'||k==='Z'||k==='y'||k==='Y'));
    if(!gestito) return; e.preventDefault();
    invia({tipo:'tasto',key:k,meta:e.metaKey,ctrl:e.ctrlKey,shift:e.shiftKey,alt:e.altKey});
  });
  document.addEventListener('dragover',function(e){ if(e.dataTransfer&&Array.prototype.indexOf.call(e.dataTransfer.types,'Files')!==-1){ e.preventDefault(); var k=blocco(e.target); if(k!==hov){ hov=k; ridisegna(); } } });
  document.addEventListener('drop',function(e){
    if(!e.dataTransfer||!e.dataTransfer.files||!e.dataTransfer.files.length) return; e.preventDefault();
    var k=blocco(e.target); invia({tipo:'file',file:Array.prototype.slice.call(e.dataTransfer.files),id:k?k.getAttribute('data-blocco-id'):null});
  });
  window.addEventListener('resize',misuraPresto);
  document.addEventListener('load',function(e){ if(e.target&&e.target.tagName==='IMG') misuraPresto(); },true);
  document.addEventListener('error',function(e){ if(e.target&&e.target.tagName==='IMG') misuraPresto(); },true);
  if(window.ResizeObserver){ new ResizeObserver(misuraPresto).observe(document.documentElement); }
  invia({tipo:'pronto'});
})();
`

type Messaggio =
  | { tipo: 'pronto' }
  | { tipo: 'misure'; altezza: number; blocchi: RettangoloBlocco[]; colonne: RettangoloColonna[] }
  | { tipo: 'click'; id: string | null }
  | { tipo: 'doppio'; id: string }
  | { tipo: 'azione'; azione: AzioneTela; id: string | null }
  | { tipo: 'tasto'; key: string; meta: boolean; ctrl: boolean; shift: boolean; alt: boolean }
  | { tipo: 'file'; file: File[]; id: string | null }

export type TelaEmailProps = {
  html: string
  /** id → tipo, per le etichette sopra la selezione. */
  tipi: Record<string, string>
  selezione: string | null
  evidenzia: string | null
  /** Larghezza dell'iframe in px CSS. */
  larghezza: number
  /** Larghezza disponibile: se minore, l'iframe si riduce in scala. */
  disponibile: number
  accento: string
  onSeleziona: (id: string | null) => void
  onDoppioClick: (id: string) => void
  onAzione: (azione: AzioneTela, id: string) => void
  onTasto: (t: TastoTela) => void
  onFile: (file: File[], id: string | null) => void
  titolo: string
}

export const TelaEmail = forwardRef<TelaHandle, TelaEmailProps>(function TelaEmail(props, ref) {
  const iframe = useRef<HTMLIFrameElement>(null)
  const [pronto, setPronto] = useState(false)
  const [altezza, setAltezza] = useState(600)
  const rett = useRef<RettangoliTela>({ blocchi: [], colonne: [] })
  const cb = useRef(props)
  cb.current = props

  const scala = Math.min(1, props.disponibile > 0 ? props.disponibile / props.larghezza : 1)

  useImperativeHandle(ref, () => ({ rettangoli: () => rett.current, elemento: () => iframe.current, scala: () => scala }), [scala])

  // Lo script si crea una volta sola per accento: cambiare srcDoc ricaricherebbe l'iframe
  const srcDoc = useMemo(
    () => `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body><script>${SCRIPT(props.accento, ETICHETTE_BLOCCO)}</script></html>`,
    [props.accento],
  )

  const posta = useCallback((m: Record<string, unknown>) => {
    iframe.current?.contentWindow?.postMessage({ ...m, __ml: 1 }, '*')
  }, [])

  useEffect(() => {
    const onMessaggio = (e: MessageEvent) => {
      if (!iframe.current || e.source !== iframe.current.contentWindow) return
      const d = e.data as (Messaggio & { __ml?: number }) | null
      if (!d || !d.__ml) return
      const p = cb.current
      switch (d.tipo) {
        case 'pronto':
          setPronto(true)
          break
        case 'misure':
          rett.current = { blocchi: d.blocchi, colonne: d.colonne }
          setAltezza(Math.max(200, d.altezza))
          break
        case 'click':
          p.onSeleziona(d.id)
          break
        case 'doppio':
          p.onDoppioClick(d.id)
          break
        case 'azione':
          if (d.id) p.onAzione(d.azione, d.id)
          break
        case 'tasto':
          p.onTasto({ key: d.key, meta: d.meta, ctrl: d.ctrl, shift: d.shift, alt: d.alt })
          break
        case 'file':
          p.onFile(d.file, d.id)
          break
      }
    }
    window.addEventListener('message', onMessaggio)
    return () => window.removeEventListener('message', onMessaggio)
  }, [])

  useEffect(() => setPronto(false), [srcDoc])

  // HTML nuovo: un frame di ritardo per raggruppare gli aggiornamenti ravvicinati
  useEffect(() => {
    if (!pronto) return
    const id = requestAnimationFrame(() => posta({ tipo: 'html', html: props.html, selezione: cb.current.selezione, tipi: cb.current.tipi }))
    return () => cancelAnimationFrame(id)
  }, [pronto, props.html, posta])

  useEffect(() => {
    if (pronto) posta({ tipo: 'selezione', id: props.selezione })
  }, [pronto, props.selezione, posta])

  useEffect(() => {
    if (pronto) posta({ tipo: 'evidenzia', id: props.evidenzia })
  }, [pronto, props.evidenzia, posta])

  return (
    <div className="ml-ed-iframe-box" style={{ width: props.larghezza * scala, height: altezza * scala }}>
      <iframe
        ref={iframe}
        title={props.titolo}
        className="ml-ed-iframe"
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        style={{ width: props.larghezza, height: altezza, transform: scala < 1 ? `scale(${scala})` : undefined }}
        data-pronto={pronto ? '' : undefined}
      />
    </div>
  )
})

