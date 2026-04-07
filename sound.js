// ==========================================
// AUDIO ENGINE - MP3 Loader
// ==========================================

// ---- Background Music ----
let bgMusic = null;
let musicPlaying = false;

function startMusic() {
    if (musicPlaying) return;
    if (!bgMusic) {
        bgMusic = new Audio('sounds/ingame.mp3');
        bgMusic.loop = true;
        bgMusic.volume = 0.5;
    }
    bgMusic.play().catch(e => console.warn('Music play failed:', e));
    musicPlaying = true;
}

function stopMusic() {
    if (bgMusic) {
        bgMusic.pause();
        bgMusic.currentTime = 0;
    }
    musicPlaying = false;
}

// ---- Sound Effects ----
// Pre-load all sound effects
const sfxFiles = {
    pew:  'sounds/pew.mp3',
    thud: 'sounds/thud.mp3',
    ding: 'sounds/ding.mp3',
    turn: 'sounds/turn.mp3',
    win:  'sounds/win.mp3',
};

const sfxBuffers = {};

function preloadSFX() {
    for (const [name, path] of Object.entries(sfxFiles)) {
        const audio = new Audio(path);
        audio.preload = 'auto';
        sfxBuffers[name] = audio;
    }
}

const SoundEngine = {
    init: function () {
        preloadSFX();
    },

    play: function (type) {
        const original = sfxBuffers[type];
        if (!original) {
            console.warn(`Sound "${type}" not found.`);
            return;
        }
        // Clone so overlapping sounds don't cut each other off
        const audio = original.cloneNode();
        audio.volume = 0.7;
        audio.play().catch(e => console.warn(`SFX "${type}" play failed:`, e));
    }
};
