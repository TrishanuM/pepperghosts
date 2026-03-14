let buildings = [], drops = [], particles = [], mushroom = null;
let phase = 'city', blackAlpha = 0, cityAlpha = 255;
let W, H;
let lastAX = 0, lastAY = 0;
const SHAKE_THRESHOLD = 8;
let shakeIdleTimer = null;

let flashAlpha    = 0;
let flashBalls    = [];
let quakeAmt      = 0;
let orangeEngulf  = 0;
let dropFadeAlpha = 1.0;

let voronoiCells = [];
let fogAlpha     = 0;
let fogDir       = 0;
let fogSpeed     = 0.002;

let globalQuakeX = 0, globalQuakeY = 0;

let spaceHeld    = false;
let shakeActive  = false;
let bombInterval = null;
let bombsStopped = false;

let raidSound      = null;
let bellsSound     = null;
let audioCtx       = null;
let bellsConnected = false;
let bellsSrc       = null;
let bellsGain      = null;

const LAYERS = [
  { speed:1.6,  col:[200,210,240], win:[255,252,200], minH:90,  maxH:160, wR:[28,52], haze:0   },
  { speed:0.9,  col:[120,130,165], win:[220,230,255], minH:160, maxH:280, wR:[38,72], haze:0.3 },
  { speed:0.35, col:[60,68,98],    win:[160,180,240], minH:280, maxH:460, wR:[52,98], haze:0.6 },
];
const GY = () => H - 22;

// ─── VORONOI FOG ─────────────────────────────────────────────
function buildVoronoi() {
  voronoiCells = [];
  for (let i = 0; i < 130; i++) {
    voronoiCells.push({
      x: random(W), y: random(H),
      vx: random(-0.25, 0.25), vy: random(-0.18, 0.18),
      delay: random(0, 0.55), size: random(0.8, 1.5),
    });
  }
}

function drawVoronoiFog(alpha) {
  if (alpha <= 0) return;
  let dc = drawingContext;
  dc.save();
  for (let c of voronoiCells) {
    c.x += c.vx; c.y += c.vy;
    if (c.x < -80)  c.x = W + 80;
    if (c.x > W+80) c.x = -80;
    if (c.y < -80)  c.y = H + 80;
    if (c.y > H+80) c.y = -80;
    let localA = constrain((alpha - c.delay) / (1 - c.delay), 0, 1);
    if (localA <= 0) continue;
    let r = c.size * W * 0.13;
    let rg = dc.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
    rg.addColorStop(0,    `rgba(205,210,220,${localA * 0.74})`);
    rg.addColorStop(0.38, `rgba(185,192,205,${localA * 0.52})`);
    rg.addColorStop(0.72, `rgba(165,172,188,${localA * 0.28})`);
    rg.addColorStop(1,    `rgba(145,155,172,0)`);
    dc.fillStyle = rg;
    dc.beginPath(); dc.arc(c.x, c.y, r, 0, Math.PI * 2); dc.fill();
  }
  dc.restore();
}

// ─── PRELOAD ─────────────────────────────────────────────────
function preload() {
  raidSound = document.createElement('audio');
  raidSound.src = 'raid.mp3';
  raidSound.loop = true;
  raidSound.volume = 0.8;
  document.body.appendChild(raidSound);

  bellsSound = document.createElement('audio');
  bellsSound.src = 'bells.mp3';
  bellsSound.loop = true;
  bellsSound.volume = 0.7;
  document.body.appendChild(bellsSound);
}

// ─── BELLS HELPERS ───────────────────────────────────────────
function connectBellsToCtx() {
  if (bellsConnected || !audioCtx || !bellsSound) return;
  bellsConnected = true;
  bellsSrc  = audioCtx.createMediaElementSource(bellsSound);
  bellsGain = audioCtx.createGain();
  bellsGain.gain.value = 1.0;
  bellsSrc.connect(bellsGain);
  bellsGain.connect(audioCtx.destination);
}

function fadeBellsOut(duration) {
  if (!bellsSound || bellsSound.paused) return;
  let steps = 30, startVol = bellsSound.volume, i = 0;
  let iv = setInterval(()=>{
    i++;
    bellsSound.volume = Math.max(0, startVol * (1 - i / steps));
    if (i >= steps) {
      bellsSound.pause();
      bellsSound.volume = startVol;
      clearInterval(iv);
    }
  }, duration / steps);
}

function fadeBellsIn(targetVol, duration) {
  bellsSound.playbackRate = 1.0;
  bellsSound.volume = 0;
  bellsSound.play().catch(e => console.warn(e));
  let steps = 30, i = 0;
  let iv = setInterval(()=>{
    i++;
    bellsSound.volume = Math.min(targetVol, targetVol * (i / steps));
    if (i >= steps) clearInterval(iv);
  }, duration / steps);
}

// ─── SETUP ───────────────────────────────────────────────────
function setup() {
  W = windowWidth; H = windowHeight;
  let cnv = createCanvas(W, H);
  cnv.style('position', 'fixed');
  cnv.style('top', '0');
  cnv.style('left', '0');
  cnv.style('z-index', '0');
  buildCity();
  buildVoronoi();
  registerMotion();
}

// ─── DRAW ────────────────────────────────────────────────────
function draw() {
  background(0);
  const gy = GY();

  if (mushroom || phase === 'fadeblack') {
    globalQuakeX = (random() - 0.5) * 22;
    globalQuakeY = (random() - 0.5) * 12;
  } else {
    globalQuakeX *= 0.98;
    globalQuakeY *= 0.98;
  }

  let qx = globalQuakeX, qy = globalQuakeY;
  if (quakeAmt > 0) {
    qx += (random() - 0.5) * quakeAmt * 28;
    qy += (random() - 0.5) * quakeAmt * 14;
    quakeAmt = max(0, quakeAmt - 0.012);
  }

  if (fogDir !== 0) {
    fogAlpha = constrain(fogAlpha + fogDir * fogSpeed, 0, 1);
    if (fogAlpha >= 1) fogDir = 0;
    if (fogAlpha <= 0) fogDir = 0;
  }

  if (mushroom) drawCloud(gy);

  drawFlashBalls();

  // mask everything below ground
  drawingContext.fillStyle = 'rgba(0,0,0,1)';
  drawingContext.fillRect(0, gy, W, H - gy);

  // black silhouette on buildings during flash and mushroom
  if (phase === 'flashbang' || phase === 'mushroom') {
    let silAlpha = (phase === 'flashbang') ? min(flashAlpha * 2, 1) : 1.0;
    drawBuildingSilhouettes(gy, silAlpha);
  }

  if (orangeEngulf > 0) {
    let dc = drawingContext;
    let engulfY = (mushroom && mushroom.engulfY) ? mushroom.engulfY : gy;
    let r = orangeEngulf * W * 1.6;
    let og = dc.createRadialGradient(W*0.5, engulfY, 0, W*0.5, engulfY, r);
    og.addColorStop(0,    `rgba(255,220,80,${min(orangeEngulf*2, 0.85)})`);
    og.addColorStop(0.25, `rgba(255,120,10,${min(orangeEngulf*1.8, 0.7)})`);
    og.addColorStop(0.55, `rgba(180,40,0,${min(orangeEngulf*1.4, 0.55)})`);
    og.addColorStop(0.8,  `rgba(60,10,0,${min(orangeEngulf, 0.45)})`);
    og.addColorStop(1,    'rgba(0,0,0,0)');
    dc.fillStyle = og; dc.fillRect(0, 0, W, H);
  }

  translate(qx, qy);
  drawAtmosphere(gy);
  drawDrops(gy);
  scrollAndDrawBuildings(gy);
  drawGround(gy);
  updateParticles();
  resetMatrix();

  if (fogAlpha > 0) drawVoronoiFog(fogAlpha);

  if (flashAlpha > 0) {
    let dc = drawingContext;
    let fg = dc.createRadialGradient(W*0.5, gy, 0, W*0.5, gy, W*0.9);
    fg.addColorStop(0,    `rgba(255,255,220,${flashAlpha})`);
    fg.addColorStop(0.15, `rgba(255,200,80,${flashAlpha*0.95})`);
    fg.addColorStop(0.4,  `rgba(255,100,10,${flashAlpha*0.7})`);
    fg.addColorStop(0.7,  `rgba(180,40,0,${flashAlpha*0.4})`);
    fg.addColorStop(1,    'rgba(0,0,0,0)');
    dc.fillStyle = fg; dc.fillRect(0, 0, W, H);
    flashAlpha = max(0, flashAlpha - 0.035);
  }

  applyBlackOverlay();
}

// ─── FLASH BALLS ─────────────────────────────────────────────
function spawnFlashBalls(gy) {
  let cx = W * 0.5;
  flashBalls = [
    { x: cx,          y: gy, r:0, maxR:W*0.60, vy:-5.5, life:1.0, decay:0.018, style:'white'  },
    { x: cx - W*0.07, y: gy, r:0, maxR:W*0.44, vy:-3.8, life:1.0, decay:0.022, style:'orange' },
    { x: cx + W*0.07, y: gy, r:0, maxR:W*0.34, vy:-2.6, life:1.0, decay:0.026, style:'red'    },
  ];
}

function drawFlashBalls() {
  if (flashBalls.length === 0) return;
  let dc = drawingContext;
  let anyAlive = false;
  for (let fb of flashBalls) {
    if (fb.life <= 0) continue;
    anyAlive = true;
    fb.r    = min(fb.r + fb.maxR * 0.048, fb.maxR);
    fb.y   += fb.vy; fb.vy *= 0.93;
    fb.life -= fb.decay;
    let a = max(0, fb.life);
    let rg = dc.createRadialGradient(fb.x, fb.y, 0, fb.x, fb.y, fb.r);
    if (fb.style === 'white') {
      rg.addColorStop(0,    `rgba(255,255,255,${a})`);
      rg.addColorStop(0.08, `rgba(255,255,200,${a})`);
      rg.addColorStop(0.22, `rgba(255,220,60,${a*0.97})`);
      rg.addColorStop(0.45, `rgba(255,140,10,${a*0.85})`);
      rg.addColorStop(0.72, `rgba(220,60,0,${a*0.55})`);
      rg.addColorStop(1,    `rgba(140,20,0,0)`);
    } else if (fb.style === 'orange') {
      rg.addColorStop(0,    `rgba(255,220,40,${a*0.98})`);
      rg.addColorStop(0.2,  `rgba(255,140,10,${a*0.92})`);
      rg.addColorStop(0.5,  `rgba(230,60,0,${a*0.72})`);
      rg.addColorStop(0.8,  `rgba(150,20,0,${a*0.38})`);
      rg.addColorStop(1,    `rgba(80,0,0,0)`);
    } else {
      rg.addColorStop(0,    `rgba(255,120,10,${a*0.95})`);
      rg.addColorStop(0.3,  `rgba(220,40,0,${a*0.80})`);
      rg.addColorStop(0.65, `rgba(140,10,0,${a*0.45})`);
      rg.addColorStop(1,    `rgba(60,0,0,0)`);
    }
    dc.fillStyle = rg;
    dc.beginPath(); dc.arc(fb.x, fb.y, fb.r, 0, Math.PI*2); dc.fill();
  }
  if (!anyAlive) flashBalls = [];
}

// ─── ATMOSPHERE ──────────────────────────────────────────────
function drawAtmosphere(gy) {
  let dc = drawingContext;
  let grad = dc.createLinearGradient(0, gy - H*0.4, 0, gy);
  grad.addColorStop(0,   'rgba(0,0,0,0)');
  grad.addColorStop(0.6, 'rgba(15,18,35,0.4)');
  grad.addColorStop(1,   'rgba(25,28,55,0.7)');
  dc.fillStyle = grad;
  dc.fillRect(0, gy - H*0.4, W, H*0.4);
}

// ─── GROUND ──────────────────────────────────────────────────
function drawGround(gy) {
  let dc = drawingContext;
  let grad = dc.createLinearGradient(0, gy, 0, gy + 65);
  grad.addColorStop(0,    'rgba(100,105,122,1)');
  grad.addColorStop(0.12, 'rgba(78,82,96,1)');
  grad.addColorStop(0.45, 'rgba(45,47,58,1)');
  grad.addColorStop(1,    'rgba(0,0,0,1)');
  dc.fillStyle = grad; dc.fillRect(0, gy, W, 65);
  dc.fillStyle = 'rgba(165,172,198,0.68)';
  dc.fillRect(0, gy, W, 1.5);
  dc.strokeStyle = 'rgba(115,120,140,0.16)';
  dc.lineWidth = 1;
  for (let li = 0; li < 5; li++) {
    let ly = gy + 9 + li * 11;
    dc.beginPath(); dc.moveTo(0, ly); dc.lineTo(W, ly); dc.stroke();
  }
  let glow = dc.createLinearGradient(0, gy+2, 0, gy+60);
  glow.addColorStop(0, 'rgba(60,70,120,0.20)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  dc.fillStyle = glow; dc.fillRect(0, gy+2, W, 58);
}

// ─── DROPS ───────────────────────────────────────────────────
function drawDrops(gy) {
  if (drops.length === 0) return;
  noStroke();
  for (let i = 0; i < drops.length; i++) {
    let d = drops[i];
    d.vy += 0.005;
    d.y  += d.vy;
    d.x  += sin(frameCount * 0.03 + d.wobble) * 0.3;
    if (d.y > gy - 10) {
      d.y  = random(-180, -20);
      d.x  = random(W * 0.05, W * 0.95);
      d.vy = random(0.2, 0.6);
    }
    let pulse = (0.8 + 0.2 * sin(frameCount * 0.14 + d.wobble)) * dropFadeAlpha;
    fill(180,   0,   0,  30 * pulse); ellipse(d.x, d.y, 28);
    fill(220,  20,  20,  80 * pulse); ellipse(d.x, d.y, 14);
    fill(255,  60,  60, 240 * pulse); ellipse(d.x, d.y,  6);
    fill(255, 200, 200, 200 * pulse); ellipse(d.x, d.y,  2.5);
  }
}

// ─── PARTICLES ───────────────────────────────────────────────
function updateParticles() {
  noStroke();
  for (let i = particles.length - 1; i >= 0; i--) {
    let pt = particles[i];
    pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.2; pt.vx *= 0.97;
    pt.life -= pt.decay;
    fill(pt.r, pt.g, pt.b, pt.life);
    ellipse(pt.x, pt.y, pt.size);
    if (pt.life <= 0) particles.splice(i, 1);
  }
}

// ─── SILHOUETTES ─────────────────────────────────────────────
function drawBuildingSilhouettes(gy, alpha) {
  let dc = drawingContext;
  dc.save();
  dc.fillStyle = `rgba(0,0,0,${alpha * 0.92})`;
  for (let li = buildings.length - 1; li >= 0; li--) {
    let layer = buildings[li];
    for (let tx = layer.ox; tx < W; tx += layer.tw) {
      for (let b of layer.arr) {
        let bx = tx + b.x;
        if (bx + b.bw < 0 || bx > W) continue;
        dc.fill(getBuildingPath(b, bx, gy));
      }
    }
  }
  dc.restore();
}

// ─── BUILDING PATH ───────────────────────────────────────────
function getBuildingPath(b, bx, gy) {
  let bw = b.bw, bh = b.bh, by = gy - bh;
  let p = new Path2D();
  if (b.type === 0) {
    p.rect(bx, by, bw, bh);
    let sw = bw*0.55, so = (bw-sw)*0.5;
    p.rect(bx+so, by-bh*0.07, sw, bh*0.07);
    p.rect(bx+so*0.6, by-bh*0.035, bw*0.7, bh*0.035);
  } else if (b.type === 1) {
    let tp = bw*0.16;
    p.moveTo(bx, gy); p.lineTo(bx+bw, gy);
    p.lineTo(bx+bw-tp, by); p.lineTo(bx+bw*0.5, by-bh*0.22);
    p.lineTo(bx+tp, by); p.closePath();
  } else if (b.type === 2) {
    for (let ti = 0; ti < 4; ti++) {
      let fr = ti/4, tw = bw*(1-fr*0.42), th = bh*0.28;
      p.rect(bx+(bw-tw)*0.5, gy-th*(ti+1), tw, th);
    }
  } else if (b.type === 3) {
    let bw2=bw*0.78, ox=bx+bw*0.11, bodyTop=by+bh*0.1;
    let cx2=ox+bw2*0.5, ry=bh*0.1;
    p.rect(ox, bodyTop, bw2, bh*0.9);
    p.moveTo(ox, bodyTop);
    p.ellipse(cx2, bodyTop, bw2*0.5, ry, 0, Math.PI, 0, true);
    p.closePath();
    p.rect(cx2-1.5, by-bh*0.14, 3, bodyTop-(by-bh*0.14));
  } else if (b.type === 4) {
    let tw=bw*0.41;
    p.rect(bx, by, tw, bh); p.rect(bx+bw-tw, by, tw, bh);
    p.rect(bx+tw, gy-bh*0.62, bw-tw*2, bh*0.07);
    p.rect(bx+tw*0.28, by-bh*0.045, tw*0.44, bh*0.045);
    p.rect(bx+bw-tw*0.72, by-bh*0.045, tw*0.44, bh*0.045);
  } else if (b.type === 5) {
    for (let si = 0; si < 5; si++) {
      let fr=si/5, sw=bw*(1-fr*0.52), sh=bh/5;
      p.rect(bx+(bw-sw)*0.5, gy-sh*(si+1), sw, sh);
    }
  } else if (b.type === 6) {
    let mw=bw*0.58, ww=bw*0.52, wh=bh*0.48;
    p.rect(bx, by, mw, bh); p.rect(bx+mw*0.35, gy-wh, ww, wh);
    let pw=mw*0.5, ph=bh*0.1;
    p.rect(bx+(mw-pw)*0.5, by-ph, pw, ph);
  } else if (b.type === 7) {
    let base=bw, top=bw*0.22;
    p.moveTo(bx, gy); p.lineTo(bx+base, gy);
    p.quadraticCurveTo(bx+base+base*0.05, gy-bh*0.3, bx+base/2+top/2, by);
    p.lineTo(bx+base/2, by-bh*0.17);
    p.lineTo(bx+base/2-top/2, by);
    p.quadraticCurveTo(bx-base*0.05, gy-bh*0.3, bx, gy);
    p.closePath();
  } else if (b.type === 8) {
    let cf=b.cutFrac;
    p.moveTo(bx, gy); p.lineTo(bx+bw, gy);
    p.lineTo(bx+bw, by+bh*(1-cf)); p.lineTo(bx, by); p.closePath();
  } else if (b.type === 9) {
    let nw=bw*0.28, nh=bh*0.22;
    p.moveTo(bx, gy); p.lineTo(bx+bw, gy);
    p.lineTo(bx+bw, by+nh); p.lineTo(bx+bw-nw, by+nh);
    p.lineTo(bx+bw-nw, by); p.lineTo(bx+nw, by);
    p.lineTo(bx+nw, by+nh); p.lineTo(bx, by+nh); p.closePath();
  } else if (b.type === 10) {
    let ch=bh*0.12, cw=bw*0.18;
    p.moveTo(bx+cw, by); p.lineTo(bx+bw-cw, by);
    p.lineTo(bx+bw, by+ch); p.lineTo(bx+bw, gy);
    p.lineTo(bx, gy); p.lineTo(bx, by+ch); p.closePath();
  } else {
    for (let ti = 0; ti < 3; ti++) {
      let fr=ti/3, tw=bw*(1-fr*0.3), th=bh*0.36;
      let ty=gy-th*(ti+1), flare=tw*0.06;
      p.moveTo(bx+(bw-tw)*0.5-flare, ty+th);
      p.lineTo(bx+(bw-tw)*0.5+tw+flare, ty+th);
      p.lineTo(bx+(bw-tw)*0.5+tw, ty);
      p.lineTo(bx+(bw-tw)*0.5, ty);
      p.closePath();
    }
  }
  return p;
}

// ─── DRAW BUILDING ───────────────────────────────────────────
function drawBuilding(b, bx, gy, cfg, alpha, layerIndex) {
  let dc = drawingContext;
  let col=cfg.col, winCol=cfg.win, haze=cfg.haze;
  let bh=b.bh, by=gy-bh;
  let a = alpha/255 * (1 - haze*0.5);
  let path = getBuildingPath(b, bx, gy);

  dc.save();
  dc.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`;
  dc.fill(path);

  let grad = dc.createLinearGradient(bx, by, bx+b.bw, gy);
  grad.addColorStop(0,   `rgba(255,255,255,${0.08*a})`);
  grad.addColorStop(0.4, 'rgba(255,255,255,0)');
  grad.addColorStop(1,   `rgba(0,0,0,${0.12*a})`);
  dc.fillStyle = grad; dc.fill(path);

  let rimGrad = dc.createLinearGradient(bx, by-2, bx, by+bh*0.06);
  rimGrad.addColorStop(0, `rgba(255,255,255,${0.22*a})`);
  rimGrad.addColorStop(1, 'rgba(255,255,255,0)');
  dc.fillStyle = rimGrad; dc.fill(path);

  dc.clip(path);
  for (let win of b.windows) {
    let wx=bx+win.c*11+3, wy=gy-bh+win.r*15+4;
    if (win.on) {
      dc.fillStyle = `rgba(${winCol[0]+win.warm},${winCol[1]+win.warm*0.5},${winCol[2]-win.warm*2},${min(a,0.92)})`;
      dc.fillRect(wx, wy, 5, 7);
      dc.fillStyle = `rgba(${winCol[0]},${winCol[1]},${winCol[2]},${0.12*a})`;
      dc.fillRect(wx-2, wy-2, 9, 11);
    } else {
      dc.fillStyle = `rgba(${col[0]*0.45|0},${col[1]*0.45|0},${col[2]*0.6|0},${a*0.9})`;
      dc.fillRect(wx, wy, 5, 7);
      if (win.reflect) { dc.fillStyle=`rgba(180,190,220,${0.06*a})`; dc.fillRect(wx,wy,5,7); }
    }
  }
  dc.restore();

  if (layerIndex === 2) {
    let tipX=null, tipY=null;
    if (b.type===1) { tipX=bx+b.bw*0.5; tipY=by-bh*0.22; }
    else if (b.type===3) {
      let cx2=bx+b.bw*0.11+b.bw*0.78*0.5;
      dc.save(); dc.strokeStyle=`rgba(${col[0]},${col[1]},${col[2]},${a})`; dc.lineWidth=2;
      dc.beginPath(); dc.moveTo(cx2,by+b.bh*0.1); dc.lineTo(cx2,by-b.bh*0.14); dc.stroke(); dc.restore();
      tipX=cx2; tipY=by-bh*0.14;
    }
    else if (b.type===7) { tipX=bx+b.bw*0.5; tipY=by-bh*0.17; }
    else if (b.type===0 && b.bh>260) { tipX=bx+b.bw*0.5; tipY=by-bh*0.07; }
    if (tipX!==null && (frameCount%90)<60) {
      dc.save();
      let rg=dc.createRadialGradient(tipX,tipY,0,tipX,tipY,8);
      rg.addColorStop(0,`rgba(255,60,60,${0.7*a})`); rg.addColorStop(1,'rgba(255,0,0,0)');
      dc.fillStyle=rg; dc.beginPath(); dc.arc(tipX,tipY,8,0,Math.PI*2); dc.fill();
      dc.fillStyle=`rgba(255,80,80,${0.95*a})`; dc.beginPath(); dc.arc(tipX,tipY,2.5,0,Math.PI*2); dc.fill();
      dc.restore();
    }
  }
}

function scrollAndDrawBuildings(gy) {
  for (let li=buildings.length-1; li>=0; li--) {
    let layer=buildings[li], cfg=LAYERS[li];
    if (phase==='city'||phase==='bombing') {
      layer.ox -= cfg.speed;
      if (layer.ox <= -layer.tw) layer.ox += layer.tw;
    }
    for (let tx=layer.ox; tx<W; tx+=layer.tw) {
      for (let b of layer.arr) {
        let bx=tx+b.x;
        if (bx+b.bw<0||bx>W) continue;
        drawBuilding(b, bx, gy, cfg, cityAlpha, li);
      }
    }
  }
}

// ─── MUSHROOM CLOUD ──────────────────────────────────────────
function growEase(v) { return 1 - Math.exp(-v/40); }

function drawCloud(gy) {
  let dc = drawingContext;
  mushroom.t++;
  let t = mushroom.t;

  let stemH = H*0.82 * growEase(t);
  let stemW = 70     * growEase(t*1.15);
  let capR  = W*0.44 * growEase(t*0.75);
  let capY  = mushroom.baseY - stemH;
  let mx    = mushroom.x;

  if (t < 80) quakeAmt = max(quakeAmt, (1-t/80)*0.8);
  if (t > 160 && phase==='mushroom') {
    orangeEngulf = min(1,(t-160)/120);
    mushroom.engulfY = mushroom.baseY - stemH * 0.5;
  }
  if (orangeEngulf>=1 && phase==='mushroom') phase='fadeblack';
  if (phase==='flashbang' && flashAlpha<0.6) phase='mushroom';

  let alpha = 255;
  if (t > 80) alpha = max(0, 255-(t-80)*2.5);
  let a = alpha/255;
  if (a<=0) return;

  if (t < 30) {
    let gr=t*16, gf=(1-t/30);
    let fg=dc.createRadialGradient(mx,gy,0,mx,gy,gr);
    fg.addColorStop(0,    `rgba(255,255,255,${gf*a})`);
    fg.addColorStop(0.18, `rgba(255,255,80,${gf*a})`);
    fg.addColorStop(0.48, `rgba(255,180,0,${gf*0.97*a})`);
    fg.addColorStop(0.75, `rgba(255,70,0,${gf*0.82*a})`);
    fg.addColorStop(1,    'rgba(210,15,0,0)');
    dc.fillStyle=fg; dc.beginPath(); dc.ellipse(mx,gy,gr,gr*0.32,0,0,Math.PI*2); dc.fill();
  }

  if (t < 80) {
    let fireR = stemW*3.4*(t/80);
    for (let fi=0; fi<12; fi++) {
      let fx=mx+sin(fi*1.1+t*0.08)*fireR*0.58;
      let fy=gy-fireR*0.1*fi*0.2;
      let fr3=fireR*(0.36+fi*0.08);
      let fg2=dc.createRadialGradient(fx,fy,0,fx,fy,fr3);
      fg2.addColorStop(0,   `rgba(255,245,50,${(1-fi*0.075)*a*0.94})`);
      fg2.addColorStop(0.28,`rgba(255,120,0,${(1-fi*0.075)*a*0.86})`);
      fg2.addColorStop(0.6, `rgba(230,35,0,${(1-fi*0.075)*a*0.6})`);
      fg2.addColorStop(1,   'rgba(130,5,0,0)');
      dc.fillStyle=fg2; dc.beginPath(); dc.ellipse(fx,fy,fr3,fr3*0.55,0,0,Math.PI*2); dc.fill();
    }
  }

  let midY=mushroom.baseY-stemH*0.42, waistW=stemW*0.28;
  let stemGrad=dc.createLinearGradient(mx,mushroom.baseY,mx,capY);
  stemGrad.addColorStop(0,    `rgba(255,185,25,${0.96*a})`);
  stemGrad.addColorStop(0.15, `rgba(255,140,15,${0.93*a})`);
  stemGrad.addColorStop(0.38, `rgba(225,95,22,${0.89*a})`);
  stemGrad.addColorStop(0.62, `rgba(185,72,32,${0.85*a})`);
  stemGrad.addColorStop(1,    `rgba(140,72,48,${0.78*a})`);
  let slices=30;
  let lp=new Path2D();
  for (let i=0; i<slices; i++) {
    let fr=i/slices, fr2=(i+1)/slices;
    let y1=lerp(mushroom.baseY,midY,fr),  y2=lerp(mushroom.baseY,midY,fr2);
    let n1=sin(fr*8+t*0.06)*stemW*0.07,   n2=sin(fr2*8+t*0.06)*stemW*0.07;
    let w1=lerp(stemW*0.82,waistW,fr)+n1, w2=lerp(stemW*0.82,waistW,fr2)+n2;
    lp.moveTo(mx-w1,y1); lp.lineTo(mx+w1,y1); lp.lineTo(mx+w2,y2); lp.lineTo(mx-w2,y2); lp.closePath();
  }
  dc.fillStyle=stemGrad; dc.fill(lp);

  let up=new Path2D();
  for (let i=0; i<slices; i++) {
    let fr=i/slices, fr2=(i+1)/slices;
    let y1=lerp(midY,capY,fr),             y2=lerp(midY,capY,fr2);
    let n1=sin(fr*10+t*0.07+2)*stemW*0.08, n2=sin(fr2*10+t*0.07+2)*stemW*0.08;
    let w1=lerp(waistW,stemW*0.74,fr)+n1,  w2=lerp(waistW,stemW*0.74,fr2)+n2;
    up.moveTo(mx-w1,y1); up.lineTo(mx+w1,y1); up.lineTo(mx+w2,y2); up.lineTo(mx-w2,y2); up.closePath();
  }
  let upperGrad=dc.createLinearGradient(mx,midY,mx,capY);
  upperGrad.addColorStop(0,  `rgba(185,95,38,${0.90*a})`);
  upperGrad.addColorStop(0.5,`rgba(158,82,45,${0.84*a})`);
  upperGrad.addColorStop(1,  `rgba(130,78,55,${0.78*a})`);
  dc.fillStyle=upperGrad; dc.fill(up);

  for (let i=0; i<14; i++) {
    let fr=(i+0.5)/14;
    let sy=lerp(mushroom.baseY,capY,fr*0.88);
    let spread=lerp(stemW*0.82,waistW,min(fr*2,1))+stemW*0.36;
    if (fr>0.5) spread=lerp(waistW,stemW*0.74,(fr-0.5)*2)+stemW*0.33;
    let rr=stemW*(0.22+0.12*sin(t*0.04+i));
    let lv=round(lerp(200,95,fr)), sv=round(lerp(90,35,fr));
    for (let side of [-1,1]) {
      let rg=dc.createRadialGradient(mx+side*spread,sy,0,mx+side*spread,sy,rr);
      rg.addColorStop(0,`rgba(${lv+sv},${lv},${max(0,lv-sv*2)},${0.64*a})`);
      rg.addColorStop(1,`rgba(${lv-25},${lv-35},${max(0,lv-55)},0)`);
      dc.fillStyle=rg; dc.beginPath(); dc.arc(mx+side*spread,sy,rr,0,Math.PI*2); dc.fill();
    }
  }

  if (t<110) {
    let ringR=t*7.5, ringA=max(0,0.92-t/110);
    dc.strokeStyle=`rgba(255,245,100,${ringA*0.96*a})`; dc.lineWidth=5;
    dc.beginPath(); dc.ellipse(mx,gy,ringR,ringR*0.22,0,0,Math.PI*2); dc.stroke();
    dc.strokeStyle=`rgba(255,180,50,${ringA*0.6*a})`; dc.lineWidth=2.5;
    dc.beginPath(); dc.ellipse(mx,gy,ringR*0.74,ringR*0.18,0,0,Math.PI*2); dc.stroke();
    dc.strokeStyle=`rgba(220,240,255,${max(0,ringA*0.28)*a})`; dc.lineWidth=1.5;
    dc.beginPath(); dc.ellipse(mx,gy,ringR*1.32,ringR*0.16,0,0,Math.PI*2); dc.stroke();
  }

  for (let pass=0; pass<3; pass++) {
    let pOff=pass*capR*0.09;
    for (let i=0; i<22; i++) {
      let frac=i/22, angle=frac*Math.PI;
      let cr=capR*(0.22+0.78*Math.sin(angle))+pOff;
      let cy=capY-capR*0.44+capR*0.88*frac+pOff*0.3;
      let lit=frac<0.5?frac*2:(1-frac)*2;
      let bR=lerp(115,235,lit)*lerp(1,0.65,pass/3);
      let bG=lerp(52,148,lit*0.72)*lerp(1,0.55,pass/3);
      let bB=lerp(8,48,lit*0.18)*lerp(1,0.42,pass/3);
      dc.fillStyle=`rgba(${round(bR)},${round(bG)},${round(bB)},${(0.58+lit*0.38)*a*lerp(0.94,0.52,pass/3)})`;
      dc.beginPath(); dc.ellipse(mx,cy,cr,cr*0.78,0,0,Math.PI*2); dc.fill();
    }
  }

  for (let i=0; i<26; i++) {
    let ang=(i/26)*Math.PI*2, ph2=t*0.035+i*0.45;
    let kr=capR*(0.65+0.18*Math.sin(ph2));
    let kx=mx+Math.cos(ang)*kr*0.88, ky=capY-capR*0.06+Math.sin(ang)*kr*0.44;
    let ks=capR*(0.1+0.065*Math.sin(t*0.055+i*1.1));
    let lv2=round(155+55*Math.sin(t*0.025+i));
    let kg=dc.createRadialGradient(kx,ky,0,kx,ky,ks);
    kg.addColorStop(0,   `rgba(${lv2+55},${lv2+8},${max(0,lv2-70)},${0.84*a})`);
    kg.addColorStop(0.55,`rgba(${lv2+10},${lv2-18},${max(0,lv2-95)},${0.56*a})`);
    kg.addColorStop(1,   `rgba(${lv2-45},${lv2-55},${max(0,lv2-110)},0)`);
    dc.fillStyle=kg; dc.beginPath(); dc.arc(kx,ky,ks,0,Math.PI*2); dc.fill();
  }

  let fbA=Math.min(1,t/18)*a;
  if (fbA>0) {
    let r1=capR*min(0.30,t*0.006), y1f=capY-t*0.55;
    let g1=dc.createRadialGradient(mx,y1f,0,mx,y1f,r1);
    g1.addColorStop(0,    `rgba(255,255,255,${fbA})`);
    g1.addColorStop(0.1,  `rgba(255,255,140,${fbA})`);
    g1.addColorStop(0.32, `rgba(255,210,15,${fbA*0.99})`);
    g1.addColorStop(0.65, `rgba(255,85,0,${fbA*0.78})`);
    g1.addColorStop(1,    `rgba(210,15,0,0)`);
    dc.fillStyle=g1; dc.beginPath(); dc.arc(mx,y1f,r1,0,Math.PI*2); dc.fill();

    let r2=capR*min(0.43,t*0.009), y2f=capY-t*0.32;
    let g2=dc.createRadialGradient(mx,y2f,0,mx,y2f,r2);
    g2.addColorStop(0,    `rgba(255,225,35,${fbA*0.99})`);
    g2.addColorStop(0.16, `rgba(255,135,5,${fbA*0.97})`);
    g2.addColorStop(0.46, `rgba(245,45,0,${fbA*0.90})`);
    g2.addColorStop(0.76, `rgba(175,12,0,${fbA*0.52})`);
    g2.addColorStop(1,    `rgba(80,5,0,0)`);
    dc.fillStyle=g2; dc.beginPath(); dc.arc(mx,y2f,r2,0,Math.PI*2); dc.fill();

    let r3=capR*min(0.55,t*0.013), y3f=capY-t*0.14;
    let g3=dc.createRadialGradient(mx,y3f,0,mx,y3f,r3);
    g3.addColorStop(0,    `rgba(255,125,5,${fbA*0.98})`);
    g3.addColorStop(0.2,  `rgba(245,45,0,${fbA*0.95})`);
    g3.addColorStop(0.5,  `rgba(195,12,0,${fbA*0.78})`);
    g3.addColorStop(0.78, `rgba(115,5,0,${fbA*0.40})`);
    g3.addColorStop(1,    `rgba(40,0,0,0)`);
    dc.fillStyle=g3; dc.beginPath(); dc.arc(mx,y3f,r3,0,Math.PI*2); dc.fill();
  }

  let anvilR=capR*(0.9+growEase(t)*0.6), anvilY=capY-capR*0.34;
  let ag=dc.createRadialGradient(mx,anvilY,anvilR*0.2,mx,anvilY,anvilR);
  ag.addColorStop(0,   `rgba(218,172,88,${0.70*a})`);
  ag.addColorStop(0.5, `rgba(188,142,70,${0.50*a})`);
  ag.addColorStop(1,   'rgba(120,90,50,0)');
  dc.fillStyle=ag; dc.beginPath(); dc.ellipse(mx,anvilY,anvilR,anvilR*0.19,0,0,Math.PI*2); dc.fill();
  for (let i=0; i<16; i++) {
    let ax=mx+(((i/16)*2-1)*anvilR*0.84);
    let ay=anvilY+sin(i*0.9)*anvilR*0.07;
    let ar=anvilR*(0.07+0.04*sin(t*0.02+i));
    let ag2=dc.createRadialGradient(ax,ay,0,ax,ay,ar);
    ag2.addColorStop(0,`rgba(228,188,115,${(0.52+0.1*sin(i))*a})`);
    ag2.addColorStop(1,'rgba(170,135,78,0)');
    dc.fillStyle=ag2; dc.beginPath(); dc.arc(ax,ay,ar,0,Math.PI*2); dc.fill();
  }

  if (t<105) {
    let gi=1-t/105;
    let gg=dc.createRadialGradient(mx,gy,0,mx,gy,stemW*4.2);
    gg.addColorStop(0,   `rgba(255,168,18,${gi*0.65*a})`);
    gg.addColorStop(0.4, `rgba(255,75,0,${gi*0.32*a})`);
    gg.addColorStop(1,   'rgba(0,0,0,0)');
    dc.fillStyle=gg; dc.beginPath(); dc.ellipse(mx,gy,stemW*4.2,stemW*1.2,0,0,Math.PI*2); dc.fill();
  }

  if (t%2===0 && t<135) {
    for (let i=0; i<7; i++) {
      particles.push({
        x: mx+random(-stemW*0.65,stemW*0.65), y: capY+random(0,stemH*0.52),
        vx: random(-2.8,2.8), vy: random(-5.5,-1.2),
        r:255, g:round(random(110,255)), b:round(random(0,35)),
        size: random(1.5,7.5), life: random(60,165), decay: random(1.8,3.2)
      });
    }
  }
}

// ─── FADE OVERLAY ────────────────────────────────────────────
function applyBlackOverlay() {
  if (phase==='fadeblack') {
    blackAlpha = min(blackAlpha+1.5, 255);
    fill(8,3,2,blackAlpha); noStroke(); rect(0,0,W,H);
    if (blackAlpha>=255) {
      raidSound.pause();
      raidSound.currentTime = 0;
      raidSound.volume = 0.8;
      bellsSound.pause();
      bellsSound.currentTime = 0;
      bellsSound.playbackRate = 1.0;
      bellsSound.volume = 0.7;
      phase='fadein'; cityAlpha=0; orangeEngulf=0;
      mushroom=null; particles=[]; drops=[]; flashBalls=[];
      bombsStopped=false; dropFadeAlpha=1.0;
      globalQuakeX=0; globalQuakeY=0;
      buildCity();
      buildVoronoi(); fogAlpha=1.0; fogDir=-1; fogSpeed=0.004;
      setTimeout(()=>{ fadeBellsIn(0.7, 3000); }, 1000);
    }
  } else if (phase==='fadein') {
    blackAlpha = max(blackAlpha-0.9, 0);
    cityAlpha  = round(map(blackAlpha,255,0,0,255));
    fill(8,3,2,blackAlpha); noStroke(); rect(0,0,W,H);
    if (blackAlpha<=0) { phase='city'; cityAlpha=255; }
  }
}

// ─── MEDIA ───────────────────────────────────────────────────
function fadeOutRaid() {
  if (!raidSound || raidSound.paused) return;
  let fade = setInterval(()=>{
    if (raidSound.volume > 0.05) {
      raidSound.volume = Math.max(0, raidSound.volume - 0.05);
    } else {
      raidSound.volume = 0;
      raidSound.pause();
      raidSound.currentTime = 0;
      raidSound.volume = 0.8;
      clearInterval(fade);
    }
  }, 80);
}

// ─── BOMB SPAWNING ───────────────────────────────────────────
function spawnBomb() {
  if (bombsStopped) return;
  let bx;
  if (random() < 0.6) {
    bx = random(W * 0.05, W * 0.95);
  } else {
    let cx=W*0.5, spread=W*0.36;
    bx=cx+(random(-spread,spread)+random(-spread,spread)+random(-spread,spread))/3;
  }
  drops.push({ x:bx, y:random(-180,-20), vy:random(0.2,0.6), wobble:random(TWO_PI) });
}

function startBombInterval() {
  if (bombInterval) return;
  dropFadeAlpha = 1.0;
  phase = 'bombing';
  // fade bells out slowly over 4 seconds while raid plays on top
  fadeBellsOut(4000);
  if (raidSound.paused) raidSound.play().catch(e => console.warn(e));
  bombInterval = setInterval(()=>{
    if (!bombsStopped) {
      if (drops.length < 80) {
        let n = floor(random(1, 3));
        for (let i=0; i<n; i++) spawnBomb();
      }
    }
  }, 180);
}

function stopBombInterval() {
  if (bombInterval) { clearInterval(bombInterval); bombInterval=null; }
}

function onInputReleased() {
  stopBombInterval();
  if (phase!=='bombing'&&phase!=='city') return;
  if (drops.length===0) { bombsStopped=false; phase='city'; return; }
  bombsStopped=true;

  let fadeInterval = setInterval(()=>{
    dropFadeAlpha = max(0, dropFadeAlpha - 0.005);
    if (dropFadeAlpha <= 0) { drops=[]; clearInterval(fadeInterval); }
  }, 50);

  setTimeout(()=>{
    if (phase==='bombing') {
      fadeOutRaid();
      spawnFlashBalls(GY());
      drops=[];
      phase='flashbang'; flashAlpha=1.0; quakeAmt=1.0;
      buildVoronoi(); fogAlpha=0; fogDir=1; fogSpeed=0.002;
      setTimeout(()=>{ mushroom={ x:W*0.5, baseY:GY(), t:0 }; }, 80);
    }
  }, 8000);
}

// ─── INPUT ───────────────────────────────────────────────────
function keyPressed() {
  if (key!==' '&&key!=='b'&&key!=='B') return;
  if (phase!=='city'&&phase!=='bombing') return;
  if (!spaceHeld) { spaceHeld=true; startBombInterval(); }
}

function keyReleased() {
  if (key!==' '&&key!=='b'&&key!=='B') return;
  if (spaceHeld) { spaceHeld=false; onInputReleased(); }
}

// ─── MOTION + FIRST TAP ──────────────────────────────────────
function registerMotion() {
  let overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed; top:0; left:0; width:100%; height:100%;
    background:rgba(0,0,0,0.92); z-index:9999;
    display:flex; align-items:center; justify-content:center;
    flex-direction:column; gap:20px;
  `;
  overlay.innerHTML = `
    <p style="color:white; font-size:24px; font-family:sans-serif;
      text-align:center; padding:0 40px; line-height:1.5;">
      Tap anywhere to begin
    </p>
    <div style="color:white; font-size:52px;">👋</div>
    <p style="color:rgba(255,255,255,0.5); font-size:14px; font-family:sans-serif;">
      Shake the iPad to trigger bombs
    </p>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', ()=>{
    // AudioContext created directly inside tap — required for iOS
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume().then(()=>{
      connectBellsToCtx();
      bellsSound.playbackRate = 1.0;
      bellsSound.volume = 0.7;
      bellsSound.play().catch(e => console.warn(e));
    });

    if (typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission()
        .then(state=>{
          if (state==='granted') attachMotionListener();
          overlay.remove();
        })
        .catch(err=>{ console.error(err); overlay.remove(); });
    } else {
      attachMotionListener();
      overlay.remove();
    }
  });
}

function attachMotionListener() {
  window.addEventListener('devicemotion',(e)=>{
    let acc=e.accelerationIncludingGravity; if(!acc) return;
    let dx=abs(acc.x-lastAX), dy=abs(acc.y-lastAY);
    lastAX=acc.x; lastAY=acc.y;
    if (dx+dy>SHAKE_THRESHOLD) {
      if (phase!=='city'&&phase!=='bombing') return;
      if (!shakeActive) { shakeActive=true; startBombInterval(); }
      clearTimeout(shakeIdleTimer);
      shakeIdleTimer=setTimeout(()=>{ shakeActive=false; onInputReleased(); },700);
    }
  });
}

// ─── CITY ────────────────────────────────────────────────────
function buildCity() {
  buildings=[];
  for (let li=0; li<LAYERS.length; li++) {
    let cfg=LAYERS[li], arr=[], x=0;
    while (x<W*1.8) {
      let bw=random(cfg.wR[0],cfg.wR[1]);
      let bh=random(cfg.minH,cfg.maxH);
      let type=floor(random(12));
      let b={ x, bw, bh, type, windows:makeWindows(bw,bh) };
      if (type===8) b.cutFrac=random(0.3,0.7);
      arr.push(b); x+=bw+random(2,10);
    }
    buildings.push({ arr, ox:0, tw:x });
  }
}

function makeWindows(bw,bh) {
  let wins=[], cols=floor(bw/11), rows=floor(bh/15);
  for (let r=0;r<rows;r++)
    for (let c=0;c<cols;c++)
      if (random()>0.30)
        wins.push({ c, r, on:random()>0.20, warm:round(random(-20,20)), reflect:random()<0.15 });
  return wins;
}

function windowResized() {
  W=windowWidth; H=windowHeight;
  resizeCanvas(W,H); buildCity(); buildVoronoi();
}