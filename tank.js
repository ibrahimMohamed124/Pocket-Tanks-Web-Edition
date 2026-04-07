class Tank {
    constructor(x, color, isP1) {
        this.x = x; this.y = 0; this.color = color; this.isP1 = isP1;
        this.hp = MAX_HP; this.angle = isP1 ? 45 : 135; this.power = 50; this.weapon = 'dirtball';
        this.fuel = MAX_FUEL;
        this.shield = 0;
        this.settleOnTerrain();
    }
    settleOnTerrain() {
        let highest = height;
        for (let tx = Math.floor(this.x - TANK_WIDTH / 2); tx <= Math.ceil(this.x + TANK_WIDTH / 2); tx++)
            if (tx >= 0 && tx < width && terrain[tx] < highest) highest = terrain[tx];
        this.y = highest;
    }
    move(dir) {
        if (this.fuel <= 0) return false;
        const step = dir * MOVE_STEP;
        const newX = this.x + step;
        if (newX < TANK_WIDTH / 2 || newX > width - TANK_WIDTH / 2) return false;
        this.x = newX;
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
        ctx.save(); ctx.translate(this.x, this.y);

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.ellipse(0, 5, TANK_WIDTH / 2 + 5, 5, 0, 0, Math.PI * 2); ctx.fill();

        // Shield bubble
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
        grad.addColorStop(0, this.color); grad.addColorStop(1, '#333');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-TANK_WIDTH / 2 + 5, -5); ctx.lineTo(TANK_WIDTH / 2 - 5, -5);
        ctx.lineTo(TANK_WIDTH / 2 - 10, -TANK_HEIGHT); ctx.lineTo(-TANK_WIDTH / 2 + 10, -TANK_HEIGHT);
        ctx.closePath(); ctx.fill();

        // Barrel
        ctx.save(); ctx.translate(0, -TANK_HEIGHT + 2); ctx.rotate(-this.angle * Math.PI / 180);
        ctx.fillStyle = '#555'; ctx.fillRect(0, -3, 25, 6);
        if (gameState === 'playing' && tanks[currentPlayer] === this) {
            ctx.beginPath(); ctx.moveTo(25, 0); ctx.lineTo(800, 0);
            ctx.strokeStyle = `rgba(255,0,0,${this.power / 200})`; ctx.lineWidth = 1; ctx.stroke();
        }
        ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // Fuel bar above tank
        const fuelPct = this.fuel / MAX_FUEL;
        const barW = 40, barH = 4;
        ctx.fillStyle = '#333';
        ctx.fillRect(-barW / 2, -TANK_HEIGHT - 22, barW, barH);
        ctx.fillStyle = fuelPct > 0.5 ? '#00cc44' : fuelPct > 0.25 ? '#ffaa00' : '#ff3300';
        ctx.fillRect(-barW / 2, -TANK_HEIGHT - 22, barW * fuelPct, barH);
        ctx.strokeStyle = '#555'; ctx.lineWidth = 0.5;
        ctx.strokeRect(-barW / 2, -TANK_HEIGHT - 22, barW, barH);

        ctx.restore();
    }
}
