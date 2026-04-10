const TANK_SLIDE_START_DEG = 52;
const TANK_WALL_DETACH_DEG = 74;
const TANK_AIR_DRIFT_DEG = 58;

class Tank {
    constructor(x, color, isP1) {
        this.x = x; this.y = 0; this.color = color; this.isP1 = isP1;
        this.hp = MAX_HP; this.angle = isP1 ? 45 : 135; this.power = 50; this.weapon = 'dirtball';
        this.fuel = MAX_FUEL;
        this.shield = 0;
        this.vx = 0;         // horizontal velocity for realistic slope sliding
        this.tilt = 0;       // current visual tilt in radians (from terrain slope)
        this.vy = 0;         // vertical velocity for gravity/sliding
        this.grounded = true;
        this.settleOnTerrain();
    }

    // Returns terrain Y at a given X, clamped to canvas bounds
    _terrainAt(x) {
        const tx = Math.round(x);
        if (tx < 0) return terrain[0] || height;
        if (tx >= width) return terrain[width - 1] || height;
        return terrain[tx];
    }

    // Compute tilt angle from the slope under the tank's left/right contact points
    _computeTilt() {
        const lx = this.x - TANK_WIDTH / 2 + 4;
        const rx = this.x + TANK_WIDTH / 2 - 4;
        const ly = this._terrainAt(lx);
        const ry = this._terrainAt(rx);
        return Math.atan2(ry - ly, rx - lx);
    }

    // How many pixels of the tank's base are actually supported by terrain
    _supportedFraction() {
        const left  = Math.floor(this.x - TANK_WIDTH / 2);
        const right = Math.ceil(this.x  + TANK_WIDTH / 2);
        let supported = 0, total = 0;
        for (let tx = left; tx <= right; tx++) {
            total++;
            const ty = this._terrainAt(tx);
            if (this.y >= ty - 4) supported++; // within 4px = touching
        }
        return total > 0 ? supported / total : 0;
    }

    settleOnTerrain() {
        // Place tank so its center base sits on terrain, respecting slope
        // Use left & right contact points average
        const lx = this.x - TANK_WIDTH / 2 + 4;
        const rx = this.x + TANK_WIDTH / 2 - 4;
        const ly = this._terrainAt(lx);
        const ry = this._terrainAt(rx);
        const tilt = Math.atan2(ry - ly, rx - lx);

        // If the ground under the tank is extremely steep, don't hard-lock it to the wall.
        if (Math.abs(tilt) > (TANK_WALL_DETACH_DEG * Math.PI / 180)) {
            this.y = this._terrainAt(this.x);
            this.tilt = tilt;
            this.grounded = false;
            return;
        }

        this.y = (ly + ry) / 2;
        this.tilt = tilt;
        this.grounded = true;
        this.vy = 0;
    }

    // Called every frame to apply gravity & sliding
    update() {
        if (this.hp <= 0) return;

        const supportFrac = this._supportedFraction();
        const slope = this._computeTilt();
        const slopeDeg = Math.abs(slope) * 180 / Math.PI;
        const steepWall = slopeDeg > TANK_WALL_DETACH_DEG;
        const wellSupported = supportFrac > 0.5;

        if (wellSupported && !steepWall) {
            // Grounded state: stick to terrain and slide along slope with friction.
            this.grounded = true;
            this.vy = 0;

            const downhillDir = slope > 0 ? 1 : -1; // +tilt => lower side is right in canvas coordinates
            if (slopeDeg > TANK_SLIDE_START_DEG) {
                const slideFactor = Math.min(1, (slopeDeg - TANK_SLIDE_START_DEG) / (TANK_WALL_DETACH_DEG - TANK_SLIDE_START_DEG));
                this.vx += downhillDir * (0.03 + slideFactor * 0.22);
            }

            // Ground friction
            this.vx *= slopeDeg > TANK_SLIDE_START_DEG ? 0.975 : 0.72;
            if (Math.abs(this.vx) < 0.03) this.vx = 0;
            this.vx = Math.max(-3.6, Math.min(3.6, this.vx));
            this.x += this.vx;

            // Clamp to canvas edges
            const clampedX = Math.max(TANK_WIDTH / 2, Math.min(width - TANK_WIDTH / 2, this.x));
            if (clampedX !== this.x) this.vx = 0;
            this.x = clampedX;

            this.settleOnTerrain();
        } else {
            // Unstable/airborne: detach from wall and fall, with mild side drift down slope.
            this.grounded = false;
            const downhillDir = slope > 0 ? 1 : -1;
            if (slopeDeg > TANK_AIR_DRIFT_DEG) this.vx += downhillDir * 0.05;

            this.vy += GRAVITY * 1.7;
            this.vx *= 0.995;
            this.vx = Math.max(-4.2, Math.min(4.2, this.vx));
            this.x += this.vx;
            this.y += this.vy;

            // Clamp to canvas edges
            const clampedX = Math.max(TANK_WIDTH / 2, Math.min(width - TANK_WIDTH / 2, this.x));
            if (clampedX !== this.x) this.vx = 0;
            this.x = clampedX;

            // Land check
            const centerTerrain = this._terrainAt(this.x);
            const landedTilt = this._computeTilt();
            const landedSupport = this._supportedFraction();
            if (this.y >= centerTerrain - 1 && landedSupport > 0.45 && Math.abs(landedTilt) < (TANK_WALL_DETACH_DEG * Math.PI / 180)) {
                this.vy = 0;
                this.vx *= 0.75;
                this.settleOnTerrain();
            } else {
                this.tilt = landedTilt;
            }
        }
    }

    move(dir) {
        if (this.fuel <= 0) return false;
        const step = dir * MOVE_STEP;
        const newX = this.x + step;
        if (newX < TANK_WIDTH / 2 || newX > width - TANK_WIDTH / 2) return false;
        this.x = newX;
        this.vx = 0;
        this.fuel = Math.max(0, this.fuel - FUEL_PER_STEP);
        this.settleOnTerrain();
        SoundEngine.play('move');
        return true;
    }

    takeDamage(amount) {
        if (this.shield > 0) {
            const absorbed = Math.min(this.shield, amount);
            this.shield -= absorbed;
            amount -= absorbed;
            texts.push({ x: this.x, y: this.y - 45, text: `SHIELD -${Math.round(absorbed)}`, color: '#00ccff', age: 0 });
        }
        if (amount <= 0) return;
        this.hp = Math.max(0, this.hp - amount);
        texts.push({ x: this.x, y: this.y - 30, text: `-${Math.round(amount)}`, color: amount > 10 ? '#ff0000' : '#ffff00', age: 0 });
        updateUI();
        if (this.hp <= 0) {
            for (let i = 0; i < 30; i++) spawnParticle(this.x, this.y, this.color, 5);
            SoundEngine.play('thud');
            cameraShake = 30;
            setTimeout(() => { stopMusic(); SoundEngine.play('win'); endGame(); }, 1200);
        }
    }

    draw() {
        if (this.hp <= 0) return;

        // --- Draw shadow on terrain ---
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.tilt);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 6, TANK_WIDTH / 2 + 4, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // --- Main tank body, tilted with terrain ---
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.tilt);

        // Shield bubble (in tilted space)
        if (this.shield > 0) {
            ctx.save();
            ctx.globalAlpha = 0.3 + (this.shield / MAX_SHIELD) * 0.3;
            ctx.strokeStyle = '#00ccff';
            ctx.lineWidth = 3;
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#00ccff';
            ctx.beginPath();
            ctx.ellipse(0, -TANK_HEIGHT / 2, TANK_WIDTH / 2 + 12, TANK_HEIGHT + 10, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 0.08;
            ctx.fillStyle = '#00ccff';
            ctx.fill();
            ctx.restore();
        }

        // Tracks
        ctx.fillStyle = '#222';
        ctx.fillRect(-TANK_WIDTH / 2, -5, TANK_WIDTH, 10);

        // Body
        const grad = ctx.createLinearGradient(0, -TANK_HEIGHT, 0, 0);
        grad.addColorStop(0, this.color);
        grad.addColorStop(1, '#333');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-TANK_WIDTH / 2 + 5, -5);
        ctx.lineTo(TANK_WIDTH / 2 - 5, -5);
        ctx.lineTo(TANK_WIDTH / 2 - 10, -TANK_HEIGHT);
        ctx.lineTo(-TANK_WIDTH / 2 + 10, -TANK_HEIGHT);
        ctx.closePath();
        ctx.fill();

        // Barrel — always shoots in world space regardless of tilt
        // We rotate BACK by tilt so the barrel stays world-aligned
        ctx.save();
        ctx.translate(0, -TANK_HEIGHT + 2);
        ctx.rotate(-this.tilt); // undo tank tilt
        ctx.rotate(-this.angle * Math.PI / 180);
        ctx.fillStyle = '#555';
        ctx.fillRect(0, -3, 25, 6);
        if (gameState === 'playing' && tanks[currentPlayer] === this) {
            ctx.beginPath();
            ctx.moveTo(25, 0);
            ctx.lineTo(800, 0);
            ctx.strokeStyle = `rgba(255,0,0,${this.power / 200})`;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.restore(); // end tilt transform

        // --- Fuel bar (always horizontal, in screen space) ---
        ctx.save();
        ctx.translate(this.x, this.y - TANK_HEIGHT - 18);
        const fuelPct = this.fuel / MAX_FUEL;
        const barW = 40, barH = 4;
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(-barW / 2, 0, barW, barH);
        ctx.fillStyle = fuelPct > 0.5 ? '#00cc44' : fuelPct > 0.25 ? '#ffaa00' : '#ff3300';
        ctx.fillRect(-barW / 2, 0, barW * fuelPct, barH);
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-barW / 2, 0, barW, barH);
        ctx.restore();
    }
}
