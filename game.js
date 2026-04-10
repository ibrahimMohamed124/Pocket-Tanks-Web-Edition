// ==========================================
// GAME ENGINE & GRAPHICS
// ==========================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
let width, height;

let terrain = [];
let tanks = [];
let projectiles = [];
let particles = [];
let texts = [];
let currentPlayer = 0;
let gameState = 'playing';
let cameraShake = 0;

const GRAVITY = 0.2;
const MAX_HP = 50;
const MAX_SHIELD = 30;
const MAX_FUEL = 100;
const FUEL_PER_STEP = 10;
const MOVE_STEP = 15;
const TANK_WIDTH = 40;
const TANK_HEIGHT = 15;
const MAX_PARTICLES = 300;
const MAX_TEXTS = 24;
const TERRAIN_SMOOTHING_PASSES = 3;
const TERRAIN_SLOPE_PASSES = 3;
const MAX_TERRAIN_STEP = 9;
const TERRAIN_RELAX_MARGIN = 36;
const TERRAIN_MELT_ACCEL = 0.035;
const TERRAIN_MELT_PULL = 0.009;
const TERRAIN_MELT_MAX_SPEED = 1.4;
const TERRAIN_MELT_EPSILON = 0.05;

const GRASS_DEPTH = 22;

// Pre-baked offscreen texture canvases — built once, reused every frame
let _dirtCanvas = null;
let _grassCanvas = null;
let _skyCanvas = null;
let _terrainCanvas = null;
let _terrainCtx = null;
let _terrainDirty = true;
let _stars = [];
let terrainTarget = [];
let terrainVelocity = [];
let terrainMeltActive = false;
let terrainMeltStart = 0;
let terrainMeltEnd = -1;
let _lastFrameTime = performance.now();

function ensureTerrainCanvas() {
    if (!_terrainCanvas) {
        _terrainCanvas = document.createElement('canvas');
        _terrainCtx = _terrainCanvas.getContext('2d', { alpha: false });
    }
    if (_terrainCanvas.width !== width || _terrainCanvas.height !== height) {
        _terrainCanvas.width = width;
        _terrainCanvas.height = height;
        _terrainDirty = true;
    }
}

function buildStars() {
    _stars = Array.from({ length: 120 }, () => ({
        x: Math.random(),
        y: Math.random() * 0.65,
        s: Math.random() * 1.5 + 0.4,
        b: Math.random() * 0.7 + 0.3,
    }));
}

function markTerrainDirty() {
    _terrainDirty = true;
}

function clampTerrainY(y) {
    return Math.max(height * 0.15, Math.min(height - GRASS_DEPTH - 2, y));
}

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    ctx.imageSmoothingEnabled = true;
    // Rebuild textures for the new viewport height to avoid vertical-repeat seams.
    _dirtCanvas = null;
    _grassCanvas = null;
    _skyCanvas = null;
    ensureTerrainCanvas();
    buildStars();
    markTerrainDirty();
}
window.addEventListener('resize', resize);
resize();

function generateTerrain() {
    terrain = new Array(width);
    const baseHeight = height * 0.6;
    const o1 = Math.random() * 1000, o2 = Math.random() * 1000, o3 = Math.random() * 1000;
    for (let x = 0; x < width; x++) {
        let y = Math.sin((x + o1) / 300) * 150 + Math.sin((x + o2) / 100) * 50 + Math.sin((x + o3) / 20) * 5;
        terrain[x] = clampTerrainY(baseHeight + y);
    }
    terrainTarget = terrain.slice();
    terrainVelocity = new Array(width).fill(0);
    terrainMeltActive = false;
    terrainMeltStart = 0;
    terrainMeltEnd = -1;
    markTerrainDirty();
}

function buildTextures() {
    const texH = Math.max(256, height);

    // --- Dirt texture ---
    _dirtCanvas = document.createElement('canvas');
    _dirtCanvas.width = 256; _dirtCanvas.height = texH;
    const dc = _dirtCanvas.getContext('2d');
    // Seamless base color so vertical tiling doesn't produce horizontal seams.
    dc.fillStyle = '#3a2414';
    dc.fillRect(0, 0, 256, texH);
    // Large-scale mottling (random blobs) to break flatness without directional banding.
    for (let i = 0; i < Math.floor(260 * (texH / 256)); i++) {
        const bx = Math.random() * 256;
        const by = Math.random() * texH;
        const br = Math.random() * 18 + 6;
        dc.fillStyle = Math.random() > 0.5
            ? `rgba(82,50,26,${Math.random() * 0.12})`
            : `rgba(18,10,6,${Math.random() * 0.18})`;
        dc.beginPath();
        dc.arc(bx, by, br, 0, Math.PI * 2);
        dc.fill();
    }
    // Noise stipple
    for (let i = 0; i < Math.floor(3200 * (texH / 256)); i++) {
        const nx = Math.random() * 256, ny = Math.random() * texH;
        const bright = Math.random();
        dc.fillStyle = bright > 0.85
            ? `rgba(120,80,40,${Math.random()*0.35})`
            : `rgba(0,0,0,${Math.random()*0.25})`;
        dc.fillRect(nx, ny, Math.random()*3+1, Math.random()*2+1);
    }
    // Subtle strata (short segments) to avoid strong horizontal seam artifacts
    for (let y = 16; y < texH; y += 16 + Math.floor(Math.random() * 10)) {
        const segs = 3 + Math.floor(Math.random() * 3);
        for (let s = 0; s < segs; s++) {
            const x0 = Math.random() * 220;
            const len = 24 + Math.random() * 60;
            dc.strokeStyle = `rgba(80,45,20,${0.06 + Math.random() * 0.1})`;
            dc.lineWidth = 0.7 + Math.random() * 0.7;
            dc.beginPath();
            dc.moveTo(x0, y + (Math.random() - 0.5) * 2);
            dc.lineTo(x0 + len, y + (Math.random() - 0.5) * 3);
            dc.stroke();
        }
    }
    // Pebbles
    for (let i = 0; i < Math.floor(80 * (texH / 256)); i++) {
        const px = Math.random()*256, py = Math.random()*texH;
        const r = Math.random()*3+1;
        dc.fillStyle = `rgba(${60+Math.random()*40},${35+Math.random()*25},${15+Math.random()*10},0.6)`;
        dc.beginPath(); dc.ellipse(px, py, r, r*0.7, Math.random()*Math.PI, 0, Math.PI*2); dc.fill();
    }

    // --- Grass texture ---
    _grassCanvas = document.createElement('canvas');
    _grassCanvas.width = 256; _grassCanvas.height = 64;
    const gc = _grassCanvas.getContext('2d');
    const gg = gc.createLinearGradient(0, 0, 0, 64);
    gg.addColorStop(0,   '#6ed630');
    gg.addColorStop(0.5, '#4db520');
    gg.addColorStop(1,   '#2d7810');
    gc.fillStyle = gg; gc.fillRect(0, 0, 256, 64);
    // Grass blade variation
    for (let i = 0; i < 1800; i++) {
        const gx = Math.random()*256, gy = Math.random()*64;
        gc.fillStyle = Math.random() > 0.5
            ? `rgba(120,220,40,${Math.random()*0.3})`
            : `rgba(20,80,10,${Math.random()*0.3})`;
        gc.fillRect(gx, gy, 1, Math.random()*4+1);
    }

    // --- Sky texture ---
    const skyH = Math.max(512, height);
    _skyCanvas = document.createElement('canvas');
    _skyCanvas.width = 4; _skyCanvas.height = skyH;
    const sc = _skyCanvas.getContext('2d');
    const sg = sc.createLinearGradient(0, 0, 0, skyH);
    sg.addColorStop(0,    '#06081a');
    sg.addColorStop(0.5,  '#12083a');
    sg.addColorStop(1,    '#3a1060');
    sc.fillStyle = sg; sc.fillRect(0, 0, 4, skyH);
}

function drawTerrainScene(targetCtx) {
    if (!_dirtCanvas) buildTextures();
    targetCtx.save();

    // --- Sky ---
    const skyPat = targetCtx.createPattern(_skyCanvas, 'repeat-x');
    const sm = new DOMMatrix(); sm.a = width / 4;
    skyPat.setTransform(sm);
    targetCtx.fillStyle = skyPat;
    targetCtx.fillRect(0, 0, width, height);

    _stars.forEach(st => {
        targetCtx.fillStyle = `rgba(255,255,255,${st.b})`;
        targetCtx.beginPath();
        targetCtx.arc(st.x * width, st.y * height, st.s, 0, Math.PI * 2);
        targetCtx.fill();
    });

    // --- Dirt body ---
    const dirtPat = targetCtx.createPattern(_dirtCanvas, 'repeat-x');
    targetCtx.beginPath();
    targetCtx.moveTo(0, height);
    for (let x = 0; x < width; x++) targetCtx.lineTo(x, terrain[x] + GRASS_DEPTH);
    targetCtx.lineTo(width, height);
    targetCtx.closePath();
    targetCtx.fillStyle = dirtPat;
    targetCtx.fill();
    // Darken toward bottom with gradient overlay
    const dg2 = targetCtx.createLinearGradient(0, 0, 0, height);
    dg2.addColorStop(0, 'rgba(0,0,0,0.04)');
    dg2.addColorStop(0.55, 'rgba(0,0,0,0.14)');
    dg2.addColorStop(1, 'rgba(0,0,0,0.55)');
    targetCtx.fillStyle = dg2;
    targetCtx.beginPath();
    targetCtx.moveTo(0, height);
    for (let x = 0; x < width; x++) targetCtx.lineTo(x, terrain[x] + GRASS_DEPTH);
    targetCtx.lineTo(width, height);
    targetCtx.closePath();
    targetCtx.fill();

    // --- Grass band ---
    const grassPat = targetCtx.createPattern(_grassCanvas, 'repeat');
    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.moveTo(0, terrain[0] + GRASS_DEPTH * 0.5);
    for (let x = 1; x < width; x++) targetCtx.lineTo(x, terrain[x] + GRASS_DEPTH * 0.5);
    targetCtx.lineWidth = GRASS_DEPTH;
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    targetCtx.strokeStyle = grassPat;
    targetCtx.stroke();
    targetCtx.restore();

    // --- Grass top highlight ---
    targetCtx.beginPath();
    targetCtx.moveTo(0, terrain[0]);
    for (let x = 1; x < width; x++) targetCtx.lineTo(x, terrain[x]);
    targetCtx.lineWidth = 3;
    targetCtx.strokeStyle = '#90ef50';
    targetCtx.stroke();
    // Second subtle line for depth
    targetCtx.beginPath();
    targetCtx.moveTo(0, terrain[0] + 3);
    for (let x = 1; x < width; x++) targetCtx.lineTo(x, terrain[x] + 3);
    targetCtx.lineWidth = 1.5;
    targetCtx.strokeStyle = 'rgba(30,120,10,0.6)';
    targetCtx.stroke();

    // --- Grass tufts (small blade clusters) ---
    targetCtx.save();
    for (let x = 8; x < width - 8; x += 7 + Math.floor((Math.sin(x * 0.3) + 1) * 4)) {
        const ty = terrain[x];
        const tuftH = 4 + Math.sin(x * 0.7) * 2;
        targetCtx.strokeStyle = Math.sin(x) > 0 ? '#7de035' : '#5ab525';
        targetCtx.lineWidth = 1.2;
        targetCtx.beginPath();
        targetCtx.moveTo(x, ty);
        targetCtx.lineTo(x - 2, ty - tuftH);
        targetCtx.stroke();
        targetCtx.beginPath();
        targetCtx.moveTo(x, ty);
        targetCtx.lineTo(x + 2, ty - tuftH - 1);
        targetCtx.stroke();
    }
    targetCtx.restore();

    targetCtx.restore();
}

function rebuildTerrainCache() {
    ensureTerrainCanvas();
    if (!terrain.length) return;
    drawTerrainScene(_terrainCtx);
    _terrainDirty = false;
}

function renderTerrain() {
    if (_terrainDirty) rebuildTerrainCache();
    if (_terrainCanvas) ctx.drawImage(_terrainCanvas, 0, 0);
}

function smoothTerrainRange(startX, endX, surface = terrain) {
    const from = Math.max(2, startX);
    const to = Math.min(width - 3, endX);
    if (from > to) return;
    for (let pass = 0; pass < TERRAIN_SMOOTHING_PASSES; pass++) {
        const snapshot = surface.slice(from - 2, to + 3);
        for (let x = from; x <= to; x++) {
            const idx = x - from + 2;
            const smoothed =
                (snapshot[idx - 2] + snapshot[idx - 1] * 2 + snapshot[idx] * 3 + snapshot[idx + 1] * 2 + snapshot[idx + 2]) / 9;
            surface[x] = clampTerrainY(smoothed);
        }
    }
}

function limitTerrainSlopeRange(startX, endX, surface = terrain) {
    const from = Math.max(1, startX);
    const to = Math.min(width - 2, endX);
    if (from > to) return;
    for (let pass = 0; pass < TERRAIN_SLOPE_PASSES; pass++) {
        for (let x = from + 1; x <= to; x++) {
            const maxY = surface[x - 1] + MAX_TERRAIN_STEP;
            const minY = surface[x - 1] - MAX_TERRAIN_STEP;
            if (surface[x] > maxY) surface[x] = maxY;
            if (surface[x] < minY) surface[x] = minY;
            surface[x] = clampTerrainY(surface[x]);
        }
        for (let x = to - 1; x >= from; x--) {
            const maxY = surface[x + 1] + MAX_TERRAIN_STEP;
            const minY = surface[x + 1] - MAX_TERRAIN_STEP;
            if (surface[x] > maxY) surface[x] = maxY;
            if (surface[x] < minY) surface[x] = minY;
            surface[x] = clampTerrainY(surface[x]);
        }
    }
}

function stabilizeTerrainRange(startX, endX, surface = terrain) {
    const from = Math.max(2, startX - TERRAIN_RELAX_MARGIN);
    const to = Math.min(width - 3, endX + TERRAIN_RELAX_MARGIN);
    limitTerrainSlopeRange(from, to, surface);
    smoothTerrainRange(from, to, surface);
    limitTerrainSlopeRange(from, to, surface);
    smoothTerrainRange(from, to, surface);
}

function queueTerrainMeltRange(startX, endX) {
    const from = Math.max(0, startX);
    const to = Math.min(width - 1, endX);
    if (from > to) return;
    if (!terrainMeltActive) {
        terrainMeltStart = from;
        terrainMeltEnd = to;
        terrainMeltActive = true;
        return;
    }
    terrainMeltStart = Math.min(terrainMeltStart, from);
    terrainMeltEnd = Math.max(terrainMeltEnd, to);
}

function updateTerrainMelting(deltaMs) {
    if (!terrainMeltActive || !terrain.length || !terrainTarget.length) return;

    const frameScale = Math.min(2.5, Math.max(0.2, deltaMs / 16.67));
    const from = Math.max(0, terrainMeltStart - 2);
    const to = Math.min(width - 1, terrainMeltEnd + 2);
    let changed = false;
    let nextStart = width;
    let nextEnd = -1;

    for (let x = from; x <= to; x++) {
        const targetY = terrainTarget[x];
        const diff = targetY - terrain[x];

        if (diff > TERRAIN_MELT_EPSILON) {
            terrainVelocity[x] += (TERRAIN_MELT_ACCEL + diff * TERRAIN_MELT_PULL) * frameScale;
            if (terrainVelocity[x] > TERRAIN_MELT_MAX_SPEED) terrainVelocity[x] = TERRAIN_MELT_MAX_SPEED;
            const step = Math.min(diff, terrainVelocity[x] * frameScale);
            terrain[x] = clampTerrainY(terrain[x] + step);
            changed = true;
        } else {
            terrain[x] = targetY;
            terrainVelocity[x] = 0;
        }

        const remaining = terrainTarget[x] - terrain[x];
        if (remaining > TERRAIN_MELT_EPSILON) {
            if (x < nextStart) nextStart = x;
            if (x > nextEnd) nextEnd = x;
        } else {
            terrain[x] = terrainTarget[x];
            terrainVelocity[x] = 0;
        }
    }

    if (changed) {
        const relaxFrom = Math.max(2, from - 2);
        const relaxTo = Math.min(width - 3, to + 2);
        smoothTerrainRange(relaxFrom, relaxTo, terrain);
        limitTerrainSlopeRange(relaxFrom, relaxTo, terrain);
        for (let x = relaxFrom; x <= relaxTo; x++) {
            if (terrain[x] > terrainTarget[x]) terrain[x] = terrainTarget[x];
        }
        markTerrainDirty();
    }

    if (nextEnd >= nextStart) {
        terrainMeltStart = nextStart;
        terrainMeltEnd = nextEnd;
    } else {
        terrainMeltActive = false;
    }
}

function destroyTerrain(cx, cy, radius) {
    if (!terrainTarget.length) terrainTarget = terrain.slice();
    if (!terrainVelocity.length || terrainVelocity.length !== width) terrainVelocity = new Array(width).fill(0);

    const startX = Math.max(0, Math.floor(cx - radius));
    const endX = Math.min(width - 1, Math.ceil(cx + radius));
    for (let x = startX; x <= endX; x++) {
        const dx = x - cx;
        const h = Math.sqrt(Math.max(0, radius * radius - dx * dx));
        const lowerY = clampTerrainY(cy + h);
        if (terrainTarget[x] < lowerY) terrainTarget[x] = lowerY;
    }
    stabilizeTerrainRange(startX, endX, terrainTarget);
    queueTerrainMeltRange(startX - TERRAIN_RELAX_MARGIN, endX + TERRAIN_RELAX_MARGIN);
}

function createExplosion(x, y, radius, maxDamage, playSound = true) {
    if (playSound) SoundEngine.play('thud');
    destroyTerrain(x, y, radius);
    for (let i = 0; i < Math.min(24, Math.max(8, Math.floor(radius / 3))); i++)
        spawnParticle(x, y, Math.random() > 0.5 ? '#ff5500' : '#ffff00', Math.random() * 5 + 2);
    texts.push({ x, y, isRing: true, radius, age: 0 });
    if (texts.length > MAX_TEXTS) texts.splice(0, texts.length - MAX_TEXTS);
    tanks.forEach(t => {
        if (t.hp <= 0) return;
        const dist = Math.hypot(t.x - x, t.y - y);
        if (dist < radius + TANK_WIDTH / 2)
            t.takeDamage(Math.max(1, maxDamage * (1 - dist / (radius + TANK_WIDTH / 2))));
    });
}

function spawnParticle(x, y, color, size, vx = null, vy = null) {
    if (particles.length >= MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES + 1);
    particles.push({
        x, y,
        vx: vx !== null ? vx : (Math.random() - 0.5) * 10,
        vy: vy !== null ? vy : (Math.random() - 0.5) * 10 - 2,
        color, size, life: 1.0
    });
}

function initGame() {
    buildWeaponSelect();
    SoundEngine.init();
    if (!_dirtCanvas || !_grassCanvas || !_skyCanvas) buildTextures();
    generateTerrain();
    tanks = [new Tank(width * 0.15, '#ff2222', true), new Tank(width * 0.85, '#2266ff', false)];
    currentPlayer = 0; projectiles = []; particles = []; texts = [];
    gameState = 'playing';
    _lastFrameTime = performance.now();
    document.getElementById('overlay').style.display = 'none';
    stopMusic();
    startMusic();
    startTurn();
}

function startTurn() {
    SoundEngine.play('turn');
    // Reset fuel each turn
    tanks[currentPlayer].fuel = MAX_FUEL;
    updateUI();
    const ind = document.getElementById('turn-indicator');
    ind.innerText = currentPlayer === 0 ? "PLAYER 1'S TURN" : "PLAYER 2'S TURN";
    ind.style.color = currentPlayer === 0 ? "#ff5555" : "#55aaff";
    ind.style.opacity = 1;
    setTimeout(() => { ind.style.opacity = 0; }, 1500);
    syncControlsToTank();
    updateMoveButtons();
}

function nextTurn() {
    setTimeout(() => {
        if (tanks[0].hp <= 0 || tanks[1].hp <= 0) return;
        currentPlayer = (currentPlayer + 1) % 2;
        gameState = 'playing';
        startTurn();
    }, 1000);
}

function fire() {
    if (gameState !== 'playing') return;

    const tank = tanks[currentPlayer];
    const weapon = getWeapon(tank.weapon);

    // Run weapon's custom onFire — if returns false, skip default projectile
    if (weapon.onFire) {
        const proceed = weapon.onFire(tank);
        if (proceed === false) return;
    }

    gameState = 'animating';
    SoundEngine.play('pew');

    const rad = -tank.angle * Math.PI / 180;
    // Barrel pivot is at tank center offset by tilt, then world-angle
    const pivotX = tank.x + Math.cos(tank.tilt) * 0 - Math.sin(tank.tilt) * (-(TANK_HEIGHT - 2));
    const pivotY = tank.y + Math.sin(tank.tilt) * 0 + Math.cos(tank.tilt) * (-(TANK_HEIGHT - 2));
    const bx = pivotX + Math.cos(rad) * 25;
    const by = pivotY + Math.sin(rad) * 25;
    spawnParticle(bx, by, weapon.color || '#ffffaa', 8);
    projectiles.push(new Projectile(bx, by, tank.angle, tank.power, tank.weapon));
}

function moveCurrentTank(dir) {
    if (gameState !== 'playing') return;
    const moved = tanks[currentPlayer].move(dir);
    if (moved) updateMoveButtons();
}

function updateMoveButtons() {
    const fuel = tanks[currentPlayer].fuel;
    const pct = Math.round((fuel / MAX_FUEL) * 100);
    // Fuel bar fill
    const fill = document.getElementById('fuel-bar-fill');
    if (fill) {
        fill.style.width = pct + '%';
        fill.style.background = pct > 50
            ? 'linear-gradient(90deg,#2a9a10,#6adf30)'
            : pct > 25
                ? 'linear-gradient(90deg,#8a7010,#e0c030)'
                : 'linear-gradient(90deg,#8a1010,#e03030)';
    }
    const leftBtn = document.getElementById('move-left');
    const rightBtn = document.getElementById('move-right');
    if (leftBtn) leftBtn.disabled = fuel <= 0 || gameState !== 'playing';
    if (rightBtn) rightBtn.disabled = fuel <= 0 || gameState !== 'playing';
}

function endGame() {
    gameState = 'gameover';
    const winner = tanks[0].hp > 0 ? "PLAYER 1" : "PLAYER 2";
    const overlay = document.getElementById('overlay');
    overlay.style.display = 'flex';
    overlay.innerHTML = `
        <h1 style="color:${tanks[0].hp > 0 ? '#ff5555' : '#55aaff'}">${winner} WINS!</h1>
        <button id="start-btn" onclick="initGame()" style="font-size:24px;padding:15px 40px;margin-top:20px;">PLAY AGAIN</button>
    `;
}

const angleInput = document.getElementById('angle');
const powerInput = document.getElementById('power');
const weaponSelect = document.getElementById('weapon-select');
const angleVal = document.getElementById('angle-val');
const powerVal = document.getElementById('power-val');

function syncControlsToTank() {
    const t = tanks[currentPlayer];
    angleInput.value = t.angle; powerInput.value = t.power; weaponSelect.value = t.weapon;
    angleVal.innerText = t.angle; powerVal.innerText = t.power;
    const wd = document.getElementById('weapon-display');
    if (wd) wd.innerText = getWeapon(t.weapon).name || t.weapon;
}

function updateTankFromControls() {
    if (gameState !== 'playing') return;
    const t = tanks[currentPlayer];
    t.angle = parseInt(angleInput.value); t.power = parseInt(powerInput.value); t.weapon = weaponSelect.value;
    angleVal.innerText = t.angle; powerVal.innerText = t.power;
    const wd = document.getElementById('weapon-display');
    if (wd) wd.innerText = getWeapon(t.weapon).name || t.weapon;
}

angleInput.addEventListener('input', updateTankFromControls);
powerInput.addEventListener('input', updateTankFromControls);
weaponSelect.addEventListener('change', updateTankFromControls);
document.getElementById('fire-btn').addEventListener('click', fire);
document.getElementById('start-btn').addEventListener('click', initGame);
document.getElementById('move-left').addEventListener('click', () => moveCurrentTank(-1));
document.getElementById('move-right').addEventListener('click', () => moveCurrentTank(1));

window.addEventListener('keydown', (e) => {
    if (gameState !== 'playing') return;
    if (e.code === 'Space') { e.preventDefault(); fire(); }
    if (e.code === 'ArrowUp') { angleInput.value = Math.min(180, parseInt(angleInput.value) + 1); updateTankFromControls(); }
    if (e.code === 'ArrowDown') { angleInput.value = Math.max(0, parseInt(angleInput.value) - 1); updateTankFromControls(); }
    if (e.code === 'ArrowRight') { powerInput.value = Math.min(100, parseInt(powerInput.value) + 1); updateTankFromControls(); }
    if (e.code === 'ArrowLeft') { powerInput.value = Math.max(10, parseInt(powerInput.value) - 1); updateTankFromControls(); }
    if (e.code === 'KeyA') moveCurrentTank(-1);
    if (e.code === 'KeyD') moveCurrentTank(1);
});

function updateUI() {
    document.getElementById('p1-health').style.width = `${(tanks[0].hp / MAX_HP) * 100}%`;
    document.getElementById('p2-health').style.width = `${(tanks[1].hp / MAX_HP) * 100}%`;
    // Shield indicators
    const s1 = document.getElementById('p1-shield');
    const s2 = document.getElementById('p2-shield');
    if (s1) s1.style.display = tanks[0].shield > 0 ? 'block' : 'none';
    if (s2) s2.style.display = tanks[1].shield > 0 ? 'block' : 'none';
}

function gameLoop(now = performance.now()) {
    requestAnimationFrame(gameLoop);
    const deltaMs = Math.min(40, Math.max(8, now - _lastFrameTime));
    _lastFrameTime = now;
    let cx = 0, cy = 0;
    if (cameraShake > 0) {
        cx = (Math.random() - 0.5) * cameraShake; cy = (Math.random() - 0.5) * cameraShake;
        cameraShake *= 0.9; if (cameraShake < 0.5) cameraShake = 0;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.save(); ctx.translate(cx, cy);
    if (terrain.length > 0) {
        updateTerrainMelting(deltaMs);
        renderTerrain();
    } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
    }
    tanks.forEach(t => { t.update(); t.draw(); });
    projectiles.forEach(p => { p.update(); p.draw(); });
    projectiles = projectiles.filter(p => p.active);
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += GRAVITY * 0.5; p.life -= 0.02;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;
    for (let i = texts.length - 1; i >= 0; i--) {
        let txt = texts[i]; txt.age += 0.02;
        if (txt.age >= 1) { texts.splice(i, 1); continue; }
        ctx.globalAlpha = 1 - txt.age;
        if (txt.isRing) {
            ctx.strokeStyle = '#ffaa00'; ctx.lineWidth = 4 * (1 - txt.age);
            ctx.beginPath(); ctx.arc(txt.x, txt.y, txt.radius * Math.sqrt(txt.age), 0, Math.PI * 2); ctx.stroke();
        } else {
            ctx.fillStyle = txt.color; ctx.font = 'bold 20px Arial';
            ctx.fillText(txt.text, txt.x - 10, txt.y - (txt.age * 30));
        }
    }
    ctx.globalAlpha = 1.0; ctx.restore();
}

gameLoop();
