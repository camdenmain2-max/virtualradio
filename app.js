const $=x=>document.getElementById(x);
const S={ws:null,id:null,name:"Operator",room:null,tx:null,peers:new Map(),rx:new Map(),audio:new Map(),stationId:null};

function room(){return (Number($("freq").value)||0)+"/"+$("unit").value+"/"+$("mode").value}
function send(x){if(S.ws?.readyState===1)S.ws.send(JSON.stringify(x))}

function connect(){
  if(S.ws?.readyState===1)return;
  const wsUrl=(location.protocol==="https:"?"wss":"ws")+"://"+location.host+"/signal?room="+encodeURIComponent(room());
  const w=new WebSocket(wsUrl); S.ws=w;
  $("online").textContent="CONNECTING";
  w.onopen=()=>{$("online").textContent="ONLINE";send({t:"hello",name:S.name});join()};
  w.onclose=()=>{$("online").textContent="OFFLINE";S.ws=null;setTimeout(connect,1800)};
  w.onmessage=e=>{try{msg(JSON.parse(e.data))}catch{}};
}

function msg(m){
  if(m.t==="id")S.id=m.id;
  if(m.t==="stations")renderStations(m.stations||[]);
  if(m.t==="peer"&&m.a==="join"&&S.tx)offer(m.id);
  if(m.t==="peer"&&m.a==="leave")drop(m.id);
  if(m.t==="offer")answer(m.from,m.sdp);
  if(m.t==="answer")S.peers.get(m.from)?.setRemoteDescription(m.sdp);
  if(m.t==="ice"){let p=S.peers.get(m.from)||S.rx.get(m.from);p?.addIceCandidate(m.c).catch(()=>{})}
}

function join(){
  S.room=room();
  if(S.ws?.readyState!==1){connect();return}
  S.rx.forEach(p=>p.close());S.rx.clear();
  S.audio.forEach(a=>a.close());S.audio.clear();
  send({t:"join",room:S.room});
}

$("name").value=localStorage.vtxName||"Operator";
$("name").onchange=()=>{S.name=($("name").value||"Operator").trim();localStorage.vtxName=S.name};
$("tune").onclick=join;
$("mode").onchange=join;$("unit").onchange=join;$("freq").onchange=join;
document.querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{$("freq").value=b.dataset.f;$("unit").value=b.dataset.u;$("mode").value=b.dataset.m;join()});

$("source").onchange=()=>{
  $("micwrap").classList.toggle("hide",$("source").value!=="mic");
  $("streamwrap").classList.toggle("hide",$("source").value!=="stream");
};

async function mics(){
  try{
    if(!navigator.mediaDevices)return;
    await navigator.mediaDevices.getUserMedia({audio:true});
    const d=await navigator.mediaDevices.enumerateDevices(),s=$("mic");s.innerHTML="";
    d.filter(x=>x.kind==="audioinput").forEach((x,i)=>{
      const o=document.createElement("option");o.value=x.deviceId;o.textContent=x.label||"Microphone "+(i+1);s.appendChild(o);
    });
  }catch{}
}
mics();

async function source(){
  if($("source").value==="stream"){
    const a=new Audio();a.crossOrigin="anonymous";a.src=$("streamurl").value;
    await a.play();
    if(!a.captureStream)throw new Error("This browser cannot capture that stream.");
    return {stream:a.captureStream(),el:a};
  }
  const stream=await navigator.mediaDevices.getUserMedia({
    audio:{deviceId:$("mic").value?{exact:$("mic").value}:undefined,echoCancellation:false,noiseSuppression:false}
  });
  return {stream};
}

function graph(src){
  const c=new AudioContext(),i=c.createMediaStreamSource(src.stream),g=c.createGain();
  const co=c.createDynamicsCompressor(),f=c.createBiquadFilter();
  g.gain.value=Number($("gain").value)/100;co.threshold.value=-28;co.ratio.value=4;
  f.type="lowpass";f.frequency.value=$("txmode").value==="FM"?15000:$("txmode").value==="AM"?9000:3200;
  const d=c.createMediaStreamDestination();i.connect(g).connect(co).connect(f).connect(d);c.resume();
  return {c,d,g};
}

async function start(){
  if(S.tx)return;
  try{
    const src=await source(),g=graph(src);S.stationId=crypto.randomUUID();S.tx={...g,src};
    const f=Number($("txfreq").value)||101.7,u=$("txunit").value,m=$("txmode").value,r=f+"/"+u+"/"+m;
    S.room=r;send({t:"broadcast",room:r,id:S.stationId,station:{id:S.stationId,name:$("station").value||S.name,freq:f,unit:u,mode:m,owner:S.name}});
    $("txstate").textContent="ON AIR";$("start").disabled=true;$("stop").disabled=false;
  }catch(e){alert("Broadcast failed: "+e.message)}
}

$("start").onclick=start;
$("stop").onclick=()=>{
  if(!S.tx)return;
  send({t:"stop",id:S.stationId});S.peers.forEach(p=>p.close());S.peers.clear();
  S.tx.src.stream.getTracks().forEach(t=>t.stop());S.tx.src.el?.pause();S.tx.c.close();S.tx=null;
  $("txstate").textContent="STOPPED";$("start").disabled=false;$("stop").disabled=true;
};

async function offer(id){
  const p=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});S.peers.set(id,p);
  S.tx.d.stream.getTracks().forEach(t=>p.addTrack(t,S.tx.d.stream));
  p.onicecandidate=e=>e.c&&send({t:"ice",to:id,c:e.c});
  const o=await p.createOffer();await p.setLocalDescription(o);send({t:"offer",to:id,sdp:p.localDescription});
}

async function answer(id,sdp){
  const p=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});S.rx.set(id,p);
  p.onicecandidate=e=>e.c&&send({t:"ice",to:id,c:e.c});
  p.ontrack=e=>{
    const c=new AudioContext(),s=c.createMediaStreamSource(e.streams[0]),g=c.createGain();
    g.gain.value=Number($("vol").value)/100;s.connect(g).connect(c.destination);c.resume();
    S.audio.set(id,c);$("rx").textContent="SIGNAL";
  };
  await p.setRemoteDescription(sdp);const a=await p.createAnswer();await p.setLocalDescription(a);
  send({t:"answer",to:id,sdp:p.localDescription});
}

function drop(id){S.rx.get(id)?.close();S.rx.delete(id);S.audio.get(id)?.close();S.audio.delete(id)}

function renderStations(a){
  $("list").innerHTML="";
  if(!a.length){$("list").textContent="No stations yet.";return}
  a.forEach(s=>{
    const d=document.createElement("div");d.className="station";
    d.innerHTML="<div><b>"+esc(s.name)+"</b><br><small>"+s.freq+" "+s.unit+" · "+esc(s.mode)+" · "+esc(s.owner||"")+"</small></div><button>LISTEN</button>";
    d.querySelector("button").onclick=()=>{$("freq").value=s.freq;$("unit").value=s.unit;$("mode").value=s.mode;join()};
    $("list").appendChild(d);
  });
}
function esc(x){return String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

function draw(){
  const c=$("spec"),x=c.getContext("2d"),w=c.width=Math.max(1,c.clientWidth*devicePixelRatio),h=c.height=110*devicePixelRatio;
  x.clearRect(0,0,w,h);x.strokeStyle="#21452a";
  for(let i=0;i<9;i++){x.beginPath();x.moveTo(0,i*h/9);x.lineTo(w,i*h/9);x.stroke()}
  x.strokeStyle="#62cf7b";x.beginPath();
  for(let i=0;i<w;i++){let q=Math.random()*8+Math.exp(-(((i-w*.52)/(w*.055))**2))*55,y=h*.75-q;i?x.lineTo(i,y):x.moveTo(i,y)}x.stroke();
  const q=$("water"),z=q.getContext("2d"),W=q.width=Math.max(1,q.clientWidth*devicePixelRatio),H=q.height=220*devicePixelRatio;
  z.drawImage(q,0,1,W,H-1);
  for(let i=0;i<W;i++){let v=Math.random()*70+Math.exp(-(((i-W*.52)/(W*.05))**2))*150;z.fillStyle="rgb("+((v*.3)|0)+","+Math.min(190,v|0)+","+((v*.55)|0)+")";z.fillRect(i,0,1,1)}
  requestAnimationFrame(draw);
}
draw();connect();
