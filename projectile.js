class Projectile {
    constructor(x, y, angle, power, type) {
        this.x = x; this.y = y;
        const rad = -angle * Math.PI / 180, force = power * 0.25;
        this.vx = Math.cos(rad) * force; this.vy = Math.sin(rad) * force;
        this.type = type; this.active = true; this.bounces = 0;
        this.radius = 4; this.color = '#fff';
        if (type === 'dirtball') this.color = '#8b5a2b';
        if (type === 'mortar') { this.color = '#555'; this.radius = 6; }
        if (type === 'rocket') { this.color = '#ff3300'; this.vy *= 0.5; this.vx *= 1.5; }
        if (type === 'bigdaddy') { this.color = '#ff00ff'; this.radius = 8; }
        if (type === 'bouncy') this.color = '#00ff00';
        if (type === 'airstrike') {
            this.color = '#ffdd00'; this.radius = 5;
            this.vy = Math.abs(this.vy) * 0.3 + 1;
            this.vx = (Math.random() > 0.5 ? 1 : -1) * power * 0.3;
        }
    }
    update() {
        if (!this.active) return;
        this.vy += GRAVITY;
        this.x += this.vx; this.y += this.vy;
        if (Math.random() > 0.5) spawnParticle(this.x, this.y, this.type === 'rocket' ? '#ffaa00' : this.type === 'airstrike' ? '#ffdd00' : '#888', 1, 0, 0);
        if (this.x < -100 || this.x > width + 100 || this.y > height) { this.active = false; nextTurn(); return; }
        const tx = Math.floor(this.x);
        if (tx >= 0 && tx < width && this.y >= terrain[tx]) this.handleCollision();
        tanks.forEach(t => {
            if (t.hp > 0 && Math.abs(this.x - t.x) < TANK_WIDTH / 2 && Math.abs(this.y - t.y) < TANK_HEIGHT) this.handleCollision();
        });
    }
    handleCollision() {
        if (this.type === 'bouncy' && this.bounces < 5) {
            this.bounces++; this.vy = -this.vy * 0.6;
            this.y = terrain[Math.floor(this.x)] - 1;
            SoundEngine.play('ding');
            for (let i = 0; i < 3; i++) spawnParticle(this.x, this.y, '#00ff00', 2);
            return;
        }
        this.active = false;
        let expRadius = 30, damage = 15;
        if (this.type === 'mortar') { expRadius = 50; damage = 20; }
        if (this.type === 'bigdaddy') { expRadius = 120; damage = 35; cameraShake = 20; }
        if (this.type === 'airstrike') { expRadius = 60; damage = 25; cameraShake = 15; }
        createExplosion(this.x, this.y, expRadius, damage);
        nextTurn();
    }
    draw() {
        if (!this.active) return;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.shadowBlur = 10; ctx.shadowColor = this.color;
        ctx.fill(); ctx.shadowBlur = 0;
    }
}
