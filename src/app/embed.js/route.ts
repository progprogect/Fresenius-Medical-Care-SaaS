import { getSettings } from "@/lib/settings";

/**
 * Embeddable launcher script. Usage on any website:
 *   <script src="https://<deployment>/embed.js" async></script>
 * Injects a floating button that opens the /widget page in an iframe.
 */
export async function GET(req: Request) {
  const widget = await getSettings("widget");
  const origin = process.env.APP_BASE_URL || new URL(req.url).origin;
  const pos = widget.position === "bottom-left" ? "left:20px;" : "right:20px;";

  const js = `
(function(){
  if (window.__clinicWidgetLoaded) return; window.__clinicWidgetLoaded = true;
  var color=${JSON.stringify(widget.primaryColor)};
  var origin=${JSON.stringify(origin)};
  var btn=document.createElement('button');
  btn.setAttribute('aria-label','Open clinic assistant');
  btn.style.cssText='position:fixed;bottom:20px;${pos}z-index:999998;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);background:'+color+';display:flex;align-items:center;justify-content:center;transition:transform .15s';
  btn.onmouseenter=function(){btn.style.transform='scale(1.06)'};
  btn.onmouseleave=function(){btn.style.transform='scale(1)'};
  btn.innerHTML='<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';
  var frame=document.createElement('iframe');
  frame.src=origin+'/widget';
  frame.allow='microphone';
  frame.title=${JSON.stringify(widget.title)};
  frame.style.cssText='position:fixed;bottom:88px;${pos}z-index:999999;width:400px;height:620px;max-height:calc(100vh - 110px);max-width:calc(100vw - 32px);border:none;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.28);display:none;background:white';
  var open=false;
  btn.onclick=function(){
    open=!open;
    frame.style.display=open?'block':'none';
    btn.innerHTML=open
      ?'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
      :'<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';
  };
  function mount(){document.body.appendChild(btn);document.body.appendChild(frame);}
  if(document.body) mount(); else document.addEventListener('DOMContentLoaded',mount);
})();`;

  return new Response(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
