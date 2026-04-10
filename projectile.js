class Projectile {
    constructor(x, y, angle, power, typeId) {
        this.x = x; this.y = y;
        this.typeId = typeId;
        this.weapon = getWeapon(typeId);
        this.active = true;
        this._bounces = 0;

        const rad = -angle * Math.PI / 180;
        const force = power * 0.25;
        let vx = Math.cos(rad) * force;
        let vy = Math.sin(rad) * force;

        if (this.weapon.initVelocity) {
            const v = this.weapon.initVelocity(vx, vy, power);
            vx = v.vx; vy = v.vy;
        }

        this.vx = vx; this.vy = vy;
        this.radius = this.weapon.radius || 4;
        this.color = this.weapon.color || '#fff';
        this.trailColor = this.weapon.trailColor || '#888';
    }

    update() {
        if (!this.active) return;

        // Custom per-frame logic
        if (this.weapon.onUpdate) {
            const result = this.weapon.onUpdate(this);
            if (result === false) return;
        }

        this.vy += GRAVITY;
        this.x += this.vx;
        this.y += this.vy;

        // Trail particle
        if (Math.random() > 0.4) {
            spawnParticle(this.x, this.y, this.trailColor, 1.5, 0, 0);
        }

        // Out of bounds
        if (this.x < -100 || this.x > width + 100 || this.y > height) {
            this.active = false;
            nextTurn();
            return;
        }

        // Terrain collision
        const tx = Math.floor(this.x);
        if (tx >= 0 && tx < width && this.y >= terrain[tx]) {
            this.handleCollision();
            return;
        }

        // Tank collision
        for (const t of tanks) {
            if (t.hp > 0 && Math.abs(this.x - t.x) < TANK_WIDTH / 2 && Math.abs(this.y - t.y) < TANK_HEIGHT) {
                this.handleCollision();
                return;
            }
        }
    }

    handleCollision() {
        if (!this.active) return;

        // Run weapon's custom collision first
        if (this.weapon.onCollision) {
            const proceed = this.weapon.onCollision(this);
            if (proceed === false) {
                this.active = false;
                return;
            }
        }

        // Default explosion
        this.active = false;
        const { expRadius, damage, cameraShake: shakeAmount } = this.weapon;
        if (shakeAmount) cameraShake = Math.max(cameraShake, shakeAmount);
        playWeaponSound(this.weapon, 'explosion');
        createExplosion(this.x, this.y, expRadius || 30, damage || 15, false);
        nextTurn();
    }

    draw() {
        if (!this.active || this.radius === 0) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}
