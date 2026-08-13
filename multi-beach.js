// Multi-beach compatibility layer v6.
// Haeundae keeps its verified polygon grid from script.js.
// Gwangalli, Songjeong and Songdo build 10m guide cells only inside the
// OpenStreetMap natural=beach polygon for each beach.
(() => {
  const BEACH = {
    haeundae: { name: "해운대해수욕장", prefix: "HD", lat: 35.1587, lng: 129.1604, ripCode: "HAE" },
    gwangalli: { name: "광안리해수욕장", prefix: "GW", lat: 35.15089, lng: 129.11908, wayId: 107642460, ripCode: null },
    songjeong: { name: "송정해수욕장", prefix: "SJ", lat: 35.18046, lng: 129.20335, wayId: null, ripCode: "SONGJUNG" },
    songdo: { name: "송도해수욕장", prefix: "SD", lat: 35.07564, lng: 129.01881, wayId: 474957001, ripCode: null }
  };
  const OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];
  const RIP_WORKER = "https://beach-guide-rip-current-api.chopyoz1207.workers.dev";
  const GRID = 10;
  const BOUNDARY_CACHE_MS = 30 * 24 * 60 * 60 * 1000;

  let cells = [];
  let selectedCell = null;
  let selectedGridId = null;
  let selectedPoint = null;
  let ignoreMapClickUntil = 0;
  let facilityOverlays = [];
  let loadVersion = 0;

  const beachKey = () => document.querySelector("#beachSelect")?.value || "haeundae";
  const current = () => BEACH[beachKey()] || BEACH.haeundae;
  const isHaeundae = () => beachKey() === "haeundae";

  function alpha(index) {
    let n = index + 1, label = "";
    while (n > 0) { n--; label = String.fromCharCode(65 + (n % 26)) + label; n = Math.floor(n / 26); }
    return label;
  }

  function normalizeHaeundaeId(text) {
    const raw = String(text || "").replace(/구역/g, "").replace(/·.*$/g, "").trim();
    let m = raw.match(/^HD-([A-Z]+)0*(\d+)$/i);
    if (m) return `HD-${m[1].toUpperCase()}${Number(m[2])}`;
    m = raw.match(/^([A-Z]+)0*(\d+)$/i);
    if (m) return `HD-${m[1].toUpperCase()}${Number(m[2])}`;
    m = raw.match(/^(\d+)-([A-Z]+)$/i);
    if (m) return `HD-${m[2].toUpperCase()}${Number(m[1])}`;
    return "";
  }

  function clearCells() {
    cells.forEach((polygon) => polygon.setMap(null));
    cells = [];
    selectedCell = null;
    selectedGridId = null;
  }

  function clearFacilities() {
    facilityOverlays.forEach((overlay) => overlay.setMap(null));
    facilityOverlays = [];
  }

  function metresProjection(origin) {
    const mLat = 111320;
    const mLng = 111320 * Math.cos(origin.lat * Math.PI / 180);
    return {
      toXY: (p) => ({ x: (p.lng-origin.lng)*mLng, y: (p.lat-origin.lat)*mLat }),
      toGeo: (p) => ({ lat: origin.lat+p.y/mLat, lng: origin.lng+p.x/mLng })
    };
  }

  function pointInside(p, poly) {
    let inside = false;
    for (let i=0,j=poly.length-1;i<poly.length;j=i++) {
      const a=poly[i], b=poly[j];
      if ((a.y>p.y)!==(b.y>p.y) && p.x<((b.x-a.x)*(p.y-a.y))/(b.y-a.y)+a.x) inside=!inside;
    }
    return inside;
  }

  function principalAxes(points) {
    const cx=points.reduce((s,p)=>s+p.x,0)/points.length;
    const cy=points.reduce((s,p)=>s+p.y,0)/points.length;
    let xx=0,yy=0,xy=0;
    points.forEach((p)=>{const dx=p.x-cx,dy=p.y-cy;xx+=dx*dx;yy+=dy*dy;xy+=dx*dy;});
    const angle=.5*Math.atan2(2*xy,xx-yy);
    let u={x:Math.cos(angle),y:Math.sin(angle)};
    if(u.x<0)u={x:-u.x,y:-u.y};
    return {c:{x:cx,y:cy},u,v:{x:-u.y,y:u.x}};
  }

  function toFrame(p,a) {
    const dx=p.x-a.c.x,dy=p.y-a.c.y;
    return {x:dx*a.u.x+dy*a.u.y,y:dx*a.v.x+dy*a.v.y};
  }

  function fromFrame(p,a) {
    return {x:a.c.x+p.x*a.u.x+p.y*a.v.x,y:a.c.y+p.x*a.u.y+p.y*a.v.y};
  }

  function boundaryCacheKey(cfg){return `actualBeachBoundary:${cfg.prefix}:v6`;}
  function readBoundaryCache(cfg){
    try{
      const value=JSON.parse(localStorage.getItem(boundaryCacheKey(cfg))||"null");
      if(!value||!Array.isArray(value.boundary)||Date.now()-value.savedAt>BOUNDARY_CACHE_MS)return null;
      return value.boundary;
    }catch{return null;}
  }
  function saveBoundaryCache(cfg,boundary){try{localStorage.setItem(boundaryCacheKey(cfg),JSON.stringify({savedAt:Date.now(),boundary}));}catch{}}

  function elementCentre(element){
    const g=element.geometry||[];
    if(!g.length)return null;
    const s=g.reduce((a,p)=>({lat:a.lat+p.lat,lng:a.lng+p.lon}),{lat:0,lng:0});
    return {lat:s.lat/g.length,lng:s.lng/g.length};
  }

  function distanceSq(a,b){
    const dy=(a.lat-b.lat)*111320;
    const dx=(a.lng-b.lng)*111320*Math.cos(a.lat*Math.PI/180);
    return dx*dx+dy*dy;
  }

  async function overpassQuery(query){
    let lastError;
    for(const endpoint of OVERPASS){
      try{
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),10000);
        const response=await fetch(`${endpoint}?data=${encodeURIComponent(query)}`,{headers:{Accept:"application/json"},signal:controller.signal});
        clearTimeout(timer);
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        const data=await response.json();
        if(data&&Array.isArray(data.elements))return data;
      }catch(error){lastError=error;}
    }
    throw lastError||new Error("boundary service unavailable");
  }

  function chooseSongjeongWay(elements,cfg){
    const ways=elements.filter((e)=>e.type==="way"&&Array.isArray(e.geometry)&&e.geometry.length>=4);
    if(!ways.length)return null;
    return ways.map((way)=>{
      const name=way.tags?.name||way.tags?.["name:ko"]||"";
      const centre=elementCentre(way)||cfg;
      let score=distanceSq(centre,cfg);
      if(name.includes("송정"))score-=1e12;
      return {way,score};
    }).sort((a,b)=>a.score-b.score)[0].way;
  }

  async function getActualBoundary(cfg){
    const cached=readBoundaryCache(cfg);
    if(cached)return cached;
    let query;
    if(cfg.wayId){
      query=`[out:json][timeout:18];way(${cfg.wayId});out geom tags;`;
    }else{
      query=`[out:json][timeout:18];way(around:1800,${cfg.lat},${cfg.lng})["natural"="beach"];out geom tags;`;
    }
    const data=await overpassQuery(query);
    let way;
    if(cfg.wayId)way=(data.elements||[]).find((e)=>e.type==="way"&&e.id===cfg.wayId);
    else way=chooseSongjeongWay(data.elements||[],cfg);
    if(!way||!Array.isArray(way.geometry)||way.geometry.length<4)throw new Error("beach polygon missing");
    const boundary=way.geometry.map((p)=>({lat:p.lat,lng:p.lon}));
    saveBoundaryCache(cfg,boundary);
    return boundary;
  }

  function ensureGridNote(){
    const card=document.querySelector(".location-card");if(!card)return null;
    let el=card.querySelector(".multi-beach-grid-note");
    if(!el){el=document.createElement("p");el.className="multi-beach-grid-note";el.style.cssText="margin:10px 0 0;padding:9px 10px;border-radius:9px;background:#f4fafb;color:#60787e;font-size:10px;line-height:1.5";card.appendChild(el);}
    el.hidden=isHaeundae();return el;
  }

  function displaySelection(id,point){
    const cfg=current();
    const selected=document.querySelector("#selectedAddress");if(selected)selected.innerHTML=`${id} <em>구역</em>`;
    const panel=document.querySelector("#panelAddress");if(panel)panel.innerHTML=`${id} 구역 <small>· 10m × 10m</small>`;
    const desc=document.querySelector(".location-card p");if(desc)desc.textContent=`${cfg.name} 모래사장`;
    const caption=document.querySelector(".location-card span");if(caption)caption.textContent="내가 선택한 장소";
    selectedGridId=id;selectedPoint=point;
    setNotice(`${cfg.name} ${id} 구역을 선택했어요.`);
  }

  function selectCell(id,polygon,point){
    ignoreMapClickUntil=Date.now()+450;
    if(selectedCell)selectedCell.setOptions({fillOpacity:.05,strokeColor:"#237a8b",strokeWeight:1});
    selectedCell=polygon;
    polygon.setOptions({fillOpacity:.52,fillColor:"#f6b73c",strokeColor:"#d76b00",strokeWeight:2});
    displaySelection(id,point);
  }

  async function drawActualBeachGrid(version){
    clearCells();
    if(isHaeundae()||!window.kakaoMap||!window.kakao?.maps)return;
    const cfg=current();
    const note=ensureGridNote();
    if(note)note.textContent=`${cfg.name} 실제 모래사장 경계를 불러오는 중입니다.`;
    setNotice(`${cfg.name} 실제 모래사장 경계를 기준으로 10m 격자를 준비하고 있어요.`);
    try{
      const boundary=await getActualBoundary(cfg);
      if(version!==loadVersion||beachKey()=== "haeundae")return;
      const origin=boundary.reduce((a,p)=>({lat:a.lat+p.lat/boundary.length,lng:a.lng+p.lng/boundary.length}),{lat:0,lng:0});
      const proj=metresProjection(origin);
      const local=boundary.map(proj.toXY);
      const axes=principalAxes(local);
      const framed=local.map((p)=>toFrame(p,axes));
      const minX=Math.floor(Math.min(...framed.map(p=>p.x))/GRID)*GRID;
      const maxX=Math.ceil(Math.max(...framed.map(p=>p.x))/GRID)*GRID;
      const minY=Math.floor(Math.min(...framed.map(p=>p.y))/GRID)*GRID;
      const maxY=Math.ceil(Math.max(...framed.map(p=>p.y))/GRID)*GRID;
      let count=0,rowIndex=0;
      for(let y=minY;y<maxY;y+=GRID,rowIndex++){
        let colIndex=0;
        for(let x=minX;x<maxX;x+=GRID,colIndex++){
          const frameCorners=[{x,y},{x:x+GRID,y},{x:x+GRID,y:y+GRID},{x,y:y+GRID}];
          const centreFrame={x:x+GRID/2,y:y+GRID/2};
          // Every corner plus the centre must be inside the actual beach polygon.
          if(!pointInside(centreFrame,framed)||!frameCorners.every((p)=>pointInside(p,framed)))continue;
          const corners=frameCorners.map((p)=>proj.toGeo(fromFrame(p,axes)));
          const centre=proj.toGeo(fromFrame(centreFrame,axes));
          const id=`${cfg.prefix}-${alpha(rowIndex)}${colIndex+1}`;
          const polygon=new window.kakao.maps.Polygon({map:kakaoMap,path:corners.map(p=>new window.kakao.maps.LatLng(p.lat,p.lng)),strokeWeight:1,strokeColor:"#237a8b",strokeOpacity:.72,fillColor:"#70d1d2",fillOpacity:.05});
          window.kakao.maps.event.addListener(polygon,"click",()=>selectCell(id,polygon,centre));
          cells.push(polygon);count++;
        }
      }
      if(note)note.textContent=`${cfg.prefix} 체계의 10m 안내격자 ${count.toLocaleString()}개를 OpenStreetMap의 실제 natural=beach 모래사장 경계 안에만 표시했습니다. 공식 측량 주소는 아닙니다.`;
      setNotice(`${cfg.name} 실제 모래사장 경계 안에만 10m 안내격자를 표시했어요.`);
    }catch(error){
      if(note)note.textContent=`${cfg.name} 실제 모래사장 경계를 불러오지 못해 격자를 표시하지 않았습니다. 잘못된 위치에 임시 격자를 만들지는 않습니다.`;
      setNotice(`${cfg.name} 모래사장 경계 연결에 실패했어요. 잠시 후 해변을 다시 선택해 주세요.`);
    }
  }

  function repairHaeundaeDisplay(){
    if(!isHaeundae())return;
    const selected=document.querySelector("#selectedAddress");
    const panel=document.querySelector("#panelAddress");
    const desc=document.querySelector(".location-card p");if(desc)desc.textContent="해운대해수욕장 모래사장";
    const id=normalizeHaeundaeId(selected?.textContent||panel?.textContent||"");
    if(!id)return;
    if(selected&&!selected.textContent.trim().startsWith("HD-"))selected.innerHTML=`${id} <em>구역</em>`;
    if(panel&&!panel.textContent.trim().startsWith(id))panel.innerHTML=`${id} 구역 <small>· 10m × 10m</small>`;
    const gridNote=ensureGridNote();if(gridNote)gridNote.hidden=true;
  }

  function resetBeachUI(){
    const cfg=current();
    document.title=`해변가이드 | ${cfg.name} 안전 지도`;
    const title=document.querySelector(".panel-head h2");if(title)title.textContent=`${cfg.name} 안전 안내`;
    const desc=document.querySelector(".location-card p");if(desc)desc.textContent=`${cfg.name} 모래사장`;
    if(isHaeundae())repairHaeundaeDisplay();
    else{
      const selected=document.querySelector("#selectedAddress");if(selected)selected.innerHTML=`격자를 선택하세요 <em>${cfg.name}</em>`;
      const panel=document.querySelector("#panelAddress");if(panel)panel.innerHTML=`격자를 선택하세요 <small>· 10m × 10m</small>`;
      ensureGridNote();
    }
  }

  function fmt(p){return `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;}

  async function copyOther(event){
    if(isHaeundae())return;event.preventDefault();event.stopImmediatePropagation();
    const cfg=current(),id=selectedGridId||"지도 위치",p=selectedPoint||{lat:cfg.lat,lng:cfg.lng};
    const text=`${cfg.name} ${id} ${fmt(p)}`;
    try{await navigator.clipboard.writeText(text);setNotice(`${id} 위치를 복사했어요.`);}catch{setNotice(text);}
  }

  async function shareOther(event){
    if(isHaeundae())return;event.preventDefault();event.stopImmediatePropagation();
    const cfg=current(),id=selectedGridId||"지도 위치",p=selectedPoint||{lat:cfg.lat,lng:cfg.lng};
    const text=`${cfg.name} 만남 위치: ${id} · ${fmt(p)}`;
    try{if(navigator.share)await navigator.share({title:`${cfg.name} 만남 위치`,text,url:location.href});else await navigator.clipboard.writeText(`${text}\n${location.href}`);}catch(e){if(e.name!=="AbortError")setNotice("공유하지 못했어요.");}
  }

  function locateOther(event){
    if(isHaeundae())return;event.preventDefault();event.stopImmediatePropagation();
    const button=event.currentTarget;if(!navigator.geolocation){setNotice("GPS를 사용할 수 없어요.");return;}
    button.disabled=true;button.textContent="현재 위치를 확인하고 있어요…";
    navigator.geolocation.getCurrentPosition(({coords})=>{selectedPoint={lat:coords.latitude,lng:coords.longitude};const pos=new window.kakao.maps.LatLng(selectedPoint.lat,selectedPoint.lng);if(window.myLocationMarker)myLocationMarker.setMap(null);window.myLocationMarker=new window.kakao.maps.Marker({map:kakaoMap,position:pos,title:"내 현재 위치"});kakaoMap.panTo(pos);button.disabled=false;button.innerHTML="내 현재 위치 지도에서 확인 <span>⌖</span>";setNotice(`${current().name} 주변에서 현재 GPS 위치를 표시했어요.`);},()=>{button.disabled=false;button.innerHTML="내 현재 위치 지도에서 확인 <span>⌖</span>";setNotice("위치 권한을 허용해 주세요.");},{enableHighAccuracy:true,timeout:10000,maximumAge:0});
  }

  async function queryFacilities(version){
    clearFacilities();if(isHaeundae())return;
    const cfg=current();
    const q=`[out:json][timeout:12];(nwr(around:1200,${cfg.lat},${cfg.lng})["amenity"="toilets"];nwr(around:1200,${cfg.lat},${cfg.lng})["amenity"="shower"];nwr(around:1200,${cfg.lat},${cfg.lng})["amenity"="parking"];);out center tags;`;
    let data=null;
    for(const endpoint of OVERPASS){try{const r=await fetch(`${endpoint}?data=${encodeURIComponent(q)}`);if(r.ok){data=await r.json();break;}}catch{}}
    if(!data||version!==loadVersion||isHaeundae())return;
    const point=e=>e.lat!=null?{lat:e.lat,lng:e.lon}:e.center?{lat:e.center.lat,lng:e.center.lon}:null;
    (data.elements||[]).slice(0,40).forEach(e=>{const p=point(e);if(!p)return;const amenity=e.tags?.amenity;const icon=amenity==="toilets"?"🚻":amenity==="shower"?"🚿":"🅿";const name=e.tags?.name||e.tags?.["name:ko"]||(amenity==="toilets"?"화장실":amenity==="shower"?"샤워 시설":"주차장");const b=document.createElement("button");b.type="button";b.className="map-facility-label";b.textContent=icon;b.addEventListener("click",()=>setNotice(`${name} · 공개 지도 시설 정보 · 운영 여부는 현장 확인 필요`));facilityOverlays.push(new window.kakao.maps.CustomOverlay({map:kakaoMap,position:new window.kakao.maps.LatLng(p.lat,p.lng),yAnchor:1,content:b}));});
  }

  async function loadSongjeongRip(version){
    if(beachKey()!=="songjeong")return;
    const card=document.querySelector(".rip-current-card");if(card)card.hidden=false;
    try{const r=await fetch(`${RIP_WORKER}/rip-current?beachCode=SONGJUNG`);if(!r.ok)throw new Error();const data=await r.json();if(version!==loadVersion||beachKey()!=="songjeong")return;const items=Array.isArray(data.items)?data.items:[];if(!items.length)throw new Error();const latest=items[items.length-1],level=String(latest.lastScrCn||"관심").trim()||"관심";const rank={관심:["🟢","관심"],주의:["🟡","주의"],경계:["🟠","경계"],위험:["🔴","위험"]}[level]||["🟢",level];document.querySelector("#ripCurrentLight").textContent=rank[0];document.querySelector("#ripCurrentLevel").textContent=`${rank[1]} · 송정해수욕장 이안류 지수`;document.querySelector("#ripCurrentStatus").textContent=`국립해양조사원 공식 이안류 지수 ${rank[1]} 단계입니다.`;}catch{document.querySelector("#ripCurrentLevel").textContent="공식 정보 확인 필요";}
  }

  async function onBeachChange(){
    const version=++loadVersion;clearCells();clearFacilities();selectedPoint=null;selectedGridId=null;resetBeachUI();
    if(isHaeundae()){setTimeout(repairHaeundaeDisplay,60);setTimeout(repairHaeundaeDisplay,300);return;}
    const rip=document.querySelector(".rip-current-card");if(rip)rip.hidden=!current().ripCode;
    setTimeout(()=>{if(version===loadVersion&&!isHaeundae()){drawActualBeachGrid(version);queryFacilities(version);loadSongjeongRip(version);}},120);
  }

  function init(){
    document.querySelector("#beachSelect")?.addEventListener("change",onBeachChange);
    document.querySelector("#copyAddress")?.addEventListener("click",copyOther,true);
    document.querySelector("#shareMeeting")?.addEventListener("click",shareOther,true);
    document.querySelector("#locateMe")?.addEventListener("click",locateOther,true);
    if(window.kakaoMap&&window.kakao?.maps)window.kakao.maps.event.addListener(kakaoMap,"click",event=>{if(isHaeundae()||Date.now()<ignoreMapClickUntil)return;selectedGridId=null;selectedPoint={lat:event.latLng.getLat(),lng:event.latLng.getLng()};const cfg=current();const selected=document.querySelector("#selectedAddress");if(selected)selected.innerHTML=`지도 위치 <em>${cfg.name}</em>`;const panel=document.querySelector("#panelAddress");if(panel)panel.innerHTML="지도 위치 <small>· 격자를 눌러 구역 선택</small>";});
    const selected=document.querySelector("#selectedAddress");if(selected)new MutationObserver(()=>{if(!isHaeundae())return;const id=normalizeHaeundaeId(selected.textContent);if(id&&!selected.textContent.trim().startsWith("HD-"))repairHaeundaeDisplay();}).observe(selected,{childList:true,subtree:true,characterData:true});
    resetBeachUI();
  }

  if(document.readyState==="complete")init();else window.addEventListener("load",init,{once:true});
})();

// Weather and marine-safety modal. The existing live cards are moved into the
// modal, so all existing weather/tide/rip-current update logic keeps working.
(() => {
  let activePanel = "overview";
  const ITEMS = [
    { key:"weather", icon:"☀️", label:"날씨", selector:".weather-card", desc:"기온 · 강수 · 바람" },
    { key:"safety", icon:"🚦", label:"안전지수", selector:".safety-index-card", desc:"현재 조건 종합 판정" },
    { key:"condition", icon:"🌊", label:"해변상태", selector:".condition-card", desc:"기상·조석·이안류 해석" },
    { key:"rip", icon:"⚠️", label:"이안류", selector:".rip-current-card", desc:"공식 이안류 위험 정보" },
    { key:"tide", icon:"↕️", label:"조석", selector:".tide-card", desc:"만조 · 간조 시각" }
  ];

  function addStyles(){
    if(document.querySelector("#safetyModalStyles"))return;
    const style=document.createElement("style");
    style.id="safetyModalStyles";
    style.textContent=`
      .environment-group{border:0!important;background:transparent!important;overflow:visible!important}
      .environment-group>summary{display:none!important}
      .environment-group .environment-body{padding:0!important}
      .safety-launch-card{border:1px solid #bddde4;border-radius:15px;background:#f7fcfd;padding:15px}
      .safety-launch-card .tag{margin:0;color:#087698;font-size:10px;font-weight:900;letter-spacing:.14em}
      .safety-launch-card h3{margin:6px 0 5px;color:#123b50;font-size:16px}
      .safety-launch-card p{margin:0;color:#667f87;font-size:10px;line-height:1.55}
      .safety-launch-button{width:100%;margin-top:11px;border:0;border-radius:11px;padding:12px;background:#0b7896;color:#fff;font-weight:900;font-size:12px;cursor:pointer}
      .safety-modal-overlay{position:fixed;inset:0;z-index:99990;display:grid;place-items:center;padding:16px;background:rgba(7,28,39,.48);backdrop-filter:blur(2px)}
      .safety-modal-overlay[hidden]{display:none!important}
      .safety-modal{position:relative;width:min(500px,calc(100vw - 28px));max-height:min(86vh,780px);overflow:auto;box-sizing:border-box;border-radius:18px;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.3);padding:20px}
      .safety-modal-close{position:absolute;right:11px;top:11px;width:34px;height:34px;border:0;border-radius:50%;background:#f1f5f6;color:#284c58;font-size:21px;line-height:1;cursor:pointer}
      .safety-modal-head .tag{margin:0 42px 5px 0;color:#087698;font-size:10px;font-weight:900;letter-spacing:.14em}
      .safety-modal-head h2{margin:0 42px 6px 0;color:#123b50;font-size:20px}
      .safety-modal-head p{margin:0;color:#667f87;font-size:10px;line-height:1.55}
      .safety-choice-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:15px}
      .safety-choice{border:1px solid #d5e2e6;border-radius:12px;background:#fff;padding:12px;text-align:left;cursor:pointer}
      .safety-choice:hover{background:#f7fbfc}.safety-choice.active{border-color:#69b6c8;background:#eef9fb}
      .safety-choice b{display:block;color:#173f50;font-size:12px}.safety-choice span{display:block;margin-top:4px;color:#70868d;font-size:9px;line-height:1.4}
      .safety-choice-icon{font-size:18px;margin-bottom:5px}
      .safety-modal-content{margin-top:14px}
      .safety-modal-content>.weather-card,.safety-modal-content>.safety-index-card,.safety-modal-content>.condition-card,.safety-modal-content>.rip-current-card,.safety-modal-content>.tide-card{margin:0!important}
      .safety-modal-back{width:100%;margin-top:12px;border:1px solid #bfd5dc;border-radius:10px;padding:10px;background:#fff;color:#315968;font-weight:800;cursor:pointer}
      .safety-modal-helper{margin:12px 0 0;padding:9px;border-radius:9px;background:#f6fafb;color:#6a8087;font-size:9px;line-height:1.5}
      @media(max-width:520px){.safety-modal{max-height:90vh;padding:17px}.safety-choice-grid{grid-template-columns:1fr}.safety-modal-head h2{font-size:18px}}
    `;
    document.head.appendChild(style);
  }

  function setup(){
    const group=document.querySelector(".environment-group");
    const body=group?.querySelector(".environment-body");
    if(!group||!body||document.querySelector("#safetyModalOverlay"))return;
    addStyles();

    const liveCards={};
    ITEMS.forEach(item=>{const el=body.querySelector(item.selector);if(el)liveCards[item.key]=el;});

    const launch=document.createElement("section");
    launch.className="safety-launch-card";
    launch.innerHTML=`<p class="tag">WEATHER · MARINE SAFETY</p><h3>기상·해양 안전 정보</h3><p>날씨, 안전지수, 해변상태, 이안류, 조석 중 필요한 정보만 선택해서 확인하세요.</p><button id="openSafetyModal" class="safety-launch-button" type="button">안전 정보 선택해서 보기</button>`;
    body.innerHTML="";
    body.appendChild(launch);

    const overlay=document.createElement("div");
    overlay.id="safetyModalOverlay";
    overlay.className="safety-modal-overlay";
    overlay.hidden=true;
    overlay.setAttribute("aria-hidden","true");
    overlay.innerHTML=`<section class="safety-modal" role="dialog" aria-modal="true" aria-labelledby="safetyModalTitle"><button id="closeSafetyModal" class="safety-modal-close" type="button" aria-label="안전 정보 창 닫기">×</button><div id="safetyModalInner"></div></section>`;
    document.body.appendChild(overlay);

    const stash=document.createElement("div");
    stash.id="safetyLiveCardStash";
    stash.hidden=true;
    Object.values(liveCards).forEach(card=>stash.appendChild(card));
    document.body.appendChild(stash);

    function beachLabel(){return document.querySelector("#beachSelect")?.selectedOptions?.[0]?.textContent?.split(" · ")[0]||"선택한 해변";}

    function renderChoice(){
      activePanel="overview";
      const inner=document.querySelector("#safetyModalInner");
      inner.innerHTML=`<div class="safety-modal-head"><p class="tag">WEATHER · MARINE SAFETY</p><h2 id="safetyModalTitle">어떤 정보를 확인할까요?</h2><p>${beachLabel()}의 필요한 안전 정보만 골라서 확인할 수 있습니다.</p></div><div class="safety-choice-grid">${ITEMS.map(item=>`<button class="safety-choice" type="button" data-safety-view="${item.key}"><div class="safety-choice-icon">${item.icon}</div><b>${item.label}</b><span>${item.desc}</span></button>`).join("")}</div><p class="safety-modal-helper">정보는 기존과 동일하게 실시간으로 갱신됩니다. 실제 입수·통제 여부는 현장 안전요원 안내를 우선하세요.</p>`;
      inner.querySelectorAll("[data-safety-view]").forEach(btn=>btn.addEventListener("click",()=>renderPanel(btn.dataset.safetyView)));
    }

    function renderPanel(key){
      const item=ITEMS.find(x=>x.key===key);
      const card=liveCards[key];
      if(!item||!card)return;
      activePanel=key;
      const inner=document.querySelector("#safetyModalInner");
      inner.innerHTML=`<div class="safety-modal-head"><p class="tag">${item.label.toUpperCase()}</p><h2 id="safetyModalTitle">${item.label}</h2><p>${beachLabel()}의 ${item.desc} 정보를 확인합니다.</p></div><div id="safetyModalContent" class="safety-modal-content"></div><button id="safetyModalBack" class="safety-modal-back" type="button">← 다른 안전 정보 선택</button>`;
      inner.querySelector("#safetyModalContent").appendChild(card);
      inner.querySelector("#safetyModalBack").addEventListener("click",()=>{stash.appendChild(card);renderChoice();});
    }

    function open(){
      renderChoice();
      overlay.hidden=false;
      overlay.setAttribute("aria-hidden","false");
      document.body.style.overflow="hidden";
    }

    function close(){
      if(activePanel!=="overview"&&liveCards[activePanel])stash.appendChild(liveCards[activePanel]);
      overlay.hidden=true;
      overlay.setAttribute("aria-hidden","true");
      document.body.style.overflow="";
      activePanel="overview";
    }

    document.querySelector("#openSafetyModal")?.addEventListener("click",open);
    document.querySelector("#closeSafetyModal")?.addEventListener("click",close);
    overlay.addEventListener("click",event=>{if(event.target===overlay)close();});
    document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!overlay.hidden)close();});
    document.querySelector("#beachSelect")?.addEventListener("change",()=>{if(!overlay.hidden)renderChoice();});
  }

  if(document.readyState==="complete")setup();else window.addEventListener("load",setup,{once:true});
})();