/*
 * Reference implementation copied verbatim from the Vantage clickable
 * prototype (artifact R4Jic2KqVD133ZdqSv39Vo, 12 Oct 2026): court constants,
 * zoneOf, legalOurs, live and fold. The engine is tested against it so the
 * real apps count exactly what the prototype testers saw.
 * Only the wrapper below is new: it supplies the prototype's global game `G`.
 */
export function prototype(G) {
const COURT_L=30.5, COURT_W=15.25, R_CIRCLE=4.9;
function zoneOf(x,y){
  const third=x<1/3?'defensive':x<2/3?'centre':'attacking';
  const chan=y<1/3?'near':y<2/3?'middle':'far';
  const dxA=(1-x)*COURT_L, dyA=(y-.5)*COURT_W, dA=Math.hypot(dxA,dyA);
  const dxD=x*COURT_L, dD=Math.hypot(dxD,dyA);
  const z={third,chan,circle:null,sector:null,range:null,centre:false,label:''};
  if(dA<=R_CIRCLE){z.circle='ours';const ang=Math.atan2(dyA,dxA)*180/Math.PI; // 0 = straight in front
    z.sector=ang<-54?'right baseline':ang<-18?'right':ang<=18?'front':ang<=54?'left':'left baseline';
    z.range=dA<2.5?'close':'long';z.label='our circle, '+z.sector+', '+z.range;}
  else if(dD<=R_CIRCLE){z.circle='theirs';z.label='their circle';}
  else if(Math.hypot((x-.5)*COURT_L,dyA)<=0.45){z.centre=true;z.label='centre circle';}
  else z.label=third+' third, '+chan+' side';
  return z;
}
// legal positions by zone, for our players in attack coords
function legalOurs(z){
  const s=new Set();
  if(z.circle==='ours'){['GS','GA'].forEach(p=>s.add(p));return s;}
  if(z.circle==='theirs'){['GD','GK'].forEach(p=>s.add(p));return s;}
  if(z.third==='attacking'){['GS','GA','WA','C'].forEach(p=>s.add(p));}
  else if(z.third==='centre'){['GA','WA','C','WD','GD'].forEach(p=>s.add(p));}
  else {['C','WD','GD','GK'].forEach(p=>s.add(p));}
  return s;
}
function live(){return G.events.filter(e=>!e.deleted)}
function fold(upTo){
  const st={us:0,them:0,nextCP:G.firstCP,poss:null,cpPending:true,chain:null,lastEv:null,
    stats:{shots:{},cp:{us:{n:0,g:0},them:{n:0,g:0}},gains:0,unforced:0,unforcedByZone:{},turnoverPos:{}},perQ:{}};
  const evs=live(); const n=upTo==null?evs.length:upTo;
  let curQ=1;
  const q=()=>st.perQ[curQ]||(st.perQ[curQ]={us:0,them:0,gains:0,unforced:0,shotsN:0,shotsG:0,cpN:0,cpG:0});
  for(let i=0;i<n;i++){const e=evs[i];
    if(e.type==='period_start'){curQ=e.period;const o=G.periodOverrides[curQ];if(o&&o.cp)st.nextCP=o.cp;st.cpPending=true;st.poss=null;st.chain=null;q();continue;}
    if(e.type!=='action')continue;
    const T=e.team, O=T==='us'?'them':'us';
    const a=e.action;
    if(a==='Receive'){st.poss=T;st.cpPending=false;st.chain={team:T,from:'cp'};st.stats.cp[T].n++;q().cpN+= (T==='us'?1:0);}
    else if(a==='Goal'||a==='Miss'){
      if(T==='us'&&e.player&&e.player!=='?'){const s=st.stats.shots[e.player]||(st.stats.shots[e.player]={att:0,g:0});s.att++;if(a==='Goal')s.g++;}
      if(T==='us'){q().shotsN++;if(a==='Goal')q().shotsG++;}
      if(a==='Goal'){st[T]++;q()[T]++;if(st.chain&&st.chain.team===T&&st.chain.from==='cp'){st.stats.cp[T].g++;if(T==='us')q().cpG++;}
        st.nextCP=O;st.cpPending=true;st.poss=null;st.chain=null;}
      else{ // miss: rebound decides
        if(e.rebound==='ours'){st.poss=T;st.chain=st.chain||{team:T,from:'rebound'};}
        else if(e.rebound==='theirs'){st.poss=O;st.chain={team:O,from:'rebound'};}
        else if(e.rebound==='out'){st.poss=O;st.chain={team:O,from:'throwin'};}
      }
    }
    else if(a==='Won it'){st.poss=T;st.cpPending=false;st.chain={team:T,from:'gain'};if(T==='us'){st.stats.gains++;q().gains++;}}
    else if(a==='Lost it'){st.poss=O;st.cpPending=false;st.chain={team:O,from:'turnover'};
      if(T==='us'){st.stats.unforced++;q().unforced++;const k=e.zone?e.zone.third:'?';st.stats.unforcedByZone[k]=(st.stats.unforcedByZone[k]||0)+1;
        if(e.player){st.stats.turnoverPos[e.player]=(st.stats.turnoverPos[e.player]||0)+1;}}}
    else if(a==='Feed'||a==='Touch'||a==='Penalty'){ /* possession unchanged */ }
    st.lastEv=e;
  }
  return st;
}
  return { zoneOf, legalOurs, fold };
}
