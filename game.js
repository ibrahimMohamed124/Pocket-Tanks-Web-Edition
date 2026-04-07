// ==========================================
// GAME ENGINE & GRAPHICS
// ==========================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
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

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    ctx.imageSmoothingEnabled = true;
}
window.addEventListener('resize', resize);
resize();

function generateTerrain() {
    terrain = new Array(width);
    const baseHeight = height * 0.6;
    const o1 = Math.random() * 1000, o2 = Math.random() * 1000, o3 = Math.random() * 1000;
    for (let x = 0; x < width; x++) {
        let y = Math.sin((x + o1) / 300) * 150 + Math.sin((x + o2) / 100) * 50 + Math.sin((x + o3) / 20) * 5;
        terrain[x] = baseHeight + y;
    }
}

function renderTerrain() {
    ctx.save();
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    skyGrad.addColorStop(0, '#0a0a1a'); skyGrad.addColorStop(1, '#2a1a2a');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x < width; x++) ctx.lineTo(x, terrain[x]);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.clip();

    const dirtGrad = ctx.createLinearGradient(0, height * 0.3, 0, height);
    dirtGrad.addColorStop(0, '#3a2518'); dirtGrad.addColorStop(1, '#110a05');
    ctx.fillStyle = dirtGrad; ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, terrain[0]);
    for (let x = 0; x < width; x++) ctx.lineTo(x, terrain[x]);
    ctx.lineTo(width, terrain[width - 1] + 20); ctx.lineTo(0, terrain[0] + 20);
    ctx.closePath();
    ctx.fillStyle = '#2d5a1e'; ctx.fill();

    ctx.beginPath();
    for (let x = 0; x < width; x++) ctx.lineTo(x, terrain[x]);
    ctx.lineWidth = 4; ctx.strokeStyle = '#4cb02c'; ctx.stroke();
    ctx.restore();
}

function destroyTerrain(cx, cy, radius) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(width, Math.ceil(cx + radius)); x++) {
        const dx = x - cx, h = Math.sqrt(radius * radius - dx * dx), lowerY = cy + h;
        if (terrain[x] < lowerY) terrain[x] = lowerY;
    }
    tanks.forEach(t => t.settleOnTerrain());
}

function createExplosion(x, y, radius, maxDamage) {
    SoundEngine.play('thud');
    destroyTerrain(x, y, radius);
    for (let i = 0; i < radius / 2; i++)
        spawnParticle(x, y, Math.random() > 0.5 ? '#ff5500' : '#ffff00', Math.random() * 5 + 2);
    texts.push({ x, y, isRing: true, radius, age: 0 });
    tanks.forEach(t => {
        if (t.hp <= 0) return;
        const dist = Math.hypot(t.x - x, t.y - y);
        if (dist < radius + TANK_WIDTH / 2)
            t.takeDamage(Math.max(1, maxDamage * (1 - dist / (radius + TANK_WIDTH / 2))));
    });
}

function spawnParticle(x, y, color, size, vx = null, vy = null) {
    particles.push({
        x, y,
        vx: vx !== null ? vx : (Math.random() - 0.5) * 10,
        vy: vy !== null ? vy : (Math.random() - 0.5) * 10 - 2,
        color, size, life: 1.0
    });
}

function initGame() {
    SoundEngine.init();
    generateTerrain();
    tanks = [new Tank(width * 0.15, '#ff2222', true), new Tank(width * 0.85, '#2266ff', false)];
    currentPlayer = 0; projectiles = []; particles = []; texts = [];
    gameState = 'playing';
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

    // Handle shield weapon locally — no projectile
    if (tanks[currentPlayer].weapon === 'shield') {
        tanks[currentPlayer].shield = Math.min(MAX_SHIELD, tanks[currentPlayer].shield + MAX_SHIELD);
        SoundEngine.play('ding');
        texts.push({ x: tanks[currentPlayer].x, y: tanks[currentPlayer].y - 40, text: 'SHIELD UP!', color: '#00ccff', age: 0 });
        gameState = 'animating';
        nextTurn();
        return;
    }

    gameState = 'animating';
    SoundEngine.init();
    SoundEngine.play('pew');
    const tank = tanks[currentPlayer];
    const rad = -tank.angle * Math.PI / 180;
    const bx = tank.x + Math.cos(rad) * 25;
    const by = tank.y - TANK_HEIGHT + 2 + Math.sin(rad) * 25;
    spawnParticle(bx, by, '#ffffaa', 8);

    if (tank.weapon === 'airstrike') {
        // Spawn 3 bombs from the top
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const offsetX = tank.x + (Math.random() - 0.5) * 80;
                projectiles.push(new Projectile(offsetX, -20, 90, tank.power, 'airstrike'));
            }, i * 300);
        }
        // nextTurn triggered by last bomb
        return;
    }

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
    const fuelEl = document.getElementById('fuel-val');
    if (fuelEl) fuelEl.innerText = pct + '%';
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
}

function updateTankFromControls() {
    if (gameState !== 'playing') return;
    const t = tanks[currentPlayer];
    t.angle = parseInt(angleInput.value); t.power = parseInt(powerInput.value); t.weapon = weaponSelect.value;
    angleVal.innerText = t.angle; powerVal.innerText = t.power;
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

function gameLoop() {
    requestAnimationFrame(gameLoop);
    let cx = 0, cy = 0;
    if (cameraShake > 0) {
        cx = (Math.random() - 0.5) * cameraShake; cy = (Math.random() - 0.5) * cameraShake;
        cameraShake *= 0.9; if (cameraShake < 0.5) cameraShake = 0;
    }
    ctx.save(); ctx.translate(cx, cy);
    if (terrain.length > 0) renderTerrain();
    tanks.forEach(t => t.draw());
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
