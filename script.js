let sounds = [];
let currentScene = 'all';
let masterVolume = 0.85;
let playingAudios = new Map(); // track id -> audio element

const soundGrid = document.getElementById('sound-grid');
const sceneList = document.getElementById('scene-list');
const activeSceneName = document.getElementById('active-scene-name');
const statusEl = document.getElementById('status');
const masterVolumeSlider = document.getElementById('master-volume');
const searchInput = document.getElementById('search-input');

const predefinedScenes = [
    'All Sounds',
    'Act 1',
    'Act 2',
    'Act 3',
    'Effects',
    'Ambience',
    'Music Cues',
    'Transitions'
];

// Load from localStorage
function loadSounds() {
    const saved = localStorage.getItem('clsf_soundboard');
    if (saved) {
        sounds = JSON.parse(saved);
    }
    renderScenes();
    renderSoundGrid();
}

function saveSounds() {
    localStorage.setItem('clsf_soundboard', JSON.stringify(sounds));
}

function renderScenes() {
    sceneList.innerHTML = '';
    
    predefinedScenes.forEach(scene => {
        const sceneKey = scene.toLowerCase().replace(/\s+/g, '-');
        const el = document.createElement('div');
        el.className = `scene-item px-5 py-3 rounded-2xl cursor-pointer flex items-center gap-3 text-sm font-medium ${currentScene === sceneKey ? 'active' : 'hover:bg-zinc-800'}`;
        el.innerHTML = `
            <i class="fa-solid ${scene === 'All Sounds' ? 'fa-layer-group' : 'fa-theater-masks'}"></i>
            <span>${scene}</span>
        `;
        el.onclick = () => {
            currentScene = sceneKey;
            activeSceneName.textContent = scene;
            renderScenes();
            renderSoundGrid();
        };
        sceneList.appendChild(el);
    });
}

function getSceneForSound(sound) {
    return sound.scene || 'all';
}

function renderSoundGrid(filteredSounds = null) {
    soundGrid.innerHTML = '';
    soundGrid.className = 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4';

    const toRender = filteredSounds || sounds.filter(s => {
        if (currentScene === 'all') return true;
        return getSceneForSound(s) === currentScene;
    });

    if (toRender.length === 0) {
        soundGrid.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center h-96 text-zinc-500">
                <i class="fa-solid fa-music text-7xl mb-6 opacity-20"></i>
                <p class="text-xl">No sounds in this scene yet</p>
                <p class="text-sm mt-2">Upload audio files and assign them to scenes</p>
            </div>
        `;
        return;
    }

    toRender.forEach((sound, idx) => {
        const globalIdx = sounds.findIndex(s => s.id === sound.id);
        const btn = document.createElement('button');
        btn.className = `sound-btn group bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-3xl p-6 text-left h-full flex flex-col justify-between`;
        
        const isPlaying = playingAudios.has(sound.id);
        
        btn.innerHTML = `
            <div>
                <div class="flex justify-between items-start mb-4">
                    <div class="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                        🎵
                    </div>
                    ${isPlaying ? `<span class="px-3 py-1 text-xs bg-amber-500 text-zinc-950 rounded-full font-medium animate-pulse">PLAYING</span>` : ''}
                </div>
                <h3 class="font-semibold text-lg leading-tight mb-1 line-clamp-2">${sound.name}</h3>
                <p class="text-xs text-zinc-500">${sound.scene ? sound.scene.replace('-', ' ').toUpperCase() : 'GENERAL'}</p>
            </div>
            
            <div class="flex items-center justify-between mt-6">
                <button onclick="event.stopImmediatePropagation(); toggleSound(${globalIdx});" 
                        class="w-11 h-11 rounded-2xl bg-zinc-800 hover:bg-amber-500 hover:text-zinc-950 flex items-center justify-center text-xl transition-all">
                    <i class="fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'}"></i>
                </button>
                <button onclick="event.stopImmediatePropagation(); deleteSound(${globalIdx});" 
                        class="text-zinc-500 hover:text-red-400 text-xl">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        
        btn.onclick = () => toggleSound(globalIdx);
        soundGrid.appendChild(btn);
    });

    statusEl.textContent = `${sounds.length} sounds loaded • ${toRender.length} shown`;
}

// === REPLACE THIS FUNCTION ===
function toggleSound(index) {
    const sound = sounds[index];
    if (!sound) return;

    if (playingAudios.has(sound.id)) {
        // === PAUSE WITH FADE OUT ===
        const audio = playingAudios.get(sound.id);
        fadeOut(audio, 1200, () => {
            audio.pause();
            playingAudios.delete(sound.id);
            renderSoundGrid();
        });
    } else {
        // === PLAY WITH FADE IN ===
        const audio = new Audio(sound.url);
        audio.volume = 0;                    // Start silent
        audio.loop = false;

        audio.onended = () => {
            playingAudios.delete(sound.id);
            renderSoundGrid();
        };

        playingAudios.set(sound.id, audio);

        audio.play().then(() => {
            fadeIn(audio, 1000, masterVolume);
            renderSoundGrid();
        }).catch(err => {
            console.error("Playback failed:", err);
            playingAudios.delete(sound.id);
        });
    }
}

// Fade Out
function fadeOut(audio, duration = 1200, callback = null) {
    if (!audio) return;
    const startVolume = audio.volume;
    const startTime = Date.now();

    const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        audio.volume = startVolume * (1 - progress);

        if (progress >= 1) {
            clearInterval(interval);
            audio.volume = 0;
            if (callback) callback();
        }
    }, 16);
}

// Fade In
function fadeIn(audio, duration = 1000, targetVolume = 0.85) {
    if (!audio) return;
    audio.volume = 0;
    const startTime = Date.now();

    const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        audio.volume = targetVolume * progress;

        if (progress >= 1) {
            clearInterval(interval);
            audio.volume = targetVolume;
        }
    }, 16);
}

function stopAllSounds() {
    playingAudios.forEach(audio => {
        audio.pause();
    });
    playingAudios.clear();
    renderSoundGrid();
}

function deleteSound(index) {
    if (!confirm('Delete this sound?')) return;
    
    const sound = sounds[index];
    if (playingAudios.has(sound.id)) {
        playingAudios.get(sound.id).pause();
        playingAudios.delete(sound.id);
    }
    
    URL.revokeObjectURL(sound.url);
    sounds.splice(index, 1);
    saveSounds();
    renderSoundGrid();
}

function clearAll() {
    if (!confirm('Clear ALL sounds from the soundboard?')) return;
    stopAllSounds();
    sounds.forEach(s => URL.revokeObjectURL(s.url));
    sounds = [];
    saveSounds();
    renderSoundGrid();
}

// Upload handler
document.getElementById('file-input').addEventListener('change', function(e) {
    const files = Array.from(e.target.files);
    
    files.forEach(file => {
        if (file.type.startsWith('audio/')) {
            const url = URL.createObjectURL(file);
            const scene = currentScene === 'all' ? 'act-1' : currentScene;
            
            sounds.push({
                id: 'sound-' + Date.now() + Math.random().toString(36).substr(2, 5),
                name: file.name.replace(/\.(mp3|wav|mpeg)$/i, ''),
                url: url,
                scene: scene,
                duration: 0
            });
        }
    });
    
    saveSounds();
    renderSoundGrid();
});

function filterSounds() {
    const term = searchInput.value.toLowerCase().trim();
    if (!term) {
        renderSoundGrid();
        return;
    }
    
    const filtered = sounds.filter(sound => 
        sound.name.toLowerCase().includes(term)
    );
    renderSoundGrid(filtered);
}

// Master Volume
masterVolumeSlider.addEventListener('input', () => {
    masterVolume = parseFloat(masterVolumeSlider.value);
    playingAudios.forEach(audio => {
        // Only set volume if not currently fading
        if (!audio.dataset.fading) {
            audio.volume = masterVolume;
        }
    });
});

// Modal functions
function showLibraryModal() {
    const modal = document.getElementById('library-modal');
    const content = document.getElementById('library-content');
    
    let html = `<div class="space-y-4">`;
    
    sounds.forEach((sound, i) => {
        html += `
            <div class="flex items-center justify-between bg-zinc-800 p-4 rounded-2xl">
                <div>
                    <div class="font-medium">${sound.name}</div>
                    <div class="text-xs text-zinc-500">${sound.scene ? sound.scene.replace('-',' ').toUpperCase() : ''}</div>
                </div>
                <button onclick="deleteSound(${i}); hideLibraryModal();" 
                        class="px-4 py-2 text-red-400 hover:bg-red-900/30 rounded-2xl text-sm">
                    Delete
                </button>
            </div>`;
    });
    
    html += `</div>`;
    content.innerHTML = html || `<p class="text-zinc-500 text-center py-12">No sounds yet. Add some using the upload button.</p>`;
    
    modal.classList.remove('hidden');
}

function hideLibraryModal() {
    document.getElementById('library-modal').classList.add('hidden');
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        // Could implement global play/pause logic if desired
    }
    if (e.key === 'Escape') {
        const modal = document.getElementById('library-modal');
        if (!modal.classList.contains('hidden')) hideLibraryModal();
    }
});

function init() {
    loadSounds();
    console.log('%cCLSF Soundboard initialized • Professional mode', 'color: #f59e0b; font-size: 13px; font-family: monospace');
}

window.onload = init;

let currentPlayingIndex = -1; // Track the last toggled sound for Next/Prev

function getCurrentFilteredSounds() {
    if (!searchInput.value.trim()) {
        return sounds.filter(s => {
            if (currentScene === 'all') return true;
            return getSceneForSound(s) === currentScene;
        });
    }
    return sounds.filter(sound => 
        sound.name.toLowerCase().includes(searchInput.value.toLowerCase().trim())
    );
}

function nextSound() {
    const filtered = getCurrentFilteredSounds();
    if (filtered.length === 0) return;

    const currentGlobalIndices = filtered.map(s => sounds.findIndex(sound => sound.id === s.id));
    let nextIdx = currentGlobalIndices.indexOf(currentPlayingIndex) + 1;
    if (nextIdx >= currentGlobalIndices.length) nextIdx = 0;

    currentPlayingIndex = currentGlobalIndices[nextIdx];
    toggleSound(currentPlayingIndex);
}

function prevSound() {
    const filtered = getCurrentFilteredSounds();
    if (filtered.length === 0) return;

    const currentGlobalIndices = filtered.map(s => sounds.findIndex(sound => sound.id === s.id));
    let prevIdx = currentGlobalIndices.indexOf(currentPlayingIndex) - 1;
    if (prevIdx < 0) prevIdx = currentGlobalIndices.length - 1;

    currentPlayingIndex = currentGlobalIndices[prevIdx];
    toggleSound(currentPlayingIndex);
}