// ==========================================
// WEAPONS SYSTEM
// ==========================================
// Each weapon definition:
// {
//   id: string           — matches <option value>
//   name: string         — display name
//   color: string        — projectile color
//   radius: number       — projectile draw radius
//   expRadius: number    — explosion terrain radius
//   damage: number       — max damage
//   cameraShake: number  — shake amount
//   projectileCount: number — how many projectiles (default 1)
//   onFire(tank)         — optional override: custom fire logic, returns false to skip default projectile
//   onCollision(proj)    — optional override: custom collision logic, returns false to skip default explosion
//   onUpdate(proj)       — optional per-frame logic (e.g. homing), return false to skip default movement
//   trailColor: string   — particle trail color
//   initVelocity(vx,vy,power) — optional velocity modifier
// }

const WEAPONS = {

    dirtball: {
        id: 'dirtball', name: 'Dirt Ball',
        color: '#8b5a2b', radius: 4,
        expRadius: 30, damage: 15, cameraShake: 0,
        trailColor: '#6b3a1b',
    },

    mortar: {
        id: 'mortar', name: 'Mortar',
        color: '#888', radius: 6,
        expRadius: 55, damage: 22, cameraShake: 8,
        trailColor: '#555',
    },

    rocket: {
        id: 'rocket', name: 'Rocket',
        color: '#ff3300', radius: 5,
        expRadius: 45, damage: 20, cameraShake: 10,
        trailColor: '#ffaa00',
        initVelocity(vx, vy) { return { vx: vx * 1.5, vy: vy * 0.5 }; },
    },

    bigdaddy: {
        id: 'bigdaddy', name: 'Big Daddy',
        color: '#ff00ff', radius: 8,
        expRadius: 120, damage: 35, cameraShake: 25,
        trailColor: '#ff44ff',
    },

    bouncy: {
        id: 'bouncy', name: 'Bouncy Ball',
        color: '#00ff00', radius: 4,
        expRadius: 25, damage: 12, cameraShake: 0,
        trailColor: '#00cc00',
        maxBounces: 5,
        onCollision(proj) {
            if (proj._bounces < (this.maxBounces || 5)) {
                proj._bounces++;
                proj.vy = -proj.vy * 0.6;
                proj.y = terrain[Math.floor(proj.x)] - 1;
                SoundEngine.play('ding');
                for (let i = 0; i < 3; i++) spawnParticle(proj.x, proj.y, '#00ff00', 2);
                return false; // skip default explosion
            }
            return true; // proceed to default explosion
        },
    },

    airstrike: {
        id: 'airstrike', name: 'Airstrike ✈',
        color: '#ffdd00', radius: 5,
        expRadius: 65, damage: 28, cameraShake: 18,
        trailColor: '#ffaa00',
        projectileCount: 3,
        projectileDelay: 300, // ms between each bomb
        onFire(tank) {
            gameState = 'animating';
            SoundEngine.play('pew');
            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    const offsetX = tank.x + (Math.random() - 0.5) * 100;
                    projectiles.push(new Projectile(offsetX, -20, 90, tank.power, 'airstrike'));
                }, i * 300);
            }
            return false; // skip default single-projectile fire
        },
    },

    shield: {
        id: 'shield', name: 'Shield 🛡',
        color: '#00ccff', radius: 0,
        expRadius: 0, damage: 0, cameraShake: 0,
        trailColor: '#00ccff',
        onFire(tank) {
            tank.shield = Math.min(MAX_SHIELD, tank.shield + MAX_SHIELD);
            SoundEngine.play('ding');
            texts.push({ x: tank.x, y: tank.y - 40, text: 'SHIELD UP!', color: '#00ccff', age: 0 });
            gameState = 'animating';
            nextTurn();
            return false; // no projectile
        },
    },

    cluster: {
        id: 'cluster', name: 'Cluster Bomb',
        color: '#ffaa00', radius: 5,
        expRadius: 20, damage: 10, cameraShake: 5,
        trailColor: '#ff8800',
        onCollision(proj) {
            // Spawn 5 mini bombs on first impact
            SoundEngine.play('thud');
            for (let i = 0; i < 5; i++) {
                const angle = 60 + i * 12;
                const mini = new Projectile(proj.x, proj.y, angle, 30, '_clustermini');
                projectiles.push(mini);
            }
            // Ring fx
            texts.push({ x: proj.x, y: proj.y, isRing: true, radius: proj.weapon.expRadius, age: 0 });
            return false; // skip default explosion — minis handle it
        },
    },

    _clustermini: {
        id: '_clustermini', name: '',
        color: '#ff6600', radius: 3,
        expRadius: 20, damage: 10, cameraShake: 3,
        trailColor: '#ff6600',
    },

    napalm: {
        id: 'napalm', name: 'Napalm 🔥',
        color: '#ff4400', radius: 6,
        expRadius: 40, damage: 18, cameraShake: 8,
        trailColor: '#ff8800',
        onCollision(proj) {
            // Standard explosion + fire particles that linger and keep dealing damage
            createExplosion(proj.x, proj.y, this.expRadius, this.damage);
            // Spawn fire particles horizontally
            for (let i = 0; i < 12; i++) {
                spawnFireParticle(proj.x + (Math.random() - 0.5) * this.expRadius, proj.y);
            }
            nextTurn();
            return false;
        },
    },

    sniper: {
        id: 'sniper', name: 'Sniper 🎯',
        color: '#00ffff', radius: 2,
        expRadius: 10, damage: 40, cameraShake: 5,
        trailColor: '#00ffff',
        initVelocity(vx, vy) { return { vx: vx * 2.5, vy: vy * 2.5 }; },
    },

};

// ---- Helper: spawn a fire particle (used by napalm) ----
function spawnFireParticle(x, y) {
    particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 4,
        vy: -(Math.random() * 3 + 1),
        color: Math.random() > 0.5 ? '#ff4400' : '#ffaa00',
        size: Math.random() * 5 + 2,
        life: 1.0,
        isFire: true,
    });
}

// ---- Weapon lookup ----
function getWeapon(id) {
    return WEAPONS[id] || WEAPONS['dirtball'];
}

// ---- Build select options from WEAPONS (skip internal _ entries) ----
function buildWeaponSelect() {
    const sel = document.getElementById('weapon-select');
    if (!sel) return;
    sel.innerHTML = '';
    Object.values(WEAPONS).forEach(w => {
        if (w.id.startsWith('_')) return;
        const opt = document.createElement('option');
        opt.value = w.id;
        opt.textContent = w.name;
        sel.appendChild(opt);
    });
}
