/*@ASSET DEMO demo.jpg dataurl:image/jpeg*/
const DEMO_POLY=[[162,615],[172,590],[215,568],[270,555],[345,540],[400,514],[450,492],[500,487],[560,488],[620,503],[690,521],[745,527],[815,511],[824,517],[802,540],[826,560],[837,600],[834,640],[832,650],[768,650],[762,666],[664,666],[658,650],[366,650],[360,666],[262,666],[256,650],[160,650]].map(([x,y])=>({x:(x-110)/790,y:(y-433.33)/270}));

const $=id=>document.getElementById(id);
const view=$('view'),over=$('over'),vctx=view.getContext('2d'),octx=over.getContext('2d'),stage=$('stage'),inner=$('inner');
const eraseC=document.createElement('canvas'),addC=document.createElement('canvas'),rasC=document.createElement('canvas');
let img=null,W=0,H=0,R,G,B,grad=null,magN=null,gdx=null,gdy=null,support=null,gradKey='';
let fin=null,bbox=null,parts=0,vec=[],vecPath=new Path2D(),autoItems=[];
let poly=[],draft=null,mode='result',tool='hand',undoStack=[],hover=null,lineStart=null,lastPt=null,stroking=false;
let userLines=[],trace=null,editDrag=null,editHover=null,delHover=null,uidSeq=1,shiftDown=false,spaceDown=false;
let wheelConf='',wheels=[],wheelKey='',wheelsManual=false,wheelMode='arc';
let zv={z:1,tx:0,ty:0},panning=null;
let WIGK=20000,SC=1,carBoxPx=null,crop={x0:0,y0:0,x1:1,y1:1},photoC=document.createElement('canvas'),gen=0,pipeBusy=false;
let teedGamma=1,teedSess=null,teedE=null,teedState='idle',teedRectKey='';
const lw=()=>Math.max(1.2,(2*+$('thick').value+1)*SC);
const pxs=()=>W/over.getBoundingClientRect().width||1;

/* ================= Laden ================= */
function loadSrc(src,demo){
  const im=new Image();
  im.onload=()=>{img=im;demoFallback=demo?DEMO_POLY.map(p=>({...p})):null;
    seg=null;segFor=null;carMask=null;maskKey='';teedE=null;teedRectKey='';lineE=null;artKey='';carParts=[];crop={x0:0,y0:0,x1:1,y1:1};
    resetEdits();zv={z:1,tx:0,ty:0};
    startPipeline(im,++gen,demo);};
  im.onerror=()=>setTip('Das Bild konnte nicht gelesen werden. Bitte JPG, PNG oder WebP verwenden.');
  im.src=src;
}
function loadFile(f){if(!f||!f.type.startsWith('image/'))return;applyNameGuess(f.name);const r=new FileReader();r.onload=()=>loadSrc(r.result,false);r.readAsDataURL(f);}
$('file').onchange=e=>loadFile(e.target.files[0]);
$('file2').onchange=e=>loadFile(e.target.files[0]);
$('demoBtn').onclick=()=>{$('brand').value='McLaren';$('model').value='765LT';refreshModelList();loadSrc(DEMO,true);};
stage.addEventListener('dragover',e=>{e.preventDefault();stage.classList.add('drop')});
stage.addEventListener('dragleave',()=>stage.classList.remove('drop'));
stage.addEventListener('drop',e=>{e.preventDefault();stage.classList.remove('drop');loadFile(e.dataTransfer.files[0])});
window.addEventListener('paste',e=>{for(const it of e.clipboardData.items){if(it.type.startsWith('image/')){loadFile(it.getAsFile());break;}}});

function resetEdits(){poly=[];draft=null;undoStack=[];userLines=[];trace=null;wheels=[];wheelKey='';wheelsManual=false;
  for(const m of [eraseC,addC])if(m.width)m.getContext('2d').clearRect(0,0,m.width,m.height);}
const nextFrame=()=>new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));
function setProgress(step,text){
  const p=$('prog');if(!step){p.hidden=true;return;}
  p.hidden=false;$('progT').textContent=text;$('progS').textContent='Schritt '+step+' von 3';$('progB').style.width=(step/3*100-15)+'%';
}
/* Autobreite im Original (px) */
function carWidthOrig(){
  const nw=img.naturalWidth;
  if(seg&&$('aiOn').checked&&seg.bx1>seg.bx0)return (seg.bx1-seg.bx0)*nw;
  return (crop.x1-crop.x0)*nw*0.8;
}
async function startPipeline(im,g,demo){
  pipeBusy=true;setMode('result');
  setupRes(true,true);render();
  setProgress(1,'KI stellt das Auto frei …');await nextFrame();
  if($('aiOn').checked){try{await segmentImage(im);}catch(e){}}
  if(g!==gen)return;
  if(seg&&$('aiOn').checked){
    const nw=im.naturalWidth,nh=im.naturalHeight,cw=seg.bx1-seg.bx0,ch=seg.by1-seg.by0;
    crop={x0:Math.max(0,seg.bx0-cw*0.07),x1:Math.min(1,seg.bx1+cw*0.07),y0:Math.max(0,seg.by0-ch*0.16),y1:Math.min(1,seg.by1+ch*0.12)};
  }else{crop={x0:0,y0:0,x1:1,y1:1};if(demo&&demoFallback)poly=demoFallback;}
  resetEditsKeepPoly();
  setupRes(true,true);
  await runTeedStage(g);
  if(g!==gen)return;
  setProgress(3,'Zeichnung wird erstellt …');await nextFrame();
  run();fitView();
  pipeBusy=false;setProgress(0);render();
  setTip(finishTip());
}
function finishTip(){
  if(!seg)return 'Kein Auto automatisch gefunden. Mit <b>„Bereich selbst festlegen“</b> das Auto umranden.';
  const notes=[];
  // Auto am Bildrand abgeschnitten?
  const m=currentMask();
  if(m){let tb=0,lr=0;const nw=img.naturalWidth,nh=img.naturalHeight;
    const atL=crop.x0<=0.001,atR=crop.x1>=0.999,atT=crop.y0<=0.001,atB=crop.y1>=0.999;
    for(let y=0;y<H;y++){if(atL&&m[y*W])lr++;if(atR&&m[y*W+W-1])lr++;}
    for(let x=0;x<W;x++){if(atT&&m[x])tb++;if(atB&&m[(H-1)*W+x])tb++;}
    if(lr>H*0.08||tb>W*0.08)notes.push('⚠ Das Auto ist am Bildrand abgeschnitten – ein Foto mit etwas Rand drumherum liefert einen sauberen Umriss.');}
  if(wheels.length<2)notes.push('Keine zwei Räder erkannt – am besten klappt eine genaue <b>Seitenansicht</b>.');
  return 'Fertig – automatisch erstellt. <b>Tipp:</b> Oben den Stil wählen (Minimal / Mittel / Detail). Störende Linien mit <b>D</b> anklicken, fehlende mit <b>N</b> nachzeichnen.'+(notes.length?'<br>'+notes.join(' '):'');
}
function resetEditsKeepPoly(){const p=poly;resetEdits();poly=p;}
async function runTeedStage(g){
  if(!$('autoOn').checked){teedE=null;lineE=null;return;}
  setProgress(2,'KI zeichnet die Linien …');await nextFrame();
  if($('teedOn').checked){try{await runTeed(g);}catch(e){teedE=null;teedState='failed';}}else teedE=null;
  if(g!==gen)return;
  if($('artOn').checked){try{await runArt(g);}catch(e){console.error(e);lineE=null;artState='failed';}}else lineE=null;
  if(!teedE&&lineE&&window.ART_AS_TEED){teedE=lineE;teedRectKey='art:'+artKey;}
}
async function refreshAll(){
  if(!img)return;const g=gen;pipeBusy=true;
  await runTeedStage(g);if(g!==gen)return;setProgress(3,'Zeichnung wird erstellt …');await nextFrame();run();pipeBusy=false;setProgress(0);render();
}
function setupRes(reset,noRun){
  if(!img)return;
  const nw=img.naturalWidth,nh=img.naturalHeight,cx0=crop.x0*nw,cy0=crop.y0*nh,cwo=(crop.x1-crop.x0)*nw,cho=(crop.y1-crop.y0)*nh;
  let s=+$('res').value/Math.max(50,carWidthOrig());s=Math.min(s,4);
  if(cwo*cho*s*s>6e6)s=Math.sqrt(6e6/(cwo*cho));
  const nW=Math.max(64,Math.round(cwo*s)),nH=Math.max(64,Math.round(cho*s));
  const c=photoC;c.width=nW;c.height=nH;
  const cx=c.getContext('2d',{willReadFrequently:true});cx.fillStyle='#fff';cx.fillRect(0,0,nW,nH);cx.imageSmoothingQuality='high';cx.drawImage(img,cx0,cy0,cwo,cho,0,0,nW,nH);
  const d=cx.getImageData(0,0,nW,nH).data,N=nW*nH;
  R=new Float32Array(N);G=new Float32Array(N);B=new Float32Array(N);
  for(let i=0,j=0;i<N;i++,j+=4){R[i]=d[j];G[i]=d[j+1];B[i]=d[j+2];}
  for(const m of [eraseC,addC]){
    if(reset||!m.width){m.width=nW;m.height=nH;}
    else{const t=document.createElement('canvas');t.width=nW;t.height=nH;t.getContext('2d').drawImage(m,0,0,nW,nH);m.width=nW;m.height=nH;m.getContext('2d').drawImage(t,0,0);}
  }
  const changed=(W!==nW||H!==nH);
  W=nW;H=nH;view.width=over.width=rasC.width=W;view.height=over.height=rasC.height=H;gradKey='';wheelKey='';maskKey='';if(changed){teedE=null;lineE=null;}applyView();if(!noRun)run();
}

/* ================= Bildanalyse ================= */
function gauss(src,sigma){
  const r=Math.max(1,Math.ceil(sigma*3)),k=new Float32Array(2*r+1);let s=0;
  for(let i=-r;i<=r;i++){k[i+r]=Math.exp(-i*i/(2*sigma*sigma));s+=k[i+r];}
  for(let i=0;i<k.length;i++)k[i]/=s;
  const tmp=new Float32Array(W*H),out=new Float32Array(W*H);
  for(let y=0;y<H;y++){const o=y*W;for(let x=0;x<W;x++){let a=0;for(let i=-r;i<=r;i++){let xx=x+i;xx=xx<0?0:xx>=W?W-1:xx;a+=src[o+xx]*k[i+r];}tmp[o+x]=a;}}
  for(let y=0;y<H;y++){for(let x=0;x<W;x++){let a=0;for(let i=-r;i<=r;i++){let yy=y+i;yy=yy<0?0:yy>=H?H-1:yy;a+=tmp[yy*W+x]*k[i+r];}out[y*W+x]=a;}}
  return out;
}
function dtFilter(chs,sigmaS,sigmaR,iters){
  const N=W*H,dH=new Float32Array(N),dV=new Float32Array(N),k=sigmaS/sigmaR,out=chs.map(c=>Float32Array.from(c));
  for(let y=0;y<H;y++)for(let x=1;x<W;x++){const i=y*W+x;let s=0;for(const c of chs)s+=Math.abs(c[i]-c[i-1]);dH[i]=1+k*s;}
  for(let y=1;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;let s=0;for(const c of chs)s+=Math.abs(c[i]-c[i-W]);dV[i]=1+k*s;}
  const V=new Float32Array(N);
  for(let it=0;it<iters;it++){
    const sH=sigmaS*Math.sqrt(3)*Math.pow(2,iters-it-1)/Math.sqrt(Math.pow(4,iters)-1),a=Math.exp(-Math.SQRT2/sH);
    for(let i=0;i<N;i++)V[i]=Math.pow(a,dH[i]);
    for(const I of out)for(let y=0;y<H;y++){const o=y*W;
      for(let x=1;x<W;x++)I[o+x]+=V[o+x]*(I[o+x-1]-I[o+x]);
      for(let x=W-2;x>=0;x--)I[o+x]+=V[o+x+1]*(I[o+x+1]-I[o+x]);}
    for(let i=0;i<N;i++)V[i]=Math.pow(a,dV[i]);
    for(const I of out){
      for(let y=1;y<H;y++){const o=y*W;for(let x=0;x<W;x++)I[o+x]+=V[o+x]*(I[o+x-W]-I[o+x]);}
      for(let y=H-2;y>=0;y--){const o=y*W;for(let x=0;x<W;x++)I[o+x]+=V[o+x+W]*(I[o+x+W]-I[o+x]);}}
  }
  return out;
}
function edgeField(base,sigma){
  const ch=base.map(c=>gauss(c,sigma)),N=W*H;
  const mag=new Float32Array(N),gx=new Float32Array(N),gy=new Float32Array(N),bin=new Uint8Array(N);
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    const i=y*W+x;let bm=-1,bx=0,by=0;
    for(const a of ch){
      const X=(a[i-W+1]+2*a[i+1]+a[i+W+1])-(a[i-W-1]+2*a[i-1]+a[i+W-1]);
      const Y=(a[i+W-1]+2*a[i+W]+a[i+W+1])-(a[i-W-1]+2*a[i-W]+a[i-W+1]);
      const m=X*X+Y*Y;if(m>bm){bm=m;bx=X;by=Y;}
    }
    const m=Math.sqrt(bm);mag[i]=m;if(m>0){gx[i]=bx/m;gy[i]=by/m;}
    let ang=Math.atan2(by,bx)*57.29578;if(ang<0)ang+=180;
    bin[i]=(ang<22.5||ang>=157.5)?0:ang<67.5?1:ang<112.5?2:3;
  }
  const nms=new Float32Array(N),vals=[];
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    const i=y*W+x,m=mag[i];if(m<1)continue;
    let a,b;switch(bin[i]){case 0:a=mag[i-1];b=mag[i+1];break;case 1:a=mag[i-W-1];b=mag[i+W+1];break;case 2:a=mag[i-W];b=mag[i+W];break;default:a=mag[i-W+1];b=mag[i+W-1];}
    if(m>=a&&m>=b){nms[i]=m;vals.push(m);}
  }
  const step=Math.max(1,Math.floor(vals.length/40000)),smp=[];
  for(let i=0;i<vals.length;i+=step)smp.push(vals[i]);
  smp.sort((p,q)=>p-q);
  const ref=smp.length?smp[Math.floor(smp.length*0.97)]:1;
  for(let i=0;i<N;i++){nms[i]=nms[i]/ref*100;mag[i]=mag[i]/ref*100;}
  return {nms,mag,gx,gy};
}
let valley=null;
function computeGrad(){
  const useT=!!teedE&&$('teedOn').checked;
  const sc=Math.round(SC*20)/20,sigma=Math.max(0.8,+$('sigma').value*sc),calm=+$('calm').value,st=$('struct').checked&&!useT,vo=$('valleyOn').checked;
  const key=[W,H,sigma,calm,st,vo,sc,useT].join(':');
  if(gradKey===key)return;gradKey=key;wheelKey='';
  let base=[R,G,B];
  if(calm>0&&!useT)base=dtFilter(base,Math.max(2,(8+calm*0.5)*sc),6+calm*0.9,3);
  const f=edgeField(base,sigma);grad=f.nms;magN=f.mag;gdx=f.gx;gdy=f.gy;support=null;
  if(st){
    const cs=sigma*2.4,c=edgeField(base,cs),N=W*H,a=new Float32Array(N);
    for(let i=0;i<N;i++)a[i]=c.nms[i]>=14?1:0;
    const b=boxBlur(a,Math.ceil(cs*1.6));support=new Uint8Array(N);for(let i=0;i<N;i++)support[i]=b[i]>1e-6?1:0;
  }
  valley=vo?valleyField(base,Math.max(0.9,1.6*sc)):null;
}
/* Fugen/Zierlinien: dunkle schmale Linien über die Hesse-Matrix (Valley-Detektor) */
function valleyField(base,sig){
  const N=W*H,L=new Float32Array(N);for(let i=0;i<N;i++)L[i]=0.299*base[0][i]+0.587*base[1][i]+0.114*base[2][i];
  const g=gauss(L,sig),s=new Float32Array(N),nx=new Float32Array(N),ny=new Float32Array(N);
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;
    const xx=g[i-1]-2*g[i]+g[i+1],yy=g[i-W]-2*g[i]+g[i+W],xy=(g[i+W+1]-g[i+W-1]-g[i-W+1]+g[i-W-1])/4;
    const tr=(xx+yy)/2,dd=Math.sqrt(((xx-yy)/2)**2+xy*xy),l1=tr+dd,l2=tr-dd;
    if(l1<=0)continue;
    const v=l1-Math.max(0,-l2)*0.5;if(v<=0)continue;
    let ex=xy,ey=l1-xx;const n=Math.hypot(ex,ey);if(n<1e-9){ex=1;ey=0;}else{ex/=n;ey/=n;}
    s[i]=v*sig*sig;nx[i]=ex;ny[i]=ey;}
  const out=new Float32Array(N),vals=[];
  for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){const i=y*W+x,v=s[i];if(v<=0)continue;
    const dx=Math.round(nx[i]),dy=Math.round(ny[i]);const a=s[i+dy*W+dx],b=s[i-dy*W-dx];
    if(v>=a&&v>=b){out[i]=v;vals.push(v);}}
  const step=Math.max(1,Math.floor(vals.length/40000)),smp=[];for(let i=0;i<vals.length;i+=step)smp.push(vals[i]);smp.sort((p,q)=>p-q);
  const ref=smp.length?smp[Math.floor(smp.length*0.97)]:1;for(let i=0;i<N;i++)out[i]=out[i]/ref*100;
  return out;
}
/* Mittellinien einer gezeichneten Linienkarte: Grat-Suche (Hesse-Matrix) + Unterdrückung quer zur Linie */
function ridgeNMS(E,sig){
  const N=W*H,g=gauss(E,sig),out=new Float32Array(N);
  for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){const i=y*W+x,v=g[i];if(v<4)continue;
    const xx=g[i-1]-2*v+g[i+1],yy=g[i-W]-2*v+g[i+W],xy=(g[i+W+1]-g[i+W-1]-g[i-W+1]+g[i-W-1])/4;
    const tr=(xx+yy)/2,dd=Math.sqrt(((xx-yy)/2)**2+xy*xy),l2=tr-dd; // stärkste negative Krümmung = quer zur Linie
    if(l2>=0)continue;
    let ex=xy,ey=l2-xx;const n=Math.hypot(ex,ey);if(n<1e-9){ex=xx<yy?1:0;ey=xx<yy?0:1;}else{ex/=n;ey/=n;}
    const a=bilin(g,x+ex,y+ey),b=bilin(g,x-ex,y-ey);
    if(v>=a&&v>b)out[i]=v;}
  return out;
}
/* Normalen (quer zur Linie) der KI-Linienkarte – für die Kreissuche (Räder) */
function lineNormals(E){
  const N=W*H,g=gauss(E,1.5),gx=new Float32Array(N),gy=new Float32Array(N);
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(g[i]<8)continue;
    const xx=g[i-1]-2*g[i]+g[i+1],yy=g[i-W]-2*g[i]+g[i+W],xy=(g[i+W+1]-g[i+W-1]-g[i-W+1]+g[i-W-1])/4;
    const tr=(xx+yy)/2,dd=Math.sqrt(((xx-yy)/2)**2+xy*xy),l2=tr-dd;let ex=xy,ey=l2-xx;const n=Math.hypot(ex,ey);if(n<1e-9)continue;gx[i]=ex/n;gy[i]=ey/n;}
  return {gx,gy};
}
function bilin(F,x,y){const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0,i=y0*W+x0;return (F[i]*(1-fx)+F[i+1]*fx)*(1-fy)+(F[i+W]*(1-fx)+F[i+W+1]*fx)*fy;}
/* ---- Hilfen für den KI-Zeichner ---- */
function strokeMask(items,width){ // Rastermaske der Linien mit gegebener Breite
  const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d',{willReadFrequently:true});
  x.lineCap='round';x.lineJoin='round';x.lineWidth=width;x.strokeStyle='#000';
  for(const it of items){const P=it.sm||(it.cub&&it.cub.length?flatten(it.cub,10):it.p);if(!P||P.length<2)continue;x.beginPath();x.moveTo(P[0][0],P[0][1]);for(let i=1;i<P.length;i++)x.lineTo(P[i][0],P[i][1]);if(it.closed)x.closePath();x.stroke();}
  const d=x.getImageData(0,0,W,H).data,m=new Uint8Array(W*H);for(let i=0;i<m.length;i++)m[i]=d[i*4+3]>100?1:0;return m;
}
const mAt=(m,q)=>{const x=Math.round(q[0]),y=Math.round(q[1]);return x>=0&&y>=0&&x<W&&y<H&&m[y*W+x]===1;};
/* Teile einer Linie, die in der Maske liegen, herausschneiden; übrig bleiben Stücke >= minRun */
function cutCovered(it,m,minRun){
  const P=it.sm,n=P.length,cov=P.map(q=>mAt(m,q));let nc=0;for(const v of cov)if(v)nc++;
  if(nc===0)return [it];if(nc>n*0.8)return [];
  const runs=[];let a=-1;for(let i=0;i<=n;i++){const f=i<n&&!cov[i];if(f&&a<0)a=i;if(!f&&a>=0){runs.push([a,i]);a=-1;}}
  if(it.closed&&runs.length>1&&runs[0][0]===0&&runs[runs.length-1][1]===n){const l=runs.pop();runs[0]=[l[0]-n,runs[0][1]];}
  const out=[];for(const [ra,rb] of runs){if(rb-ra<minRun)continue;const sub=[];for(let i=ra;i<rb;i++)sub.push(P[(i+n)%n]);
    out.push(Object.assign({},it,{sm:sub,p:rdp(sub,0.6),closed:false,len:sub.length,score:it.score*sub.length/n,detailLoop:false}));}
  return out;
}
/* Kreis-Fit (Kasa) für kleine geschlossene Formen: Tankdeckel, Embleme … */
function fitCircle(P){let sx=0,sy=0,n=P.length;for(const q of P){sx+=q[0];sy+=q[1];}const mx=sx/n,my=sy/n;
  let suu=0,svv=0,suv=0,suuu=0,svvv=0,suvv=0,svuu=0;
  for(const q of P){const u=q[0]-mx,v=q[1]-my;suu+=u*u;svv+=v*v;suv+=u*v;suuu+=u*u*u;svvv+=v*v*v;suvv+=u*v*v;svuu+=v*u*u;}
  const a=suu,b=suv,c=svv,d=0.5*(suuu+suvv),e=0.5*(svvv+svuu),det=a*c-b*b;if(Math.abs(det)<1e-9)return null;
  const uc=(d*c-b*e)/det,vc=(a*e-b*d)/det,r=Math.sqrt(uc*uc+vc*vc+(suu+svv)/n);
  let err=0;for(const q of P)err=Math.max(err,Math.abs(Math.hypot(q[0]-mx-uc,q[1]-my-vc)-r));return {x:mx+uc,y:my+vc,r,err};}
/* Freie Linienenden in Laufrichtung verlängern, bis sie eine andere Linie treffen (hält das Teil zusammen, wirkt gezeichnet) */
function extendEnds(list,occAll,maxD,lwv){
  const add=[];
  list.forEach((c,ci)=>{
    if(c.closed||c.wheel!==undefined||c.ground||!c.sm||c.sm.length<6)return;
    const own=null,ownPts=c.sm,near=(q,d)=>{const d2=d*d;for(let i=0;i<ownPts.length;i+=2){const dx=ownPts[i][0]-q[0],dy=ownPts[i][1]-q[1];if(dx*dx+dy*dy<d2)return true;}return false;};
    for(const atStart of [true,false]){
      const P=c.sm,n=P.length,E=atStart?P[0]:P[n-1];
      // schon verbunden?
      let touch=false;for(let a=0;a<12&&!touch;a++){const ang=a/12*2*Math.PI,q=[E[0]+Math.cos(ang)*lwv*0.9,E[1]+Math.sin(ang)*lwv*0.9];if(mAt(occAll,q)&&!near(q,lwv*0.8))touch=true;}
      if(touch)continue;
      // Richtung + Krümmung am Ende
      const k=Math.min(n-1,Math.max(3,Math.round(lwv*2))),k2=Math.min(n-1,k*2);
      const A=atStart?P[k]:P[n-1-k],B=atStart?P[k2]:P[n-1-k2];
      let dx=E[0]-A[0],dy=E[1]-A[1];const L=Math.hypot(dx,dy)||1;dx/=L;dy/=L;
      let ex=A[0]-B[0],ey=A[1]-B[1];const L2=Math.hypot(ex,ey)||1;ex/=L2;ey/=L2;
      let turn=Math.atan2(dx*ey-dy*ex,dx*ex+dy*ey)/Math.max(1,k);turn=Math.max(-0.01,Math.min(0.01,turn))*0; // gerade weiter (Krümmung ignoriert)
      let x=E[0],y=E[1],ang=Math.atan2(dy,dx);const path=[[x,y]];let hit=false;
      for(let s=1;s<=maxD;s++){ang-=turn;x+=Math.cos(ang);y+=Math.sin(ang);path.push([x,y]);
        if(x<1||y<1||x>=W-1||y>=H-1)break;
        if(s>lwv*0.5&&mAt(occAll,[x,y])&&!near([x,y],lwv*1.2)){hit=true;break;}}
      if(!hit)continue;
      const ext={sm:path,p:path,closed:false,len:path.length,score:c.score,user:false,dockExt:true,parent:c};
      add.push(ext);
    }
  });
  return add;
}
function strokeMaskOne(c,w){return strokeMask([c],w);}
function freeEnds(list,pts){ // Anzahl frei endender Linien (zur Kontrolle)
  const lwv=lw(),occ=[];let n=0;const P=list.map(c=>{const q=c.cub&&c.cub.length?flatten(c.cub,10):c.p;return q&&q.length>1?resample(q,!!c.closed,2):q;});
  list.forEach((c,ci)=>{if(c.closed||c.wheel!==undefined||c.ground)return;const p=P[ci];if(!p||p.length<2)return;
    for(const E of [p[0],p[p.length-1]]){let t=false;for(let j=0;j<list.length&&!t;j++){if(j===ci)continue;for(const q of P[j]||[])if(Math.hypot(q[0]-E[0],q[1]-E[1])<lwv*1.2){t=true;break;}}if(!t){n++;if(pts)pts.push([E[0],E[1],c.outline?'o':c.dockExt?'x':c.bridge?'b':'l']);}}});
  return n;}
function tieEnds(out,carLen,lwv,eps){
  const ptsOf=c=>c.sm||(c.cub&&c.cub.length?flatten(c.cub,10):c.p);
  for(const c of out)if(!c.sm)c.sm=ptsOf(c);
  const tieable=c=>!c.closed&&c.wheel===undefined&&!c.ground&&!c.user&&!c.dockExt&&c.sm&&c.sm.length>=4;
  let ties=[];
  for(let iter=0;iter<6;iter++){
    const cell=Math.max(8,lwv*3),grid=new Map(),K=(x,y)=>x+','+y;
    out.forEach((c,ci)=>{for(const q of resample(c.sm,!!c.closed,Math.max(1.5,lwv*0.5))){const k=K(Math.floor(q[0]/cell),Math.floor(q[1]/cell));let a=grid.get(k);if(!a)grid.set(k,a=[]);a.push(ci,q[0],q[1]);}});
    const nearest=(ci,E,R,dir)=>{let best=null,bd=Infinity;const r=Math.ceil(R/cell),gx=Math.floor(E[0]/cell),gy=Math.floor(E[1]/cell);
      for(let a=-r;a<=r;a++)for(let b=-r;b<=r;b++){const arr=grid.get(K(gx+a,gy+b));if(!arr)continue;
        for(let j=0;j<arr.length;j+=3){const oj=arr[j];if(oj===ci)continue;const dx=arr[j+1]-E[0],dy=arr[j+2]-E[1],d=Math.hypot(dx,dy);if(d>R)continue;
          let cost=d;if(dir){const t=(dx*dir[0]+dy*dir[1])/(d||1);if(t<0.55)continue;cost=d*(1.6-0.6*t);}
          if(cost<bd){bd=cost;best={ci:oj,q:[arr[j+1],arr[j+2]],d};}}}
      return best;};
    ties=[];const drop=new Set();
    out.forEach((c,ci)=>{
      if(!(tieable(c)||(c.outline&&!c.closed)))return;
      const P=c.sm,n=P.length;
      for(const atStart of [true,false]){
        const E=atStart?P[0]:P[n-1];if(nearest(ci,E,lwv*0.9,null))continue;
        const k=Math.min(n-1,Math.max(2,Math.round(lwv*2))),A=atStart?P[k]:P[n-1-k];
        let dx=E[0]-A[0],dy=E[1]-A[1];const L=Math.hypot(dx,dy)||1;dx/=L;dy/=L;
        let hit=null;
        for(let st=lwv;st<=carLen*0.12;st+=Math.max(1,lwv*0.4)){const q=[E[0]+dx*st,E[1]+dy*st];if(q[0]<1||q[1]<1||q[0]>=W-1||q[1]>=H-1)break;
          const nb=nearest(ci,q,lwv*0.6,null);if(nb){hit=nb;break;}}
        const short=c.len<carLen*0.12&&!c.outline;
        if(!hit)hit=nearest(ci,E,carLen*(short?0.025:0.05),[dx,dy]);
        if(!hit&&c.outline)hit=nearest(ci,E,carLen*0.1,null);
        if(hit)ties.push({c,ci,E,dir:[dx,dy],hit});
        else if(!c.outline)drop.add(ci);
      }
    });
    if(!drop.size)break;
    out=out.filter((c,i)=>!drop.has(i)); // Linien ohne Anschluss weg, dann nochmal prüfen
  }
  for(const t of ties){const {E,dir:[dx,dy]}=t,Q=t.hit.q;let vx=Q[0]-E[0],vy=Q[1]-E[1];const d=Math.hypot(vx,vy)||1;
    const hit=[Q[0]+vx/d*lwv*0.5,Q[1]+vy/d*lwv*0.5],h=d/3; // leicht in die Ziel-Linie hinein
    const cub=[[E,[E[0]+dx*h,E[1]+dy*h],[hit[0]+(E[0]+dx*h-hit[0])*0.35,hit[1]+(E[1]+dy*h-hit[1])*0.35],hit]];
    out.push({cub,sm:flatten(cub,Math.max(4,Math.round(d/3))),p:[E,hit],closed:false,user:false,dockExt:true,parent:t.c,score:t.c.score||0,len:d});}
  return out;
}

function hystOn(F,hi,lo){
  const N=W*H,e=new Uint8Array(N),st=new Int32Array(N);let sp=0;
  for(let i=0;i<N;i++){if(e[i]||F[i]<hi)continue;e[i]=1;st[sp++]=i;
    while(sp){const j=st[--sp];for(const o of [-W-1,-W,-W+1,-1,1,W-1,W,W+1]){const k=j+o;if(k>=0&&k<N&&!e[k]&&F[k]>=lo){e[k]=1;st[sp++]=k;}}}}
  return e;
}

/* ================= KI-Freistellung: U²-Net-P (Apache-2.0, Qin et al. 2020) über onnxruntime-web ================= */
/*@ASSET U2NETP u2netp.onnx gzb64*/
const ORT_BASE='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
/* onnxruntime-web 1.20.1 (MIT, Microsoft) – eingebettet, damit alles offline läuft */
/*@ASSET ORT_JS ort.wasm.min.js text*/
/*@ASSET ORT_MJS ort-wasm-simd-threaded.mjs text*/
/*@ASSET ORT_WASM_GZ ort-wasm-simd-threaded.wasm.gz b64*/
let demoFallback=null,ortSess=null,ortState='idle',seg=null,segFor=null,carMask=null,maskKey='',segBusy=false;
let ortLock=Promise.resolve();
function runLocked(sess,feeds){const p=ortLock.then(()=>sess.run(feeds));ortLock=p.catch(()=>{});return p;}
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('load'));document.head.appendChild(s);});}
async function ensureOrt(){
  if(ortSess)return ortSess;
  if(ortState==='failed')throw new Error('offline');
  ortState='loading';aiStatus();if(pipeBusy)setProgress(1,'KI wird gestartet …');
  try{
    let embedded=false;
    if(!window.ort&&ORT_JS.length>100&&typeof DecompressionStream!=='undefined'){
      try{ // eingebettete KI-Laufzeit (funktioniert komplett offline)
        await loadScript(URL.createObjectURL(new Blob([ORT_JS],{type:'text/javascript'})));
        const gz=Uint8Array.from(atob(ORT_WASM_GZ),c=>c.charCodeAt(0));
        const buf=await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
        ort.env.wasm.wasmBinary=buf;
        ort.env.wasm.wasmPaths={mjs:URL.createObjectURL(new Blob([ORT_MJS],{type:'text/javascript'}))};
        embedded=true;
      }catch(e){embedded=false;}
    }
    if(!window.ort)await loadScript(ORT_BASE+'ort.wasm.min.js');
    if(!embedded)ort.env.wasm.wasmPaths=ORT_BASE;
    ort.env.wasm.numThreads=1;
    const bin=await modelBytes(U2NETP);
    ortSess=await ort.InferenceSession.create(bin,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
    ortState='ready';if(pipeBusy)setProgress(1,'KI stellt das Auto frei …');
  }catch(e){ortState='failed';aiStatus();throw e;}
  aiStatus();return ortSess;
}
async function u2(src,sx,sy,sw,sh){
  const N=320,c=document.createElement('canvas');c.width=c.height=N;const x=c.getContext('2d',{willReadFrequently:true});
  x.fillStyle='#fff';x.fillRect(0,0,N,N);x.imageSmoothingQuality='high';x.drawImage(src,sx,sy,sw,sh,0,0,N,N);
  const d=x.getImageData(0,0,N,N).data;let mx=1;for(let i=0;i<d.length;i+=4)mx=Math.max(mx,d[i],d[i+1],d[i+2]);
  const f=new Float32Array(3*N*N),mean=[0.485,0.456,0.406],std=[0.229,0.224,0.225];
  for(let i=0;i<N*N;i++)for(let k=0;k<3;k++)f[k*N*N+i]=(d[i*4+k]/mx-mean[k])/std[k];
  const out=await runLocked(ortSess,{[ortSess.inputNames[0]]:new ort.Tensor('float32',f,[1,3,N,N])});
  const o=out[ortSess.outputNames[0]].data;let a=Infinity,b=-Infinity;for(const v of o){if(v<a)a=v;if(v>b)b=v;}
  const p=new Float32Array(N*N);for(let i=0;i<N*N;i++)p[i]=(o[i]-a)/((b-a)||1);return p;
}
function compBoxes(p,N){
  const lab=new Int32Array(N*N),st=[],out=[];let n=0;
  for(let i=0;i<N*N;i++){if(p[i]<0.5||lab[i])continue;n++;let cnt=0,x0=N,x1=0,y0=N,y1=0;st.push(i);lab[i]=n;
    while(st.length){const j=st.pop(),x=j%N,y=(j-x)/N;cnt++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=N||yy>=N)continue;const k=yy*N+xx;if(!lab[k]&&p[k]>=0.5){lab[k]=n;st.push(k);}}}
    if(cnt>=20)out.push({x0,x1,y0,y1,n:cnt});}
  return out;
}
function bigBox(p,N){
  const lab=new Int32Array(N*N),st=[];let best=null,bs=0,n=0;
  for(let i=0;i<N*N;i++){if(p[i]<0.5||lab[i])continue;n++;let cnt=0,x0=N,x1=0,y0=N,y1=0;st.push(i);lab[i]=n;
    while(st.length){const j=st.pop(),x=j%N,y=(j-x)/N;cnt++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=N||yy>=N)continue;const k=yy*N+xx;if(!lab[k]&&p[k]>=0.5){lab[k]=n;st.push(k);}}}
    if(cnt>bs){bs=cnt;best={x0,x1,y0,y1};}}
  return best;
}
/* ================= Auto-Erkennung: NanoDet-Plus (Apache-2.0, RangiLyu) – findet das Auto im Bild ================= */
/*@ASSET NANODET nanodet.onnx gzb64*/
let ndSess=null;
async function detectCars(im){
  if(!ndSess)ndSess=await ort.InferenceSession.create(await modelBytes(NANODET),{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  const nw=im.naturalWidth,nh=im.naturalHeight,S=320,sc=S/Math.max(nw,nh),w=Math.round(nw*sc),h=Math.round(nh*sc);
  const c=document.createElement('canvas');c.width=S;c.height=S;const x=c.getContext('2d',{willReadFrequently:true});
  x.fillStyle='#000';x.fillRect(0,0,S,S);x.fillStyle='#fff';x.fillRect(0,0,w,h);x.imageSmoothingQuality='high';x.drawImage(im,0,0,w,h);
  const d=x.getImageData(0,0,S,S).data,n=S*S,f=new Float32Array(3*n);
  for(let i=0;i<n;i++){f[i]=(d[i*4+2]-103.53)/57.375;f[n+i]=(d[i*4+1]-116.28)/57.12;f[2*n+i]=(d[i*4]-123.675)/58.395;}
  const out=await runLocked(ndSess,{data:new ort.Tensor('float32',f,[1,3,S,S])});
  const o=out.output.data,NP=out.output.dims[1],C=out.output.dims[2];
  const pri=[];for(const st of [8,16,32,64]){const fw=Math.ceil(S/st);for(let yy=0;yy<fw;yy++)for(let xx=0;xx<fw;xx++)pri.push([xx*st,yy*st,st]);}
  const cand=[];
  for(let i=0;i<NP;i++){const b=i*C;let best=-1,bs=0;for(const k of [2,5,7]){const v=o[b+k];if(v>bs){bs=v;best=k;}}
    if(bs<0.3)continue;const dis=[];
    for(let s=0;s<4;s++){let mx=-1e9;for(let j=0;j<8;j++)mx=Math.max(mx,o[b+80+s*8+j]);let den=0,num=0;for(let j=0;j<8;j++){const e=Math.exp(o[b+80+s*8+j]-mx);den+=e;num+=e*j;}dis.push(num/den*pri[i][2]);}
    const [px,py]=pri[i];cand.push({x0:(px-dis[0])/sc,y0:(py-dis[1])/sc,x1:(px+dis[2])/sc,y1:(py+dis[3])/sc,s:bs,k:best});}
  cand.sort((a,b)=>b.s-a.s);const keep=[];
  const iou=(a,b)=>{const ix=Math.max(0,Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0)),iy=Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0)),I=ix*iy;return I/((a.x1-a.x0)*(a.y1-a.y0)+(b.x1-b.x0)*(b.y1-b.y0)-I);};
  for(const c2 of cand){if(keep.every(k=>iou(k,c2)<0.5))keep.push(c2);}
  return keep.map(b=>({x0:Math.max(0,b.x0),y0:Math.max(0,b.y0),x1:Math.min(nw,b.x1),y1:Math.min(nh,b.y1),s:b.s}));
}
/* ================= Autoteile-Erkennung (YOLOv8n-seg, Car-Damage-Parts von M. Nisar) – findet v. a. die Räder zuverlässig ================= */
/*@ASSET CARPARTS carparts.onnx gzb64*/
const PART_NAMES=['Back-bumper','Back-door','Back-wheel','Back-window','Back-windshield','Broken part','Corrosion','Cracked','Dent','Fender','Flaking','Front-bumper','Front-door','Front-wheel','Front-window','Grille','Headlight','Hood','License-plate','Mirror','Missing part','Paint chip','Quarter-panel','Rocker-panel','Roof','Scratch','Tail-light','Trunk','Windshield'];
let partsSess=null,carParts=[];
async function detectParts(im){
  if(!partsSess)partsSess=await ort.InferenceSession.create(await modelBytes(CARPARTS),{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  const nw=im.naturalWidth,nh=im.naturalHeight,S=640,sc=S/Math.max(nw,nh),w=Math.round(nw*sc),h=Math.round(nh*sc);
  const c=document.createElement('canvas');c.width=S;c.height=S;const x=c.getContext('2d',{willReadFrequently:true});
  x.fillStyle='rgb(114,114,114)';x.fillRect(0,0,S,S);x.imageSmoothingQuality='high';x.drawImage(im,0,0,w,h);
  const d=x.getImageData(0,0,S,S).data,n=S*S,f=new Float32Array(3*n);
  for(let i=0;i<n;i++){f[i]=d[i*4]/255;f[n+i]=d[i*4+1]/255;f[2*n+i]=d[i*4+2]/255;}
  const out=await runLocked(partsSess,{[partsSess.inputNames[0]]:new ort.Tensor('float32',f,[1,3,S,S])});
  const o=out[partsSess.outputNames[0]],D=o.dims[2],NC=PART_NAMES.length,a=o.data,cand=[];
  for(let j=0;j<D;j++){let bk=-1,bs=0.25;for(let k=0;k<NC;k++){const v=a[(4+k)*D+j];if(v>bs){bs=v;bk=k;}}
    if(bk<0)continue;const cx=a[j],cy=a[D+j],bw=a[2*D+j],bh=a[3*D+j];
    cand.push({k:PART_NAMES[bk],s:bs,x0:(cx-bw/2)/sc,y0:(cy-bh/2)/sc,x1:(cx+bw/2)/sc,y1:(cy+bh/2)/sc,j});}
  cand.sort((p,q)=>q.s-p.s);const keep=[];
  const iou=(p,q)=>{const ix=Math.max(0,Math.min(p.x1,q.x1)-Math.max(p.x0,q.x0)),iy=Math.max(0,Math.min(p.y1,q.y1)-Math.max(p.y0,q.y0)),I=ix*iy;return I/((p.x1-p.x0)*(p.y1-p.y0)+(q.x1-q.x0)*(q.y1-q.y0)-I);};
  for(const c2 of cand)if(keep.every(k2=>k2.k!==c2.k||iou(k2,c2)<0.5))keep.push(c2);
  // Masken (160×160 über dem 640er-Bild) für Scheiben
  const pr=out[partsSess.outputNames[1]];
  if(pr){const P=pr.data,PM=pr.dims[2]*pr.dims[3],PW=pr.dims[3];
    for(const k2 of keep){if(!/window|windshield/i.test(k2.k))continue;const m=new Float32Array(PM);
      for(let q=0;q<32;q++){const cf=a[(4+NC+q)*D+k2.j];if(!cf)continue;for(let i=0;i<PM;i++)m[i]+=cf*P[q*PM+i];}
      k2.mask=m;k2.mw=PW;k2.msc=sc*PW/S;}}
  return keep;
}
/* Räder aus der Teile-Erkennung: zwei runde Rad-Boxen → Kreise, dann Radius/Mitte an den Kanten nachjustieren */
/* Scheibenflächen (aus der Teile-Erkennung) in Arbeitskoordinaten */
function glassMask(){
  if(!carParts||!img)return null;const ws=carParts.filter(p=>p.mask&&p.s>0.3);if(!ws.length)return null;
  const nw=img.naturalWidth,nh=img.naturalHeight,ax=(crop.x1-crop.x0)*nw/W,ay=(crop.y1-crop.y0)*nh/H,m=new Uint8Array(W*H);
  for(const p of ws){const k=p.msc,MW=p.mw;
    const X0=Math.max(0,Math.floor((p.x0-crop.x0*nw)/ax)),X1=Math.min(W-1,Math.ceil((p.x1-crop.x0*nw)/ax)),Y0=Math.max(0,Math.floor((p.y0-crop.y0*nh)/ay)),Y1=Math.min(H-1,Math.ceil((p.y1-crop.y0*nh)/ay));
    for(let y=Y0;y<=Y1;y++){const ny=crop.y0*nh+y*ay,my=Math.min(MW-1,Math.max(0,Math.floor(ny*k)));
      for(let x=X0;x<=X1;x++){const nx=crop.x0*nw+x*ax,mx=Math.min(MW-1,Math.max(0,Math.floor(nx*k)));if(p.mask[my*MW+mx]>0)m[y*W+x]=1;}}}
  return m;
}
/* Scheiben als geschlossene, glatte Formen (Maske der Teile-Erkennung, an die KI-Linien angelegt) */
function windowItems(){
  if(!carParts||!img||!lineE)return [];
  const out=[],nw=img.naturalWidth,nh=img.naturalHeight,ax=(crop.x1-crop.x0)*nw/W,ay=(crop.y1-crop.y0)*nh/H,carLen=carBoxPx?carBoxPx.x1-carBoxPx.x0:W*0.8;
  for(const p of carParts){if(!p.mask||p.s<0.35)continue;
    const X0=Math.max(0,Math.floor((p.x0-crop.x0*nw)/ax)-4),X1=Math.min(W-1,Math.ceil((p.x1-crop.x0*nw)/ax)+4),Y0=Math.max(0,Math.floor((p.y0-crop.y0*nh)/ay)-4),Y1=Math.min(H-1,Math.ceil((p.y1-crop.y0*nh)/ay)+4);
    const w=X1-X0+1,h=Y1-Y0+1;if(w<10||h<10)continue;const sub=new Uint8Array(w*h),k=p.msc,MW=p.mw;let cnt=0;
    // Maske weich abtasten (bilinear), damit die Kontur nicht treppig wird
    for(let y=0;y<h;y++){const my=(crop.y0*nh+(y+Y0)*ay)*k-0.5;for(let x=0;x<w;x++){const mx=(crop.x0*nw+(x+X0)*ax)*k-0.5;
      const ix=Math.max(0,Math.min(MW-2,Math.floor(mx))),iy=Math.max(0,Math.min(MW-2,Math.floor(my))),fx=Math.min(1,Math.max(0,mx-ix)),fy=Math.min(1,Math.max(0,my-iy)),M=p.mask;
      const v=(M[iy*MW+ix]*(1-fx)+M[iy*MW+ix+1]*fx)*(1-fy)+(M[(iy+1)*MW+ix]*(1-fx)+M[(iy+1)*MW+ix+1]*fx)*fy;
      const gx=crop.x0*nw+(x+X0)*ax,gy=crop.y0*nh+(y+Y0)*ay;
      if(v>0&&gx>=p.x0&&gx<=p.x1&&gy>=p.y0&&gy<=p.y1){sub[y*w+x]=1;cnt++;}}}
    if(cnt<(0.03*carLen)**2)continue;
    const loops=traceContours(sub,w,h);if(!loops.length)continue;
    let best=loops[0],ba=0;for(const l of loops){const a=Math.abs(polyArea(l));if(a>ba){ba=a;best=l;}}
    let pts=best.map(q=>[q[0]+X0,q[1]+Y0]);
    pts=gsmooth(pts,Math.max(2,3*SC),true);pts=resample(pts,true,1.5);
    pts=gsmooth(pts,Math.max(3,6*SC),true);pts=resample(pts,true,1.5);
    pts=snapContour(pts,Math.max(4,0.008*carLen),lineE);
    pts=tubeFair(pts,true,Math.max(1.5,1.1*lw()),Math.max(6,26*SC));
    out.push({sm:pts,p:rdp(pts,0.6),closed:true,len:pts.length,str:2,score:1e7,user:false,protect:true,window:true});
  }
  return out;
}
function wheelsFromParts(){
  if(!carParts||!img)return [];
  const nw=img.naturalWidth,nh=img.naturalHeight,kx=W/((crop.x1-crop.x0)*nw),ky=H/((crop.y1-crop.y0)*nh);
  let wh=carParts.filter(p=>/wheel/.test(p.k)&&p.s>0.18).map(p=>({x:(p.x0-crop.x0*nw)*kx,y:(p.y0-crop.y0*nh)*ky,x1:(p.x1-crop.x0*nw)*kx,y1:(p.y1-crop.y0*nh)*ky,s:p.s}));
  wh=wh.filter(b=>b.x1>0&&b.x<W&&b.y1>0&&b.y<H);
  // doppelte Boxen desselben Rads zusammenfassen
  wh.sort((a,b)=>b.s-a.s);const uniq=[];for(const b of wh){const cx=(b.x+b.x1)/2;if(uniq.every(u=>Math.abs((u.x+u.x1)/2-cx)>(u.x1-u.x)*0.6))uniq.push(b);}
  if(uniq.length<2)return [];
  const two=uniq.slice(0,2).sort((a,b)=>a.x-b.x);
  const E=i=>Math.max(teedE?teedE[i]:0,lineE?lineE[i]:0);
  const out=[];
  for(const b of two){const bw=b.x1-b.x,bh=b.y1-b.y,asp=bw/bh;if(asp<0.78||asp>1.3)return []; // Schrägansicht: Räder nicht ersetzen
    let cx=(b.x+b.x1)/2,cy=(b.y+b.y1)/2,r0=Math.max(bw,bh)/2,best={x:cx,y:cy,r:r0,s:-1};
    if(teedE||lineE){for(let r=r0*0.86;r<=r0*1.08;r+=Math.max(1,r0*0.015))for(let dx=-0.08*r0;dx<=0.08*r0;dx+=Math.max(1,r0*0.02))for(let dy=-0.08*r0;dy<=0.08*r0;dy+=Math.max(1,r0*0.02)){
        let hit=0,tot=0;for(let k=0;k<48;k++){const an=k/48*2*Math.PI;if(Math.sin(an)>0.6)continue;let bv=0;
          for(let dd=-2;dd<=2;dd++){const x=Math.round(cx+dx+Math.cos(an)*(r+dd)),y=Math.round(cy+dy+Math.sin(an)*(r+dd));if(x<1||y<1||x>=W-1||y>=H-1)continue;const v=E(y*W+x);if(v>bv)bv=v;}
          tot++;if(bv>35)hit++;}
        const sc=tot?hit/tot+r/r0*0.02:0;if(sc>best.s)best={x:cx+dx,y:cy+dy,r,s:sc};}}
    out.push({x:best.x/W,y:best.y/H,r:best.r/W});}
  const d=Math.abs(out[1].x-out[0].x)*W,L=carBoxPx?carBoxPx.x1-carBoxPx.x0:W*0.8;
  if(d<0.35*L)return [];
  return out;
}
async function segmentImage(im){
  segFor=im;seg=null;maskKey='';segBusy=true;aiStatus();
  try{
    await ensureOrt();
    const nw=im.naturalWidth,nh=im.naturalHeight;
    let cars=[];try{cars=await detectCars(im);}catch(e){cars=[];}
    try{carParts=await detectParts(im);}catch(e){console.error(e);carParts=[];}
    if(segFor!==im)return;
    let x0,x1,y0,y1,car=null,bb=null,comps=[];
    if(!cars.length){ // ohne Auto-Erkennung: erst grob im ganzen Bild freistellen
      const p0=await u2(im,0,0,nw,nh);
      if(segFor!==im)return;
      comps=compBoxes(p0,320).map(b=>({x0:b.x0/320*nw,x1:(b.x1+1)/320*nw,y0:b.y0/320*nh,y1:(b.y1+1)/320*nh,n:b.n}));
    }
    if(cars.length&&!comps.length){ // schneller Weg: Box der Auto-Erkennung direkt nutzen
      const smax=Math.max(...cars.map(c=>c.s));car=cars.filter(c=>c.s>=smax*0.8).reduce((a,b)=>((b.x1-b.x0)*(b.y1-b.y0)>(a.x1-a.x0)*(a.y1-a.y0)?b:a));
      const cw=car.x1-car.x0,ch=car.y1-car.y0;bb={x0:car.x0-cw*0.03,x1:car.x1+cw*0.03,y0:car.y0-ch*0.06,y1:car.y1+ch*0.05};
    }
    else if(cars.length){ // größtes/sicherstes Auto, dazu die passende Freistell-Komponente
      const smax=Math.max(...cars.map(c=>c.s));car=cars.filter(c=>c.s>=smax*0.8).reduce((a,b)=>((b.x1-b.x0)*(b.y1-b.y0)>(a.x1-a.x0)*(a.y1-a.y0)?b:a));
      const ov=(a,b)=>Math.max(0,Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0))*Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0));
      const ca=(car.x1-car.x0)*(car.y1-car.y0);let best=null,bs=0;
      for(const c of comps){const o=ov(c,car);if(o>bs){bs=o;best=c;}}
      if(best&&bs>ca*0.3)bb={x0:Math.max(best.x0,car.x0-(car.x1-car.x0)*0.06),x1:Math.min(best.x1,car.x1+(car.x1-car.x0)*0.06),y0:Math.max(best.y0,car.y0-(car.y1-car.y0)*0.1),y1:Math.min(best.y1,car.y1+(car.y1-car.y0)*0.08)};
      else bb={x0:car.x0,x1:car.x1,y0:car.y0,y1:car.y1};
    }else if(!bb){
      if(!comps.length)throw new Error('none');
      bb=comps.reduce((a,b)=>b.n>a.n?b:a);
    }
    x0=bb.x0;x1=bb.x1;y0=bb.y0;y1=bb.y1;
    {const m=0.05*Math.max(x1-x0,y1-y0);x0=Math.max(0,x0-m);y0=Math.max(0,y0-m);x1=Math.min(nw,x1+m);y1=Math.min(nh,y1+m);}
    const p1=await u2(im,x0,y0,x1-x0,y1-y0);
    if(segFor!==im)return;
    if(car){ // alles außerhalb der Auto-Box (+Rand) verwerfen – z.B. Personen neben dem Auto
      const cw=car.x1-car.x0,ch=car.y1-car.y0,bx0=car.x0-cw*0.04,bx1=car.x1+cw*0.04,by0=car.y0-ch*0.08,by1=car.y1+ch*0.06;
      for(let j=0;j<320;j++){const yy=y0+(j+0.5)/320*(y1-y0);for(let i=0;i<320;i++){const xx=x0+(i+0.5)/320*(x1-x0);if(xx<bx0||xx>bx1||yy<by0||yy>by1)p1[j*320+i]=0;}}
    }
    const b2=bigBox(p1,320);if(!b2)throw new Error('none');
    const sx=(x1-x0)/320/nw,sy=(y1-y0)/320/nh;
    seg={p:p1,x0:x0/nw,y0:y0/nh,x1:x1/nw,y1:y1/nh,bx0:x0/nw+b2.x0*sx,bx1:x0/nw+(b2.x1+1)*sx,by0:y0/nh+b2.y0*sy,by1:y0/nh+(b2.y1+1)*sy};
  }catch(e){seg=null;}
  finally{if(segFor===im){segBusy=false;aiStatus();wheelKey='';}}
}
/* ================= KI-Linien: TEED (MIT, Soria et al. 2023) ================= */
/*@ASSET TEEDM teed.onnx gzb64*/
function polyMask(){const pc=document.createElement('canvas');pc.width=W;pc.height=H;const px=pc.getContext('2d');
  px.beginPath();poly.forEach((p,i)=>i?px.lineTo(p.x*W,p.y*H):px.moveTo(p.x*W,p.y*H));px.closePath();px.fill();return maskFrom(pc,127);}
/* Maske fürs Auto: KI-Maske, bei eigenem Bereich mit diesem geschnitten */
let cmKey='',cmVal=null;
function currentMask(){
  if(!$('aiOn').checked)return null;
  const m=buildMask();
  if(poly.length<3)return m;
  const key=maskKey+'|'+JSON.stringify(poly)+'|'+W+'x'+H;if(key===cmKey)return cmVal;cmKey=key;
  if(!m){cmVal=null;return null;}
  const pr=polyMask(),o=new Uint8Array(W*H);let a=0,pa=0;
  for(let i=0;i<o.length;i++){if(pr[i]){pa++;if(m[i]){o[i]=1;a++;}}}
  if(a<pa*0.12){cmVal=null;return null;}
  const L=label(o);if(L.n>1){let best=1;for(let k=2;k<=L.n;k++)if(L.sizes[k]>L.sizes[best])best=k;for(let i=0;i<o.length;i++)if(o[i]&&L.lab[i]!==best)o[i]=0;}
  cmVal=o;return o;
}
function teedRect(){
  let box=null;
  const m=currentMask();if(m)box=maskBox(m);
  if(!box&&poly.length>=3){let a=1,b=0,c=1,d=0;for(const p of poly){a=Math.min(a,p.x);b=Math.max(b,p.x);c=Math.min(c,p.y);d=Math.max(d,p.y);}box={x0:a*W,x1:b*W,y0:c*H,y1:d*H};}
  if(!box)return {x0:0,y0:0,w:Math.ceil(W/8)*8,h:Math.ceil(H/8)*8};
  const pad=Math.round(0.03*(box.x1-box.x0)+12);
  let x0=Math.max(0,Math.floor(box.x0-pad)),y0=Math.max(0,Math.floor(box.y0-pad)),x1=Math.min(W,Math.ceil(box.x1+pad)),y1=Math.min(H,Math.ceil(box.y1+pad));
  let w=Math.ceil((x1-x0)/8)*8,h=Math.ceil((y1-y0)/8)*8;x0=Math.max(0,Math.min(x0,W-w));y0=Math.max(0,Math.min(y0,H-h));
  return {x0,y0,w,h};
}
async function runTeed(g){
  await ensureOrt();
  if(!teedSess){teedState='loading';teedSess=await ort.InferenceSession.create(await modelBytes(TEEDM),{executionProviders:['wasm'],graphOptimizationLevel:'all'});}
  const r=teedRect(),key=W+'x'+H+':'+[r.x0,r.y0,r.w,r.h].join(',')+':'+[crop.x0,crop.y0,crop.x1,crop.y1].join(',')+':'+$('darkBoost').checked;
  if(teedE&&teedRectKey===key){teedState='ready';return;}
  const cw=r.w,ch=r.h,n=cw*ch,f=new Float32Array(3*n);
  // dunkle Autos aufhellen (Gamma), damit feine Fugen/Griffe erkannt werden
  const cm=($('aiOn').checked&&poly.length<3)?buildMask():null;let ls=0,lc=0;
  for(let y=r.y0;y<Math.min(H,r.y0+ch);y+=2)for(let x=r.x0;x<Math.min(W,r.x0+cw);x+=2){const i=y*W+x;if(cm&&!cm[i])continue;ls+=(0.299*R[i]+0.587*G[i]+0.114*B[i])/255;lc++;}
  const lm=lc?ls/lc:0.5;teedGamma=(lm<0.3&&$('darkBoost').checked)?Math.max(0.5,Math.log(0.42)/Math.log(Math.max(0.02,lm))):1;
  const lut=new Float32Array(256);for(let v=0;v<256;v++)lut[v]=255*Math.pow(v/255,teedGamma);
  for(let y=0;y<ch;y++){const yy=Math.min(H-1,r.y0+y);for(let x=0;x<cw;x++){const i=yy*W+Math.min(W-1,r.x0+x),k=y*cw+x;f[k]=lut[B[i]|0]-103.939;f[n+k]=lut[G[i]|0]-116.779;f[2*n+k]=lut[R[i]|0]-123.68;}}
  const out=await runLocked(teedSess,{x:new ort.Tensor('float32',f,[1,3,ch,cw])});
  if(g!==gen)return;
  const o=out.fused.data,hist=new Uint32Array(256);for(let i=0;i<n;i++)hist[Math.min(255,Math.max(0,(o[i]*255)|0))]++;
  let bg=0.44,hb=0;for(let i=1;i<255;i++){const v=hist[i-1]+hist[i]+hist[i+1];if(v>hb){hb=v;bg=i/255;}} // häufigster Wert = Hintergrund-Antwort
  const E=new Float32Array(W*H);
  for(let y=0;y<ch;y++){const yy=r.y0+y;if(yy>=H)break;for(let x=0;x<cw;x++){const xx=r.x0+x;if(xx>=W)break;E[yy*W+xx]=Math.max(0,(o[y*cw+x]-bg)/(1-bg))*100;}}
  teedE=E;teedRectKey=key;teedState='ready';
}
/* ================= KI-Zeichner: Informative Drawings (MIT, Chan/Durand/Isola 2022, Stil „anime“) =================
   Zeichnet das Foto wie ein Illustrator: Fugen, Scheiben, Lichter, Griffe – Spiegelungen werden weitgehend ignoriert. */
/*@ASSET LINEART lineart_anime.onnx gzb64*/
let artSess=null,lineE=null,artKey='',artState='idle',artScale=1,artMs=0;
const ART_CAR={min:600,mid:780,det:1050}; // Autobreite (px), mit der die KI zeichnet – kleiner = nur die wichtigsten Linien
let artLevel='mid';
const b64u8=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function modelBytes(s){return new Uint8Array(await new Response(new Blob([b64u8(s)]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}
async function runArt(g){
  await ensureOrt();
  if(!artSess){artState='loading';artSess=await ort.InferenceSession.create(await modelBytes(LINEART),{executionProviders:['wasm'],graphOptimizationLevel:'all'});}
  const r=teedRect(),m=currentMask(),bx=m?maskBox(m):null,carW=bx?bx.x1-bx.x0:r.w*0.85;
  const s=Math.min(1.6,(window.ART_CARW||ART_CAR[artLevel])/Math.max(50,carW));
  const key=[W,H,r.x0,r.y0,r.w,r.h,s.toFixed(4),crop.x0,crop.y0,crop.x1,crop.y1].join(',');
  if(lineE&&artKey===key){artState='ready';return;}
  const mw=Math.max(64,Math.round(r.w*s/8)*8),mh=Math.max(64,Math.round(r.h*s/8)*8);
  const c=document.createElement('canvas');c.width=mw;c.height=mh;const x=c.getContext('2d',{willReadFrequently:true});
  x.imageSmoothingQuality='high';x.drawImage(photoC,r.x0,r.y0,r.w,r.h,0,0,mw,mh);
  const d=x.getImageData(0,0,mw,mh).data,n=mw*mh,f=new Float32Array(3*n);
  for(let i=0;i<n;i++){f[i]=d[i*4]/255;f[n+i]=d[i*4+1]/255;f[2*n+i]=d[i*4+2]/255;}
  const t0=performance.now();
  const out=await runLocked(artSess,{[artSess.inputNames[0]]:new ort.Tensor('float32',f,[1,3,mh,mw])});
  artMs=performance.now()-t0;
  if(g!==gen)return;
  const o=out[artSess.outputNames[0]].data,E=new Float32Array(W*H),sx=mw/r.w,sy=mh/r.h;
  for(let y=0;y<r.h;y++){const yy=r.y0+y;if(yy>=H)break;const v=(y+0.5)*sy-0.5,iv=Math.max(0,Math.min(mh-2,Math.floor(v))),fv=Math.min(1,Math.max(0,v-iv));
    for(let q=0;q<r.w;q++){const xx=r.x0+q;if(xx>=W)break;const u=(q+0.5)*sx-0.5,iu=Math.max(0,Math.min(mw-2,Math.floor(u))),fu=Math.min(1,Math.max(0,u-iu));
      const a=o[iv*mw+iu]*(1-fu)+o[iv*mw+iu+1]*fu,b=o[(iv+1)*mw+iu]*(1-fu)+o[(iv+1)*mw+iu+1]*fu;
      E[yy*W+xx]=Math.max(0,Math.min(1,1-(a*(1-fv)+b*fv)))*100;}}
  lineE=E;artKey=key;artScale=s;artState='ready';
}
function aiStatus(){
  const el=$('aiInfo');if(!el)return;
  if(!$('aiOn').checked){el.innerHTML='Aus. Bereich bei Bedarf selbst festlegen.';return;}
  if(ortState==='failed'){el.innerHTML='<span style="color:var(--warn)">KI konnte nicht gestartet werden (Browser zu alt?). Bereich selbst festlegen.</span>';return;}
  if(ortState==='loading'||segBusy){el.innerHTML='KI stellt das Auto frei …';return;}
  if(seg)el.innerHTML='Auto automatisch freigestellt'+(poly.length>=3?' (dein eigener Bereich hat Vorrang)':'')+'.';
  else el.innerHTML='Kein Auto gefunden – Bereich selbst festlegen.';
}
function boxWH(a,w,h,r){
  const tmp=new Float32Array(w*h),out=new Float32Array(w*h),n=2*r+1;
  for(let y=0;y<h;y++){const o=y*w;let s=0;for(let i=-r;i<=r;i++)s+=a[o+Math.min(w-1,Math.max(0,i))];
    for(let x=0;x<w;x++){tmp[o+x]=s/n;s+=a[o+Math.min(w-1,x+r+1)]-a[o+Math.max(0,x-r)];}}
  for(let x=0;x<w;x++){let s=0;for(let i=-r;i<=r;i++)s+=tmp[Math.min(h-1,Math.max(0,i))*w+x];
    for(let y=0;y<h;y++){out[y*w+x]=s/n;s+=tmp[Math.min(h-1,y+r+1)*w+x]-tmp[Math.max(0,y-r)*w+x];}}
  return out;
}
/* Farb-Guided-Filter (He et al.): zieht die grobe KI-Maske exakt an die Bildkanten */
function guidedColor(Ir,Ig,Ib,p,w,h,r,eps){
  const bx=a=>boxWH(a,w,h,r),n=w*h,mul=(a,b)=>{const o=new Float32Array(n);for(let i=0;i<n;i++)o[i]=a[i]*b[i];return o;};
  const mr=bx(Ir),mg=bx(Ig),mb=bx(Ib),mp=bx(p);
  const rr=bx(mul(Ir,Ir)),rg=bx(mul(Ir,Ig)),rb=bx(mul(Ir,Ib)),gg=bx(mul(Ig,Ig)),gb=bx(mul(Ig,Ib)),bb=bx(mul(Ib,Ib));
  const pr=bx(mul(Ir,p)),pg=bx(mul(Ig,p)),pb=bx(mul(Ib,p));
  const ar=new Float32Array(n),ag=new Float32Array(n),ab=new Float32Array(n),b=new Float32Array(n);
  for(let i=0;i<n;i++){
    const s11=rr[i]-mr[i]*mr[i]+eps,s12=rg[i]-mr[i]*mg[i],s13=rb[i]-mr[i]*mb[i],s22=gg[i]-mg[i]*mg[i]+eps,s23=gb[i]-mg[i]*mb[i],s33=bb[i]-mb[i]*mb[i]+eps;
    const c1=pr[i]-mr[i]*mp[i],c2=pg[i]-mg[i]*mp[i],c3=pb[i]-mb[i]*mp[i];
    const i11=s22*s33-s23*s23,i12=s13*s23-s12*s33,i13=s12*s23-s13*s22,i22=s11*s33-s13*s13,i23=s13*s12-s11*s23,i33=s11*s22-s12*s12;
    const det=s11*i11+s12*i12+s13*i13||1e-12;
    const a1=(i11*c1+i12*c2+i13*c3)/det,a2=(i12*c1+i22*c2+i23*c3)/det,a3=(i13*c1+i23*c2+i33*c3)/det;
    ar[i]=a1;ag[i]=a2;ab[i]=a3;b[i]=mp[i]-a1*mr[i]-a2*mg[i]-a3*mb[i];}
  const Ar=bx(ar),Ag=bx(ag),Ab=bx(ab),Bm=bx(b),q=new Float32Array(n);
  for(let i=0;i<n;i++)q[i]=Ar[i]*Ir[i]+Ag[i]*Ig[i]+Ab[i]*Ib[i]+Bm[i];
  return q;
}
function buildMask(){
  const key=W+'x'+H+':'+[crop.x0,crop.y0,crop.x1,crop.y1].join(',')+':'+(seg?[seg.x0,seg.y0,seg.x1,seg.y1].join(','):'-');
  if(key===maskKey)return carMask;maskKey=key;carMask=null;if(!seg)return null;
  const N=320,kx=W/(crop.x1-crop.x0),ky=H/(crop.y1-crop.y0),X0=(seg.x0-crop.x0)*kx,Y0=(seg.y0-crop.y0)*ky,CW=(seg.x1-seg.x0)*kx,CH=(seg.y1-seg.y0)*ky;
  const pad=Math.ceil(0.02*Math.max(CW,CH)),x0=Math.max(0,Math.floor(X0)-pad),y0=Math.max(0,Math.floor(Y0)-pad),x1=Math.min(W,Math.ceil(X0+CW)+pad),y1=Math.min(H,Math.ceil(Y0+CH)+pad);
  const w=x1-x0,h=y1-y0,n=w*h,P=new Float32Array(n),Ir=new Float32Array(n),Ig=new Float32Array(n),Ib=new Float32Array(n);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const gi=(y+y0)*W+x+x0,li=y*w+x;Ir[li]=R[gi]/255;Ig[li]=G[gi]/255;Ib[li]=B[gi]/255;
    let u=(x+x0+0.5-X0)/CW*N-0.5,v=(y+y0+0.5-Y0)/CH*N-0.5;if(u<-0.5||v<-0.5||u>N-0.5||v>N-0.5)continue;
    u=Math.min(N-1,Math.max(0,u));v=Math.min(N-1,Math.max(0,v));const iu=Math.min(N-2,Math.floor(u)),iv=Math.min(N-2,Math.floor(v)),fu=u-iu,fv=v-iv,p=seg.p;
    P[li]=(p[iv*N+iu]*(1-fu)+p[iv*N+iu+1]*fu)*(1-fv)+(p[(iv+1)*N+iu]*(1-fu)+p[(iv+1)*N+iu+1]*fu)*fv;}
  const r=Math.max(3,Math.round(CW/320*1.2)),q=guidedColor(Ir,Ig,Ib,P,w,h,r,2e-3);
  const m=new Uint8Array(W*H);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(q[y*w+x]>=0.5)m[(y+y0)*W+x+x0]=1;
  // größte Komponente behalten, Löcher füllen
  const L=label(m);if(L.n>1){let best=1;for(let k=2;k<=L.n;k++)if(L.sizes[k]>L.sizes[best])best=k;for(let i=0;i<m.length;i++)if(m[i]&&L.lab[i]!==best)m[i]=0;}
  const vis=new Uint8Array(W*H),st=[];
  for(let x=0;x<W;x++){for(const y of [0,H-1]){const i=y*W+x;if(!m[i]&&!vis[i]){vis[i]=1;st.push(i);}}}
  for(let y=0;y<H;y++){for(const x of [0,W-1]){const i=y*W+x;if(!m[i]&&!vis[i]){vis[i]=1;st.push(i);}}}
  while(st.length){const j=st.pop(),x=j%W;for(const k of [j-W,j+W,x>0?j-1:-1,x<W-1?j+1:-1]){if(k<0||k>=W*H||m[k]||vis[k])continue;vis[k]=1;st.push(k);}}
  for(let i=0;i<m.length;i++)if(!vis[i])m[i]=1;
  carMask=m;return m;
}
function maskBox(m){let x0=W,x1=-1,y0=H,y1=-1;for(let y=0;y<H;y++){const o=y*W;for(let x=0;x<W;x++)if(m[o+x]){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}return x1<0?null:{x0,x1,y0,y1};}
function erodeMask(m,r){if(r<1)return m;const f=new Float32Array(W*H);for(let i=0;i<f.length;i++)f[i]=m[i];const b=boxBlur(f,Math.round(r)),o=new Uint8Array(W*H);for(let i=0;i<o.length;i++)o[i]=b[i]>0.9999?1:0;return o;}
/* Kontur an echte Bildkanten ziehen (Normalensuche + robuste Glättung der Verschiebung) */
function snapContour(pts,delta,F,closedIn){
  const n=pts.length;if(n<12||(!magN&&!F))return pts;
  const D=Math.max(2,Math.ceil(delta)),m=2*D+1,nor=new Float32Array(2*n),cost=new Float32Array(n*m);
  for(let i=0;i<n;i++){
    const a=pts[(i-4+n)%n],b=pts[(i+4)%n];let tx=b[0]-a[0],ty=b[1]-a[1];const l=Math.hypot(tx,ty)||1;tx/=l;ty/=l;const nx=-ty,ny=tx;nor[2*i]=nx;nor[2*i+1]=ny;
    for(let o=-D;o<=D;o++){const x=pts[i][0]+nx*o,y=pts[i][1]+ny*o,xi=Math.round(x),yi=Math.round(y);let v=0;
      if(xi>0&&yi>0&&xi<W-1&&yi<H-1){const k=yi*W+xi;if(F)v=F[k]*1.5;else if(teedE&&$('teedOn').checked)v=teedE[k]*1.5;else{const al=Math.abs(gdx[k]*nx+gdy[k]*ny);v=Math.min(160,magN[k])*(al>0.55?al:al*0.3);}}
      cost[i*m+o+D]=-v+1.2*Math.abs(o);}
  }
  const TP=7,back=new Int8Array(n*m);let acc=new Float32Array(m),nxt=new Float32Array(m);
  for(let o=0;o<m;o++)acc[o]=cost[o];
  for(let i=1;i<n;i++){for(let o=0;o<m;o++){let bv=Infinity,bd=0;for(let d=-2;d<=2;d++){const q=o+d;if(q<0||q>=m)continue;const v=acc[q]+TP*Math.abs(d);if(v<bv){bv=v;bd=d;}}
      nxt[o]=cost[i*m+o]+bv;back[i*m+o]=bd;}[acc,nxt]=[nxt,acc];}
  let bo=0,bv=Infinity;for(let o=0;o<m;o++)if(acc[o]<bv){bv=acc[o];bo=o;}
  const off=new Float32Array(n);for(let i=n-1;i>=0;i--){off[i]=bo-D;if(i>0)bo=bo+back[i*m+bo];}
  const sg=Math.max(1.5,2.5*SC),r=Math.ceil(sg*3),ker=[];let ks=0;for(let k=-r;k<=r;k++){const v=Math.exp(-k*k/(2*sg*sg));ker.push(v);ks+=v;}
  const sm=new Float32Array(n);for(let i=0;i<n;i++){let s=0;for(let k=-r;k<=r;k++)s+=off[(i+k+n)%n]*ker[k+r];sm[i]=s/ks;}
  return pts.map((p,i)=>[p[0]+nor[2*i]*sm[i],p[1]+nor[2*i+1]*sm[i]]);
}
/* Schmale „Zungen“ im unteren Bereich der Kontur entfernen (Schatten, Bodenplatte, Reflexe am Boden) */
function removeTongues(pts){
  const n=pts.length;if(n<50||!carBoxPx)return pts;
  const L=carBoxPx.x1-carBoxPx.x0,yLine=wheels.length?Math.min(...wheels.map(w=>w.y*H)):carBoxPx.y0+0.7*(carBoxPx.y1-carBoxPx.y0);
  const maxC=0.05*L,minArc=20*SC,maxArc=0.45*L;
  const low=[];for(let i=0;i<n;i++)if(pts[i][1]>yLine)low.push(i);
  if(low.length<10)return pts;
  const cut=[];
  for(let a=0;a<low.length;a+=3){const i=low[a];
    for(let b=a+1;b<low.length;b+=3){const j=low[b];let arc=j-i;if(arc<=minArc)continue;if(arc>n/2)arc=n-arc;if(arc>maxArc/1.5)continue;
      const d=Math.hypot(pts[i][0]-pts[j][0],pts[i][1]-pts[j][1]);if(d>maxC)continue;
      if(arc*1.5>3*d+minArc)cut.push({i,j,gain:arc*1.5-d});}}
  if(!cut.length)return pts;
  cut.sort((a,b)=>b.gain-a.gain);
  const del=new Uint8Array(n),bridges=[];
  for(const c of cut){let ok=true;for(let k=c.i+1;k<c.j;k++)if(del[k]){ok=false;break;}if(!ok||del[c.i]||del[c.j])continue;
    for(let k=c.i+1;k<c.j;k++)del[k]=1;bridges.push(c);}
  const out=[];
  for(let k=0;k<n;k++){if(del[k])continue;out.push(pts[k]);const br=bridges.find(b=>b.i===k);
    if(br){const p=pts[br.i],q=pts[br.j],m=Math.max(1,Math.round(Math.hypot(q[0]-p[0],q[1]-p[1])/1.5));for(let s=1;s<m;s++)out.push([p[0]+(q[0]-p[0])*s/m,p[1]+(q[1]-p[1])*s/m]);}}
  return out;
}
/* Außenkontur aus der Maske, ohne die Reifen */
function outlineItems(m,er){
  const bb=maskBox(m);if(!bb)return [];
  const x0=Math.max(0,bb.x0-2),y0=Math.max(0,bb.y0-2),w=Math.min(W,bb.x1+3)-x0,h=Math.min(H,bb.y1+3)-y0,sub=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)sub[y*w+x]=m[(y+y0)*W+x+x0];
  const loops=traceContours(sub,w,h);if(!loops.length)return [];
  let best=null,ba=0;for(const l of loops){let a=0;for(let i=0;i<l.length;i++){const p=l[i],q=l[(i+1)%l.length];a+=p[0]*q[1]-q[0]*p[1];}if(Math.abs(a)>ba){ba=Math.abs(a);best=l;}}
  let pts=best.map(p=>[p[0]+x0,p[1]+y0]);
  pts=gsmooth(pts,Math.max(1.2,2*SC),true);
  pts=resample(pts,true,1.5);pts=snapContour(pts,Math.max(4,14*SC));
  pts=removeTongues(pts);
  pts=gsmooth(pts,Math.max(1.5,(+$('curve').value*0.35+1.5)*SC),true);
  if(FAIR)pts=tubeFair(pts,true,Math.max(1.2,(window.OUT_T||0.9)*lw()),+$('curve').value*(window.OUT_S||1.2)*SC);
  const bm=Math.max(3,lw()*1.5),bL=crop.x0<=0.001,bR=crop.x1>=0.999,bT=crop.y0<=0.001,bB=crop.y1>=0.999;
  const cut=q=>{const x=Math.round(q[0]),y=Math.round(q[1]);if(x>=0&&y>=0&&x<W&&y<H&&er&&er[y*W+x])return true;
    if((bL&&q[0]<bm)||(bR&&q[0]>W-1-bm)||(bT&&q[1]<bm)||(bB&&q[1]>H-1-bm))return true; // Bildrand: dort keinen Umriss zeichnen
    if(wheelMode!=='orig')for(const wh of wheels){const r=wh.r*W,cx=wh.x*W,cy=wh.y*H;if(Math.hypot(q[0]-cx,q[1]-cy)<r*1.06+lw()*0.6)return true;if(q[1]>cy+r*0.2&&Math.abs(q[0]-cx)<r*1.1)return true;}return false;};
  const keep=pts.map(q=>!cut(q));
  if(keep.every(k=>k))return [mkLine(pts,true,1e8,{outline:true})];
  let s0=keep.indexOf(false);const n=pts.length,runs=[];let cur=[];
  for(let k=1;k<=n;k++){const i=(s0+k)%n;if(keep[i])cur.push(pts[i]);else{if(cur.length)runs.push(cur);cur=[];}}
  if(cur.length)runs.push(cur);
  const minL=40*SC;
  // Stummel am Boden neben den Rädern abschneiden (Reifen-/Schattenrand)
  const low=q=>{if(wheelMode==='orig')return false;for(const wh of wheels){const r=wh.r*W,cx=wh.x*W,cy=wh.y*H;if(Math.abs(q[0]-cx)<r*1.7&&q[1]>cy+r*0.55)return true;}return false;};
  const trimmed=runs.map(r=>{let a=0,b=r.length;while(a<b&&low(r[a]))a++;while(b>a&&low(r[b-1]))b--;return r.slice(a,b);});
  return trimmed.filter(r=>r.length>minL).map(r=>mkLine(r,false,1e8,{outline:true}));
}
function mkLine(sm,closed,score,extra){
  const eps=Math.max(0.3,+$('straight').value*SC);
  return Object.assign({p:rdp(sm,0.6),cub:fitPath(sm,closed&&sm.length>3,eps),closed:closed&&sm.length>3,score,len:sm.length,str:3,user:false,protect:true},extra||{});
}
/* Linienenden an Nachbarlinien andocken (wirkt gezeichnet und hält das Teil zusammen) */
function dockLines(list,maxD){
  if(maxD<=0)return list;
  const lwv=lw(),cell=Math.max(16,maxD),grid=new Map(),K=(x,y)=>x+','+y;
  const S=list.map(c=>samplePts(c,Math.max(2,2*SC)));
  S.forEach((pts,ci)=>pts.forEach(q=>{const k=K(Math.floor(q[0]/cell),Math.floor(q[1]/cell));let a=grid.get(k);if(!a)grid.set(k,a=[]);a.push(ci,q[0],q[1]);}));
  const tanA=Math.tan(16*Math.PI/180),ext=[];
  list.forEach((c,ci)=>{
    if(c.closed||c.ground||c.wheel!==undefined||!c.cub||!c.cub.length)return;
    const P=flatten(c.cub,8);if(P.length<3)return;
    const b0=c.cub[0],b1=c.cub[c.cub.length-1];
    for(const atStart of [true,false]){
      const E=atStart?P[0]:P[P.length-1];
      let D=atStart?[b0[0][0]-b0[1][0],b0[0][1]-b0[1][1]]:[b1[3][0]-b1[2][0],b1[3][1]-b1[2][1]];
      {const l=Math.hypot(D[0],D[1]);D=l>1e-6?[D[0]/l,D[1]/l]:outDir(P,atStart);}
      let touching=false,best=null,bs=Infinity;
      const gx=Math.floor(E[0]/cell),gy=Math.floor(E[1]/cell);
      for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const arr=grid.get(K(gx+a,gy+b));if(!arr)continue;
        for(let j=0;j<arr.length;j+=3){if(arr[j]===ci)continue;const vx=arr[j+1]-E[0],vy=arr[j+2]-E[1],d=Math.hypot(vx,vy);
          if(d<lwv*0.9){touching=true;break;}
          const t=vx*D[0]+vy*D[1],perp=Math.abs(vx*D[1]-vy*D[0]);
          if(t>0&&t<=maxD&&perp<=t*tanA+lwv*0.5){const sc=t+2.5*perp;if(sc<bs){bs=sc;best=[arr[j+1],arr[j+2]];}}}
        if(touching)break;}
      if(touching||!best)continue;
      const L=Math.hypot(best[0]-E[0],best[1]-E[1]),o=Math.min(lwv*0.4,L*0.2);
      const Q=[best[0]+D[0]*o,best[1]+D[1]*o];
      ext.push({p:[E,Q],cub:[[E,[E[0]+D[0]*L/3,E[1]+D[1]*L/3],[Q[0]-(Q[0]-E[0])/3,Q[1]-(Q[1]-E[1])/3],Q]],closed:false,user:false,dockExt:true,score:c.score,parent:c});
    }
  });
  return list.concat(ext);
}
function hysteresis(hi,lo){
  const N=W*H,e=new Uint8Array(N),st=new Int32Array(N);let sp=0;
  for(let i=0;i<N;i++){
    if(e[i]||grad[i]<hi)continue;e[i]=1;st[sp++]=i;
    while(sp){const j=st[--sp];
      for(const o of [-W-1,-W,-W+1,-1,1,W-1,W,W+1]){const k=j+o;if(k>=0&&k<N&&!e[k]&&grad[k]>=lo){e[k]=1;st[sp++]=k;}}}
  }
  return e;
}
function label(bin){
  const N=W*H,lab=new Int32Array(N),st=new Int32Array(N),sizes=[0];let n=0;
  for(let i=0;i<N;i++){
    if(!bin[i]||lab[i])continue;n++;let sp=0,cnt=0;lab[i]=n;st[sp++]=i;
    while(sp){const j=st[--sp];cnt++;const x=j%W,y=(j-x)/W;
      for(let dy=-1;dy<=1;dy++){const yy=y+dy;if(yy<0||yy>=H)continue;
        for(let dx=-1;dx<=1;dx++){const xx=x+dx;if(xx<0||xx>=W)continue;const k=yy*W+xx;if(bin[k]&&!lab[k]){lab[k]=n;st[sp++]=k;}}}}
    sizes.push(cnt);
  }
  return {lab,sizes,n};
}
function boxBlur(a,r){
  const tmp=new Float32Array(W*H),out=new Float32Array(W*H),w=2*r+1;
  for(let y=0;y<H;y++){const o=y*W;let s=0;for(let i=-r;i<=r;i++)s+=a[o+Math.min(W-1,Math.max(0,i))];
    for(let x=0;x<W;x++){tmp[o+x]=s/w;s+=a[o+Math.min(W-1,x+r+1)]-a[o+Math.max(0,x-r)];}}
  for(let x=0;x<W;x++){let s=0;for(let i=-r;i<=r;i++)s+=tmp[Math.min(H-1,Math.max(0,i))*W+x];
    for(let y=0;y<H;y++){out[y*W+x]=s/w;s+=tmp[Math.min(H-1,y+r+1)*W+x]-tmp[Math.max(0,y-r)*W+x];}}
  return out;
}
function maskFrom(c,th){const d=c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data,m=new Uint8Array(W*H);for(let i=0;i<m.length;i++)m[i]=d[i*4+3]>th?1:0;return m;}

/* ================= Räder (Hough-Kreise) ================= */
function carBox(e){
  if(carBoxPx)return carBoxPx;
  if(poly.length>=3){let x0=1,x1=0,y0=1,y1=0;for(const p of poly){x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y);}return {x0:x0*W,x1:x1*W,y0:y0*H,y1:y1*H};}
  const xs=[],ys=[];for(let i=0;i<e.length;i+=3)if(e[i]){xs.push(i%W);ys.push((i/W)|0);}
  if(xs.length<50)return {x0:0,x1:W,y0:0,y1:H};
  xs.sort((a,b)=>a-b);ys.sort((a,b)=>a-b);const q=(a,f)=>a[Math.floor(a.length*f)];
  return {x0:q(xs,.02),x1:q(xs,.98),y0:q(ys,.02),y1:q(ys,.98)};
}
function detectWheels(e,box){
  const L=box.x1-box.x0;if(L<100)return [];
  const rMin=Math.round(L*0.05),rMax=Math.round(L*0.14),aw=Math.ceil(W/2),ah=Math.ceil(H/2),acc=new Float32Array(aw*ah);
  const pts=[];for(let i=0;i<e.length;i++)if(e[i]&&magN[i]>8)pts.push(i);
  const stp=pts.length>150000?2:1;
  for(let n=0;n<pts.length;n+=stp){const i=pts[n],x=i%W,y=(i-x)/W,dx=gdx[i],dy=gdy[i];
    for(let r=Math.round(rMin*0.55);r<=rMax;r+=2){for(const s of [1,-1]){const cx=Math.round(x+s*dx*r)>>1,cy=Math.round(y+s*dy*r)>>1;if(cx>=0&&cy>=0&&cx<aw&&cy<ah)acc[cy*aw+cx]++;}}}
  const sm=new Float32Array(aw*ah);
  for(let y=1;y<ah-1;y++)for(let x=1;x<aw-1;x++){let s=0;for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)s+=acc[(y+a)*aw+x+b];sm[y*aw+x]=s;}
  const yMin=(box.y0+(box.y1-box.y0)*0.35)/2;
  // Kandidaten (lokale Maxima)
  const cand=[];const sup=Math.max(3,Math.round(rMin/2));
  for(let k=0;k<8;k++){let best=-1,bv=0;
    for(let y=1;y<ah-1;y++){if(y<yMin)continue;const o=y*aw;for(let x=1;x<aw-1;x++){const v=sm[o+x];if(v>bv){bv=v;best=o+x;}}}
    if(best<0||bv<=0)break;const bx=best%aw,by=(best-bx)/aw;cand.push({x:bx*2+1,y:by*2+1,v:bv});
    for(let y=Math.max(0,by-sup);y<=Math.min(ah-1,by+sup);y++)for(let x=Math.max(0,bx-sup);x<=Math.min(aw-1,bx+sup);x++)sm[y*aw+x]=0;}
  const useT=!!teedE&&$('teedOn').checked;
  const radial=(p,a,b)=>{const bins=new Float32Array(Math.ceil(b)+4);
    const x0=Math.max(1,Math.floor(p.x-b-2)),x1=Math.min(W-2,Math.ceil(p.x+b+2)),y0=Math.max(1,Math.floor(p.y-b-2)),y1=Math.min(H-2,Math.ceil(p.y+b+2));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const i=y*W+x;const vx=x-p.x,vy=y-p.y,d=Math.hypot(vx,vy);if(d<a||d>b)continue;
      if(useT){if(teedE[i]>30)bins[Math.round(d)]+=teedE[i]/100;continue;}
      if(magN[i]<8||!grad[i])continue;
      if(Math.abs((vx*gdx[i]+vy*gdy[i])/d)>0.85)bins[Math.round(d)]+=1;}
    const nb=new Float32Array(bins.length);for(let r=2;r<bins.length-2;r++)nb[r]=(bins[r-2]+bins[r-1]+bins[r]+bins[r+1]+bins[r+2])/(2*Math.PI*r);return nb;};
  const ev=[];
  for(const p of cand){
    const cx=Math.round(p.x),cy=Math.round(p.y);let r=0,yb=-1;
    if(carMask){
      if(!carMask[cy*W+cx])continue;
      for(let y=cy+Math.round(rMin*0.8);y<Math.min(H,cy+rMax*1.3);y++){let hit=0;for(let dx=-2;dx<=2;dx++)hit+=carMask[y*W+Math.min(W-1,Math.max(0,cx+dx))];if(hit<3){yb=y;break;}}
      if(yb<0)continue;const rm=yb-cy;if(rm<rMin||rm>rMax*1.25)continue;
      const nb=radial(p,rm*0.8,rm*1.1);let mx=0;for(let q=Math.round(rm*0.86);q<=Math.round(rm*1.06)&&q<nb.length;q++)mx=Math.max(mx,nb[q]);
      let bi=0;if(mx>0.1)for(let q=Math.min(nb.length-3,Math.round(rm*1.06));q>=Math.round(rm*0.86);q--){if(nb[q]>=mx*0.5){bi=q;let bq=q,bv=nb[q];for(let k=q-1;k>=q-4&&k>0;k--)if(nb[k]>bv){bv=nb[k];bq=k;}bi=bq;break;}}
      r=bi>0?bi:rm*0.97;
    }else{
      const nb=radial(p,rMin*0.6,rMax+2);let mx=0;for(let q=Math.round(rMin*0.8);q<nb.length;q++)if(nb[q]>mx)mx=nb[q];
      if(mx<0.08)continue;for(let q=nb.length-3;q>=rMin*0.8;q--){if(nb[q]>=mx*0.55){r=q;break;}}
      yb=cy+r;
    }
    if(r){const cov=ringCoverage(p.x,p.y,r),ins=carMask?diskInside(p.x,p.y,r,carMask):1;if(ins>=0.88)ev.push({x:p.x,y:p.y,r,yb,v:p.v,cov});}
  }
  if(!ev.length)return [];
  // bestes Paar: weit auseinander, gleiche Bodenhöhe, ähnliche Größe
  let bestPair=null,bs=-1;
  for(let i=0;i<ev.length;i++)for(let j=i+1;j<ev.length;j++){const a=ev[i],b=ev[j];
    const dx=Math.abs(a.x-b.x);if(dx<L*0.4||dx>L*0.85)continue;if(Math.abs(a.yb-b.yb)>L*0.05)continue;const rr=Math.max(a.r,b.r)/Math.min(a.r,b.r);if(rr>1.35)continue;
    if(a.cov+b.cov<0.5)continue;if(a.yb<box.y1-L*0.1||b.yb<box.y1-L*0.1)continue;
    const s=(a.v*(0.4+a.cov)+b.v*(0.4+b.cov))*(1.35-rr)*(1-Math.abs(a.yb-b.yb)/(L*0.1));if(s>bs){bs=s;bestPair=[a,b];}}
  if(bestPair){ // Paar muss sich klar von anderen Kreis-Kandidaten abheben (sonst Schrägansicht → Räder nicht ersetzen)
    const [a,b]=bestPair;let other=0;for(const c of ev){if(Math.hypot(c.x-a.x,c.y-a.y)<a.r*0.5||Math.hypot(c.x-b.x,c.y-b.y)<b.r*0.5)continue;other=Math.max(other,c.v);}
    const nrm=Math.min(a.v/(2*Math.PI*a.r),b.v/(2*Math.PI*b.r));
    if(!(Math.min(a.v,b.v)>=1.3*other||nrm>=1.5))bestPair=null;else{wheelConf='pair';}
    if(!bestPair)return [];
  }
  if(!bestPair){ev.sort((a,b)=>b.v-a.v);if(ev[0].cov<0.62||ev[0].yb<box.y1-L*0.1)return [];}
  const out=(bestPair||[ev[0]]).map(p=>({x:p.x/W,y:p.y/H,r:p.r/W}));
  out.sort((a,b)=>a.x-b.x);
  return out;
}
/* Räder über die Maske finden: in der Seitenansicht stehen zwei „Füße“ (Reifen) auf dem Boden.
   Pro Fuß wird der Kreis gesucht, der den Boden berührt und am besten auf Kanten liegt. */
function wheelsFromFeet(m){
  if(!m)return [];const bb=maskBox(m);if(!bb)return [];const L=bb.x1-bb.x0;if(L<100)return [];
  const E=i=>Math.max(teedE?teedE[i]:0,lineE?lineE[i]:0,(!teedE&&!lineE&&grad&&grad[i])?Math.min(100,magN[i]):0);
  const yb=new Int32Array(W).fill(-1);
  for(let x=bb.x0;x<=bb.x1;x++){for(let y=bb.y1;y>=bb.y0;y--)if(m[y*W+x]){yb[x]=y;break;}}
  const ys=[];for(let x=bb.x0;x<=bb.x1;x++)if(yb[x]>=0)ys.push(yb[x]);ys.sort((a,b)=>a-b);if(!ys.length)return [];
  const G=ys[Math.floor(ys.length*0.97)],tol=Math.max(3,0.025*L);
  const runs=[];let a=-1,last=-1;
  for(let x=bb.x0;x<=bb.x1+1;x++){const f=x<=bb.x1&&yb[x]>=G-tol;
    if(f){if(a<0)a=x;last=x;}else if(a>=0&&x-last>0.04*L){runs.push([a,last]);a=-1;}}
  if(a>=0)runs.push([a,last]);
  const cand=runs.filter(r=>r[1]-r[0]>0.03*L).map(r=>(r[0]+r[1])/2);
  if(cand.length<2)return [];
  const fit=xc=>{let best=null;
    for(let r=Math.round(0.055*L);r<=Math.round(0.15*L);r+=Math.max(1,Math.round(L/800))){
      for(let dx=-0.35*r;dx<=0.35*r;dx+=Math.max(1,r/20)){const cx=xc+dx,cy=G-r*0.98;let hit=0,tot=0;
        for(let k=0;k<64;k++){const ang=k/64*2*Math.PI;if(Math.sin(ang)>0.5)continue; // unten (Bodenkontakt) auslassen
          const ca=Math.cos(ang),sa=Math.sin(ang);let bv=0;
          for(let d=-2;d<=2;d++){const x=Math.round(cx+ca*(r+d)),y=Math.round(cy+sa*(r+d));if(x<1||y<1||x>=W-1||y>=H-1)continue;const v=E(y*W+x);if(v>bv)bv=v;}
          tot++;if(bv>30)hit++;}
        const sc=tot?hit/tot:0;if(!best||sc>best.s+1e-6||(Math.abs(sc-best.s)<0.02&&r>best.r))best={x:cx,y:cy,r,s:sc};}}
    return best;};
  // die beiden äußersten Füße (Vorder- und Hinterrad)
  const A=fit(cand[0]),B=fit(cand[cand.length-1]);
  if(!A||!B)return [];
  const d=Math.abs(A.x-B.x),rr=Math.max(A.r,B.r)/Math.min(A.r,B.r);
  if(d<0.4*L||d>0.85*L||rr>1.3||A.s<0.45||B.s<0.45)return [];
  const r=(A.r+B.r)/2; // gleich große Räder
  return [A,B].sort((p,q)=>p.x-q.x).map(p=>({x:p.x/W,y:(G-r*0.98)/H,r:r/W}));
}
function diskInside(cx,cy,r,m){let a=0,b=0;const st=Math.max(1,r/12);for(let y=cy-r;y<=cy+r;y+=st)for(let x=cx-r;x<=cx+r;x+=st){if((x-cx)**2+(y-cy)**2>r*r)continue;b++;const xi=Math.round(x),yi=Math.round(y);if(xi>=0&&yi>=0&&xi<W&&yi<H&&m[yi*W+xi])a++;}return b?a/b:0;}
/* Anteil des Kreisumfangs mit Kanten-Beleg (Reifen sind fast rundum sichtbar) */
function ringCoverage(cx,cy,r){
  const useT=!!teedE&&$('teedOn').checked,nb=72;let hit=0,tot=0;
  for(let k=0;k<nb;k++){const a=k/nb*2*Math.PI,ca=Math.cos(a),sa=Math.sin(a);let best=0,inside=false;
    for(let d=-4;d<=4;d++){const x=Math.round(cx+ca*(r+d)),y=Math.round(cy+sa*(r+d));if(x<1||y<1||x>=W-1||y>=H-1)continue;inside=true;const i=y*W+x;
      const v=useT?teedE[i]:(grad[i]?Math.min(100,magN[i]):0);if(v>best)best=v;}
    if(!inside)continue;tot++;if(best>(useT?35:25))hit++;}
  return tot?hit/tot:0;
}
function arcCubics(cx,cy,r,a0,a1){
  const out=[],n=Math.max(1,Math.ceil(Math.abs(a1-a0)/(Math.PI/2))),d=(a1-a0)/n,k=4/3*Math.tan(d/4);
  for(let i=0;i<n;i++){const s=a0+i*d,e=s+d,c1=Math.cos(s),s1=Math.sin(s),c2=Math.cos(e),s2=Math.sin(e);
    out.push([[cx+r*c1,cy+r*s1],[cx+r*(c1-k*s1),cy+r*(s1+k*c1)],[cx+r*(c2+k*s2),cy+r*(s2-k*c2)],[cx+r*c2,cy+r*s2]]);}
  return out;
}

/* ================= Skelett, Ketten, Verbinden ================= */
function thin(b){
  for(let x=0;x<W;x++){b[x]=0;b[(H-1)*W+x]=0;}for(let y=0;y<H;y++){b[y*W]=0;b[y*W+W-1]=0;}
  let pts=[];for(let i=0;i<b.length;i++)if(b[i])pts.push(i);
  let changed=true;
  while(changed){changed=false;
    for(let pass=0;pass<2;pass++){
      const del=[];
      for(const i of pts){if(!b[i])continue;
        const p2=b[i-W],p3=b[i-W+1],p4=b[i+1],p5=b[i+W+1],p6=b[i+W],p7=b[i+W-1],p8=b[i-1],p9=b[i-W-1];
        const n=p2+p3+p4+p5+p6+p7+p8+p9;if(n<2||n>6)continue;
        const A=(!p2&&p3)+(!p3&&p4)+(!p4&&p5)+(!p5&&p6)+(!p6&&p7)+(!p7&&p8)+(!p8&&p9)+(!p9&&p2);if(A!==1)continue;
        if(pass===0){if(p2&&p4&&p6)continue;if(p4&&p6&&p8)continue;}else{if(p2&&p4&&p8)continue;if(p2&&p6&&p8)continue;}
        del.push(i);}
      if(del.length){changed=true;for(const i of del)b[i]=0;}
    }
    pts=pts.filter(i=>b[i]);
  }
  return b;
}
function chains(S){
  const N=W*H,type=new Uint8Array(N),vis=new Uint8Array(N);
  const ring=[-W,-W+1,1,W+1,W,W-1,-1,-W-1],ORD=[-W,-1,1,W,-W-1,-W+1,W-1,W+1];
  const px=[];for(let i=0;i<N;i++)if(S[i])px.push(i);
  for(const i of px){let t=0,cnt=0;for(let k=0;k<8;k++){const a=S[i+ring[k]],b=S[i+ring[(k+1)%8]];if(!a&&b)t++;cnt+=a;}type[i]=cnt===0?0:t<=1?1:t===2?2:3;}
  const out=[];
  const walk=(ch,prev,cur,start)=>{
    while(true){let nxt=-1;
      for(const o of ORD){const k=cur+o;if(k===prev||!S[k]||vis[k])continue;if(k===start&&ch.length<4)continue;nxt=k;break;}
      if(nxt<0)break;ch.push(nxt);if(type[nxt]===3)break;vis[nxt]=1;prev=cur;cur=nxt;}
    return ch;
  };
  const mk=(ch,closed)=>({p:ch.map(i=>[i%W,(i/W)|0]),ix:ch,closed});
  for(const i of px){if(type[i]!==1||vis[i])continue;vis[i]=1;const ch=walk([i],-1,i,i);out.push(mk(ch,false));}
  for(const j of px){if(type[j]!==3)continue;
    for(const o of ORD){const n=j+o;if(!S[n]||vis[n]||type[n]===3)continue;vis[n]=1;out.push(mk(walk([j,n],j,n,j),false));}}
  for(const i of px){if(vis[i]||type[i]===3||!type[i])continue;vis[i]=1;const ch=walk([i],-1,i,i);
    const a=ch[0],z=ch[ch.length-1];out.push(mk(ch,ch.length>4&&Math.abs(a%W-z%W)<=1&&Math.abs(((a/W)|0)-((z/W)|0))<=1));}
  for(const c of out){c.ja=type[c.ix[0]]===3;c.jb=type[c.ix[c.ix.length-1]]===3;}
  return out;
}
function outDir(p,atStart){const n=p.length,k=Math.min(7,n-1);const a=atStart?p[0]:p[n-1],b=atStart?p[k]:p[n-1-k];const dx=a[0]-b[0],dy=a[1]-b[1],L=Math.hypot(dx,dy)||1;return [dx/L,dy/L];}
function mergeChains(cs,gap){
  const ends=[];
  cs.forEach((c,ci)=>{if(c.closed||c.p.length<2)return;ends.push({ci,s:0,pt:c.p[0],dir:outDir(c.p,true)},{ci,s:1,pt:c.p[c.p.length-1],dir:outDir(c.p,false)});});
  const cell=Math.max(8,gap),grid=new Map(),key=(x,y)=>x+','+y;
  ends.forEach((e,i)=>{const k=key(Math.floor(e.pt[0]/cell),Math.floor(e.pt[1]/cell));if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);});
  const cand=[];
  ends.forEach((A,i)=>{const gx=Math.floor(A.pt[0]/cell),gy=Math.floor(A.pt[1]/cell);
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const l=grid.get(key(gx+a,gy+b));if(!l)continue;
      for(const j of l){if(j<=i)continue;const B=ends[j];if(A.ci===B.ci&&cs[A.ci].p.length<Math.max(40,gap*3))continue;
        const dx=B.pt[0]-A.pt[0],dy=B.pt[1]-A.pt[1],d=Math.hypot(dx,dy);
        if(d<=3.5){const dot=A.dir[0]*B.dir[0]+A.dir[1]*B.dir[1];if(dot<=-0.55)cand.push({i,j,s:(1+dot)+d*0.05});}
        else if(d<=gap){const ca=(A.dir[0]*dx+A.dir[1]*dy)/d,cb=-(B.dir[0]*dx+B.dir[1]*dy)/d;
          if(ca>0.6&&cb>0.6)cand.push({i,j,s:0.6+d/gap+(2-ca-cb)});}}}});
  cand.sort((a,b)=>a.s-b.s);
  const link=new Map(),used=new Set();
  for(const c of cand){if(used.has(c.i)||used.has(c.j))continue;used.add(c.i);used.add(c.j);
    const A=ends[c.i],B=ends[c.j];link.set(A.ci*2+A.s,B.ci*2+B.s);link.set(B.ci*2+B.s,A.ci*2+A.s);}
  const vis=new Uint8Array(cs.length),out=[];
  const walk=(ci,entry)=>{
    const m={p:[],ix:[],closed:false,len:0,sw:0,user:0,ja:false,jb:false};let first=ci,firstEntry=entry;
    while(true){vis[ci]=1;const c=cs[ci],fw=entry===0;
      const p=fw?c.p:c.p.slice().reverse();
      m.p.push(...(m.p.length?p.slice(1):p));m.ix.push(...c.ix);m.len+=c.len;m.sw+=c.str*c.len;m.user+=c.user?c.len:0;
      const exit=fw?1:0,nx=link.get(ci*2+exit);
      if(nx===undefined){m.jb=fw?c.jb:c.ja;break;}
      const nci=nx>>1;if(vis[nci]){if(nci===first&&(nx&1)===firstEntry)m.closed=true;break;}
      ci=nci;entry=nx&1;}
    const c0=cs[first];m.ja=firstEntry===0?c0.ja:c0.jb;
    m.str=m.sw/Math.max(1,m.len);m.user=m.user>m.len*0.5;return m;
  };
  cs.forEach((c,ci)=>{if(vis[ci])return;if(c.closed){vis[ci]=1;out.push(c);return;}
    if(!link.has(ci*2))out.push(walk(ci,0));else if(!link.has(ci*2+1))out.push(walk(ci,1));});
  cs.forEach((c,ci)=>{if(!vis[ci])out.push(walk(ci,0));});
  return out;
}

/* ================= Glätten, Vereinfachen, Kurven ================= */
function resample(p,closed,step){
  const out=[p[0].slice()];let carry=0;const n=p.length,segs=closed?n:n-1;
  for(let i=0;i<segs;i++){const a=p[i],b=p[(i+1)%n],L=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!L)continue;
    let d=step-carry;while(d<=L){out.push([a[0]+(b[0]-a[0])*d/L,a[1]+(b[1]-a[1])*d/L]);d+=step;}carry=L-(d-step);}
  if(!closed){const l=p[n-1],o=out[out.length-1];if(Math.hypot(l[0]-o[0],l[1]-o[1])>step*0.3)out.push(l.slice());else out[out.length-1]=l.slice();}
  else if(out.length>2){const f=out[0],l=out[out.length-1];if(Math.hypot(f[0]-l[0],f[1]-l[1])<step*0.5)out.pop();}
  return out;
}
function gsmooth(p,sigma,closed){
  const q=resample(p,closed,1),n=q.length;if(sigma<0.5||n<3)return q;
  const r=Math.ceil(sigma*3),k=[];let ks=0;for(let i=-r;i<=r;i++){const v=Math.exp(-i*i/(2*sigma*sigma));k.push(v);ks+=v;}
  const get=i=>{if(closed)return q[((i%n)+n)%n];
    if(i<0){const m=Math.min(-i,n-1);return [2*q[0][0]-q[m][0],2*q[0][1]-q[m][1]];}
    if(i>n-1){const m=Math.max(0,2*(n-1)-i);return [2*q[n-1][0]-q[m][0],2*q[n-1][1]-q[m][1]];}
    return q[i];};
  const out=[];
  for(let i=0;i<n;i++){let x=0,y=0;for(let j=-r;j<=r;j++){const v=get(i+j),w=k[j+r];x+=v[0]*w;y+=v[1]*w;}out.push([x/ks,y/ks]);}
  if(!closed){out[0]=q[0];out[n-1]=q[n-1];}
  return out;
}
function wiggle2(p,st){
  st=Math.max(2,st||4);const n=p.length;if(n<st*4)return 0;const th=[];let pa=null;
  for(let i=st;i<n;i+=st){const a=Math.atan2(p[i][1]-p[i-st][1],p[i][0]-p[i-st][0]);if(pa!==null){let d=a-pa;if(d>Math.PI)d-=2*Math.PI;if(d<-Math.PI)d+=2*Math.PI;th.push(d);}pa=a;}
  let s=0;for(let i=1;i<th.length;i++)s+=Math.abs(th[i]-th[i-1]);
  return s/Math.max(1,(th.length-1)*st);
}
function wiggle(p,st){
  st=st||4;if(p.length<st*3)return 0.1;let t=0,L=0,pa=null;
  for(let i=st;i<p.length;i+=st){const a=Math.atan2(p[i][1]-p[i-st][1],p[i][0]-p[i-st][0]);if(pa!==null){let d=Math.abs(a-pa);if(d>Math.PI)d=2*Math.PI-d;t+=d;}pa=a;L+=st;}
  return t/Math.max(1,L);
}
/* Fair-Kurven: stark glätten, dann in einen Toleranzschlauch um die Originallinie zurückziehen */
let FAIR=true,FAIR_T=0.5,FAIR_S=1.1;
function tubeFair(p,closed,T,sig){
  const raw=resample(p,closed,1),n=raw.length;if(n<5)return raw;
  let q=gsmooth(p,sig,closed);if(q.length!==n)return gsmooth(p,sig*0.45,closed);
  const st=3,idx=[];for(let i=0;i<n;i+=st)idx.push(i);if(!closed&&idx[idx.length-1]!==n-1)idx.push(n-1);
  const m=idx.length;let a=idx.map(i=>q[i].slice()),o=idx.map(i=>raw[i]);
  for(let it=0;it<80;it++){
    const b=a.map(v=>v.slice());
    for(let k=0;k<m;k++){
      if(!closed&&(k===0||k===m-1))continue;
      const l=a[(k-1+m)%m],r=a[(k+1)%m];b[k][0]=a[k][0]+0.5*((l[0]+r[0])/2-a[k][0]);b[k][1]=a[k][1]+0.5*((l[1]+r[1])/2-a[k][1]);
      const dx=b[k][0]-o[k][0],dy=b[k][1]-o[k][1],d=Math.hypot(dx,dy);if(d>T){b[k][0]=o[k][0]+dx*T/d;b[k][1]=o[k][1]+dy*T/d;}
    }
    a=b;
  }
  return resample(a,closed,1);
}
function rdp(pts,eps){
  const n=pts.length;if(n<3||eps<=0)return pts;const keep=new Uint8Array(n);keep[0]=keep[n-1]=1;const st=[[0,n-1]];
  while(st.length){const [a,b]=st.pop();const [ax,ay]=pts[a],[bx,by]=pts[b];const dx=bx-ax,dy=by-ay,L=Math.hypot(dx,dy);let md=-1,mi=-1;
    for(let i=a+1;i<b;i++){const d=L?Math.abs(dy*pts[i][0]-dx*pts[i][1]+bx*ay-by*ax)/L:Math.hypot(pts[i][0]-ax,pts[i][1]-ay);if(d>md){md=d;mi=i;}}
    if(md>eps){keep[mi]=1;st.push([a,mi],[mi,b]);}}
  return pts.filter((_,i)=>keep[i]);
}
function simplifyLoop(p,eps){
  if(p.length<4)return p;
  let far=0,fd=-1;for(let i=1;i<p.length;i++){const d=(p[i][0]-p[0][0])**2+(p[i][1]-p[0][1])**2;if(d>fd){fd=d;far=i;}}
  const a=rdp(p.slice(0,far+1),eps),b=rdp(p.slice(far).concat([p[0]]),eps);
  return a.slice(0,-1).concat(b.slice(0,-1));
}
const V2={add:(a,b)=>[a[0]+b[0],a[1]+b[1]],sub:(a,b)=>[a[0]-b[0],a[1]-b[1]],mul:(a,s)=>[a[0]*s,a[1]*s],dot:(a,b)=>a[0]*b[0]+a[1]*b[1],
  len:a=>Math.hypot(a[0],a[1]),norm:a=>{const l=Math.hypot(a[0],a[1])||1;return [a[0]/l,a[1]/l];}};
function bz(b,t){const m=1-t;return [m*m*m*b[0][0]+3*m*m*t*b[1][0]+3*m*t*t*b[2][0]+t*t*t*b[3][0],m*m*m*b[0][1]+3*m*m*t*b[1][1]+3*m*t*t*b[2][1]+t*t*t*b[3][1]];}
function bz1(b,t){const m=1-t;return [3*m*m*(b[1][0]-b[0][0])+6*m*t*(b[2][0]-b[1][0])+3*t*t*(b[3][0]-b[2][0]),3*m*m*(b[1][1]-b[0][1])+6*m*t*(b[2][1]-b[1][1])+3*t*t*(b[3][1]-b[2][1])];}
function bz2(b,t){return [6*(1-t)*(b[2][0]-2*b[1][0]+b[0][0])+6*t*(b[3][0]-2*b[2][0]+b[1][0]),6*(1-t)*(b[2][1]-2*b[1][1]+b[0][1])+6*t*(b[3][1]-2*b[2][1]+b[1][1])];}
function genBez(P,u,t1,t2){
  const p0=P[0],p3=P[P.length-1];let C00=0,C01=0,C11=0,X0=0,X1=0;
  for(let i=0;i<P.length;i++){const t=u[i],m=1-t,b0=m*m*m,b1=3*m*m*t,b2=3*m*t*t,b3=t*t*t;
    const A0=V2.mul(t1,b1),A1=V2.mul(t2,b2);C00+=V2.dot(A0,A0);C01+=V2.dot(A0,A1);C11+=V2.dot(A1,A1);
    const tmp=V2.sub(P[i],V2.add(V2.mul(p0,b0+b1),V2.mul(p3,b2+b3)));X0+=V2.dot(A0,tmp);X1+=V2.dot(A1,tmp);}
  const det=C00*C11-C01*C01;let aL=det?(X0*C11-X1*C01)/det:0,aR=det?(C00*X1-C01*X0)/det:0;
  const seg=V2.len(V2.sub(p3,p0));if(aL<seg*1e-3||aR<seg*1e-3||aL>seg*2||aR>seg*2){aL=aR=seg/3;}
  return [p0,V2.add(p0,V2.mul(t1,aL)),V2.add(p3,V2.mul(t2,aR)),p3];
}
function fitCubic(P,t1,t2,err,out,depth){
  if(P.length<=2||depth>40){const d=V2.len(V2.sub(P[P.length-1],P[0]))/3;out.push([P[0],V2.add(P[0],V2.mul(t1,d)),V2.add(P[P.length-1],V2.mul(t2,d)),P[P.length-1]]);return;}
  let u=[0];for(let i=1;i<P.length;i++)u.push(u[i-1]+V2.len(V2.sub(P[i],P[i-1])));const tot=u[u.length-1]||1;u=u.map(v=>v/tot);
  let b=genBez(P,u,t1,t2),me=0,sp=1;
  const maxErr=()=>{me=0;sp=Math.floor(P.length/2);for(let i=1;i<P.length-1;i++){const q=bz(b,u[i]),d=(q[0]-P[i][0])**2+(q[1]-P[i][1])**2;if(d>me){me=d;sp=i;}}me=Math.sqrt(me);};
  maxErr();if(me<err){out.push(b);return;}
  if(me<err*4){for(let k=0;k<12;k++){u=u.map((t,i)=>{const d=V2.sub(bz(b,t),P[i]),d1=bz1(b,t),d2=bz2(b,t),den=V2.dot(d1,d1)+V2.dot(d,d2);return den?Math.min(1,Math.max(0,t-V2.dot(d,d1)/den)):t;});
    b=genBez(P,u,t1,t2);maxErr();if(me<err){out.push(b);return;}}}
  const c=V2.norm(V2.sub(P[sp-1],P[sp+1]));
  fitCubic(P.slice(0,sp+1),t1,c,err,out,depth+1);fitCubic(P.slice(sp),V2.mul(c,-1),t2,err,out,depth+1);
}
function fitPath(p,closed,err){
  let P=p.filter((_,i)=>i%2===0||i===p.length-1);if(P.length<2)P=p;
  const out=[];
  if(closed&&P.length>3){const Q=P.concat([P[0]]),n=Q.length,t1=V2.norm(V2.sub(Q[1],Q[n-2]));fitCubic(Q,t1,V2.mul(t1,-1),err,out,0);return out;}
  const n=P.length,k=Math.min(3,n-1);
  fitCubic(P,V2.norm(V2.sub(P[k],P[0])),V2.norm(V2.sub(P[n-1-k],P[n-1])),err,out,0);return out;
}
function crSegments(A,closed){
  const n=A.length,out=[];if(n<2)return out;
  const P=i=>{if(closed)return A[(i+n)%n];if(i<0)return {x:2*A[0].x-A[1].x,y:2*A[0].y-A[1].y};if(i>n-1)return {x:2*A[n-1].x-A[n-2].x,y:2*A[n-1].y-A[n-2].y};return A[i];};
  const segs=closed?n:n-1;
  for(let i=0;i<segs;i++){
    const p1=P(i),p2=P(i+1);let p0=P(i-1),p3=P(i+2);
    if(p1.c)p0={x:2*p1.x-p2.x,y:2*p1.y-p2.y};
    if(p2.c)p3={x:2*p2.x-p1.x,y:2*p2.y-p1.y};
    const d1=Math.max(1e-3,Math.sqrt(Math.hypot(p1.x-p0.x,p1.y-p0.y))),d2=Math.max(1e-3,Math.sqrt(Math.hypot(p2.x-p1.x,p2.y-p1.y))),d3=Math.max(1e-3,Math.sqrt(Math.hypot(p3.x-p2.x,p3.y-p2.y)));
    const b1x=(d1*d1*p2.x-d2*d2*p0.x+(2*d1*d1+3*d1*d2+d2*d2)*p1.x)/(3*d1*(d1+d2)),b1y=(d1*d1*p2.y-d2*d2*p0.y+(2*d1*d1+3*d1*d2+d2*d2)*p1.y)/(3*d1*(d1+d2));
    const b2x=(d3*d3*p1.x-d2*d2*p3.x+(2*d3*d3+3*d3*d2+d2*d2)*p2.x)/(3*d3*(d3+d2)),b2y=(d3*d3*p1.y-d2*d2*p3.y+(2*d3*d3+3*d3*d2+d2*d2)*p2.y)/(3*d3*(d3+d2));
    out.push([[p1.x,p1.y],[b1x,b1y],[b2x,b2y],[p2.x,p2.y]]);
  }
  return out;
}
function flatten(cub,k){const o=[];cub.forEach((b,i)=>{for(let j=i?1:0;j<=k;j++)o.push(bz(b,j/k));});return o;}
function pathD(list,ox,oy,s){
  const f=v=>+v.toFixed(2),X=q=>f((q[0]-ox)*s),Y=q=>f((q[1]-oy)*s);let d='';
  for(const c of list){const p=c.p,n=p?p.length:0;
    if(c.cub&&c.cub.length){const b=c.cub;d+=`M${X(b[0][0])} ${Y(b[0][0])}`;for(const q of b)d+=`C${X(q[1])} ${Y(q[1])} ${X(q[2])} ${Y(q[2])} ${X(q[3])} ${Y(q[3])}`;if(c.closed)d+='Z';continue;}
    if(n<2)continue;
    if(c.closed&&n>=3){const m=(i,j)=>[(p[i][0]+p[j][0])/2,(p[i][1]+p[j][1])/2];const s0=m(n-1,0);d+=`M${X(s0)} ${Y(s0)}`;
      for(let i=0;i<n;i++){const q=m(i,(i+1)%n);d+=`Q${X(p[i])} ${Y(p[i])} ${X(q)} ${Y(q)}`;}d+='Z';continue;}
    d+=`M${X(p[0])} ${Y(p[0])}`;
    if(n===2){d+=`L${X(p[1])} ${Y(p[1])}`;continue;}
    for(let i=1;i<n-1;i++){const q=i===n-2?p[n-1]:[(p[i][0]+p[i+1][0])/2,(p[i][1]+p[i+1][1])/2];d+=`Q${X(p[i])} ${Y(p[i])} ${X(q)} ${Y(q)}`;}
  }
  return d;
}
/* ================= Strichstil: Hierarchie + Pinsel-Enden ================= */
let drawing=[],strokeMode='brush';
const TIERW={A:1,B1:0.88,B:0.74,C:0.55};
function minWidthPx(){const mm=+$('mm').value||600,minMM=Math.max(0,+$('minMM').value||0),fw=(carBoxPx?carBoxPx.x1-carBoxPx.x0:W*0.8)+2*marg();return minMM*fw/mm;}
function endGrid(list,cell){
  const g=new Map(),K=(x,y)=>x+','+y,st=Math.max(1.5,2*SC);
  list.forEach((c,ci)=>{const P=c.cub&&c.cub.length?flatten(c.cub,8):c.p;if(!P)return;
    for(const q of resample(P,!!c.closed,st)){const k=K(Math.floor(q[0]/cell),Math.floor(q[1]/cell));let a=g.get(k);if(!a)g.set(k,a=[]);a.push(ci,q[0],q[1]);}});
  return {g,K,cell};
}
function joinedAt(G,ci,E,thr){
  const gx=Math.floor(E[0]/G.cell),gy=Math.floor(E[1]/G.cell),t2=thr*thr;
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const arr=G.g.get(G.K(gx+a,gy+b));if(!arr)continue;
    for(let j=0;j<arr.length;j+=3){if(arr[j]===ci)continue;const dx=arr[j+1]-E[0],dy=arr[j+2]-E[1];if(dx*dx+dy*dy<=t2)return true;}}
  return false;
}
function buildDrawing(list){
  const base=lw(),mode=strokeMode,carLen=carBoxPx?carBoxPx.x1-carBoxPx.x0:W*0.8;
  const autos=list.filter(c=>!c.outline&&c.wheel===undefined&&!c.uid&&!c.ground&&!c.bridge&&!c.dockExt&&isFinite(c.score)).map(c=>c.score).sort((a,b)=>b-a);
  const thr=autos.length?autos[Math.floor(autos.length*0.3)]:Infinity,thr1=autos.length?autos[Math.floor(autos.length*0.1)]:Infinity;
  for(const c of list){if(c.dockExt)continue;
    c.tier=(mode==='uniform')?'A':(c.outline||c.wheel!==undefined||c.ground)?'A':(c.uid||c.bridge)?'B':c.detailLoop?'C':(c.len>=carLen*0.3&&c.score>=thr1)?'B1':(c.len>=carLen*0.16||c.score>=thr)?'B':'C';}
  for(const c of list)if(c.dockExt)c.tier=mode==='uniform'?'A':((c.parent&&c.parent.tier)||'B');
  const wMin=Math.min(base,minWidthPx());
  for(const c of list)c.w=Math.max(wMin,base*TIERW[c.tier||'A']);
  const G=new Map(),add=(w,d)=>{const k=Math.max(0.5,Math.round(w*8)/8);G.set(k,(G.get(k)||'')+d);};
  const f2=v=>v.toFixed(2),taper=mode==='brush',EG=taper?endGrid(list,Math.max(8,base*1.5)):null;
  list.forEach((c,ci)=>{
    const w=c.w;let tA=false,tB=false,P=null;
    if(taper&&!c.closed&&c.wheel===undefined&&!c.bridge&&!c.dockExt&&!c.ground&&c.cub&&c.cub.length){
      P=resample(flatten(c.cub,16),false,Math.max(1,w/3));
      if(P.length>=4){const th=base*0.75;tA=!joinedAt(EG,ci,P[0],th);tB=!joinedAt(EG,ci,P[P.length-1],th);}
    }
    if(!tA&&!tB){add(w,pathD([c],0,0,1));return;}
    const n=P.length,s=new Float32Array(n);for(let i=1;i<n;i++)s[i]=s[i-1]+Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]);
    const L=s[n-1],Lt=Math.min(0.4*L,9*w),minF=0.3;
    const f=v=>{const x=Math.max(0,Math.min(1,v/Lt));return minF+(1-minF)*(1-(1-x)*(1-x));};
    const wAt=i=>Math.max(wMin,w*Math.min(tA?f(s[i]):1,tB?f(L-s[i]):1));
    let i0=0,i1=n-1;if(tA)while(i0<n-1&&s[i0]<Lt)i0++;if(tB)while(i1>0&&L-s[i1]<Lt)i1--;
    if(i1>i0){let d=`M${f2(P[i0][0])} ${f2(P[i0][1])}`;for(let i=i0+1;i<=i1;i++)d+=`L${f2(P[i][0])} ${f2(P[i][1])}`;add(w,d);}
    for(let i=0;i<n-1;i++){if(i1>i0&&i>=i0&&i<i1)continue;add((wAt(i)+wAt(i+1))/2,`M${f2(P[i][0])} ${f2(P[i][1])}L${f2(P[i+1][0])} ${f2(P[i+1][1])}`);}
  });
  drawing=[...G.entries()].sort((a,b)=>b[0]-a[0]).map(([w,d])=>({w,d,p:new Path2D(d)}));
  return drawing;
}
function paintDrawing(ctx,color){ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=color;for(const g of drawing){ctx.lineWidth=g.w;ctx.stroke(g.p);}ctx.restore();}
function rasterDrawing(){
  const c=rasC.getContext('2d',{willReadFrequently:true});c.clearRect(0,0,W,H);paintDrawing(c,'#000');
  const d=c.getImageData(0,0,W,H).data,m=new Uint8Array(W*H);for(let i=0;i<m.length;i++)m[i]=d[i*4+3]>127?1:0;return m;
}
function strokeTo(ctx,path,width,color){ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke(path);ctx.restore();}
function rasterize(list){buildDrawing(list);return rasterDrawing();}

function samplePts(c,step){
  const p=c.p,out=[];const n=p.length,segs=c.closed?n:n-1;
  for(let i=0;i<segs;i++){const a=p[i],b=p[(i+1)%n],L=Math.hypot(b[0]-a[0],b[1]-a[1]),k=Math.max(1,Math.ceil(L/step));
    for(let s=0;s<k;s++)out.push([a[0]+(b[0]-a[0])*s/k,a[1]+(b[1]-a[1])*s/k]);}
  if(!c.closed)out.push(p[n-1]);
  return out;
}
function dedup(list,d){
  if(d<=0||list.length<2)return list;
  const occ=new Uint8Array(W*H),occT=new Uint8Array(W*H);
  const mkDisk=rr=>{const r=Math.ceil(rr),o=[];for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(dx*dx+dy*dy<=rr*rr)o.push([dx,dy]);return o;};
  const disk=mkDisk(d),diskO=mkDisk(d*1.5),diskT=mkDisk(d*0.75),diskW=mkDisk(Math.min(d*0.5,Math.max(3,lw()*1.2)));
  const mark=(g,pts,dk)=>{for(const q of pts){const x0=Math.round(q[0]),y0=Math.round(q[1]);for(const [dx,dy] of dk){const x=x0+dx,y=y0+dy;if(x>=0&&y>=0&&x<W&&y<H)g[y*W+x]=1;}}};
  const at=(g,q)=>{const x=Math.round(q[0]),y=Math.round(q[1]);return x>=0&&y>=0&&x<W&&y<H&&g[y*W+x]===1;};
  const sorted=list.slice().sort((a,b)=>(b.user-a.user)||(b.score-a.score));
  const kept=[],minRun=Math.max(10,24*SC);let pid=0;
  for(const c of sorted){
    const S=c.sm||samplePts(c,2);
    if(!c.user&&!c.protect){let hit=0;for(const q of S)if(at(occ,q))hit++;if(hit/S.length>=0.55)continue;}
    const id=++pid;
    if(c.user||c.protect||!c.sm||c.detailLoop){c.pid=id;kept.push(c);mark(occ,S,c.outline?diskO:c.wheel!==undefined?diskW:disk);if(!c.protect&&!c.user)mark(occT,S,diskT);continue;}
    // Teile, die auf einer stärkeren Innenlinie liegen, abschneiden (Gabelungen, Doppelstriche)
    const P=c.sm,n=P.length,cov=P.map(q=>at(occT,q));let nc=0;for(const v of cov)if(v)nc++;
    if(nc<3){c.pid=id;kept.push(c);mark(occ,P,disk);mark(occT,P,diskT);continue;}
    const runs=[];let a=-1;
    for(let i=0;i<=n;i++){const free=i<n&&!cov[i];if(free&&a<0)a=i;if(!free&&a>=0){runs.push([a,i]);a=-1;}}
    if(c.closed&&runs.length>1&&runs[0][0]===0&&runs[runs.length-1][1]===n){const last=runs.pop();runs[0]=[last[0]-n,runs[0][1]];}
    for(const [ra,rb] of runs){
      const len=rb-ra;if(len<minRun)continue;
      const sub=[];for(let i=ra;i<rb;i++)sub.push(P[(i+n)%n]);
      const it={sm:sub,p:rdp(sub,0.6),closed:false,len,str:c.str,score:c.score*len/n,user:false,wg:c.wg,pid:id};
      kept.push(it);mark(occ,sub,disk);mark(occT,sub,diskT);
    }
  }
  return kept;
}

/* ================= Pipeline ================= */
function userItems(){
  return userLines.map(u=>{const A=u.a.map(q=>({x:q.x*W,y:q.y*H,c:q.c}));const cub=crSegments(A,u.closed);
    return {p:flatten(cub,16),cub,closed:u.closed,user:true,score:1e9,uid:u.id};}).filter(c=>c.cub.length);
}
function wheelItems(){
  if(wheelMode==='orig'||wheelMode==='none')return [];
  return wheels.map((w,i)=>{const cx=w.x*W,cy=w.y*H,r=w.r*W;
    const g=wheelMode==='arc'?0.5:0;const cub=wheelMode==='arc'?arcCubics(cx,cy,r,Math.PI/2+g,Math.PI/2+2*Math.PI-g):arcCubics(cx,cy,r,0,2*Math.PI);
    return {p:flatten(cub,12),cub,closed:wheelMode==='circle',user:true,score:1e9,wheel:i};});
}
function groundItem(list){
  if(!$('ground').checked)return [];
  let x0=Infinity,x1=-Infinity,y=-Infinity;
  for(const c of list)for(const q of c.p){if(q[0]<x0)x0=q[0];if(q[0]>x1)x1=q[0];}
  if(wheels.length&&wheelMode!=='orig')for(const w of wheels)y=Math.max(y,w.y*H+w.r*W);
  else for(const c of list)for(const q of c.p)if(q[1]>y)y=q[1];
  if(!isFinite(x0)||!isFinite(y))return [];
  const a=[x0-lw(),y],b=[x1+lw(),y];
  return [{p:[a,b],cub:[[a,[a[0]+(b[0]-a[0])/3,y],[a[0]+2*(b[0]-a[0])/3,y],b]],closed:false,user:true,score:1e9,ground:true}];
}
/* Alles zu einem Teil verbinden (für Laser/3D-Druck): kurze Stege zum Hauptteil, kleine Inseln weg */
function connectParts(list){
  const maxB=Math.max(10,(carBoxPx?carBoxPx.x1-carBoxPx.x0:W)*0.05),st=Math.max(2,3*SC);
  for(let iter=0;iter<8;iter++){
    const r=rasterize(list),L=label(r);if(L.n<=1)return {list,r,L};
    let main=1;for(let k=2;k<=L.n;k++)if(L.sizes[k]>L.sizes[main])main=k;
    const lab=pt=>L.lab[Math.min(H-1,Math.max(0,Math.round(pt[1])))*W+Math.min(W-1,Math.max(0,Math.round(pt[0])))];
    const comp=list.map(c=>{const P=c.cub&&c.cub.length?flatten(c.cub,6):c.p;const cnt=new Map();for(const q of P){const l=lab(q);if(l)cnt.set(l,(cnt.get(l)||0)+1);}let b=0,bv=0;for(const [k,v] of cnt)if(v>bv){bv=v;b=k;}return b;});
    // Punkte des Hauptteils in ein Raster
    const cell=Math.max(8,maxB),grid=new Map(),K=(x,y)=>x+','+y;
    list.forEach((c,i)=>{if(comp[i]!==main)return;for(const q of samplePts(c,st)){const kk=K(Math.floor(q[0]/cell),Math.floor(q[1]/cell));let a=grid.get(kk);if(!a)grid.set(kk,a=[]);a.push(q[0],q[1]);}});
    const groups=new Map();list.forEach((c,i)=>{const k=comp[i];if(!k||k===main)return;let g=groups.get(k);if(!g)groups.set(k,g=[]);g.push(i);});
    let changed=false;const drop=new Set(),add=[];
    for(const [k,idx] of groups){
      let best=null,bd=Infinity;
      for(const i of idx)for(const q of samplePts(list[i],st)){const gx=Math.floor(q[0]/cell),gy=Math.floor(q[1]/cell);
        for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const arr=grid.get(K(gx+a,gy+b));if(!arr)continue;
          for(let j=0;j<arr.length;j+=2){const d=Math.hypot(arr[j]-q[0],arr[j+1]-q[1]);if(d<bd){bd=d;best=[q,[arr[j],arr[j+1]]];}}}}
      const prot=idx.some(i=>list[i].user||list[i].wheel!==undefined||list[i].outline);
      let tl=0;for(const i of idx)tl+=list[i].len||0;const signif=prot||tl>=(carBoxPx?carBoxPx.x1-carBoxPx.x0:W)*0.18;
      if(best&&(bd<=Math.max(3*lw(),8*SC)||(signif&&bd<=maxB))){const [p,q]=best;add.push({p:[p,q],cub:[[p,[p[0]+(q[0]-p[0])/3,p[1]+(q[1]-p[1])/3],[p[0]+2*(q[0]-p[0])/3,p[1]+2*(q[1]-p[1])/3],q]],closed:false,bridge:true,user:false,score:0});changed=true;}
      else if(!prot){for(const i of idx)drop.add(i);changed=true;}
    }
    if(!changed)return {list,r,L};
    list=list.filter((c,i)=>!drop.has(i)).concat(add);
  }
  const r=rasterize(list);return {list,r,L:label(r)};
}
/* Struktur-Bonus: Linien, die an andere wichtige Linien anschließen (Säulen, Fugen, Fensterrahmen), sind wichtiger als freie Fetzen */
function structureBonus(list,anchorsExtra,weak,k){
  const anchors=anchorsExtra.concat(list.filter(c=>c.user||c.score>=weak));
  const cell=Math.max(10,3*lw()),grid=new Map(),K=(x,y)=>x+','+y,st=Math.max(2,2*SC);
  anchors.forEach((c,ai)=>{const P=c.sm||(c.cub&&c.cub.length?flatten(c.cub,8):c.p);if(!P)return;
    for(const q of resample(P,!!c.closed,st)){const kk=K(Math.floor(q[0]/cell),Math.floor(q[1]/cell));let a=grid.get(kk);if(!a)grid.set(kk,a=[]);a.push(c,q[0],q[1]);}});
  const R=Math.max(4,2*lw()),R2=R*R;
  const near=(c,E)=>{const gx=Math.floor(E[0]/cell),gy=Math.floor(E[1]/cell);
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const arr=grid.get(K(gx+a,gy+b));if(!arr)continue;
      for(let j=0;j<arr.length;j+=3){if(arr[j]===c)continue;const dx=arr[j+1]-E[0],dy=arr[j+2]-E[1];if(dx*dx+dy*dy<=R2)return true;}}return false;};
  for(const c of list){
    if(c.user)continue;const P=c.sm||c.p;if(!P||P.length<2)continue;
    let m=1;
    if(c.closed)m=1+0.6*k;
    else{const e=(near(c,P[0])?1:0)+(near(c,P[P.length-1])?1:0);m=e===2?1+1.4*k:e===1?1+0.5*k:1/(1+0.3*k);}
    c.conn=m;c.score*=m;
  }
}
let FACE={str:1.3,sol:0.78,wg:0.09};
function convexHull(P){
  const p=P.map(q=>[q[0],q[1]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(p.length<3)return p;
  const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);const lo=[],up=[];
  for(const q of p){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],q)<=0)lo.pop();lo.push(q);}
  for(let i=p.length-1;i>=0;i--){const q=p[i];while(up.length>=2&&cr(up[up.length-2],up[up.length-1],q)<=0)up.pop();up.push(q);}
  up.pop();lo.pop();return lo.concat(up);
}
/* Kleine geschlossene Flächen im Linienbild finden (Türgriffe, Tankdeckel, Blinker …) – auch wenn sie an anderen Linien hängen */
function faceLoops(S,E,thr,carLen){
  const N=W*H,lab=new Int32Array(N),st=new Int32Array(N),out=[];let n=0;
  const aMin=Math.pow(0.018*carLen,2),aMax=Math.pow(0.06*carLen,2);
  for(let i=0;i<N;i++){
    if(S[i]||lab[i])continue;n++;let sp=0,cnt=0,x0=W,x1=0,y0=H,y1=0,border=false;lab[i]=n;st[sp++]=i;
    while(sp){const j=st[--sp];cnt++;const x=j%W,y=(j-x)/W;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      if(x===0||y===0||x===W-1||y===H-1)border=true;
      if(x>0){const k=j-1;if(!S[k]&&!lab[k]){lab[k]=n;st[sp++]=k;}}if(x<W-1){const k=j+1;if(!S[k]&&!lab[k]){lab[k]=n;st[sp++]=k;}}
      if(y>0){const k=j-W;if(!S[k]&&!lab[k]){lab[k]=n;st[sp++]=k;}}if(y<H-1){const k=j+W;if(!S[k]&&!lab[k]){lab[k]=n;st[sp++]=k;}}
      if(cnt>aMax*1.5&&!border){}}
    if(border||cnt<aMin||cnt>aMax)continue;
    const bw=x1-x0+1,bh=y1-y0+1,fill=cnt/(bw*bh),asp=Math.max(bw,bh)/Math.min(bw,bh);
    if(fill<0.5||asp>7)continue;
    // Rand der Fläche: Stärke der umgebenden Linie prüfen
    const sub=new Uint8Array(bw*bh);for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(lab[y*W+x]===n)sub[(y-y0)*bw+x-x0]=1;
    const loops=traceContours(sub,bw,bh);if(!loops.length)continue;
    let L=loops[0],la=0;for(const l of loops){const a=Math.abs(polyArea(l));if(a>la){la=a;L=l;}}
    let pts=resample(L.map(q=>[q[0]+x0,q[1]+y0]),true,1);
    let s=0,c=0;for(const q of pts){let best=0;const xi=Math.round(q[0]),yi=Math.round(q[1]);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const X=xi+dx,Y=yi+dy;if(X<0||Y<0||X>=W||Y>=H)continue;best=Math.max(best,E[Y*W+X]||0);}s+=best;c++;}
    const str=c?s/c/thr:0;
    // Form muss ruhig und fast konvex sein (echte Bauteile), sonst ist es Innenraum-/Spiegelungs-Chaos
    const hull=convexHull(pts),ha=Math.abs(polyArea(hull)),sol=ha>0?cnt/ha:0;
    const smp=gsmooth(pts,Math.max(1.5,3.5*SC),true),wgf=wiggle2(smp,Math.max(2,Math.round(4*SC)))*SC;
    if(window.__DBGF)(window.__faces=window.__faces||[]).push({x:(x0+x1)/2/W,y:(y0+y1)/2/H,a:cnt,sol:+sol.toFixed(2),wg:+(wgf*1000).toFixed(1),str:+str.toFixed(2),fill:+fill.toFixed(2)});
    if(str<FACE.str||sol<FACE.sol||wgf>FACE.wg)continue;
    out.push({pts,len:pts.length,str:Math.min(3,str),area:cnt,sol});
  }
  return out;
}
/* Fenster leer lassen: Linien, die komplett innerhalb einer Scheibe liegen (Innenraum, Spiegelungen), entfernen */
let winMask=null;
function windowCleanup(list){
  winMask=null;if(!carBoxPx)return list;
  const L=carBoxPx.x1-carBoxPx.x0,Hc=carBoxPx.y1-carBoxPx.y0;
  const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d',{willReadFrequently:true});
  x.lineCap='round';x.lineJoin='round';x.lineWidth=Math.max(6,(window.WINLW||14)*SC);x.strokeStyle='#000';
  const sc=list.filter(it=>!it.user&&!it.outline&&!it.protect&&isFinite(it.score)).map(it=>it.score).sort((a,b)=>b-a);
  const thrS=sc.length?sc[Math.floor(sc.length*(window.WINQ||0.4))]:0; // nur die stärkeren Linien bilden die Scheibenrahmen
  for(const it of list){if(it.user)continue;if(!it.outline&&!it.protect&&it.score<thrS)continue;const P=it.sm||it.p;if(!P||P.length<2)continue;x.beginPath();x.moveTo(P[0][0],P[0][1]);for(let i=1;i<P.length;i++)x.lineTo(P[i][0],P[i][1]);if(it.closed)x.closePath();x.stroke();}
  const d=x.getImageData(0,0,W,H).data,N=W*H,S=new Uint8Array(N);for(let i=0;i<N;i++)S[i]=d[i*4+3]>60?1:0;
  const lab=new Int32Array(N),st=new Int32Array(N);let n=0;const win=new Uint8Array(N);let found=0;
  const aMin=Math.pow(0.07*L,2),aMax=Math.pow(0.42*L,2);
  for(let i=0;i<N;i++){
    if(S[i]||lab[i])continue;n++;let sp=0,cnt=0,x0=W,x1=0,y0=H,y1=0,sy=0,border=false;lab[i]=n;st[sp++]=i;
    while(sp){const j=st[--sp];cnt++;const px=j%W,py=(j-px)/W;sy+=py;if(px<x0)x0=px;if(px>x1)x1=px;if(py<y0)y0=py;if(py>y1)y1=py;
      if(px===0||py===0||px===W-1||py===H-1)border=true;
      if(px>0&&!S[j-1]&&!lab[j-1]){lab[j-1]=n;st[sp++]=j-1;}if(px<W-1&&!S[j+1]&&!lab[j+1]){lab[j+1]=n;st[sp++]=j+1;}
      if(py>0&&!S[j-W]&&!lab[j-W]){lab[j-W]=n;st[sp++]=j-W;}if(py<H-1&&!S[j+W]&&!lab[j+W]){lab[j+W]=n;st[sp++]=j+W;}}
    if(border||cnt<aMin||cnt>aMax)continue;
    const cy=sy/cnt;if(cy>carBoxPx.y0+0.5*Hc)continue; // nur obere Hälfte (Glasfläche)
    const bw=x1-x0+1,bh=y1-y0+1;if(cnt/(bw*bh)<0.4||bw/bh>8)continue;
    for(let y=y0;y<=y1;y++)for(let xx=x0;xx<=x1;xx++){const k=y*W+xx;if(lab[k]===n)win[k]=1;}found++;
  }
  window.__win=found;
  if(!found)return list;
  const inner=erodeMask(win,Math.max(3,1.6*lw()));winMask=inner;
  return list.filter(it=>{
    if(it.user||it.outline||it.protect||it.wheel!==undefined)return true;
    const S2=samplePts({p:it.sm||it.p,closed:it.closed},2);if(!S2.length)return true;
    let k=0;for(const q of S2){const xi=Math.round(q[0]),yi=Math.round(q[1]);if(xi>=0&&yi>=0&&xi<W&&yi<H&&inner[yi*W+xi])k++;}
    return k/S2.length<0.7;
  });
}
/* Unruhige Zonen beruhigen: Linien in dichten Bereichen (Lichter, Diffusor, Spiegelungen) abwerten */
function densityPenalty(list,outl,k){
  if(k<=0||list.length<2)return;
  const R=Math.max(12,36*SC),cell=R,grid=new Map(),K=(x,y)=>x+','+y,st=Math.max(2,4*SC);
  const add=(pts,id,w)=>{for(const q of pts){const kk=K(Math.floor(q[0]/cell),Math.floor(q[1]/cell));let a=grid.get(kk);if(!a)grid.set(kk,a=[]);a.push(q[0],q[1],id,w);}};
  const S=list.map(c=>samplePts(c,st));
  S.forEach((pts,i)=>add(pts,i,1));
  outl.forEach(o=>add(samplePts({p:o.p,closed:o.closed},st),-1,0.5));
  const R2=R*R;
  list.forEach((c,i)=>{
    if(c.user)return;const pts=S[i];if(!pts.length)return;let acc=0;
    for(const q of pts){const gx=Math.floor(q[0]/cell),gy=Math.floor(q[1]/cell);
      for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const arr=grid.get(K(gx+a,gy+b));if(!arr)continue;
        for(let j=0;j<arr.length;j+=4){if(arr[j+2]===i)continue;const dx=arr[j]-q[0],dy=arr[j+1]-q[1];if(dx*dx+dy*dy<=R2)acc+=arr[j+3];}}}
    const dens=acc/pts.length; // wie viele fremde Linienpunkte im Umkreis pro eigenem Punkt
    c.dens=dens;c.score/=1+k*Math.max(0,dens-25)/40;
  });
}
/* Schatten unter dem Auto aus der Maske entfernen: Schwellerlinie per RANSAC suchen */
function trimShadow(m){
  if(!m||wheels.length<2||!$('shadowOn').checked)return m;
  const ws=wheels.slice().sort((a,b)=>a.x-b.x),A=ws[0],Bw=ws[ws.length-1];
  const ax=A.x*W,ay=A.y*H,ar=A.r*W,bx=Bw.x*W,by=Bw.y*H,br=Bw.r*W;
  const x0=Math.ceil(ax+ar*1.0),x1=Math.floor(bx-br*1.0);if(x1-x0<40)return m;
  const useT=!!teedE&&$('teedOn').checked,E=i=>useT?teedE[i]:(grad[i]?Math.min(100,magN[i]):0),thr=useT?42:40;
  const cols=[],pts=[];
  for(let x=x0;x<=x1;x+=2){
    const t=(x-ax)/(bx-ax),cy=ay+(by-ay)*t,r=ar+(br-ar)*t;
    let ym=-1;for(let y=Math.min(H-1,Math.round(cy+r*1.5));y>cy-r*0.3;y--)if(m[y*W+x]){ym=y;break;}
    if(ym<0)continue;
    const ci=cols.length;cols.push({x,ym,cy,r});
    for(let y=Math.max(1,Math.round(cy-r*0.3));y<Math.min(H-1,ym-1);y++){const v=E(y*W+x);if(v>=thr&&v>=E((y-1)*W+x)&&v>=E((y+1)*W+x))pts.push([x,y,ci]);}
  }
  if(cols.length<10||pts.length<10)return m;
  let seed=12345;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
  const span=x1-x0;let best=null;
  for(let it=0;it<500;it++){
    const p=pts[(rnd()*pts.length)|0],q=pts[(rnd()*pts.length)|0];if(Math.abs(p[0]-q[0])<span*0.25)continue;
    const b=(q[1]-p[1])/(q[0]-p[0]);if(Math.abs(b)>0.1)continue;const a=p[1]-b*p[0];
    const hit=new Uint8Array(cols.length);let sup=0;
    for(const s of pts){if(hit[s[2]])continue;if(Math.abs(s[1]-(a+b*s[0]))<=2.5){hit[s[2]]=1;sup++;}}
    const frac=sup/cols.length;if(frac<0.45)continue;
    const midY=a+b*(x0+x1)/2;
    if(!best||midY>best.midY+3||(Math.abs(midY-best.midY)<=3&&frac>best.frac))best={a,b,frac,midY};
  }
  const o=m.slice();let cut=0;
  for(let x=x0;x<=x1;x++){
    const t=(x-ax)/(bx-ax),cy=ay+(by-ay)*t,r=ar+(br-ar)*t;
    let yc=cy+r*0.84;
    if(best)yc=Math.min(yc,best.a+best.b*x+Math.max(2,1.5*SC));
    for(let y=Math.ceil(yc);y<H;y++){const i=y*W+x;if(o[i]){o[i]=0;cut++;}}
  }
  if(!cut)return m;
  const L=label(o);if(L.n>1){let bi=1;for(let k=2;k<=L.n;k++)if(L.sizes[k]>L.sizes[bi])bi=k;for(let i=0;i<o.length;i++)if(o[i]&&L.lab[i]!==bi)o[i]=0;}
  return o;
}
/* ================= KI-Zeichner: Linien ordnen, Doppellinien zusammenfassen, verbinden ================= */
function artTail(list,outl,eps){
  const P=Object.assign({olW:2.4,parW:2.6,minRun:0.02,circ:0.12,ext:0.07,maxN:{min:22,mid:40,det:80}},window.ARTT||{});
  const lwv=lw(),carLen=carBoxPx?carBoxPx.x1-carBoxPx.x0:W*0.8,minRun=Math.max(8,carLen*P.minRun);
  const wins=$('cleanWin').checked?windowItems():[];
  const fixed=userItems().concat(wheelItems(),wins);
  // 0) Innenraum hinter den Scheiben (Sitze, Lenkrad, Spiegelungen) weglassen
  const gm0=$('cleanWin').checked?glassMask():null;
  if(gm0){const gm=erodeMask(gm0,Math.max(3,lwv*1.6));
    list=list.filter(c=>{if(c.user)return true;let k=0;for(const q of c.sm)if(mAt(gm,q))k++;return k/c.sm.length<0.5;});
    list=list.flatMap(c=>c.user?[c]:cutCovered(c,gm,minRun));}
  // 1) was am Umriss / an den Rädern entlangläuft, ist doppelt
  const om=strokeMask(outl.concat(fixed.filter(c=>c.wheel!==undefined||c.window)),lwv*P.olW);
  let cand=[];for(const c of list){if(c.user){cand.push(c);continue;}cand.push(...cutCovered(c,om,minRun));}
  // 2) parallele Doppellinien: stärkere Linie gewinnt, von der schwächeren bleibt nur, was frei liegt
  // kleine geschlossene Formen (Griffe, Tankdeckel, Blinker) zuerst – sie sind fast immer echte Details
  const isDet=c=>c.closed&&c.len<carLen*0.35&&c.len>carLen*0.02;
  cand.sort((a,b)=>(b.user-a.user)||(isDet(b)-isDet(a))||(b.score-a.score));
  const occ=new Uint8Array(W*H),rr=lwv*P.parW/2,disk=[];for(let dy=-Math.ceil(rr);dy<=Math.ceil(rr);dy++)for(let dx=-Math.ceil(rr);dx<=Math.ceil(rr);dx++)if(dx*dx+dy*dy<=rr*rr)disk.push(dy*W+dx);
  const mark=pts=>{for(const q of pts){const x=Math.round(q[0]),y=Math.round(q[1]);if(x<rr+1||y<rr+1||x>=W-rr-1||y>=H-rr-1)continue;const i=y*W+x;for(const o of disk)occ[i+o]=1;}};
  const kept=[];const maxN=P.maxN[artLevel]||40;let nAuto=0;
  for(const c of cand){
    if(c.user){kept.push(c);mark(c.sm||c.p);continue;}
    if(nAuto>=maxN)break;
    const pieces=cutCovered(c,occ,minRun);
    for(const q of pieces){kept.push(q);mark(q.sm);nAuto++;}
  }
  // 3) kleine runde Formen → exakte Kreise (Tankdeckel, Embleme); fast geschlossene Bögen werden zum Kreis ergänzt
  for(const c of kept){if(c.closed||c.user||c.sm.length<20)continue;const f=fitCircle(c.sm);
    if(!f||f.r>carLen*0.05||f.r<carLen*0.008||f.err>Math.max(2,f.r*0.15))continue;
    const ang=c.sm.map(q=>Math.atan2(q[1]-f.y,q[0]-f.x)).sort((a,b)=>a-b);let gap=ang[0]+2*Math.PI-ang[ang.length-1];for(let i=1;i<ang.length;i++)gap=Math.max(gap,ang[i]-ang[i-1]);
    if(gap<Math.PI*0.75){c.closed=true;}}
  for(const c of kept){if(!c.closed||c.user)continue;const f=fitCircle(c.sm);if(f&&f.r<carLen*0.08&&f.err<Math.max(2,f.r*P.circ)){
      const cub=arcCubics(f.x,f.y,f.r,0,2*Math.PI);c.cub=cub;c.sm=flatten(cub,12);c.p=c.sm;c.circle=true;}}
  let out=fixed.concat(outl,kept);
  if(window.__DBG)console.log('artTail cand',cand.length,'kept',kept.length);
  if($('cleanWin').checked)out=windowCleanup(out);
  // 4) Kurven
  if(window.__DBG)console.log('afterWin',out.length);
  for(const c of out)if(!c.cub&&c.sm)c.cub=fitPath(c.sm,c.closed,eps);
  out=out.concat(groundItem(out));
  // 5) Keine freien Linienenden: jedes Ende wird verlängert oder angebunden – sonst fliegt die Linie raus
  if(window.__DBG)console.log('pre-tie free',freeEnds(out));
  if($('connectAll').checked)out=tieEnds(out,carLen,lwv,eps);
  if(window.__DBG)console.log('post-tie free',freeEnds(out));
  for(const c of out)delete c.sm;
  return out;
}
function run(){
  if(!img)return;
  const t0=performance.now();
  const N=W*H,auto=$('autoOn').checked;
  // Maßstab: alles relativ zur Autogröße
  const mask0=currentMask();
  let box=null;
  if(mask0)box=maskBox(mask0);
  else if(poly.length>=3){let a=1,b=0,c=1,d=0;for(const p of poly){a=Math.min(a,p.x);b=Math.max(b,p.x);c=Math.min(c,p.y);d=Math.max(d,p.y);}box={x0:a*W,x1:b*W,y0:c*H,y1:d*H};}
  carBoxPx=box;SC=Math.min(3,Math.max(0.25,(box?box.x1-box.x0:W*0.8)/2000));
  computeGrad();
  const hi=+$('hi').value,lo=hi*(+$('lo').value)/100;
  const ad=maskFrom(addC,90),er=maskFrom(eraseC,0);
  let polyRegion=null;
  if(poly.length>=3){const pc=document.createElement('canvas');pc.width=W;pc.height=H;const px=pc.getContext('2d');
    px.beginPath();poly.forEach((p,i)=>i?px.lineTo(p.x*W,p.y*H):px.moveTo(p.x*W,p.y*H));px.closePath();px.fill();polyRegion=maskFrom(pc,127);}
  // Räder (vor dem Schatten-Trimmen)
  if(!wheelsManual){const wk=gradKey+'|'+hi+'|'+lo+'|'+JSON.stringify(poly)+'|'+maskKey+'|'+(teedE?teedRectKey:'')+'|'+artKey+'|'+(carParts?carParts.length:0);
    if(wk!==wheelKey){wheelKey=wk;let ew=hysteresis(hi*0.8,lo);
      if(mask0){const f=new Float32Array(N);for(let i=0;i<N;i++)f[i]=mask0[i];const b=boxBlur(f,Math.round(6*SC));for(let i=0;i<N;i++)if(b[i]<=0)ew[i]=0;}
      else if(polyRegion)for(let i=0;i<N;i++)ew[i]&=polyRegion[i];
      wheels=wheelsFromParts();
      if(wheels.length<2)wheels=detectWheels(ew,carBox(ew));
      if(wheels.length<2&&lineE&&teedE!==lineE){ // zweiter Versuch mit dem Linienbild des KI-Zeichners
        const k1=teedE,k2=gdx,k3=gdy,k4=magN,nn=lineNormals(lineE),e2=new Uint8Array(N);
        for(let i=0;i<N;i++)if(lineE[i]>30&&ew.length&&(!mask0||true))e2[i]=1;
        if(mask0){const f=new Float32Array(N);for(let i=0;i<N;i++)f[i]=mask0[i];const b=boxBlur(f,Math.round(6*SC));for(let i=0;i<N;i++)if(b[i]<=0)e2[i]=0;}
        teedE=lineE;gdx=nn.gx;gdy=nn.gy;magN=lineE;let w2=[];try{w2=detectWheels(e2,carBox(e2));}finally{teedE=k1;gdx=k2;gdy=k3;magN=k4;}
        if(w2.length>wheels.length)wheels=w2;}
      if(wheels.length<2&&mask0){const w3=wheelsFromFeet(mask0);if(w3.length===2)wheels=w3;}}}
  const mask=mask0?trimShadow(mask0):null;
  // Bereich für Innenlinien
  let region=polyRegion;
  const useOutline=!!mask&&$('outlineOn').checked;
  if(mask){
    if(useOutline)region=erodeMask(mask,lw()*1.2+2*SC);
    else{const f=new Float32Array(N);for(let i=0;i<N;i++)f[i]=mask[i];const b=boxBlur(f,Math.round(4*SC));region=new Uint8Array(N);for(let i=0;i<N;i++)region[i]=b[i]>0?1:0;}
  }
  const wheelCut=(arr)=>{if(wheelMode==='orig')return;for(const w of wheels){const cx=w.x*W,cy=w.y*H,r=w.r*W+Math.max(4*SC,lw());
      for(let y=Math.max(0,Math.floor(cy-r));y<=Math.min(H-1,Math.ceil(cy+r));y++)for(let x=Math.max(0,Math.floor(cx-r));x<=Math.min(W-1,Math.ceil(cx+r));x++)
        if((x-cx)**2+(y-cy)**2<=r*r)arr[y*W+x]=0;}};
  const minLen=+$('minLen').value*SC;
  const prep=(arr)=>{for(let i=0;i<N;i++)if(er[i])arr[i]=0;wheelCut(arr);
    if(minLen>0){const {lab,sizes}=label(arr);for(let i=0;i<N;i++)if(arr[i]&&sizes[lab[i]]<minLen)arr[i]=0;}};
  const useArt=auto&&!!lineE&&$('artOn').checked;
  const dbgSnap=(tag,L)=>{if(!window.__DBG)return;(window.__dbgLog=window.__dbgLog||[]).push([tag,L.map(c=>{const P=c.sm||c.p||[];let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(const q of P){x0=Math.min(x0,q[0]);x1=Math.max(x1,q[0]);y0=Math.min(y0,q[1]);y1=Math.max(y1,q[1]);}
    const b=carBoxPx;return {s:Math.round(c.score),len:Math.round(c.len||0),cl:!!c.closed,pid:c.pid,ol:!!c.outline,bx:b?[(x0-b.x0)/(b.x1-b.x0),(x1-b.x0)/(b.x1-b.x0),(y0-b.y0)/(b.y1-b.y0),(y1-b.y0)/(b.y1-b.y0)].map(v=>+v.toFixed(2)):null};})]);};
  let list=[],outl=[];
  const carLen=(carBoxPx?carBoxPx.x1-carBoxPx.x0:W*0.8),eps=Math.max(0.3,+$('straight').value*SC),weak=+$('weak').value*SC;
  if(useArt){
    const P=Object.assign({hi:40,lo:14,sig:1,minFrac:0.025,loopFrac:0.02,gap:1,fairT:0.5,fairS:1.1,keep:1},window.ARTP||{});
    const rid=ridgeNMS(lineE,Math.max(0.8,P.sig*SC/0.8));
    let e=hystOn(rid,P.hi,P.lo);
    if(region)for(let i=0;i<N;i++)e[i]&=region[i];
    prep(e);for(let i=0;i<N;i++)if(ad[i])e[i]=1;
    thin(e);
    // kleine geschlossene Flächen im Linienbild = Griffe, Tankdeckel, Blinker, Embleme
    let faces=[];if($('detailLoops').checked){const S2=e.slice();faces=faceLoops(S2,lineE,P.hi*0.9,carLen);}
    let cs=chains(e);
    for(const c of cs){let s2=0,u=0;for(const i of c.ix){s2+=lineE[i];u+=ad[i];}c.len=c.ix.length;c.str=Math.min(2,s2/c.len/P.hi);c.user=u/c.len>0.5;}
    for(const c of cs){if(c.closed||c.p.length<14)continue;const a2=c.p[0],b2=c.p[c.p.length-1];if(Math.abs(a2[0]-b2[0])<=2&&Math.abs(a2[1]-b2[1])<=2){c.closed=true;c.p=c.p.slice(0,-1);}}
    const spur=+$('spur').value*SC;
    if(spur>0)cs=cs.filter(c=>c.user||!((c.ja!==c.jb)&&c.len<spur));
    cs=mergeChains(cs,+$('gap').value*SC*P.gap);
    if(window.__DBG)window.__artChains=cs;
    const it=+$('curve').value;
    for(const c of cs){
      const minL=c.closed?carLen*P.loopFrac:carLen*P.minFrac;
      if(!c.user&&c.len<minL)continue;
      const sm=c.user?gsmooth(c.p,it*0.5*SC,c.closed):tubeFair(c.p,c.closed,Math.max(1.2,P.fairT*lw()),it*P.fairS*SC);
      if(sm.length<2)continue;
      list.push({sm,p:rdp(sm,0.6),closed:c.closed&&sm.length>3,len:c.len,str:c.str,score:c.len*c.str,user:c.user,wg:0,dens:0,detailLoop:c.closed});
    }
    for(const f of faces){const sm=tubeFair(f.pts,true,Math.max(1,0.5*lw()),Math.max(2,it*0.4*SC));list.push({sm,p:rdp(sm,0.6),closed:true,len:f.len,str:f.str,score:1e6+f.len,user:false,wg:0,dens:0,detailLoop:true,face:true});}
    outl=useOutline?outlineItems(mask,er):[];
    dbgSnap('art',list);
  }else{
  const useT=!!teedE&&$('teedOn').checked,thT=Math.min(96,hi*1.7),loT=thT*Math.max(0.2,+$('lo').value/100*1.4);
  let e;
  if(!auto)e=new Uint8Array(N);
  else if(useT)e=hystOn(teedE,thT,loT);
  else{e=hysteresis(hi,lo);if(support)for(let i=0;i<N;i++)e[i]&=support[i];}
  if(region)for(let i=0;i<N;i++)e[i]&=region[i];
  if(auto)prep(e);
  for(let i=0;i<N;i++)if(ad[i])e[i]=1;
  thin(e);
  let cs=chains(e);
  for(const c of cs){let s=0,u=0;if(useT){for(const i of c.ix){s+=teedE[i]||thT;u+=ad[i];}c.len=c.ix.length;c.str=Math.min(3,Math.max(0.4,s/c.len/thT));}
    else{for(const i of c.ix){s+=grad[i]||hi;u+=ad[i];}c.len=c.ix.length;c.str=Math.min(3,Math.max(0.4,s/c.len/hi));}c.user=u/c.len>0.5;}
  if(auto&&valley&&$('valleyOn').checked){
    let v=hystOn(valley,hi*1.1,hi*0.45);if(region)for(let i=0;i<N;i++)v[i]&=region[i];prep(v);thin(v);
    const vc=chains(v);for(const c of vc){let s=0;for(const i of c.ix)s+=valley[i];c.len=c.ix.length;c.str=Math.min(3.5,Math.max(0.4,1.25*s/c.len/hi));c.user=false;c.valley=true;}
    cs=cs.concat(vc);
  }
  // Schleifen, die an einer Kreuzung hängen (z.B. Türgriff an der Fuge), als geschlossene Form behandeln
  for(const c of cs){if(c.closed||c.p.length<14)continue;const a=c.p[0],b=c.p[c.p.length-1];if(Math.abs(a[0]-b[0])<=2&&Math.abs(a[1]-b[1])<=2){c.closed=true;c.p=c.p.slice(0,-1);}}
  let faces=[];
  if(auto&&useT&&$('detailLoops').checked){const S2=e.slice();for(let i=0;i<N;i++)if(!region||!region[i])S2[i]=0;faces=faceLoops(S2,teedE,thT,(carBoxPx?carBoxPx.x1-carBoxPx.x0:W*0.8));}
  const spur=+$('spur').value*SC;
  if(spur>0)cs=cs.filter(c=>c.user||!((c.ja!==c.jb)&&c.len<spur));
  cs=mergeChains(cs,+$('gap').value*SC);
  const it=+$('curve').value;
  // Fensterbereich grob: obere ~42 % zwischen Dach und Radmitte
  let ghY=-1;if(carBoxPx&&wheels.length===2){const wy=Math.min(wheels[0].y,wheels[1].y)*H;ghY=carBoxPx.y0+(wy-carBoxPx.y0)*0.55;}
  for(const c of cs){
    const sm0=gsmooth(c.p,it*0.5*SC,c.closed);if(sm0.length<2)continue;
    const st=Math.max(2,Math.round(5*SC)),wg=wiggle2(sm0,st)*SC;
    const wgE=c.closed?wg*0.5:wg; // geschlossene Formen (Griffe, Tankdeckel, Lichter) haben naturgemäß mehr Krümmungswechsel
    let score=c.len*c.str*c.str/(1+WIGK*wgE*wgE);
    if(!c.closed&&!c.ja&&!c.jb&&c.len<carLen*0.07)score*=0.55;
    if(ghY>0&&!c.user&&!c.ja&&!c.jb&&c.len<carLen*0.1){let my=-1;for(const q of c.p)if(q[1]>my)my=q[1];if(my<ghY)score*=0.5;} // kurze freie Linien im Fensterbereich (Innenraum)
    if(!c.user&&weak>0&&score<weak*0.5)continue;
    const sm=(FAIR&&!c.user)?tubeFair(c.p,c.closed,Math.max(1.2,FAIR_T*lw()),it*FAIR_S*SC):sm0;
    list.push({sm,p:rdp(sm,0.6),closed:c.closed&&sm.length>3,len:c.len,str:c.str,score,user:c.user,wg,dens:0});
  }
  for(const f of faces){const sm=tubeFair(f.pts,true,Math.max(1,0.6*lw()),Math.max(2,+$('curve').value*0.5*SC));list.push({sm,p:rdp(sm,0.6),closed:true,len:f.len,str:f.str,score:weak*1.3+f.len*f.str,user:false,wg:0,dens:0,detailLoop:true,face:true});}
  outl=useOutline?outlineItems(mask,er):[];
  densityPenalty(list,outl,+$('calmD').value);
  // Kleine geschlossene Formen mit klarer Kante sind fast immer echte Details (Türgriffe, Tankdeckel, Blinker, Spiegel)
  for(const c of list){if(c.user||!c.closed)continue;const L=c.len;if(L<carLen*0.035||L>carLen*0.6||c.str<1.15)continue;
    if((c.dens||0)>140)continue;c.score=Math.max(c.score,weak*1.25);c.detailLoop=true;}
  if(+$('struct2').value>0)structureBonus(list,outl.concat(wheelItems()),weak,+$('struct2').value);
  dbgSnap('scored',list);
  list=list.filter(c=>c.user||weak<=0||c.score>=weak);

  }
  let r,L,labOf;
  if(useArt){
    list=artTail(list,outl,eps);
    r=rasterize(list);L=label(r);
    if(window.__DBG)console.log('pre-connect',list.length,'parts',L.n,'free',freeEnds(list));
    if($('connectAll').checked&&L.n>1){const o=connectParts(list);list=o.list;r=o.r;L=o.L;}
    if($('connectAll').checked&&freeEnds(list)>0){list=tieEnds(list,carBoxPx?carBoxPx.x1-carBoxPx.x0:W*0.8,lw(),eps);for(const c of list)delete c.sm;r=rasterize(list);L=label(r);if(L.n>1){const o=connectParts(list);list=o.list;r=o.r;L=o.L;}}
    if(window.__DBG)console.log('post-connect',list.length,'free',freeEnds(list));
    const at=pt=>L.lab[Math.min(H-1,Math.max(0,Math.round(pt[1])))*W+Math.min(W-1,Math.max(0,Math.round(pt[0])))];
    labOf=c=>{const P=c.cub&&c.cub.length?flatten(c.cub,4):c.p;const cnt=new Map();let b=0,bv=0;for(const q of P){const l=at(q);if(!l)continue;const v=(cnt.get(l)||0)+1;cnt.set(l,v);if(v>bv){bv=v;b=l;}}return b;};
  }else{
  const fixed=userItems().concat(wheelItems(),outl);
  list=dedup(fixed.concat(list),+$('dup').value*SC);
  dbgSnap('dedup',list);
  const maxL=+$('maxLines').value;
  if(maxL<200){const seen=new Set();list=list.filter(c=>{if(c.user||c.protect)return true;if(seen.has(c.pid))return true;if(seen.size>=maxL)return false;seen.add(c.pid);return true;});}
  dbgSnap('maxl',list);
  if($('cleanWin').checked)list=windowCleanup(list);
  for(const c of list)if(!c.cub&&c.sm){c.cub=fitPath(c.sm,c.closed,eps);delete c.sm;}
  list=list.concat(groundItem(list));
  list=dockLines(list,+$('dock').value*SC);
  dbgSnap('dock',list);
  r=rasterize(list);
  L=label(r);
  const at=pt=>L.lab[Math.min(H-1,Math.max(0,Math.round(pt[1])))*W+Math.min(W-1,Math.max(0,Math.round(pt[0])))];
  const minArea=weak*lw()*0.4;
  labOf=c=>{const P=c.cub&&c.cub.length?flatten(c.cub,4):c.p;const cnt=new Map();let b=0,bv=0;for(const q of P){const l=at(q);if(!l)continue;const v=(cnt.get(l)||0)+1;cnt.set(l,v);if(v>bv){bv=v;b=l;}}return b;};
  if(minArea>0&&L.n>1){const before=list.length;list=list.filter(c=>c.user||c.protect||(c.dockExt&&c.parent)||L.sizes[labOf(c)]>=minArea);
    if(list.length!==before){list=list.filter(c=>!c.dockExt||list.includes(c.parent));r=rasterize(list);L=label(r);}}
  dbgSnap('minArea',list);
  if($('connectAll').checked&&L.n>1){const o=connectParts(list);list=o.list;r=o.r;L=o.L;}
  dbgSnap('connect',list);
  }
  parts=L.n;
  if($('largest').checked&&L.n>1){
    let best=1;for(let k=2;k<=L.n;k++)if(L.sizes[k]>L.sizes[best])best=k;
    list=list.filter(c=>c.uid||c.ground||labOf(c)===best);
    r=rasterize(list);L=label(r);parts=L.n;
  }
  vec=list;autoItems=list.filter(c=>!c.uid&&c.wheel===undefined&&!c.ground&&!c.bridge);vecPath=new Path2D(pathD(list,0,0,1));
  buildDrawing(list);r=rasterDrawing();parts=label(r).n;fin=r;
  let x0=W,y0=H,x1=-1,y1=-1;
  for(let y=0;y<H;y++){const o=y*W;for(let x=0;x<W;x++)if(r[o+x]){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}
  bbox=x1<0?null:{x0,y0,x1,y1};
  lastMs=performance.now()-t0;
  makePlan();render();status();aiStatus();devInfo();
}
let lastMs=0;
function fastCompose(){vec=autoItems.concat(userItems(),wheelItems());vec=vec.concat(groundItem(vec));vecPath=new Path2D(pathD(vec,0,0,1));buildDrawing(vec);render();}

/* ================= Anzeige ================= */
function hex2rgba(h,a){const n=parseInt(h.slice(1),16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`;}
function render(){
  if(!img)return;
  if(!fin){vctx.clearRect(0,0,W,H);vctx.drawImage(photoC,0,0,W,H);return;}
  const transp=$('transp').checked;
  applyView();
  stage.classList.toggle('checker',mode==='result'&&transp);
  stage.style.background=(mode==='result'&&!transp)?$('bgCol').value:'';
  vctx.clearRect(0,0,W,H);
  if(mode==='result'){
    if(!transp){vctx.fillStyle=$('bgCol').value;vctx.fillRect(0,0,W,H);}
    if($('underlay').checked||pipeBusy){vctx.save();vctx.globalAlpha=pipeBusy?0.8:0.38;vctx.drawImage(photoC,0,0,W,H);vctx.restore();}
    paintDrawing(vctx,$('lineCol').value);
  }else{
    vctx.drawImage(photoC,0,0,W,H);
    if(poly.length>=3&&!draft){vctx.save();vctx.fillStyle='rgba(10,12,16,.5)';vctx.beginPath();vctx.rect(0,0,W,H);
      poly.forEach((p,i)=>i?vctx.lineTo(p.x*W,p.y*H):vctx.moveTo(p.x*W,p.y*H));vctx.closePath();vctx.fill('evenodd');vctx.restore();}
    paintDrawing(vctx,'rgba(60,110,235,.9)');
  }
  drawOver();
}
function drawAnchor(a,px,big,ghost,hot,col){octx.save();octx.fillStyle=ghost?'rgba(226,72,40,.45)':(col||'#e24828');octx.strokeStyle='#fff';octx.lineWidth=1.5*px;const r=(hot?7.5:big?6:4.5)*px;octx.beginPath();
  if(a.c)octx.rect(a.x-r,a.y-r,2*r,2*r);else octx.arc(a.x,a.y,r,0,7);octx.fill();octx.stroke();octx.restore();}
function drawOver(){
  octx.clearRect(0,0,W,H);if(!img)return;
  const px=pxs();
  if(mode==='photo'){
    const pts=draft||poly;if(!pts.length)return;
    octx.lineWidth=2*px;octx.strokeStyle='#ffd23f';octx.fillStyle='#ffd23f';
    octx.beginPath();pts.forEach((p,i)=>i?octx.lineTo(p.x*W,p.y*H):octx.moveTo(p.x*W,p.y*H));
    if(draft&&hover)octx.lineTo(hover.x,hover.y);else if(!draft)octx.closePath();
    octx.stroke();
    pts.forEach((p,i)=>{octx.beginPath();octx.arc(p.x*W,p.y*H,(i===0&&draft?6:3.5)*px,0,7);octx.fill();});
    return;
  }
  if(plan&&plan.n>1&&bbox){const f=frame();octx.save();octx.setLineDash([10*px,7*px]);octx.lineWidth=2*px;octx.strokeStyle='rgba(226,72,40,.85)';
    for(const c of plan.cuts){let X=f.x0+c;if($('mirror').checked&&mode==='result'){} octx.beginPath();octx.moveTo(X,f.y0);octx.lineTo(X,f.y0+f.h);octx.stroke();}octx.restore();}
  if(tool==='trace'){
    if(trace){const A=trace.a.concat(hover&&!stroking?[snapPt(hover,shiftDown)]:[]);
      if(A.length>1){octx.save();octx.lineCap='round';octx.lineJoin='round';octx.lineWidth=Math.max(lw(),3*px);octx.strokeStyle='rgba(226,72,40,.9)';
        octx.stroke(new Path2D(pathD([{cub:crSegments(A,false),closed:false}],0,0,1)));octx.restore();}
      trace.a.forEach((a,i)=>drawAnchor(a,px,i===0));}
    if(hover)drawAnchor(snapPt(hover,shiftDown),px,false,true);
  }
  if(tool==='edit'){
    for(const u of userLines)u.a.forEach(q=>drawAnchor({x:q.x*W,y:q.y*H,c:q.c},px,false,false,editHover&&editHover.a===q));
    if(wheelMode!=='orig')wheels.forEach(w=>{const cx=w.x*W,cy=w.y*H,r=w.r*W;
      octx.save();octx.setLineDash([6*px,5*px]);octx.lineWidth=1.5*px;octx.strokeStyle='#2b59c3';octx.beginPath();octx.arc(cx,cy,r,0,7);octx.stroke();octx.restore();
      drawAnchor({x:cx,y:cy},px,true,false,editHover&&editHover.w===w&&editHover.k==='c','#2b59c3');
      drawAnchor({x:cx+r,y:cy,c:true},px,false,false,editHover&&editHover.w===w&&editHover.k==='r','#2b59c3');});
  }
  if(tool==='del'&&delHover){octx.save();octx.lineCap='round';octx.lineJoin='round';octx.lineWidth=lw()+6*px;octx.strokeStyle='rgba(226,72,40,.85)';
    octx.stroke(new Path2D(pathD([delHover],0,0,1)));octx.restore();}
  if(stroking&&(tool==='erase'||tool==='pen')){octx.save();octx.globalAlpha=tool==='erase'?0.3:0.9;octx.drawImage(tool==='erase'?eraseC:addC,0,0);octx.restore();}
  if(!hover)return;
  if(tool==='erase'){octx.lineWidth=1.5*px;octx.strokeStyle='#2b59c3';octx.beginPath();octx.arc(hover.x,hover.y,brushR(),0,7);octx.stroke();}
  if(tool==='circle'&&lineStart){octx.lineWidth=lw();octx.strokeStyle='rgba(43,89,195,.8)';octx.beginPath();octx.arc(lineStart.x,lineStart.y,Math.hypot(hover.x-lineStart.x,hover.y-lineStart.y),0,7);octx.stroke();drawAnchor(lineStart,px,false,false,false,'#2b59c3');}
  if(tool==='line'&&lineStart){octx.lineWidth=lw();octx.lineCap='round';octx.strokeStyle='rgba(43,89,195,.8)';octx.beginPath();octx.moveTo(lineStart.x,lineStart.y);octx.lineTo(hover.x,hover.y);octx.stroke();}
}
function brushR(){return +$('brush').value/2*pxs();}
function marg(){return Math.ceil(lw()/2)+6;}
function status(){
  const s=$('status');if(!bbox){s.innerHTML='<span class="warn">Keine Linien – Empfindlichkeit senken oder nachzeichnen</span>';return;}
  const cw=bbox.x1-bbox.x0+1+2*marg(),mm=+$('mm').value||600,mmpx=mm/cw;
  const lwm=lw()*mmpx,hmm=(bbox.y1-bbox.y0+1+2*marg())*mmpx;
  const nl=vec.length,wd=wheels.length;
  s.innerHTML=`<span>${Math.round(mm)}×${Math.round(hmm)} mm</span>`+
    `<span>Linie ${lwm.toFixed(1).replace('.',',')} mm${strokeMode!=='uniform'?' / Details '+Math.max(lwm*TIERW.C,Math.min(lwm,+$('minMM').value||0)).toFixed(1).replace('.',',')+' mm':''}</span>`+
    `<span>${nl} Linien</span>`+
    `<span class="${parts>1?'warn':'ok'}">${parts} ${parts===1?'Teil':'Einzelteile'}</span>`+
    `<span class="${wd===2?'ok':''}">${wd} ${wd===1?'Rad':'Räder'}</span>`;
  $('wheelInfo').innerHTML=wd?`${wd} ${wd===1?'Rad':'Räder'} erkannt${wheelsManual?' (manuell angepasst)':''}. Mit <b>Bearbeiten (V)</b> Mitte und Größe ziehen.`:'Keine Räder erkannt. Umriss setzen oder mit <b>Kreis (K)</b> selbst zeichnen.';
}
function setTip(t){$('tip').innerHTML=t;}

/* ================= Zoom & Pan ================= */
function applyView(){
  const flip=$('mirror').checked&&mode==='result';
  const sw=stage.clientWidth,sh=inner.offsetHeight||1;
  zv.z=Math.min(12,Math.max(1,zv.z));
  zv.tx=Math.min(0,Math.max(sw-sw*zv.z,zv.tx));zv.ty=Math.min(0,Math.max(sh-sh*zv.z,zv.ty));
  inner.style.transform=`translate(${zv.tx}px,${zv.ty}px) scale(${zv.z})`+(flip?' translateX(100%) scaleX(-1)':'');
  $('zoomO').textContent=Math.round(zv.z*100)+' %';
}
function fitView(){zv={z:1,tx:0,ty:0};applyView();drawOver();}
function zoomAt(f,sx,sy){const z2=Math.min(12,Math.max(1,zv.z*f));const ux=(sx-zv.tx)/zv.z,uy=(sy-zv.ty)/zv.z;zv.z=z2;zv.tx=sx-ux*z2;zv.ty=sy-uy*z2;applyView();drawOver();}
stage.addEventListener('wheel',ev=>{if(!img)return;ev.preventDefault();const r=stage.getBoundingClientRect();zoomAt(Math.exp(-ev.deltaY*0.0015),ev.clientX-r.left,ev.clientY-r.top);},{passive:false});
$('zoomIn').onclick=()=>zoomAt(1.4,stage.clientWidth/2,stage.clientHeight/2);
$('zoomOut').onclick=()=>zoomAt(1/1.4,stage.clientWidth/2,stage.clientHeight/2);
$('zoomFit').onclick=()=>{zv={z:1,tx:0,ty:0};applyView();drawOver();};
stage.addEventListener('pointerdown',ev=>{
  if(!img)return;
  if(ev.button===1||spaceDown||(tool==='hand'&&!draft&&mode==='result')||(tool==='hand'&&mode==='photo'&&!draft)){
    ev.stopPropagation();ev.preventDefault();panning={x:ev.clientX,y:ev.clientY,tx:zv.tx,ty:zv.ty};stage.setPointerCapture(ev.pointerId);stage.style.cursor='grabbing';}
},true);
stage.addEventListener('pointermove',ev=>{if(!panning)return;zv.tx=panning.tx+ev.clientX-panning.x;zv.ty=panning.ty+ev.clientY-panning.y;applyView();});
stage.addEventListener('pointerup',()=>{if(panning){panning=null;stage.style.cursor='';}});
window.addEventListener('resize',()=>{applyView();drawOver();});

/* ================= Werkzeuge ================= */
function snapshot(){
  undoStack.push({e:eraseC.getContext('2d').getImageData(0,0,W,H),a:addC.getContext('2d').getImageData(0,0,W,H),p:JSON.stringify(poly),u:JSON.stringify(userLines),w:JSON.stringify(wheels),wm:wheelsManual});
  if(undoStack.length>40)undoStack.shift();
}
function undo(){
  if(trace){trace.a.pop();if(!trace.a.length)trace=null;drawOver();return;}
  const s=undoStack.pop();if(!s)return;
  if(s.e.width===W){eraseC.getContext('2d').putImageData(s.e,0,0);addC.getContext('2d').putImageData(s.a,0,0);}
  poly=JSON.parse(s.p);userLines=JSON.parse(s.u);wheels=JSON.parse(s.w);wheelsManual=s.wm;if(!wheelsManual)wheelKey='__';run();
}
function pos(ev){const r=over.getBoundingClientRect();let x=(ev.clientX-r.left)/r.width*W;const y=(ev.clientY-r.top)/r.height*H;
  if(mode==='result'&&$('mirror').checked)x=W-x;return {x,y};}
let queued=false;function schedule(){if(queued)return;queued=true;$('busy').hidden=false;requestAnimationFrame(()=>setTimeout(()=>{queued=false;$('busy').hidden=true;if(pipeBusy)return;run();},0));}
function stroke(ctxC,a,b,w,erase){
  const c=ctxC.getContext('2d');c.save();c.lineCap='round';c.lineJoin='round';c.lineWidth=w;
  c.globalCompositeOperation=erase?'destination-out':'source-over';c.strokeStyle='#000';
  c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x+0.01,b.y);c.stroke();c.restore();
}
function circleTo(c,r){for(const [cv,w,er] of [[addC,2.5,false],[eraseC,4,true]]){const x=cv.getContext('2d');x.save();x.lineWidth=w;x.globalCompositeOperation=er?'destination-out':'source-over';x.strokeStyle='#000';x.beginPath();x.arc(c.x,c.y,r,0,Math.PI*2);x.stroke();x.restore();}}
function paint(a,b){
  if(tool==='erase'){stroke(eraseC,a,b,brushR()*2,false);stroke(addC,a,b,brushR()*2,true);}
  else if(tool==='pen'){stroke(addC,a,b,2.5,false);stroke(eraseC,a,b,4,true);}
}
function snapPt(p,noSnap){
  if(noSnap||!$('snap').checked||!grad)return {x:p.x,y:p.y};
  const px=pxs(),r=Math.max(2,Math.round(9*px)),th=+$('hi').value*0.35;
  const cx=Math.round(p.x),cy=Math.round(p.y);let best=null,bs=0;
  for(let dy=-r;dy<=r;dy++){const y=cy+dy;if(y<1||y>=H-1)continue;for(let dx=-r;dx<=r;dx++){const x=cx+dx;if(x<1||x>=W-1)continue;
    const d=Math.hypot(dx,dy);if(d>r)continue;const g=grad[y*W+x];if(g<th)continue;const sc=Math.min(g,150)*(1-d/(r*1.6));if(sc>bs){bs=sc;best={x,y};}}}
  return best||{x:p.x,y:p.y};
}
function finishTrace(close){
  if(!trace)return;
  const A=[];for(const a of trace.a){const l=A[A.length-1];if(!l||Math.hypot(a.x-l.x,a.y-l.y)>3)A.push(a);}
  const closed=!!close&&A.length>=3;trace=null;
  if(A.length<2){drawOver();return;}
  snapshot();userLines.push({id:uidSeq++,closed,a:A.map(q=>({x:q.x/W,y:q.y/H,c:!!q.c}))});run();
  setTip('Linie gespeichert. Nächste Linie einfach anfangen. Mit <b>V</b> nachträglich Punkte verschieben.');
}
function hitHandle(p){
  const lim=10*pxs();let best=null,bd=lim;
  for(const u of userLines)u.a.forEach((q,i)=>{const d=Math.hypot(q.x*W-p.x,q.y*H-p.y);if(d<bd){bd=d;best={u,i,a:q};}});
  if(wheelMode!=='orig')for(const w of wheels){
    const dc=Math.hypot(w.x*W-p.x,w.y*H-p.y);if(dc<bd){bd=dc;best={w,k:'c'};}
    const dr=Math.hypot(w.x*W+w.r*W-p.x,w.y*H-p.y);if(dr<bd){bd=dr;best={w,k:'r'};}}
  return best;
}
function hitUserSeg(p){
  let best=null,bd=Math.max(lw()/2+5*pxs(),10*pxs());
  for(const u of userLines){const cub=crSegments(u.a.map(q=>({x:q.x*W,y:q.y*H,c:q.c})),u.closed);
    cub.forEach((b,si)=>{for(let k=0;k<=24;k++){const q=bz(b,k/24),d=Math.hypot(q[0]-p.x,q[1]-p.y);if(d<bd){bd=d;best={u,si,pt:q};}}});}
  return best;
}
function distSeg(q,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],L=dx*dx+dy*dy;let t=L?((q.x-a[0])*dx+(q.y-a[1])*dy)/L:0;t=Math.max(0,Math.min(1,t));return Math.hypot(q.x-a[0]-t*dx,q.y-a[1]-t*dy);}
function pickLine(q){
  const px=pxs(),lim=Math.max(lw()/2+4*px,12*px);let best=null,bd=lim;
  for(const c of vec){const p=c.p,n=p.length,segs=c.closed?n:n-1;
    for(let i=0;i<segs;i++){const d=distSeg(q,p[i],p[(i+1)%n]);if(d<bd){bd=d;best=c;}}}
  return best;
}
function deleteLine(c){
  snapshot();
  if(c.uid){userLines=userLines.filter(u=>u.id!==c.uid);}
  else if(c.wheel!==undefined){wheels.splice(c.wheel,1);wheelsManual=true;}
  else if(c.ground){$('ground').checked=false;}
  else if(c.dockExt){const par=c.parent;c=par;const path=new Path2D(pathD([c],0,0,1));const x=eraseC.getContext('2d');x.save();x.lineCap='round';x.lineJoin='round';x.lineWidth=lw()+10;x.strokeStyle='#000';x.stroke(path);x.restore();}
  else{const path=new Path2D(pathD([c],0,0,1));
    const x=eraseC.getContext('2d');x.save();x.lineCap='round';x.lineJoin='round';x.lineWidth=lw()+10;x.strokeStyle='#000';x.stroke(path);x.restore();
    const y=addC.getContext('2d');y.save();y.globalCompositeOperation='destination-out';y.lineCap='round';y.lineWidth=lw()+10;y.stroke(path);y.restore();}
  delHover=null;run();
}
over.addEventListener('pointerdown',ev=>{
  if(!img||ev.button===2)return;const p=pos(ev);
  if(mode==='photo'){
    if(!draft)return;
    if(draft.length>=3&&Math.hypot(p.x-draft[0].x*W,p.y-draft[0].y*H)<12*pxs()){closePoly();return;}
    draft.push({x:p.x/W,y:p.y/H});drawOver();return;
  }
  if(tool==='hand')return;
  if(tool==='trace'){
    shiftDown=ev.shiftKey;const q=snapPt(p,ev.shiftKey);q.c=ev.altKey;
    if(!trace){trace={a:[q]};drawOver();return;}
    const A=trace.a,f=A[0];
    if(A.length>=3&&Math.hypot(p.x-f.x,p.y-f.y)<10*pxs()){finishTrace(true);return;}
    A.push(q);drawOver();return;
  }
  if(tool==='edit'){
    const h=hitHandle(p);
    if(h){
      if(h.u&&ev.altKey){snapshot();h.u.a.splice(h.i,1);if(h.u.a.length<2)userLines=userLines.filter(u=>u!==h.u);editHover=null;run();return;}
      snapshot();editDrag=h;over.setPointerCapture(ev.pointerId);return;}
    const s=hitUserSeg(p);
    if(s){snapshot();const na={x:s.pt[0]/W,y:s.pt[1]/H,c:false};s.u.a.splice(s.si+1,0,na);editDrag={u:s.u,i:s.si+1,a:na};over.setPointerCapture(ev.pointerId);fastCompose();}
    return;
  }
  if(tool==='del'){const c=pickLine(p);if(c)deleteLine(c);return;}
  over.setPointerCapture(ev.pointerId);snapshot();stroking=true;
  if(tool==='line'||tool==='circle'){lineStart=p;hover=p;drawOver();return;}
  lastPt=p;paint(p,p);drawOver();
});
over.addEventListener('pointermove',ev=>{
  if(!img||panning)return;hover=pos(ev);shiftDown=ev.shiftKey;
  if(mode!=='result'){drawOver();return;}
  if(stroking&&(tool==='erase'||tool==='pen')){paint(lastPt,hover);lastPt=hover;}
  if(tool==='edit'){
    if(editDrag){const d=editDrag;
      if(d.a){const q=snapPt(hover,ev.shiftKey);d.a.x=q.x/W;d.a.y=q.y/H;}
      else if(d.k==='c'){d.w.x=hover.x/W;d.w.y=hover.y/H;wheelsManual=true;}
      else if(d.k==='r'){d.w.r=Math.max(5,Math.hypot(hover.x-d.w.x*W,hover.y-d.w.y*H))/W;wheelsManual=true;}
      fastCompose();return;}
    const h=hitHandle(hover);editHover=h?{a:h.a,w:h.w,k:h.k}:null;over.style.cursor=h?'move':hitUserSeg(hover)?'copy':'default';drawOver();return;}
  if(tool==='del')delHover=pickLine(hover);
  drawOver();
});
over.addEventListener('pointerup',ev=>{
  if(editDrag){editDrag=null;run();return;}
  if(!stroking)return;stroking=false;
  if(tool==='erase'||tool==='pen'){run();return;}
  if(tool==='line'&&lineStart){const e=pos(ev);stroke(addC,lineStart,e,2.5,false);stroke(eraseC,lineStart,e,4,true);lineStart=null;run();}
  if(tool==='circle'&&lineStart){const e=pos(ev),rr=Math.hypot(e.x-lineStart.x,e.y-lineStart.y);if(rr>3)circleTo(lineStart,rr);lineStart=null;run();}
});
over.addEventListener('pointerleave',()=>{if(!stroking&&!editDrag){hover=null;delHover=null;drawOver();}});
over.addEventListener('dblclick',ev=>{
  if(draft&&draft.length>=3){closePoly();return;}
  if(tool==='trace'&&trace){finishTrace(false);return;}
  if(tool==='edit'){const h=hitHandle(pos(ev));if(h&&h.a){h.a.c=!h.a.c;run();}}
});
function closePoly(){snapshot();poly=draft;draft=null;setMode('result');wheelKey='';setTip('Bereich gesetzt – Auto wird darin freigestellt und neu gezeichnet …');polyPipeline();}
async function polyPipeline(){
  const g=gen,im=img;pipeBusy=true;render();
  if($('aiOn').checked&&poly.length>=3){
    setProgress(1,'KI stellt das Auto im Bereich frei …');await nextFrame();
    try{
      await ensureOrt();
      const nw=im.naturalWidth,nh=im.naturalHeight;let a=1,b=0,c=1,d=0;
      for(const p of poly){const X=crop.x0+p.x*(crop.x1-crop.x0),Y=crop.y0+p.y*(crop.y1-crop.y0);a=Math.min(a,X);b=Math.max(b,X);c=Math.min(c,Y);d=Math.max(d,Y);}
      const m=0.03*Math.max(b-a,d-c);a=Math.max(0,a-m);b=Math.min(1,b+m);c=Math.max(0,c-m);d=Math.min(1,d+m);
      const p1=await u2(im,a*nw,c*nh,(b-a)*nw,(d-c)*nh);
      if(g!==gen)return;
      const bb=bigBox(p1,320);
      if(bb){const sx=(b-a)/320,sy=(d-c)/320;seg={p:p1,x0:a,y0:c,x1:b,y1:d,bx0:a+bb.x0*sx,bx1:a+(bb.x1+1)*sx,by0:c+bb.y0*sy,by1:c+(bb.y1+1)*sy};maskKey='';cmKey='';}
    }catch(e){}
  }
  await refreshAll();
  if(g===gen)setTip('Bereich gesetzt. <b>Tipp:</b> Mit <b>D</b> störende Linien löschen, mit <b>N</b> fehlende nachzeichnen.');
}
$('polyBtn').onclick=()=>{if(!img)return;
  if(crop.x0>0||crop.y0>0||crop.x1<1||crop.y1<1){crop={x0:0,y0:0,x1:1,y1:1};resetEdits();teedE=null;vec=[];autoItems=[];drawing=[];fin=null;bbox=null;setupRes(true,true);fitView();}
  draft=[];setMode('photo');setTip('Um das Auto klicken (grob reicht, lieber etwas Abstand). Ersten Punkt anklicken, Doppelklick oder <kbd>Enter</kbd> schließt. <kbd>Esc</kbd> bricht ab.');};
$('polyClear').onclick=()=>{if(!img)return;if(poly.length){snapshot();poly=[];draft=null;loadSrc(img.src,false);}};
$('undoBtn').onclick=undo;
$('clearEdits').onclick=()=>{if(!img)return;snapshot();eraseC.getContext('2d').clearRect(0,0,W,H);addC.getContext('2d').clearRect(0,0,W,H);userLines=[];trace=null;wheelsManual=false;wheelKey='';run();};
const TIPS={
  hand:'<b>Ansehen:</b> Ziehen verschiebt, Mausrad zoomt. In jedem Werkzeug: <kbd>Leertaste</kbd> halten + ziehen verschiebt.',
  trace:'<b>Nachzeichnen:</b> Nur dort Punkte setzen, wo die Kurve die Richtung ändert – dazwischen entsteht eine perfekt glatte Kurve. Punkte rasten an Kanten ein. <kbd>Alt</kbd>+Klick = Ecke, <kbd>Shift</kbd> = frei, <kbd>Enter</kbd>/Doppelklick beendet, <kbd>⌫</kbd> letzter Punkt zurück.',
  edit:'<b>Bearbeiten:</b> Punkte ziehen · auf eigene Linie klicken fügt Punkt ein · <kbd>Alt</kbd>+Klick löscht Punkt · Doppelklick = Ecke/Rundung · Räder: blauer Punkt Mitte, Quadrat Größe.',
  del:'<b>Linie löschen:</b> Über eine Linie fahren (wird rot) und klicken. Geht auch für Räder und Bodenlinie.',
  erase:'<b>Radierer:</b> Über Linien malen, beim Loslassen wird neu berechnet.',
  pen:'<b>Freihand:</b> Zeichnen, wird automatisch geglättet.',line:'<b>Gerade:</b> Von Start zu Ende ziehen.',circle:'<b>Kreis:</b> Von der Mitte nach außen ziehen.'};
function setTool(t){
  if(trace&&t!=='trace')finishTrace(false);
  tool=t;delHover=null;editHover=null;
  document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tool===t));
  if((t==='trace')&&!$('underlay').checked){$('underlay').checked=true;}
  over.style.cursor=t==='hand'?'grab':'crosshair';
  if(t!=='hand'&&mode!=='result')setMode('result');else render();
  setTip(TIPS[t]||'');
}
function setMode(m){mode=m;if(m==='result')draft=null;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===m));
  over.style.cursor=m==='photo'?'crosshair':tool==='hand'?'grab':'crosshair';render();}
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setMode(b.dataset.view));
window.addEventListener('keyup',ev=>{if(ev.key==='Shift'){shiftDown=false;drawOver();}if(ev.code==='Space'){spaceDown=false;}});
window.addEventListener('keydown',ev=>{
  const tag=ev.target.tagName;if((tag==='INPUT'&&ev.target.type!=='range'&&ev.target.type!=='checkbox')||tag==='SELECT')return;
  if(ev.key==='Shift'){shiftDown=true;drawOver();}
  if(ev.code==='Space'){spaceDown=true;ev.preventDefault();return;}
  if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='z'){ev.preventDefault();undo();return;}
  if(ev.ctrlKey||ev.metaKey)return;
  const k=ev.key.toLowerCase();
  if(ev.key==='Escape'){if(draft){draft=null;setMode('result');}else if(trace){trace=null;drawOver();}else setTool('hand');}
  else if(ev.key==='Enter'&&draft&&draft.length>=3)closePoly();
  else if(ev.key==='Enter'&&trace)finishTrace(false);
  else if(ev.key==='Backspace'&&trace){ev.preventDefault();undo();}
  else if(ev.altKey)return;
  else if(k==='h')setTool('hand');else if(k==='n')setTool('trace');else if(k==='v')setTool('edit');else if(k==='d')setTool('del');
  else if(k==='r')setTool('erase');else if(k==='s')setTool('pen');else if(k==='g')setTool('line');else if(k==='k')setTool('circle');
  else if(k==='f')$('zoomFit').click();else if(k==='+'||k==='=')$('zoomIn').click();else if(k==='-')$('zoomOut').click();
});

/* ================= Regler ================= */
const fmt={struct2:v=>v==0?'aus':(+v).toFixed(1),calmD:v=>v==0?'aus':(+v).toFixed(1),dock:v=>v==0?'aus':v,res:v=>v+' px',maxLines:v=>v>=200?'alle':v,hi:v=>v,calm:v=>v==0?'aus':v,sigma:v=>(+v).toFixed(1),lo:v=>v+' %',weak:v=>v==0?'aus':v,dup:v=>v==0?'aus':v+' px',
  gap:v=>v==0?'aus':v+' px',spur:v=>v==0?'aus':v+' px',minLen:v=>v==0?'aus':v+' px',thick:v=>(+v).toFixed(1)+' px',curve:v=>v==0?'aus':v,straight:v=>(+v).toFixed(1),brush:v=>v+' px'};
for(const k in fmt){const el=$(k),o=$(k+'O');const upd=()=>o.textContent=fmt[k](el.value);upd();
  el.addEventListener('input',()=>{upd();if(k==='brush')return;
    document.querySelectorAll('[data-preset]').forEach(x=>x.setAttribute('aria-pressed','false'));
    if(k==='res'){clearTimeout(el._t);el._t=setTimeout(()=>{setupRes(false,true);refreshAll();},350);}else if(k==='hi'||k==='lo'||k==='maxLines'||k==='weak')schedule();else schedule();});}
for(const k of ['largest','autoOn','struct','ground','outlineOn','valleyOn','shadowOn','connectAll','detailLoops','cleanWin'])$(k).addEventListener('change',schedule);
$('aiOn').addEventListener('change',()=>{if(img)loadSrc(img.src,false);});
$('teedOn').addEventListener('change',()=>{if($('teedOn').checked)refreshAll();else schedule();});
$('darkBoost').addEventListener('change',()=>refreshAll());
$('underlay').addEventListener('change',render);
for(const k of ['lineCol','bgCol','transp','mirror'])$(k).addEventListener('input',render);
$('mm').addEventListener('input',()=>{status();restyle();});
$('minMM').addEventListener('input',restyle);
function restyle(){if(!vec.length)return;buildDrawing(vec);fin=rasterDrawing();parts=label(fin).n;render();status();devInfo();}
const PRESETS={
  min:{dock:26,maxLines:25,hi:36,calm:75,weak:260,dup:16,gap:32,spur:24,curve:26,straight:4.5,lo:35,calmD:1.3},
  mid:{dock:26,maxLines:45,hi:34,calm:60,weak:150,dup:14,gap:30,spur:20,curve:22,straight:4,lo:35,calmD:1},
  det:{dock:22,maxLines:100,hi:29,calm:40,weak:70,dup:11,gap:26,spur:14,curve:18,straight:3.2,lo:32,calmD:0.7}};
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{const P=PRESETS[b.dataset.preset];
  for(const k in P){$(k).value=P[k];$(k+'O').textContent=fmt[k](P[k]);}
  document.querySelectorAll('[data-preset]').forEach(x=>x.setAttribute('aria-pressed',x.dataset.preset===b.dataset.preset));
  const lv=b.dataset.preset;if(lv!==artLevel&&img){artLevel=lv;if(lineE&&$('artOn').checked){refreshAll();return;}}artLevel=lv;schedule();});
document.querySelectorAll('[data-dev]').forEach(b=>b.onclick=()=>{device=b.dataset.dev;
  document.querySelectorAll('[data-dev]').forEach(x=>x.setAttribute('aria-pressed',x===b));
  try{localStorage.setItem('sw-device',device);}catch(e){}
  if(device==='joy'&&bbox){fitToDevice();}devInfo();});
function fitToDevice(){const D=DEVICES[device];if(!D||!bbox)return;const f=frame(),bw=D.w-2*D.m,bh=D.h-2*D.m;
  const mm=Math.floor(Math.min(bw,bh*f.w/f.h));$('mm').value=mm;status();restyle();devInfo();}
$('fitDev').onclick=()=>{if(device==='free'){setTip('Zuerst oben ein Gerät wählen.');return;}fitToDevice();};
$('tileOn').addEventListener('change',devInfo);
try{const d=localStorage.getItem('sw-device');if(d&&DEVICES.hasOwnProperty(d)){device=d;document.querySelectorAll('[data-dev]').forEach(x=>x.setAttribute('aria-pressed',x.dataset.dev===d));}}catch(e){}
document.querySelectorAll('[data-stroke]').forEach(b=>b.onclick=()=>{strokeMode=b.dataset.stroke;
  document.querySelectorAll('[data-stroke]').forEach(x=>x.setAttribute('aria-pressed',x===b));restyle();});
document.querySelectorAll('[data-wheel]').forEach(b=>b.onclick=()=>{wheelMode=b.dataset.wheel;
  document.querySelectorAll('[data-wheel]').forEach(x=>x.setAttribute('aria-pressed',x===b));schedule();});
$('wheelRedetect').onclick=()=>{if(!img)return;snapshot();wheelsManual=false;wheelKey='';schedule();};
new ResizeObserver(()=>{applyView();drawOver();}).observe(stage);

/* ================= Export ================= */
function frame(){const m=marg(),x0=bbox.x0-m,y0=bbox.y0-m;return {x0,y0,w:bbox.x1-bbox.x0+1+2*m,h:bbox.y1-bbox.y0+1+2*m};}
function traceContours(b,w,h){
  const at=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&b[y*w+x];
  let E=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(b[y*w+x])E+=(!at(x,y-1))+(!at(x+1,y))+(!at(x,y+1))+(!at(x-1,y));
  const VW=w+1,head=new Int32Array(VW*(h+1)).fill(-1),sx=new Int32Array(E),sy=new Int32Array(E),sd=new Uint8Array(E),nx=new Int32Array(E),used=new Uint8Array(E);let k=0;
  const add=(x,y,d)=>{sx[k]=x;sy[k]=y;sd[k]=d;const v=y*VW+x;nx[k]=head[v];head[v]=k;k++;};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(b[y*w+x]){
    if(!at(x,y-1))add(x,y,0);if(!at(x+1,y))add(x+1,y,1);if(!at(x,y+1))add(x+1,y+1,2);if(!at(x-1,y))add(x,y+1,3);}
  const DX=[1,0,-1,0],DY=[0,1,0,-1],loops=[];
  for(let e0=0;e0<E;e0++){
    if(used[e0])continue;const pts=[];let e=e0,pd=-1;
    while(true){
      used[e]=1;const x=sx[e],y=sy[e],d=sd[e];if(d!==pd){pts.push([x,y]);pd=d;}
      const ex=x+DX[d],ey=y+DY[d];if(ex===sx[e0]&&ey===sy[e0])break;
      let best=-1,bs=9;for(let j=head[ey*VW+ex];j>=0;j=nx[j])if(!used[j]){const t=(sd[j]-d+4)%4,sc=t===1?0:t===0?1:2;if(sc<bs){bs=sc;best=j;}}
      if(best<0)break;e=best;
    }
    if(pts.length>=3)loops.push(pts);
  }
  return loops;
}
function outlinePath(){
  const f=frame(),k=Math.max(1,Math.min(4,5000/Math.max(f.w,f.h))),cw=Math.ceil(f.w*k),ch=Math.ceil(f.h*k);
  const c=document.createElement('canvas');c.width=cw;c.height=ch;const x=c.getContext('2d',{willReadFrequently:true});
  x.setTransform(k,0,0,k,-f.x0*k,-f.y0*k);paintDrawing(x,'#000');
  const d=x.getImageData(0,0,cw,ch).data,b=new Uint8Array(cw*ch);for(let i=0;i<b.length;i++)b[i]=d[i*4+3]>127?1:0;
  const loops=traceContours(b,cw,ch).map(l=>({p:simplifyLoop(l,0.8*k),closed:true})).filter(l=>l.p.length>=3);
  return {d:pathD(loops,0,0,1/k),w:f.w,h:f.h};
}
function outlineLoops(){
  const f=frame(),k=Math.max(1,Math.min(4,5000/Math.max(f.w,f.h))),cw=Math.ceil(f.w*k),ch=Math.ceil(f.h*k);
  const c=document.createElement('canvas');c.width=cw;c.height=ch;const x=c.getContext('2d',{willReadFrequently:true});
  x.setTransform(k,0,0,k,-f.x0*k,-f.y0*k);paintDrawing(x,'#000');
  const d=x.getImageData(0,0,cw,ch).data,b=new Uint8Array(cw*ch);for(let i=0;i<b.length;i++)b[i]=d[i*4+3]>127?1:0;
  const loops=traceContours(b,cw,ch).map(l=>simplifyLoop(l,0.7*k).map(q=>[q[0]/k,q[1]/k])).filter(l=>l.length>=3);
  return {loops,w:f.w,h:f.h};
}
function polyArea(p){let a=0;for(let i=0;i<p.length;i++){const q=p[i],r=p[(i+1)%p.length];a+=q[0]*r[1]-r[0]*q[1];}return a/2;}
function inPoly(pt,p){let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>pt[1])!==(b[1]>pt[1])&&pt[0]<(b[0]-a[0])*(pt[1]-a[1])/(b[1]-a[1]+1e-12)+a[0])c=!c;}return c;}
/* ================= Geräte & Aufteilen ================= */
const DEVICES={free:null,p1s:{name:'Bambu P1S',w:256,h:256,m:4},xtool:{name:'xTool M1 Ultra',w:300,h:300,m:4},joy:{name:'Cricut Joy',w:1200,h:114,m:2}};
let device='free',plan=null;
function colInk(){ // Tinte pro Spalte im Rahmen (für gute Schnittstellen)
  const f=frame(),c=new Float32Array(f.w+1);if(!fin)return c;
  for(let x=0;x<=f.w;x++){const X=f.x0+x;if(X<0||X>=W)continue;let s=0;for(let y=Math.max(0,f.y0);y<Math.min(H,f.y0+f.h);y++)s+=fin[y*W+X];c[x]=s;}
  return c;
}
function makePlan(){
  plan=null;if(!bbox)return null;
  const f=frame(),mm=+$('mm').value||600,s=mm/f.w,D=DEVICES[device],hMM=f.h*s;
  if(!D)return plan={n:1,cuts:[],hMM,fits:true};
  const bw=D.w-2*D.m,bh=D.h-2*D.m,hOK=hMM<=bh+0.01;
  if(mm<=bw+0.01)return plan={n:1,cuts:[],hMM,fits:hOK,hOK};
  if(!$('tileOn').checked)return plan={n:1,cuts:[],hMM,fits:false,hOK,tooWide:true};
  const n=Math.ceil(mm/bw),maxL=Math.floor(bw/s),minL=Math.floor(maxL*0.45),ink=colInk(),Wf=f.w;
  // DP: n-1 Schnitte, jedes Teil <= maxL, möglichst wenig Linien durchschneiden, möglichst gleich groß
  const ideal=Wf/n,INF=1e18;let prev=new Float64Array(Wf+1).fill(INF);const back=[];prev[0]=0;
  for(let k=1;k<=n;k++){
    const cur=new Float64Array(Wf+1).fill(INF),bk=new Int32Array(Wf+1).fill(-1);
    for(let p=1;p<=Wf;p++){if(k===n&&p!==Wf)continue;if(k<n&&p===Wf)continue;
      const cost=(k<n?ink[p]*3+Math.abs(p-ideal*k)*0.02:0);
      for(let q=Math.max(0,p-maxL);q<=p-(k<n?minL:1);q++){if(prev[q]>=INF)continue;const v=prev[q]+cost;if(v<cur[p]){cur[p]=v;bk[p]=q;}}}
    back.push(bk);prev=cur;
  }
  if(prev[Wf]>=INF)return plan={n:1,cuts:[],hMM,fits:false,hOK,tooWide:true};
  const cuts=[];let p=Wf;for(let k=n-1;k>=0;k--){const q=back[k][p];if(k>0)cuts.unshift(q);p=q;}
  return plan={n,cuts,hMM,fits:hOK,hOK,tileMM:Math.max(...[0,...cuts,Wf].slice(1).map((v,i,a)=>v-(i?a[i-1]:0)))*s};
}
function devInfo(){
  const el=$('devInfo');if(!el)return;const D=DEVICES[device];makePlan();
  if(!D||!plan){el.innerHTML='Kein Gerät gewählt – beliebige Größe.';drawOver();return;}
  const mm=Math.round(+$('mm').value||600);
  if(plan.tooWide)el.innerHTML=`<span style="color:var(--warn)">${mm} mm ist zu breit für ${D.name}. „Aufteilen“ aktivieren oder „Größe anpassen“.</span>`;
  else if(!plan.hOK)el.innerHTML=`<span style="color:var(--warn)">Höhe ${Math.round(plan.hMM)} mm ist zu hoch für ${D.name} (max. ${D.h-2*D.m} mm). Breite verringern.</span>`;
  else if(plan.n>1)el.innerHTML=`Wird für ${D.name} in <b>${plan.n} Teile</b> aufgeteilt (je max. ${Math.round(plan.tileMM)} mm). Schnitte sitzen dort, wo möglichst wenig Linien sind (rot gestrichelt).`;
  else el.innerHTML=`Passt auf ${D.name} ✓ (${mm} × ${Math.round(plan.hMM)} mm).`;
  drawOver();
}
function tileRanges(){const f=frame();if(!plan||plan.n<2)return [[0,f.w]];const xs=[0,...plan.cuts,f.w];return xs.slice(1).map((v,i)=>[xs[i],v]);}
function regionLoops(xa,xb){
  const f=frame(),w=xb-xa,k=Math.max(1,Math.min(4,5000/Math.max(w,f.h))),cw=Math.ceil(w*k),ch=Math.ceil(f.h*k);
  const c=document.createElement('canvas');c.width=cw;c.height=ch;const x=c.getContext('2d',{willReadFrequently:true});
  x.setTransform(k,0,0,k,-(f.x0+xa)*k,-f.y0*k);paintDrawing(x,'#000');
  const d=x.getImageData(0,0,cw,ch).data,b=new Uint8Array(cw*ch);for(let i=0;i<b.length;i++)b[i]=d[i*4+3]>127?1:0;
  const loops=traceContours(b,cw,ch).map(l=>simplifyLoop(l,0.7*k).map(q=>[q[0]/k,q[1]/k])).filter(l=>l.length>=3&&Math.abs(polyArea(l))>1);
  return {loops,w,h:f.h};
}
function loopsPathD(loops,flip,w){let d='';const f2=v=>v.toFixed(2);for(const l of loops){d+='M'+l.map(q=>f2(flip?w-q[0]:q[0])+' '+f2(q[1])).join('L')+'Z';}return d;}
/* Mini-ZIP (ohne Kompression) für mehrere Dateien */
const CRC_T=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(u){let c=0xFFFFFFFF;for(let i=0;i<u.length;i++)c=CRC_T[(c^u[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function zipFiles(files){
  const enc=new TextEncoder(),parts=[],cd=[];let off=0;
  for(const f of files){const name=enc.encode(f.name),data=f.data instanceof Uint8Array?f.data:new Uint8Array(f.data),crc=crc32(data);
    const h=new DataView(new ArrayBuffer(30));h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(8,0,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);
    parts.push(new Uint8Array(h.buffer),name,data);
    const c=new DataView(new ArrayBuffer(46));c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,off,true);
    cd.push(new Uint8Array(c.buffer),name);off+=30+name.length+data.length;}
  let cdLen=0;for(const u of cd)cdLen+=u.length;
  const e=new DataView(new ArrayBuffer(22));e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,cdLen,true);e.setUint32(16,off,true);
  return new Blob([...parts,...cd,new Uint8Array(e.buffer)],{type:'application/zip'});
}
function stlFromLoops(loops,w,h,s,th,flip){
  // Verschachtelung: gerade Tiefe = Außenkontur, ungerade = Loch
  const info=loops.map(p=>({p,a:Math.abs(polyArea(p))}));
  const depth=info.map((L,i)=>{let d=0,par=-1,pa=Infinity;for(let j=0;j<info.length;j++){if(i===j||info[j].a<=L.a)continue;if(inPoly(L.p[0],info[j].p)){d++;if(info[j].a<pa){pa=info[j].a;par=j;}}}L.par=par;return d;});
  const groups=new Map();info.forEach((L,i)=>{if(depth[i]%2===0)groups.set(i,{outer:L.p,holes:[]});});
  info.forEach((L,i)=>{if(depth[i]%2===1&&groups.has(L.par))groups.get(L.par).holes.push(L.p);});
  const tris=[];const P=(q,z)=>[(flip?(w-q[0]):q[0])*s,(h-q[1])*s,z];
  const pushT=(a,b,c)=>{if(flip)tris.push(a,c,b);else tris.push(a,b,c);};
  for(const g of groups.values()){
    const rings=[g.outer,...g.holes],flat=[],holeIdx=[],pts=[];
    rings.forEach((r,ri)=>{if(ri)holeIdx.push(pts.length);for(const q of r){flat.push(q[0],q[1]);pts.push(q);}});
    const idx=earcut(flat,holeIdx.length?holeIdx:null,2);
    for(let i=0;i<idx.length;i+=3){const a=pts[idx[i]],b=pts[idx[i+1]],c=pts[idx[i+2]];
      // earcut-Orientierung vereinheitlichen (Bild-y zeigt nach unten → nach Spiegelung auf y-oben prüfen)
      const A=P(a,th),B=P(b,th),C=P(c,th);const cr=(B[0]-A[0])*(C[1]-A[1])-(B[1]-A[1])*(C[0]-A[0]);
      if(cr>=0){tris.push(A,B,C,P(a,0),P(c,0),P(b,0));}else{tris.push(A,C,B,P(a,0),P(b,0),P(c,0));}}
    rings.forEach((r,ri)=>{const outer=ri===0,ar=polyArea(r.map(q=>[(flip?(w-q[0]):q[0]),(h-q[1])]));const ccw=ar>0;const wantCCW=outer;
      for(let i=0;i<r.length;i++){let a=r[i],b=r[(i+1)%r.length];if(ccw!==wantCCW){const tmp=a;a=b;b=tmp;}
        const a0=P(a,0),b0=P(b,0),a1=P(a,th),b1=P(b,th);tris.push(a0,b0,b1,a0,b1,a1);}});
  }
  const n=tris.length/3,buf=new ArrayBuffer(84+n*50),dv=new DataView(buf);
  const hdr='Silhouette Werkstatt STL';for(let i=0;i<80;i++)dv.setUint8(i,i<hdr.length?hdr.charCodeAt(i):32);
  dv.setUint32(80,n,true);let o=84;
  for(let i=0;i<n;i++){const a=tris[i*3],b=tris[i*3+1],c=tris[i*3+2];
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const l=Math.hypot(nx,ny,nz)||1;
    for(const v of [nx/l,ny/l,nz/l,...a,...b,...c]){dv.setFloat32(o,v,true);o+=4;}dv.setUint16(o,0,true);o+=2;}
  return {buf,n};
}
/* ---- Dateien erzeugen (für Download und NAS) ---- */
function exportRanges(){makePlan();let r=tileRanges();if($('mirror').checked)r=r.slice().reverse();return r;}
const partName=(base,i,n,ext)=>n>1?`${base} Teil ${i+1} von ${n}.${ext}`:`${base}.${ext}`;
function makeSvgKontur(base){
  const f=frame(),mm=+$('mm').value||600,s=mm/f.w,flip=$('mirror').checked,ranges=exportRanges(),col=$('lineCol').value,transp=$('transp').checked;
  return ranges.map(([xa,xb],i)=>{const {loops,w,h}=regionLoops(xa,xb);const wm=w*s,hm=h*s;
    const svg=`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${wm.toFixed(2)}mm" height="${hm.toFixed(2)}mm">`+(transp?'':`<rect width="${w}" height="${h}" fill="${$('bgCol').value}"/>`)+`<path fill="${col}" fill-rule="evenodd" d="${loopsPathD(loops,flip,w)}"/></svg>`;
    return {name:partName(base,i,ranges.length,'svg'),blob:new Blob([svg],{type:'image/svg+xml'}),wm};});
}
function makeSvgLinien(base){
  const f=frame(),inner=`<g transform="translate(${-f.x0} ${-f.y0})" fill="none" stroke="${$('lineCol').value}" stroke-linecap="round" stroke-linejoin="round">`+drawing.map(g=>`<path stroke-width="${g.w.toFixed(2)}" d="${g.d}"/>`).join('')+'</g>';
  const r=svgWrap(inner,f.w,f.h);return [{name:`${base}.svg`,blob:new Blob([r.svg],{type:'image/svg+xml'})}];
}
function makePng(base){
  const f=frame(),pw=Math.max(200,+$('pngW').value||4000),s=pw/f.w,ph=Math.round(f.h*s);
  const c=document.createElement('canvas');c.width=pw;c.height=ph;const x=c.getContext('2d');
  if(!$('transp').checked){x.fillStyle=$('bgCol').value;x.fillRect(0,0,pw,ph);}
  if($('mirror').checked){x.translate(pw,0);x.scale(-1,1);}
  x.scale(s,s);x.translate(-f.x0,-f.y0);paintDrawing(x,$('lineCol').value);
  return new Promise(res=>c.toBlob(bl=>res([{name:`${base}.png`,blob:bl,pw,ph}]),'image/png'));
}
function makeStl(base){
  const f=frame(),mm=+$('mm').value||600,s=mm/f.w,th=Math.max(0.2,+$('stlH').value||3),flip=$('mirror').checked,ranges=exportRanges();
  return ranges.map(([xa,xb],i)=>{const {loops,w,h}=regionLoops(xa,xb);const r=stlFromLoops(loops,w,h,s,th,flip);
    return {name:partName(base,i,ranges.length,'stl'),blob:new Blob([r.buf],{type:'model/stl'}),tris:r.n,wm:w*s};});
}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);}
function downloadSet(files,zipName){
  if(files.length===1)download(files[0].blob,files[0].name);
  else Promise.all(files.map(async f=>({name:f.name,data:new Uint8Array(await f.blob.arrayBuffer())}))).then(z=>download(zipFiles(z),zipName));
}
function svgWrap(inner,w,h){
  const mm=+$('mm').value||600,hmm=mm*h/w,flip=$('mirror').checked;
  const bg=$('transp').checked?'':`<rect width="${w}" height="${h}" fill="${$('bgCol').value}"/>`;
  return {mm,hmm,svg:`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${mm.toFixed(1)}mm" height="${hmm.toFixed(1)}mm">${bg}<g${flip?` transform="translate(${w} 0) scale(-1 1)"`:''}>${inner}</g></svg>`};
}
const dlBase=()=>fileBase()||'silhouette';
$('svgBtn').onclick=()=>{if(!bbox)return;setTip('Kontur wird berechnet …');
  setTimeout(()=>{const fs=makeSvgKontur(dlBase()),f=frame(),mm=+$('mm').value||600;downloadSet(fs,dlBase()+' SVG.zip');
    setTip(fs.length>1?`<b>${fs.length} SVG-Teile gespeichert</b> (ZIP) – Teile ${fs.map(x=>Math.round(x.wm)).join(' / ')} mm breit.`:`<b>SVG Kontur gespeichert</b> – ${Math.round(mm)} × ${Math.round(f.h*mm/f.w)} mm, ${parts} ${parts===1?'Teil':'Einzelteile'}.`);},20);};
$('svgLineBtn').onclick=()=>{if(!bbox)return;const fs=makeSvgLinien(dlBase()+' Linien');download(fs[0].blob,fs[0].name);setTip('<b>SVG Linien gespeichert.</b>');};
$('stlBtn').onclick=()=>{if(!bbox)return;setTip('3D-Modell wird erstellt …');
  setTimeout(()=>{try{const fs=makeStl(dlBase());downloadSet(fs,dlBase()+' STL.zip');setTip(`<b>STL gespeichert</b> – ${fs.length>1?fs.length+' Teile (ZIP)':'1 Datei'}, ${fs.reduce((a,f)=>a+f.tris,0).toLocaleString('de-AT')} Dreiecke.`);}catch(e){setTip('STL-Export fehlgeschlagen: '+e.message);}},20);};
$('pngBtn').onclick=()=>{if(!bbox)return;makePng(dlBase()).then(fs=>{download(fs[0].blob,fs[0].name);setTip(`<b>PNG gespeichert</b> – ${fs[0].pw} × ${fs[0].ph} px.`);});};

/* ================= Speichern auf dem NAS =================
   Ziel: \\mnas01\Shop\Shop\3D Dateien\2D Auto Wandbild\<Marke>\<Modell>.svg/.stl/.png
   Chrome/Edge: Ordner einmal wählen (File System Access API), danach speichert „Speichern“ direkt dorthin. */
const NAS_HINT='\\\\mnas01\\Shop\\Shop\\3D Dateien',NAS_SUB='2D Auto Wandbild';
const BRANDS=['Abarth','Alfa Romeo','Alpina','Alpine','Aston Martin','Audi','Bentley','BMW','Bugatti','Buick','BYD','Cadillac','Chevrolet','Chrysler','Citroën','Cupra','Dacia','Daihatsu','Dodge','DS','Ferrari','Fiat','Fisker','Ford','Genesis','GMC','Honda','Hummer','Hyundai','Infiniti','Isuzu','Jaguar','Jeep','Kia','Koenigsegg','KTM','Lada','Lamborghini','Lancia','Land Rover','Lexus','Lincoln','Lotus','Lucid','Maserati','Maybach','Mazda','McLaren','Mercedes-Benz','MG','Mini','Mitsubishi','Morgan','Nissan','Opel','Pagani','Peugeot','Polestar','Pontiac','Porsche','RAM','Renault','Rimac','Rivian','Rolls-Royce','Saab','Seat','Skoda','Smart','SsangYong','Subaru','Suzuki','Tesla','Toyota','Trabant','Volkswagen','Volvo','Wiesmann'];
const BRAND_ALIAS={vw:'Volkswagen',volkswagen:'Volkswagen',mercedes:'Mercedes-Benz',benz:'Mercedes-Benz',mb:'Mercedes-Benz',amg:'Mercedes-Benz',alfa:'Alfa Romeo',landrover:'Land Rover',rangerover:'Land Rover',rolls:'Rolls-Royce',rollsroyce:'Rolls-Royce',aston:'Aston Martin',astonmartin:'Aston Martin',citroen:'Citroën',škoda:'Skoda',mclaren:'McLaren',vauxhall:'Opel',chevy:'Chevrolet',lambo:'Lamborghini',merc:'Mercedes-Benz'};
const normKey=s=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
function canonBrand(v){v=(v||'').trim().replace(/\s+/g,' ');if(!v)return '';const k=normKey(v);
  for(const b of BRANDS)if(normKey(b)===k)return b;if(BRAND_ALIAS[k])return BRAND_ALIAS[k];return v;}
function cleanName(v){return (v||'').replace(/[\\/:*?"<>|\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().replace(/[. ]+$/,'').slice(0,120);}
function fileBase(){const b=canonBrand($('brand').value),m=cleanName($('model').value);return m?(b&&!normKey(m).startsWith(normKey(b))?b+' ':'')+m:cleanName(b);}
/* Marke/Modell aus dem Dateinamen raten, z. B. „audi_rs6-avant_seite.jpg“ → Audi / RS6 Avant */
const JUNK=/^(img|dsc|dscn|dcim|pxl|photo|foto|bild|image|picture|pic|side|seite|seitenansicht|profile|profil|view|ansicht|wallpaper|hd|uhd|fhd|4k|8k|copy|kopie|final|edit|web|large|small|press|presse|new|neu|jpg|jpeg|png|webp|heic|screenshot|bildschirmfoto|download|car|auto|und|and|the|der|die|das|with|mit)$/i;
function guessFromName(fn){
  const stem=(fn||'').replace(/\.[^.]+$/,'');
  let toks=stem.split(/[\s_\-.,+()\[\]]+/).filter(Boolean);
  let brand='',rest=[];
  for(let i=0;i<toks.length;i++){
    const two=i+1<toks.length?normKey(toks[i]+toks[i+1]):'';
    if(!brand&&two==='rangerover'){brand='Land Rover';rest.push('Range','Rover');i++;continue;}
    if(!brand&&two){const b=BRANDS.find(x=>normKey(x)===two)||BRAND_ALIAS[two];if(b){brand=b;i++;continue;}}
    if(!brand){const k=normKey(toks[i]),b=BRANDS.find(x=>normKey(x)===k)||BRAND_ALIAS[k];if(b){brand=b;if(k==='amg')rest.push('AMG');continue;}}
    if(brand)rest.push(toks[i]);
  }
  rest=rest.filter(t=>!JUNK.test(t)&&!/^\d{5,}$/.test(t)&&!/^\d{3,5}x\d{3,5}$/i.test(t)&&!/^(19|20)\d\d(\d{4})?$/.test(t)&&!/^[a-f0-9]{12,}$/i.test(t)).slice(0,5);
  const model=rest.map(t=>/\d/.test(t)||t.length<=3?t.toUpperCase():t[0].toUpperCase()+t.slice(1).toLowerCase()).join(' ');
  return {brand,model};
}
function applyNameGuess(fn){
  const g=guessFromName(fn);
  if(g.brand){$('brand').value=g.brand;$('model').value=g.model;}
  else $('model').value=''; // neues Auto: Modell leeren, Marke behalten
  refreshModelList();
}
/* IndexedDB (merkt sich den gewählten Ordner) */
function idbOpen(){return new Promise((res,rej)=>{const r=indexedDB.open('silhouette-werkstatt',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function kv(k,v){const db=await idbOpen();return new Promise((res,rej)=>{const t=db.transaction('kv',v===undefined?'readonly':'readwrite'),st=t.objectStore('kv');
  const r=v===undefined?st.get(k):st.put(v,k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
let baseDir=null,baseParent='',savedSomething=false;
const fsOK=()=>typeof window.showDirectoryPicker==='function';
async function perm(h,ask){const o={mode:'readwrite'};try{if(await h.queryPermission(o)==='granted')return true;if(!ask)return false;return (await h.requestPermission(o))==='granted';}catch(e){return false;}}
async function initSave(){
  $('brandList').innerHTML=BRANDS.map(b=>`<option value="${b}">`).join('');
  try{const o=JSON.parse(localStorage.getItem('sw-formats')||'null');if(o)for(const k in o)if($(k))$(k).checked=!!o[k];}catch(e){}
  for(const k of ['fSvg','fStl','fPng','fLine','fPhoto'])$(k).addEventListener('change',()=>{try{localStorage.setItem('sw-formats',JSON.stringify(Object.fromEntries(['fSvg','fStl','fPng','fLine','fPhoto'].map(x=>[x,$(x).checked]))));}catch(e){}});
  try{const b=localStorage.getItem('sw-brand');if(b&&!$('brand').value)$('brand').value=b;}catch(e){}
  if(fsOK()){try{const d=await kv('baseDir');if(d){baseDir=d;baseParent=(await kv('baseParent'))||'';}}catch(e){}}
  saveInfo();
}
async function saveInfo(){
  const el=$('saveInfo');if(!el)return;
  if(!fsOK()){el.innerHTML=`<span class="warn">Dieser Browser kann nicht direkt in Ordner speichern.</span> „Speichern“ lädt die Dateien herunter. Für direktes Speichern aufs NAS die Datei in <b>Chrome</b> oder <b>Edge</b> öffnen.`;$('pickDir').hidden=true;return;}
  if(!baseDir){el.innerHTML=`Noch kein Ordner gewählt. Einmal auf „Ordner wählen …“ klicken und <b>${NAS_HINT}</b> auswählen – der Unterordner <b>${NAS_SUB}</b> wird automatisch angelegt.`;return;}
  const ok=await perm(baseDir,false);
  el.innerHTML=`Speichert nach <b>…\\${baseParent?baseParent+'\\':''}${baseDir.name}\\${esc(canonBrand($('brand').value)||'Marke')}\\</b>`+(ok?' <span class="ok">✓ verbunden</span>':' <span class="warn">(beim ersten Speichern Zugriff bestätigen)</span>');
}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function pickBaseDir(){
  let h=await window.showDirectoryPicker({id:'wandbild',mode:'readwrite'});
  let parent='';
  if(normKey(h.name)!==normKey(NAS_SUB)){ // Elternordner gewählt (z. B. „3D Dateien“) → Unterordner anlegen/benutzen
    parent=h.name;let sub=null;
    for await(const [n,e] of h.entries())if(e.kind==='directory'&&normKey(n)===normKey(NAS_SUB)){sub=e;break;}
    h=sub||await h.getDirectoryHandle(NAS_SUB,{create:true});
  }
  baseDir=h;baseParent=parent;try{await kv('baseDir',h);await kv('baseParent',parent);}catch(e){}
  saveInfo();refreshModelList();return h;
}
$('pickDir').onclick=async()=>{try{await pickBaseDir();setTip(`Speicherort verbunden: <b>${esc(baseDir.name)}</b>. Ab jetzt reicht Marke + Modell eingeben und <b>Speichern</b>.`);}catch(e){if(e.name!=='AbortError')setTip('<span style="color:var(--warn)">Ordner konnte nicht geöffnet werden:</span> '+esc(e.message)+'<br>Tipp: Das NAS als Laufwerk verbinden (z. B. Z:) und dort den Ordner wählen.');}};
async function brandDir(create){
  const b=canonBrand($('brand').value);if(!b||!baseDir)return null;
  for await(const [n,e] of baseDir.entries())if(e.kind==='directory'&&normKey(n)===normKey(b))return e;
  return create?baseDir.getDirectoryHandle(cleanName(b),{create:true}):null;
}
async function refreshModelList(){
  const dl=$('modelList');if(!dl)return;dl.innerHTML='';saveInfo();
  if(!baseDir||!(await perm(baseDir,false)))return;
  try{const d=await brandDir(false);if(!d)return;const names=new Set();
    for await(const [n,e] of d.entries())if(e.kind==='file'){const m=n.replace(/\.[^.]+$/,'').replace(/ (Linien|Foto)$/,'').replace(/ Teil \d+ von \d+$/,'');names.add(m);}
    dl.innerHTML=[...names].sort().map(n=>`<option value="${esc(n)}">`).join('');}catch(e){}
}
function ask(text,buttons){return new Promise(res=>{const m=$('modal');$('modalT').innerHTML=text;const row=$('modalB');row.innerHTML='';
  buttons.forEach(([label,val,primary])=>{const b=document.createElement('button');b.textContent=label;if(primary)b.className='primary';b.onclick=()=>{m.hidden=true;res(val);};row.appendChild(b);});
  m.hidden=false;row.lastChild&&row.lastChild.focus();});}
async function exists(dir,name){try{await dir.getFileHandle(name);return true;}catch(e){return false;}}
async function buildSaveSet(base){
  const out=[];
  if($('fSvg').checked)out.push(...makeSvgKontur(base));
  if($('fStl').checked)out.push(...makeStl(base));
  if($('fPng').checked)out.push(...await makePng(base));
  if($('fLine').checked)out.push(...makeSvgLinien(base+' Linien'));
  if($('fPhoto').checked&&img){const b=await (await fetch(img.src)).blob();const ext=(b.type.split('/')[1]||'jpg').replace('jpeg','jpg');out.push({name:`${base} Foto.${ext}`,blob:b});}
  return out;
}
let saving=false;
async function saveAll(){
  if(saving||!bbox)return;
  const brand=canonBrand($('brand').value),model=cleanName($('model').value);
  $('brand').classList.toggle('need',!brand);$('model').classList.toggle('need',!model);
  if(!brand||!model){setTip('Bitte oben <b>Marke</b> und <b>Modell</b> eintragen – danach wird die Datei nach dem Modell benannt und im Ordner der Marke abgelegt.');($('brand').value?$('model'):$('brand')).focus();return;}
  $('brand').value=brand;try{localStorage.setItem('sw-brand',brand);}catch(e){}
  if(!$('fSvg').checked&&!$('fStl').checked&&!$('fPng').checked&&!$('fLine').checked&&!$('fPhoto').checked){setTip('Unter <b>Speichern &amp; Export</b> mindestens ein Format anhaken.');return;}
  saving=true;$('saveBtn').disabled=true;
  try{
    if(!fsOK()){ // Fallback: herunterladen
      const fs=await buildSaveSet(`${brand} ${model}`);for(const f of fs){download(f.blob,f.name);await new Promise(r=>setTimeout(r,250));}
      setTip(`<b>${fs.length} Datei${fs.length>1?'en':''} heruntergeladen</b> (${fs.map(f=>esc(f.name)).join(', ')}). Direkt aufs NAS speichern geht mit Chrome oder Edge.`);return;
    }
    // Zugriff zuerst holen (braucht den Klick als Nutzeraktion)
    if(!baseDir)await pickBaseDir();else if(!(await perm(baseDir,true))){setTip('<span style="color:var(--warn)">Kein Schreibzugriff auf den Ordner.</span> Mit „Ordner wählen …“ neu verbinden.');return;}
    setTip('Dateien werden erstellt …');await nextFrame();
    const dir=await brandDir(true);
    let base=model,files=await buildSaveSet(base);
    const clash=[];for(const f of files)if(await exists(dir,f.name))clash.push(f.name);
    if(clash.length){
      let n=2;while(true){const nb=`${model} (${n})`;let free=true;for(const f of files)if(await exists(dir,f.name.replace(model,nb))){free=false;break;}if(free)break;n++;}
      const a=await ask(`<b>${esc(model)}</b> gibt es in <b>${esc(dir.name)}</b> schon (${clash.map(esc).join(', ')}).`,[['Abbrechen','cancel'],[`Neue Version „${model} (${n})“`,'new'],['Ersetzen','replace',true]]);
      if(a==='cancel'){setTip('Speichern abgebrochen.');return;}
      if(a==='new'){base=`${model} (${n})`;files=files.map(f=>({...f,name:f.name.replace(model,base)}));}
    }
    for(const f of files){const fh=await dir.getFileHandle(f.name,{create:true});const w=await fh.createWritable();await w.write(f.blob);await w.close();}
    savedSomething=true;refreshModelList();
    setTip(`<b>Gespeichert ✓</b> in <b>…\\${esc(baseDir.name)}\\${esc(dir.name)}\\</b>: ${files.map(f=>esc(f.name)).join(', ')}`);
  }catch(e){
    if(e&&e.name==='AbortError')setTip('Speichern abgebrochen.');
    else setTip('<span style="color:var(--warn)">Speichern fehlgeschlagen:</span> '+esc(e&&e.message||e)+'. Ist das NAS erreichbar? Sonst mit „Ordner wählen …“ neu verbinden.');
  }finally{saving=false;$('saveBtn').disabled=false;}
}
$('saveBtn').onclick=saveAll;
for(const k of ['brand','model'])$(k).addEventListener('input',()=>{$(k).classList.remove('need');if(k==='brand'){clearTimeout($(k)._t);$(k)._t=setTimeout(refreshModelList,300);}});
$('brand').addEventListener('change',()=>{$('brand').value=canonBrand($('brand').value);refreshModelList();});
window.addEventListener('keydown',ev=>{if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='s'){ev.preventDefault();saveAll();}},true);
initSave();

setTool('hand');
loadSrc(DEMO,true);
