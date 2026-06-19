// ==================== ENHANCED SCRIPT.JS ====================

let sounds = [];
let scenes = ['All Sounds', 'Act 1', 'Act 2', 'Act 3', 'Effects', 'Ambience', 'Music Cues', 'Transitions'];
let currentScene = 'all';
let masterVolume = 0.85;
let playingAudios = new Map();
let currentEditingSoundId = null;

const soundGrid = document.getElementById('sound-grid');
const sceneList = document.getElementById('scene-list');
const activeSceneName = document.getElementById('active-scene-name');
const statusEl = document.getElementById('status');
const masterVolumeSlider = document.getElementById('master-volume');
const searchInput = document.getElementById('search-input');

function loadData() {
    const savedSounds = localStorage.getItem('clsf_sounds');
    const savedScenes = localStorage.getItem('clsf_scenes');
    
    if (savedSounds) sounds = JSON.parse(savedSounds);
    if (savedScenes) scenes = JSON.parse(savedScenes);
    
    renderScenes();
    renderSoundGrid();
}

function saveData() {
    localStorage.setItem('clsf_sounds', JSON.stringify(sounds));
    localStorage.setItem('clsf_scenes', JSON.stringify(scenes));
}

function renderScenes() {
    sceneList.innerHTML = '';
    
    scenes.forEach(scene => {
        const sceneKey = scene.toLowerCase().replace(/\s+/g, '-');
        const el = document.createElement('div');
        el.className = `scene-item px-5 py-3 rounded-2xl cursor-pointer flex items-center gap-3 text-sm font-medium transition-all ${currentScene === sceneKey ? 'active bg-amber-500/10 border-l-4 border-amber-500' : 'hover:bg-zinc-800'}`;
        el.innerHTML = `
            <i class="fa-solid ${scene === 'All Sounds' ? 'fa-layer-group' : 'fa-theater-masks'}"></i>
            <span class="flex-1">${scene}</span>
        `;
        el.ondblclick = () => editScene(scene);
        el.onclick = (e) => {
            if (e.detail === 1) { // single click
                currentScene = sceneKey;
                activeSceneName.textContent = scene;
                renderScenes();
                renderSoundGrid();
            }
        };
        // Drag over support
        el.ondragover = (e) => { e.preventDefault(); el.classList.add('bg-amber-500/20'); };
        el.ondragleave = () => el.classList.remove('bg-amber-500/20');
        el.ondrop = (e) => {
            e.preventDefault();
            el.classList.remove('bg-amber-500/20');
            handleDropOnScene(e, sceneKey);
        };
        sceneList.appendChild(el);
    });
}

function addNewScene() {
    const name = prompt("New scene name:");
    if (!name) return;
    scenes.push(name);
    saveData();
    renderScenes();
}

function editScene(oldName) {
    const newName = prompt("Edit scene name:", oldName);
    if (!newName || newName === oldName) return;
    
    scenes = scenes.map(s => s === oldName ? newName : s);
    sounds.forEach(s => {
        if (s.scene === oldName.toLowerCase().replace(/\s+/g, '-')) {
            s.scene = newName.toLowerCase().replace(/\s+/g, '-');
        }
    });
    saveData();
    renderScenes();
    renderSoundGrid();
}

function handleDropOnScene(e, targetSceneKey) {
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'));
    files.forEach(file => addSoundFromFile(file, targetSceneKey));
}

// Drag & Drop on Grid
soundGrid.ondragover = (e) => e.preventDefault();
soundGrid.ondrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => {
        if (file.type.startsWith('audio/')) addSoundFromFile(file);
    });
};

function addSoundFromFile(file, targetScene = null) {
    const url = URL.createObjectURL(file);
    const scene = targetScene || (currentScene === 'all' ? 'act-1' : currentScene);
    
    sounds.push({
        id: 'sound-' + Date.now() + Math.random().toString(36).substr(2, 8),
        name: file.name.replace(/\.(mp3|wav|ogg|m4a)$/i, ''),
        url: url,
        scene: scene,
        duration: 0,
        startTime: 0,
        endTime: 0,        // 0 = full duration
        volume: 1.0,
        eq: { bass: 0, mid: 0, treble: 0 } // simple EQ
    });
    
    saveData();
    renderSoundGrid();
}

// Updated file input
document.getElementById('file-input').addEventListener('change', (e) => {
    Array.from(e.target.files).forEach(file => {
        if (file.type.startsWith('audio/')) addSoundFromFile(file);
    });
});

function getSceneForSound(sound) {
    return sound.scene || 'all';
}

function renderSoundGrid(filtered = null) {
    soundGrid.innerHTML = '';
    soundGrid.className = 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6';

    const toRender = filtered || sounds.filter(s => {
        if (currentScene === 'all') return true;
        return getSceneForSound(s) === currentScene;
    });

    if (toRender.length === 0) {
        soundGrid.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center h-96 text-zinc-500">
            <i class="fa-solid fa-music text-7xl mb-6 opacity-20"></i>
            <p class="text-xl">Drop music here or use upload</p>
        </div>`;
        return;
    }

    toRender.forEach((sound, idx) => {
        const globalIdx = sounds.findIndex(s => s.id === sound.id);
        const btn = document.createElement('div');
        btn.className = `sound-btn group bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-3xl p-6 cursor-pointer`;
        btn.draggable = true;
        btn.ondragstart = (e) => e.dataTransfer.setData('text/plain', globalIdx);
        
        const isPlaying = playingAudios.has(sound.id);
        const displayDuration = sound.duration ? formatTime(sound.duration) : '--:--';
        
        btn.innerHTML = `
            <div class="flex justify-between items-start mb-4">
                <div class="w-14 h-14 bg-zinc-800 rounded-2xl flex items-center justify-center text-3xl">🎵</div>
                ${isPlaying ? `<span class="px-3 py-1 text-xs bg-amber-500 text-zinc-950 rounded-full animate-pulse">PLAYING</span>` : ''}
            </div>
            <h3 class="font-semibold text-lg leading-tight mb-1 line-clamp-2">${sound.name}</h3>
            <p class="text-xs text-zinc-500">${sound.scene ? sound.scene.replace('-', ' ').toUpperCase() : 'GENERAL'}</p>
            <div class="mt-4 text-xs text-amber-400 font-mono">${displayDuration}</div>
            
            <div class="flex gap-3 mt-6">
                <button onclick="event.stopImmediatePropagation(); editSound('${sound.id}');" 
                        class="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-xs">EDIT</button>
                <button onclick="event.stopImmediatePropagation(); toggleSound(${globalIdx});" 
                        class="flex-1 py-2 ${isPlaying ? 'bg-red-500/20 text-red-400' : 'bg-amber-500 text-zinc-950'} rounded-2xl text-xs font-semibold">
                    ${isPlaying ? 'PAUSE' : 'PLAY'}
                </button>
            </div>
        `;
        
        btn.onclick = () => toggleSound(globalIdx);
        soundGrid.appendChild(btn);
    });

    statusEl.innerHTML = `${sounds.length} sounds • ${toRender.length} shown`;
}

function formatTime(seconds) {
    if (!seconds) return '0:00';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

// ==================== AUDIO PLAYBACK ====================

async function toggleSound(index) {
    const sound = sounds[index];
    if (!sound) return;

    if (playingAudios.has(sound.id)) {
        const audio = playingAudios.get(sound.id);
        fadeOut(audio, 800, () => {
            audio.pause();
            playingAudios.delete(sound.id);
            renderSoundGrid();
        });
    } else {
        const audio = new Audio(sound.url);
        audio.volume = 0;
        audio.currentTime = sound.startTime || 0;
        
        // Simple EQ simulation via Web Audio API (basic)
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaElementSource(audio);
        const gainNode = audioContext.createGain();
        gainNode.gain.value = sound.volume || 1;
        
        source.connect(gainNode).connect(audioContext.destination);
        
        audio.onended = () => {
            playingAudios.delete(sound.id);
            renderSoundGrid();
        };
        
        playingAudios.set(sound.id, audio);
        
        try {
            await audio.play();
            fadeIn(audio, 800, masterVolume * (sound.volume || 1));
            renderSoundGrid();
            
            // Load duration if not present
            if (!sound.duration) {
                audio.onloadedmetadata = () => {
                    sound.duration = audio.duration;
                    sound.endTime = sound.endTime || audio.duration;
                    saveData();
                    renderSoundGrid();
                };
            }
        } catch (err) {
            console.error(err);
        }
    }
}

// Fade functions remain the same (from your original)

// ==================== SOUND EDITOR ====================

function editSound(id) {
    currentEditingSoundId = id;
    const sound = sounds.find(s => s.id === id);
    if (!sound) return;

    const modal = document.getElementById('sound-editor-modal');
    const content = document.getElementById('editor-content');
    
    content.innerHTML = `
        <div class="space-y-8">
            <div>
                <label class="block text-sm text-zinc-400 mb-2">Name</label>
                <input id="edit-name" value="${sound.name}" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-3">
            </div>
            
            <div>
                <label class="block text-sm text-zinc-400 mb-2">Scene</label>
                <select id="edit-scene" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-3">
                    ${scenes.map(scene => {
                        const key = scene.toLowerCase().replace(/\s+/g, '-');
                        return `<option value="${key}" ${sound.scene === key ? 'selected' : ''}>${scene}</option>`;
                    }).join('')}
                </select>
            </div>
            
            <div class="grid grid-cols-2 gap-6">
                <div>
                    <label class="block text-sm text-zinc-400 mb-2">Start Time (s)</label>
                    <input type="number" id="edit-start" value="${sound.startTime || 0}" step="0.1" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-3">
                </div>
                <div>
                    <label class="block text-sm text-zinc-400 mb-2">End Time (s)</label>
                    <input type="number" id="edit-end" value="${sound.endTime || sound.duration || ''}" step="0.1" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-3">
                </div>
            </div>
            
            <div>
                <label class="block text-sm text-zinc-400 mb-3">Volume</label>
                <input type="range" id="edit-volume" min="0" max="1" step="0.01" value="${sound.volume || 1}" class="w-full accent-amber-500">
                <div class="text-right text-xs text-zinc-500" id="volume-val">${Math.round((sound.volume || 1) * 100)}%</div>
            </div>
            
            <!-- Simple EQ -->
            <div class="grid grid-cols-3 gap-4">
                <div>
                    <label class="block text-xs text-zinc-400 mb-1">Bass</label>
                    <input type="range" id="eq-bass" min="-12" max="12" value="${sound.eq?.bass || 0}" class="w-full accent-amber-500">
                </div>
                <div>
                    <label class="block text-xs text-zinc-400 mb-1">Mid</label>
                    <input type="range" id="eq-mid" min="-12" max="12" value="${sound.eq?.mid || 0}" class="w-full accent-amber-500">
                </div>
                <div>
                    <label class="block text-xs text-zinc-400 mb-1">Treble</label>
                    <input type="range" id="eq-treble" min="-12" max="12" value="${sound.eq?.treble || 0}" class="w-full accent-amber-500">
                </div>
            </div>
        </div>
    `;
    
    // Live volume preview
    const volSlider = content.querySelector('#edit-volume');
    const volVal = content.querySelector('#volume-val');
    volSlider.oninput = () => volVal.textContent = Math.round(volSlider.value * 100) + '%';
    
    modal.classList.remove('hidden');
}

function saveSoundEditor() {
    const sound = sounds.find(s => s.id === currentEditingSoundId);
    if (!sound) return;
    
    sound.name = document.getElementById('edit-name').value;
    sound.scene = document.getElementById('edit-scene').value;
    sound.startTime = parseFloat(document.getElementById('edit-start').value) || 0;
    sound.endTime = parseFloat(document.getElementById('edit-end').value) || 0;
    sound.volume = parseFloat(document.getElementById('edit-volume').value);
    
    sound.eq = {
        bass: parseFloat(document.getElementById('eq-bass').value),
        mid: parseFloat(document.getElementById('eq-mid').value),
        treble: parseFloat(document.getElementById('eq-treble').value)
    };
    
    saveData();
    hideSoundEditor();
    renderSoundGrid();
}

function hideSoundEditor() {
    document.getElementById('sound-editor-modal').classList.add('hidden');
}

// Other functions (stopAllSounds, deleteSound, clearAll, filterSounds, etc.) remain similar — update deleteSound to also remove from playingAudios.

function deleteSound(index) {
    if (!confirm('Delete this sound?')) return;
    const sound = sounds[index];
    if (playingAudios.has(sound.id)) {
        playingAudios.get(sound.id).pause();
        playingAudios.delete(sound.id);
    }
    URL.revokeObjectURL(sound.url);
    sounds.splice(index, 1);
    saveData();
    renderSoundGrid();
}

// Add waveform visualization in editor if you want (advanced, using canvas + Web Audio API)

window.onload = () => {
    loadData();
    console.log('%cCLSF Soundboard v2 • Enhanced', 'color:#f59e0b; font-family:monospace');
};