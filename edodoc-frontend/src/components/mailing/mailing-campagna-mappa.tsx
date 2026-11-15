import { useEffect, useMemo, useRef, useState } from 'react'
import type { MailingLinkReport } from '@/services/mailing-service'

/*
  Mappa dei click: l'email vera in un iframe (script in sandbox, senza same-origin) con una bolla su ogni link.
  Corrispondenza come il backend numera i link: ogni href http/https in ordine di apparizione nel DOM,
  esclusi i {{...}} (vedi estraiLink in lib/mailing-render.ts). Indice 0 o 1-based riconosciuto da solo;
  se l'URL all'indice non coincide si cerca per URL.
*/

const SCRIPT = (dati: { link: MailingLinkReport[]; accento: string }) => `
(function(){
  var D=${JSON.stringify(dati).replace(/</g, '\\u003c')};
  var base=D.link.some(function(l){return l.indice===0})?0:1;
  var tot=D.link.reduce(function(s,l){return s+(l.clickUnici||0)},0)||1;
  var max=D.link.reduce(function(s,l){return Math.max(s,l.clickUnici||0)},0)||1;
  function norm(u){ try{ var x=new URL(u); ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(k){x.searchParams.delete(k)}); return (x.origin+x.pathname).replace(/\\/$/,'')+x.search; }catch(e){ return u; } }
  var st=document.createElement('style');
  st.textContent='a{cursor:default}.mlm-b{position:absolute;z-index:99999;display:flex;align-items:center;gap:4px;padding:3px 8px 3px 4px;border-radius:999px;font:700 12px/1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#fff;box-shadow:0 6px 16px -6px rgba(0,0,0,.45),0 0 0 2px #fff;transform:translate(-30%,-60%);transition:transform .18s cubic-bezier(.2,.9,.25,1.15);white-space:nowrap;animation:mlmin .35s cubic-bezier(.2,.9,.25,1.15) both}.mlm-b i{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 4px;border-radius:999px;background:rgba(255,255,255,.25);font-style:normal;font-size:10px}.mlm-b[data-on]{transform:translate(-30%,-60%) scale(1.18);z-index:100000}.mlm-h{position:absolute;z-index:99998;border-radius:6px;pointer-events:none;transition:opacity .15s}@keyframes mlmin{from{opacity:0;transform:translate(-30%,-30%) scale(.6)}to{opacity:1}}';
  document.head.appendChild(st);
  var mappa=[];
  var anchors=Array.prototype.filter.call(document.querySelectorAll('a[href]'),function(a){ var h=(a.getAttribute('href')||'').trim(); return /^https?:\\/\\//i.test(h)&&h.indexOf('{{')===-1; });
  anchors.forEach(function(a,i){
    var h=a.getAttribute('href').trim();
    var r=D.link.find(function(l){return l.indice===i+base});
    if(!r||norm(r.url)!==norm(h)){ var u=D.link.find(function(l){return norm(l.url)===norm(h)}); if(u) r=u; }
    if(r) mappa.push({a:a,l:r});
  });
  function colore(t){ var h=Math.round(230-200*t); return 'hsl('+h+' 78% '+(52-8*t)+'%)'; }
  var bolle=[];
  function disegna(){
    bolle.forEach(function(b){ b.b.remove(); b.h.remove(); }); bolle=[];
    mappa.forEach(function(m){
      var q=m.a.getBoundingClientRect(); if(!q.width&&!q.height) return;
      var t=(m.l.clickUnici||0)/max, pct=Math.round(((m.l.clickUnici||0)/tot)*1000)/10;
      var h=document.createElement('div'); h.className='mlm-h';
      h.style.cssText='left:'+(q.left+scrollX-3)+'px;top:'+(q.top+scrollY-3)+'px;width:'+(q.width+6)+'px;height:'+(q.height+6)+'px;background:'+colore(t)+';opacity:'+(0.12+0.28*t);
      var b=document.createElement('div'); b.className='mlm-b'; b.style.background=colore(t);
      b.style.left=(q.right+scrollX)+'px'; b.style.top=(q.top+scrollY)+'px';
      b.innerHTML='<i>'+(m.l.indice+(base?0:1))+'</i>'+String(pct).replace('.',',')+'%';
      b.title=(m.l.clickUnici||0)+' persone hanno cliccato · '+m.l.url;
      b.addEventListener('mouseenter',function(){ parent.postMessage({__mlm:1,hover:m.l.indice},'*'); });
      b.addEventListener('mouseleave',function(){ parent.postMessage({__mlm:1,hover:null},'*'); });
      document.body.appendChild(h); document.body.appendChild(b); bolle.push({b:b,h:h,i:m.l.indice});
    });
    parent.postMessage({__mlm:1,altezza:Math.ceil(document.documentElement.scrollHeight)},'*');
  }
  document.addEventListener('click',function(e){ e.preventDefault(); },true);
  window.addEventListener('message',function(e){ var d=e.data||{}; if(!d.__mlm) return; bolle.forEach(function(b){ if(b.i===d.evidenzia){ b.b.setAttribute('data-on',''); b.h.style.opacity='.55'; } else { b.b.removeAttribute('data-on'); } }); if(d.evidenzia==null) disegna(); });
  window.addEventListener('load',disegna); window.addEventListener('resize',disegna);
  if(window.ResizeObserver) new ResizeObserver(function(){ clearTimeout(window.__t); window.__t=setTimeout(disegna,60); }).observe(document.body);
  disegna();
})();`

export function MappaClick({ html, link, evidenzia, onHover, larghezza = 680 }: { html: string; link: MailingLinkReport[]; evidenzia: number | null; onHover?: (i: number | null) => void; larghezza?: number }) {
  const iframe = useRef<HTMLIFrameElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [altezza, setAltezza] = useState(900)
  const [scala, setScala] = useState(1)
  const onHoverRef = useRef(onHover)
  onHoverRef.current = onHover
  const srcDoc = useMemo(() => {
    const script = `<script>${SCRIPT({ link, accento: '#5b45e0' })}</script>`
    return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${script}</body>`) : html + script
  }, [html, link])
  useEffect(() => {
    const m = (e: MessageEvent) => {
      if (e.source !== iframe.current?.contentWindow) return
      const d = e.data as { __mlm?: number; altezza?: number; hover?: number | null }
      if (!d?.__mlm) return
      if (typeof d.altezza === 'number') setAltezza(Math.max(300, d.altezza))
      if ('hover' in d) onHoverRef.current?.(d.hover ?? null)
    }
    window.addEventListener('message', m)
    return () => window.removeEventListener('message', m)
  }, [])
  useEffect(() => {
    iframe.current?.contentWindow?.postMessage({ __mlm: 1, evidenzia }, '*')
  }, [evidenzia])
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setScala(Math.min(1, el.clientWidth / larghezza)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [larghezza])
  return (
    <div ref={box} className="ml-cp-mappa" style={{ height: altezza * scala }}>
      <iframe
        ref={iframe}
        title="Mappa dei click sull'email"
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        style={{ width: larghezza, height: altezza, transform: scala < 1 ? `scale(${scala})` : undefined }}
      />
    </div>
  )
}
