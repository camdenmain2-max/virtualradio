const clients = new Map(); // id -> { ws, name, room, role, stationId }
const stations = new Map();

const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VirtualTX</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#070a0d;color:#d7dde3;font:13px Arial,sans-serif}
button,input,select{font:inherit}button{background:#111820;color:#cbd3da;border:1px solid #29333d;border-radius:4px;padding:8px 11px}button:hover{border-color:#4e6578}
.primary{background:#14351e;border-color:#28713d;color:#9df0ad}.top{padding:12px;background:#0b1015;border-bottom:1px solid #202a32;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
.brand{font-size:18px}.muted,.hint,small{color:#697681;font-size:11px}.layout{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:10px;padding:10px;max-width:1500px;margin:auto}
.panel{background:#0b1015;border:1px solid #202a32;border-radius:5px;padding:12px;margin-bottom:10px}.title{display:flex;justify-content:space-between;border-bottom:1px solid #1a232b;padding-bottom:9px;margin-bottom:10px}
input,select{width:100%;background:#0a0f14;color:#cbd3da;border:1px solid #27323b;border-radius:3px;padding:8px}
.freq{display:flex;gap:5px}.freq input{font:700 28px monospace;color:#b7f6c2;background:#05080b}.freq .tune{min-width:75px}
canvas{display:block;width:100%;background:#030506;border:1px solid #1b252d;margin-top:8px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:9px}
label{display:block;color:#697681;font-size:10px;letter-spacing:.7px;margin:8px 0}label input,label select{margin-top:4px}
.presets{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px}.station{display:grid;grid-template-columns:1fr auto;gap:8px;padding:9px;border-top:1px solid #182129}
.two{display:grid;grid-template-columns:1fr 90px;gap:8px}.tx{display:grid;grid-template-columns:1fr 90px;gap:6px}
.status{color:#6bd68a;font-size:10px}.readout{font-size:10px;color:#6bd68a}.hide{display:none}
@media(max-width:900px){.layout{grid-template-columns:1fr}}@media(max-width:600px){.grid{grid-template-columns:1fr 1fr}}
</style></head>
<body>
<div class="top"><div class="brand">● <b>VirtualTX</b> <span class="muted">WEB SDR / VIRTUAL RADIO</span></div>
<div><input id="name" placeholder="Operator name" style="width:130px"><button id="login">Login</button> <span id="online" class="muted">OFFLINE</span></div></div>
<main class="layout">
<section class="panel"><div class="title"><b>RECEIVER</b><span id="rx" class="readout">NO SIGNAL</span></div>
<div class="freq"><button id="minus">−</button><input id="freq" value="101.700"><select id="unit" style="width:75px"><option value="mhz">MHz</option><option value="khz">kHz</option></select><button id="plus">+</button><button id="tune" class="primary">TUNE</button></div>
<canvas id="water" height="220"></canvas><canvas id="spec" height="110"></canvas>
<div class="grid"><label>MODE<select id="mode"><option>FM</option><option>AM</option><option>USB</option><option>LSB</option><option>DSB</option><option>CW</option><option>SAM</option><option>HD Radio</option></select></label>
<label>FILTER<select id="bw"><option>Wide</option><option selected>Medium</option><option>Narrow</option></select></label>
<label>SQUELCH<input id="squelch" type="range" min="0" max="100" value="18"></label><label>VOLUME<input id="vol" type="range" min="0" max="100" value="82"></label></div>
<div class="presets"><button data-f="88.1" data-u="mhz" data-m="FM">88.1 FM</button><button data-f="93.3" data-u="mhz" data-m="FM">93.3 FM</button><button data-f="101.7" data-u="mhz" data-m="FM">101.7 FM</button><button data-f="7000" data-u="khz" data-m="USB">7.000 USB</button><button data-f="7250" data-u="khz" data-m="AM">7.250 AM</button></div>
<div id="stations" style="margin-top:12px"></div></section>
<aside>
<section class="panel"><div class="title"><b>TRANSMITTER</b><span id="txstate" class="muted">STOPPED</span></div>
<label>STATION NAME<input id="station" placeholder="My Radio"></label><div class="two"><label>FREQUENCY<input id="txfreq" value="101.700"></label><label>UNIT<select id="txunit"><option value="mhz">MHz</option><option value="khz">kHz</option></select></label></div>
<label>MODE<select id="txmode"><option>FM</option><option>AM</option><option>USB</option><option>LSB</option><option>DSB</option><option>CW</option><option>SAM</option><option>HD Radio</option></select></label>
<label>SOURCE<select id="source"><option value="mic">Microphone</option><option value="stream">Internet stream</option></select></label>
<div id="micwrap"><label>MICROPHONE<select id="mic"></select></label></div>
<div id="streamwrap" class="hide"><label>STREAM URL<input id="streamurl" placeholder="https://example.com/live.mp3"></label></div>
<label>GAIN<input id="gain" type="range" min="0" max="200" value="100"></label>
<div class="tx"><button id="start" class="primary">START BROADCAST</button><button id="stop" disabled>STOP</button></div>
<p class="hint">Virtual frequencies only. This does not transmit RF.</p></section>
<section class="panel"><b>LIVE STATIONS</b><div id="list" class="hint" style="margin-top:8px">No stations yet.</div></section>
</aside></main>
<script>
const $=x=>document.getElementById(x), S={ws:null,id:null,name:"Operator",room:null,tx:null,peers:new Map(),rx:new Map(),audio:new Map(),stationId:null};
function room(){return (Number($("freq").value)||0)+"/"+$("unit").value+"/"+$("mode").value}
function connect(){if(S.ws?.readyState===1)return;let w=new WebSocket((location.protocol==="https:"?"wss":"ws")+"://"+location.host+"/signal");S.ws=w;$("online").textContent="CONNECTING";w.onopen=()=>{ $("online").textContent="ONLINE";send({t:"hello",name:S.name});join()};w.onclose=()=>{$("online").textContent="OFFLINE";S.ws=null;setTimeout(connect,1500)};w.onmessage=e=>{try{msg(JSON.parse(e.data))}catch{}}}
function send(x){if(S.ws?.readyState===1)S.ws.send(JSON.stringify(x))}
function msg(m){
 if(m.t==="id")S.id=m.id;
 if(m.t==="stations")renderStations(m.stations);
 if(m.t==="peer"&&m.a==="join"&&S.tx)offer(m.id);
 if(m.t==="peer"&&m.a==="leave")drop(m.id);
 if(m.t==="offer")answer(m.from,m.sdp);
 if(m.t==="answer")S.peers.get(m.from)?.setRemoteDescription(m.sdp);
 if(m.t==="ice"){let p=S.peers.get(m.from)||S.rx.get(m.from);p?.addIceCandidate(m.c).catch(()=>{})}
}
function join(){S.room=room();S.rx.forEach(p=>p.close());S.rx.clear();S.audio.forEach(a=>a.close());S.audio.clear();send({t:"join",room:S.room})}
$("name").value=localStorage.vtxName||"Operator";$("login").onclick=()=>{S.name=($("name").value||"Operator").trim();localStorage.vtxName=S.name;connect()};connect();
$("tune").onclick=join;$("mode").onchange=join;$("unit").onchange=join;$("freq").onchange=join;
$("minus").onclick=()=>{$("freq").value=(Number($("freq").value)-($("unit").value==="mhz"?.1:100)).toFixed($("unit").value==="mhz"?3:0);join()};
$("plus").onclick=()=>{$("freq").value=(Number($("freq").value)+($("unit").value==="mhz"?.1:100)).toFixed($("unit").value==="mhz"?3:0);join()};
document.querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{$("freq").value=b.dataset.f;$("unit").value=b.dataset.u;$("mode").value=b.dataset.m;join()});
$("source").onchange=()=>{$("micwrap").classList.toggle("hide",$("source").value!=="mic");$("streamwrap").classList.toggle("hide",$("source").value!=="stream")};
async function mics(){try{await navigator.mediaDevices.getUserMedia({audio:true});let d=await navigator.mediaDevices.enumerateDevices(),s=$("mic");s.innerHTML="";d.filter(x=>x.kind==="audioinput").forEach((x,i)=>{let o=document.createElement("option");o.value=x.deviceId;o.textContent=x.label||"Microphone "+(i+1);s.appendChild(o)})}catch{}}
mics();
async function source(){if($("source").value==="stream"){let a=new Audio();a.crossOrigin="anonymous";a.src=$("streamurl").value;a.loop=true;await a.play();return {stream:a.captureStream(),el:a}}let stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:$("mic").value?{exact:$("mic").value}:undefined,echoCancellation:false,noiseSuppression:false}});return {stream}}
function graph(src){let c=new AudioContext(),i=c.createMediaStreamSource(src.stream),g=c.createGain(),co=c.createDynamicsCompressor(),f=c.createBiquadFilter();g.gain.value=Number($("gain").value)/100;co.threshold.value=-28;co.ratio.value=4;f.type="lowpass";f.frequency.value=$("txmode").value==="FM"?15000:$("txmode").value==="AM"?9000:3200;let d=c.createMediaStreamDestination();i.connect(g).connect(co).connect(f).connect(d);c.resume();return {c,d,g}}
async function start(){if(S.tx)return;try{let src=await source(),g=graph(src);S.stationId=crypto.randomUUID();S.tx={...g,src};let f=Number($("txfreq").value)||101.7,u=$("txunit").value,m=$("txmode").value;let r=f+"/"+u+"/"+m;S.room=r;send({t:"broadcast",room:r,id:S.stationId,station:{id:S.stationId,name:$("station").value||S.name,freq:f,unit:u,mode:m,owner:S.name}});$("txstate").textContent="ON AIR";$("start").disabled=true;$("stop").disabled=false}catch(e){alert("Broadcast failed: "+e.message)}}
$("start").onclick=start;$("stop").onclick=()=>{if(!S.tx)return;send({t:"stop",id:S.stationId});S.peers.forEach(p=>p.close());S.peers.clear();S.tx.src.stream.getTracks().forEach(t=>t.stop());S.tx.src.el?.pause();S.tx.c.close();S.tx=null;$("txstate").textContent="STOPPED";$("start").disabled=false;$("stop").disabled=true};
async function offer(id){let p=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});S.peers.set(id,p);S.tx.d.stream.getTracks().forEach(t=>p.addTrack(t,S.tx.d.stream));p.onicecandidate=e=>e.c&&send({t:"ice",to:id,c:e.c});let o=await p.createOffer();await p.setLocalDescription(o);send({t:"offer",to:id,sdp:p.localDescription})}
async function answer(id,sdp){let p=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});S.rx.set(id,p);p.onicecandidate=e=>e.c&&send({t:"ice",to:id,c:e.c});p.ontrack=e=>{let c=new AudioContext(),s=c.createMediaStreamSource(e.streams[0]),g=c.createGain();g.gain.value=Number($("vol").value)/100;s.connect(g).connect(c.destination);c.resume();S.audio.set(id,c);$("rx").textContent="SIGNAL"};await p.setRemoteDescription(sdp);let a=await p.createAnswer();await p.setLocalDescription(a);send({t:"answer",to:id,sdp:p.localDescription})}
function drop(id){S.rx.get(id)?.close();S.rx.delete(id);S.audio.get(id)?.close();S.audio.delete(id)}
function renderStations(a){$("list").innerHTML="";if(!a.length){$("list").textContent="No stations yet.";return}a.forEach(s=>{let d=document.createElement("div");d.className="station";d.innerHTML="<div><b>"+esc(s.name)+"</b><br><small>"+s.freq+" "+s.unit+" · "+esc(s.mode)+" · "+esc(s.owner||"")+"</small></div><button>LISTEN</button>";d.querySelector("button").onclick=()=>{$("freq").value=s.freq;$("unit").value=s.unit;$("mode").value=s.mode;join()};$("list").appendChild(d)})}
function esc(x){return String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function draw(){let c=$("spec"),x=c.getContext("2d"),w=c.width=c.clientWidth*devicePixelRatio,h=c.height=110*devicePixelRatio;x.clearRect(0,0,w,h);x.strokeStyle="#21452a";for(let i=0;i<9;i++){x.beginPath();x.moveTo(0,i*h/9);x.lineTo(w,i*h/9);x.stroke()}x.strokeStyle="#62cf7b";x.beginPath();for(let i=0;i<w;i++){let q=Math.random()*8+Math.exp(-((i-w*.52)/(w*.055))**2)*55,y=h*.75-q;if(i)x.lineTo(i,y);else x.moveTo(i,y)}x.stroke();let q=$("water"),z=q.getContext("2d"),W=q.width=q.clientWidth*devicePixelRatio,H=220*devicePixelRatio;z.drawImage(q,0,1,W,H-1);for(let i=0;i<W;i++){let v=Math.random()*70+Math.exp(-((i-W*.52)/(W*.05))**2)*150;z.fillStyle="rgb("+((v*.3)|0)+","+Math.min(190,v|0)+","+((v*.55)|0)+")";z.fillRect(i,0,1,1)}requestAnimationFrame(draw)}draw();
</script></body></html>`;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/signal") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket endpoint", {status:426});
      const pair = new WebSocketPair();
      const client = pair[0], ws = pair[1];
      const id = crypto.randomUUID();
      ws.accept();
      clients.set(id,{ws,name:"Operator",room:null,role:"listener",stationId:null});
      const send = o => { try { ws.send(JSON.stringify(o)); } catch {} };
      send({t:"id",id});
      ws.addEventListener("message", e => {
        let m; try {m=JSON.parse(e.data)} catch {return}
        const s=clients.get(id); if(!s)return;
        if(m.t==="hello"){s.name=String(m.name||"Operator").slice(0,30); broadcastStations(); return}
        if(m.t==="join"){s.room=String(m.room||"").slice(0,100);s.role="listener";broadcastStations();return}
        if(m.t==="broadcast"){
          s.room=String(m.room||"");s.role="broadcaster";s.stationId=String(m.id||id);
          stations.set(s.stationId,{...m.station,room:s.room,sessionId:id});
          for(const [pid,p] of clients)if(pid!==id&&p.room===s.room&&p.role==="listener")safe(p.ws,{t:"peer",a:"join",id});
          broadcastStations();return
        }
        if(["offer","answer","ice"].includes(m.t)){let p=clients.get(String(m.to||""));if(p)safe(p.ws,{...m,from:id});return}
        if(m.t==="stop")stop(id,m.id)
      });
      ws.addEventListener("close",()=>cleanup(id));
      ws.addEventListener("error",()=>cleanup(id));
      return new Response(null,{status:101,webSocket:client});
    }
    return new Response(HTML,{headers:{"content-type":"text/html;charset=UTF-8","cache-control":"no-store"}});
  }
};

function safe(ws,o){try{ws.send(JSON.stringify(o))}catch{}}
function broadcastStations(){let list=[...stations.values()].map(({sessionId,room,...s})=>s);for(const p of clients.values())safe(p.ws,{t:"stations",stations:list})}
function stop(id,stationId){let s=stations.get(String(stationId));if(!s||s.sessionId!==id)return;stations.delete(String(stationId));for(const [pid,p] of clients)if(pid!==id&&p.room===s.room)safe(p.ws,{t:"peer",a:"leave",id});broadcastStations()}
function cleanup(id){let s=clients.get(id);if(!s)return;if(s.stationId)stop(id,s.stationId);clients.delete(id);broadcastStations()}
