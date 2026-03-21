// Quick test: find what config gives ~928km crash with prograde tracking,
// and what profile fixes it.

const G = 6.674e-11, EARTH_RADIUS = 6.371e6, EARTH_MU = G*5.972e24;
const MOON_DISTANCE = 384_400e3, MOON_MU = G*7.342e22, MOON_ORBITAL_PERIOD = 27.322*86400;
const MOON_INITIAL_PHASE = (135*Math.PI)/180, G0 = 9.80665, SCALE_HEIGHT = 8500;
const SEA_LEVEL_DENSITY = 1.225;

const mag = v => Math.sqrt(v.x**2+v.y**2);
const norm = v => { const m=mag(v); return m>0?{x:v.x/m,y:v.y/m}:{x:0,y:0}; };
const add = (a,b) => ({x:a.x+b.x,y:a.y+b.y});
const scale = (v,s) => ({x:v.x*s,y:v.y*s});
const dot = (a,b) => a.x*b.x+a.y*b.y;
const cross2D = (a,b) => a.x*b.y-a.y*b.x;
const rotate = (v,a) => ({x:v.x*Math.cos(a)-v.y*Math.sin(a),y:v.x*Math.sin(a)+v.y*Math.cos(a)});

function moonPos(t) {
  const a = MOON_INITIAL_PHASE + (2*Math.PI/MOON_ORBITAL_PERIOD)*t;
  return {x:MOON_DISTANCE*Math.cos(a),y:MOON_DISTANCE*Math.sin(a)};
}

function orbElems(pos,vel) {
  const r=mag(pos), v=mag(vel), energy=v*v/2-EARTH_MU/r;
  if(energy>=0) return null;
  const a=-EARTH_MU/(2*energy), h=cross2D(pos,vel);
  const eVx=(v*v*pos.x-dot(pos,vel)*vel.x)/EARTH_MU-pos.x/r;
  const eVy=(v*v*pos.y-dot(pos,vel)*vel.y)/EARTH_MU-pos.y/r;
  const e=Math.sqrt(eVx**2+eVy**2);
  return {apoapsis:a*(1+e)-EARTH_RADIUS, periapsis:a*(1-e)-EARTH_RADIUS};
}

function accel(pos,vel,mass,thrust,mp) {
  const r=mag(pos); if(r===0||mass<=0) return {x:0,y:0};
  let a = scale(norm(pos),-EARTH_MU/(r*r));
  const toMoon={x:pos.x-mp.x,y:pos.y-mp.y}, dm=mag(toMoon);
  if(dm>1) a = add(a, scale(norm(toMoon),-MOON_MU/(dm*dm)));
  const alt=r-EARTH_RADIUS, speed=mag(vel);
  if(speed>0&&alt>0&&alt<100000) {
    const rho=SEA_LEVEL_DENSITY*Math.exp(-alt/SCALE_HEIGHT);
    a = add(a, scale(norm(vel),-0.5*rho*speed*speed*0.05*3/mass));
  }
  return add(a, scale(thrust,1/mass));
}

function rk4(state,dt,thrust,mp) {
  const {pos,vel,mass}=state;
  const a1=accel(pos,vel,mass,thrust,mp);
  const p2=add(pos,scale(vel,dt/2)),v2=add(vel,scale(a1,dt/2));
  const a2=accel(p2,v2,mass,thrust,mp);
  const p3=add(pos,scale(v2,dt/2)),v3=add(vel,scale(a2,dt/2));
  const a3=accel(p3,v3,mass,thrust,mp);
  const p4=add(pos,scale(v3,dt)),v4=add(vel,scale(a3,dt));
  const a4=accel(p4,v4,mass,thrust,mp);
  return {
    pos:add(pos,scale(add(add(vel,scale(v2,2)),add(scale(v3,2),v4)),dt/6)),
    vel:add(vel,scale(add(add(a1,scale(a2,2)),add(scale(a3,2),a4)),dt/6)),mass
  };
}

const ENGINES = {
  "raptor-x":  {thrustVac:2_500_000,thrustSL:2_200_000,ispVac:363,ispSL:330},
  "kestrel-9": {thrustVac:1_340_000,thrustSL:1_200_000,ispVac:316,ispSL:289},
  "titan-rl2": {thrustVac:180_000,  thrustSL:0,          ispVac:467,ispSL:0},
  "kestrel-7": {thrustVac:1_400_000,thrustSL:1_300_000,ispVac:335,ispSL:300},
  "spartan-1": {thrustVac:1_350_000,thrustSL:1_200_000,ispVac:242,ispSL:220},
};

function simulate(stages, payloadMass, pitchFn) {
  const stageRT = stages.map(s => {
    const e=ENGINES[s.engineId];
    return {thrustVac:e.thrustVac*s.count,thrustSL:e.thrustSL*s.count,
            ispVac:e.ispVac,ispSL:e.ispSL,fuel:s.fuel,dry:s.dry};
  });
  let pos={x:EARTH_RADIUS,y:0},vel={x:0,y:465.1},mass=stageRT.reduce((a,s)=>a+s.fuel+s.dry,0)+payloadMass;
  let t=0,si=0,throttleLocked=false,throttle=1,maxAlt=0,outcome=null,dvUsed=0,lastSpeed=465.1;
  const DT=0.1, MAX_T=3600*48;
  while(t<MAX_T&&!outcome) {
    const st=stageRT[si]; if(!st){outcome="fuel_exhausted";break;}
    const mp=moonPos(t),r=mag(pos),alt=r-EARTH_RADIUS;
    if(alt>maxAlt) maxAlt=alt;
    const orb=alt>50000?orbElems(pos,vel):null;
    const pitch=pitchFn(alt,orb,pos,vel,t);
    if(alt>100000&&!throttleLocked&&orb&&orb.apoapsis>=MOON_DISTANCE){
      throttle=0;throttleLocked=true;outcome="mission_complete";break;
    }
    const af=Math.min(1,alt/100000);
    const eT=st.thrustSL+(st.thrustVac-st.thrustSL)*af;
    const eI=st.ispSL+(st.ispVac-st.ispSL)*af;
    let tv={x:0,y:0};
    if(st.fuel>0&&throttle>0) {
      const ct=eT*throttle, rd=norm(pos), pr=pitch*Math.PI/180;
      const td=rotate(rd,-pr); tv=scale(td,ct);
      const fr=ct/(eI*G0), fc=Math.min(fr*DT,st.fuel);
      st.fuel-=fc; mass-=fc;
    }
    if(st.fuel<=0&&si<stageRT.length-1){mass-=st.dry;si++;}
    const ns=rk4({pos,vel,mass},DT,tv,mp);
    pos=ns.pos;vel=ns.vel;mass=ns.mass;t+=DT;
    const speed=mag(vel);dvUsed+=Math.abs(speed-lastSpeed);lastSpeed=speed;
    if(mag(pos)-EARTH_RADIUS<0){outcome="crash";break;}
    if(mag(pos)-EARTH_RADIUS>1e9){outcome="escaped";break;}
  }
  if(!outcome) outcome="timeout";
  return {outcome,maxAlt,duration:t,dvUsed};
}

// Prograde tracking (current code)
function progradeTrack(alt,orb,pos,vel) {
  if(orb&&orb.periapsis>80000) return 90;
  if(!pos||!vel) return 0;
  const r=mag(pos);
  const vr=(vel.x*pos.x+vel.y*pos.y)/r;
  const vt=(-vel.x*pos.y+vel.y*pos.x)/r;
  const vtE=vt-465;
  if(alt<1000) return 0;
  if(alt<5000) return 3;
  return Math.max(0,Math.min(90, Math.atan2(Math.max(0,vtE),Math.max(1,vr))*180/Math.PI));
}

// Prograde + switch to 90° at altitude threshold
function progradePlus(switchAlt) {
  return (alt,orb,pos,vel) => {
    if(orb&&orb.periapsis>80000) return 90;
    if(alt>switchAlt) return 90;
    return progradeTrack(alt,orb,pos,vel);
  };
}

const ICONS = {mission_complete:"✅",crash:"💥",fuel_exhausted:"⛽",timeout:"⏱️",escaped:"🌌"};

// Test configs that might give 928km failure
const configs = [
  {label:"1×RaptorX / 100t fuel, 8t dry", stages:[{engineId:"raptor-x",count:1,fuel:100000,dry:8000}], pay:200},
  {label:"2×RaptorX / 200t fuel, 12t dry (S1) + TitanRL2 / 10t (S2)", stages:[{engineId:"raptor-x",count:2,fuel:200000,dry:12000},{engineId:"titan-rl2",count:1,fuel:10000,dry:1500}], pay:200},
  {label:"1×RaptorX / 200t fuel (S1) + TitanRL2 / 15t (S2)", stages:[{engineId:"raptor-x",count:1,fuel:200000,dry:10000},{engineId:"titan-rl2",count:1,fuel:15000,dry:1500}], pay:200},
  {label:"3×Spartan1 / 100t fuel (S1) + RaptorX / 50t (S2)", stages:[{engineId:"spartan-1",count:3,fuel:100000,dry:6000},{engineId:"raptor-x",count:1,fuel:50000,dry:4000}], pay:200},
  {label:"4×RaptorX / 300t fuel (S1) + TitanRL2 / 8t (S2)", stages:[{engineId:"raptor-x",count:4,fuel:300000,dry:18000},{engineId:"titan-rl2",count:1,fuel:8000,dry:1000}], pay:200},
];

console.log("Finding 928km crash pattern + testing prograde+alt fixes...\n");

for(const {label,stages,pay} of configs) {
  const lm = stages.reduce((a,s)=>a+s.fuel+s.dry,0)+pay;
  console.log(`🚀 ${label} (${(lm/1000).toFixed(0)}t)`);
  
  const tests = [
    ["PROGRADE TRACK", progradeTrack],
    ["PROGRADE+200km→90°", progradePlus(200_000)],
    ["PROGRADE+500km→90°", progradePlus(500_000)],
    ["PROGRADE+800km→90°", progradePlus(800_000)],
  ];
  
  for(const [name,fn] of tests) {
    const r=simulate(stages,pay,fn);
    const dur=`T+${String(Math.floor(r.duration/60)).padStart(2,"0")}:${String(Math.floor(r.duration%60)).padStart(2,"0")}`;
    const alt=r.maxAlt>1e6?`${(r.maxAlt/1e6).toFixed(1)}Mm`:`${(r.maxAlt/1e3).toFixed(0)}km`;
    console.log(`  ${ICONS[r.outcome]??'?'} [${name}] ${r.outcome} maxAlt=${alt} dur=${dur} dv=${r.dvUsed.toFixed(0)}`);
  }
  console.log();
}
