let playlist = [];
let currentTrackIndex = -1;
let isPlaying = false;

let audio1 = document.getElementById('audio-player-1');
let audio2 = document.getElementById('audio-player-2');
let currentAudio = audio1;
let nextAudio = audio2;

const playlistEl = document.getElementById('playlist');
const trackTitleEl = document.getElementById('track-title');
const trackArtistEl = document.getElementById('track-artist');
const albumArtContainer = document.getElementById('album-art-container');
const progressBar = document.getElementById('progress-bar');
const progressThumb = document.getElementById('progress-thumb');
const progressContainer = document.getElementById('progress-container');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');
const playIcon = document.getElementById('play-icon');
const volumeSlider = document.getElementById('volume-slider');
const trackCountEl = document.getElementById('track-count');
const searchInput = document.getElementById('search-input');
const scenesListEl = document.getElementById('scenes-list');

let isDragging = false;
let dragItemIndex = null;
let fadeInterval = null;
const CROSSFADE_DURATION = 1800;

// ==================== SCENES / ACTS STATE ====================
// Data model:
// scenes = [
//   { id, title, acts: [
//       { id, title, tracks: [trackObj, ...] }
//   ]}
// ]

let scenes = [];
let sceneIdCounter = 0;
let actIdCounter = 0;

// ==================== LIBRARY ====================

function loadLibrary() {
    const saved = localStorage.getItem('vibevault_library');
    if (saved) {
        playlist = JSON.parse(saved);
        renderPlaylist();
    }
}

function saveLibrary() {
    localStorage.setItem('vibevault_library', JSON.stringify(playlist));
}

// ==================== SCENES STORAGE ====================

function saveScenes() {
    // Only save track metadata (name, artist, duration), not blob URLs (they don't persist across reloads)
    const toSave = scenes.map(s => ({
        id: s.id,
        title: s.title,
        acts: s.acts.map(a => ({
            id: a.id,
            title: a.title,
            tracks: a.tracks.map(t => ({ name: t.name, artist: t.artist, duration: t.duration, url: t.url }))
        }))
    }));
    localStorage.setItem('clsf_scenes', JSON.stringify(toSave));
}

function loadScenes() {
    const saved = localStorage.getItem('clsf_scenes');
    if (saved) {
        scenes = JSON.parse(saved);

        // Migrate any old data shape (scene.tracks directly, no acts) into the new acts model
        scenes.forEach(s => {
            if (!Array.isArray(s.acts)) {
                const legacyTracks = Array.isArray(s.tracks) ? s.tracks : [];
                s.acts = legacyTracks.length
                    ? [{ id: actIdCounter++, title: 'Act 1', tracks: legacyTracks }]
                    : [];
                delete s.tracks;
            }
        });

        sceneIdCounter = scenes.reduce((max, s) => Math.max(max, s.id), -1) + 1;
        actIdCounter = scenes.reduce((max, s) =>
            Math.max(max, s.acts.reduce((m, a) => Math.max(m, a.id), -1)), -1) + 1;

        renumberScenes();
        renderScenes();
    }
}

// ==================== ADD / DELETE SCENE ====================

function addScene() {
    const scene = {
        id: sceneIdCounter++,
        title: `Scene ${scenes.length + 1}`,
        acts: []
    };
    scenes.push(scene);
    renumberScenes();
    saveScenes();
    renderScenes();
}

function deleteScene(sceneId) {
    scenes = scenes.filter(s => s.id !== sceneId);
    renumberScenes();
    saveScenes();
    renderScenes();
}

// Keep scene titles as "Scene 1", "Scene 2"... in order, unless the user has
// renamed a scene to something custom (we only auto-rename titles that still
// match the default "Scene N" pattern).
function renumberScenes() {
    scenes.forEach((s, idx) => {
        const defaultPattern = /^Scene \d+$/;
        if (!s.title || defaultPattern.test(s.title)) {
            s.title = `Scene ${idx + 1}`;
        }
    });
}

// ==================== ADD / DELETE ACT ====================

function addAct(sceneId) {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    scene.acts.push({
        id: actIdCounter++,
        title: `Act ${scene.acts.length + 1}`,
        tracks: []
    });
    saveScenes();
    renderScenes();
}

function deleteAct(sceneId, actId) {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    scene.acts = scene.acts.filter(a => a.id !== actId);
    saveScenes();
    renderScenes();
}

function removeTrackFromAct(sceneId, actId, trackIndex) {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    const act = scene.acts.find(a => a.id === actId);
    if (!act) return;
    act.tracks.splice(trackIndex, 1);
    saveScenes();
    renderScenes();
}

// ==================== RENDER PLAYLIST ====================

function renderPlaylist(filteredPlaylist = playlist) {
    playlistEl.innerHTML = '';

    if (filteredPlaylist.length === 0) {
        playlistEl.innerHTML = `
            <div class="flex flex-col items-center justify-center h-64 text-zinc-500">
                <i class="fa-solid fa-music text-5xl mb-4 opacity-30"></i>
                <p class="text-sm">Your library is empty</p>
                <p class="text-xs mt-1">Upload MP3 files to begin</p>
            </div>
        `;
        return;
    }

    const isFiltered = filteredPlaylist.length !== playlist.length;

    filteredPlaylist.forEach((track) => {
        const originalIndex = playlist.findIndex(t => t.name === track.name && t.url === track.url);
        if (originalIndex === -1) return;

        const trackEl = document.createElement('div');
        trackEl.className = `track-item px-4 py-3 rounded-2xl flex items-center gap-4 cursor-pointer select-none 
                             ${originalIndex === currentTrackIndex ? 'active-track' : ''}`;
        trackEl.draggable = true;
        trackEl.dataset.index = originalIndex;

        trackEl.innerHTML = `
            <div class="w-9 h-9 bg-zinc-700 rounded-xl flex-shrink-0 flex items-center justify-center">
                <i class="fa-solid fa-music text-yellow-400 text-sm"></i>
            </div>
            <div class="flex-1 min-w-0">
                <p class="font-medium truncate text-sm">${track.name}</p>
                <p class="text-xs text-zinc-500 truncate">${track.artist || 'Unknown Artist'}</p>
            </div>
            <div class="text-xs text-zinc-500">${formatTime(track.duration || 0)}</div>
            <div class="text-zinc-500 opacity-40 hover:opacity-100 transition-opacity cursor-grab">
                <i class="fa-solid fa-grip-lines text-xs"></i>
            </div>
        `;

        // Click to play
        trackEl.addEventListener('click', (e) => {
            if (e.target.closest('.fa-grip-lines')) return;
            playTrack(originalIndex);
        });

        // Drag start — tag payload as coming from the library
        trackEl.addEventListener('dragstart', (e) => {
            dragItemIndex = originalIndex;
            trackEl.classList.add('opacity-50', 'scale-95');
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'library', index: originalIndex }));
        });

        trackEl.addEventListener('dragend', () => {
            trackEl.classList.remove('opacity-50', 'scale-95');
            dragItemIndex = null;
            document.querySelectorAll('.track-item').forEach(el =>
                el.classList.remove('border-t-2', 'border-yellow-500', 'bg-zinc-800'));
        });

        // Internal playlist reorder DnD (only when not filtered by search)
        if (!isFiltered) {
            trackEl.addEventListener('dragover', (e) => {
                const data = e.dataTransfer.getData('text/plain');
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.source !== 'library') return;
                } catch {}
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = trackEl.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                document.querySelectorAll('.track-item').forEach(el => el.classList.remove('border-t-2', 'border-yellow-500'));
                if (e.clientY < midpoint) {
                    trackEl.classList.add('border-t-2', 'border-yellow-500');
                } else {
                    trackEl.classList.add('bg-zinc-800');
                }
            });

            trackEl.addEventListener('dragleave', () => {
                trackEl.classList.remove('border-t-2', 'border-yellow-500', 'bg-zinc-800');
            });

            trackEl.addEventListener('drop', (e) => {
                e.preventDefault();
                const fromIndex = dragItemIndex;
                const toIndex = parseInt(trackEl.dataset.index);
                if (fromIndex === null || fromIndex === toIndex) return;
                const [movedTrack] = playlist.splice(fromIndex, 1);
                playlist.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, movedTrack);
                if (currentTrackIndex === fromIndex) {
                    currentTrackIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
                } else if (currentTrackIndex > fromIndex && currentTrackIndex <= toIndex) {
                    currentTrackIndex--;
                } else if (currentTrackIndex < fromIndex && currentTrackIndex >= toIndex) {
                    currentTrackIndex++;
                }
                saveLibrary();
                renderPlaylist(searchInput.value.trim() ?
                    playlist.filter(t => t.name.toLowerCase().includes(searchInput.value.toLowerCase())) : playlist);
            });
        }

        playlistEl.appendChild(trackEl);
    });

    trackCountEl.textContent = `${playlist.length} track${playlist.length === 1 ? '' : 's'}`;
}

// Make the Library panel itself a drop target, so cut clips from the
// Music Editor (and tracks dragged from an Act) can be dropped back in.
function setupLibraryDropTarget() {
    const libraryPanel = playlistEl.closest('.xl\\:col-span-3') || playlistEl.parentElement;
    if (!libraryPanel) return;

    libraryPanel.addEventListener('dragover', (e) => {
        const data = e.dataTransfer.getData('text/plain');
        let parsed;
        try { parsed = JSON.parse(data); } catch { return; }
        if (parsed.source !== 'editor') return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        libraryPanel.classList.add('ring-2', 'ring-yellow-500/50');
    });

    libraryPanel.addEventListener('dragleave', (e) => {
        if (!libraryPanel.contains(e.relatedTarget)) {
            libraryPanel.classList.remove('ring-2', 'ring-yellow-500/50');
        }
    });

    libraryPanel.addEventListener('drop', (e) => {
        let data;
        try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
        if (data.source !== 'editor') return;
        e.preventDefault();
        libraryPanel.classList.remove('ring-2', 'ring-yellow-500/50');
        addClipToLibrary(data.clipId);
    });
}

// ==================== RENDER SCENES ====================

function renderScenes() {
    scenesListEl.innerHTML = '';

    if (scenes.length === 0) {
        scenesListEl.innerHTML = `
            <div class="scenes-empty">
                <i class="fa-solid fa-clapperboard"></i>
                <p>No scenes yet</p>
                <span>Click "Add Scene" to create one,<br>then add Acts inside it</span>
            </div>
        `;
        return;
    }

    scenes.forEach((scene) => {
        const card = document.createElement('div');
        card.className = 'scene-card';
        card.dataset.sceneId = scene.id;

        // ---- Scene header ----
        const header = document.createElement('div');
        header.className = 'scene-card-header';

        const numBadge = document.createElement('div');
        numBadge.className = 'scene-number';
        numBadge.textContent = scenes.indexOf(scene) + 1;

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'scene-title-input';
        titleInput.value = scene.title;
        titleInput.addEventListener('change', () => {
            scene.title = titleInput.value.trim() || `Scene ${scenes.indexOf(scene) + 1}`;
            saveScenes();
        });

        const addActBtn = document.createElement('button');
        addActBtn.className = 'scene-add-act-btn';
        addActBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Act';
        addActBtn.title = 'Add an Act to this scene';
        addActBtn.addEventListener('click', () => addAct(scene.id));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'scene-delete-btn';
        deleteBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        deleteBtn.title = 'Delete scene';
        deleteBtn.addEventListener('click', () => {
            if (confirm(`Delete "${scene.title}"?`)) deleteScene(scene.id);
        });

        header.appendChild(numBadge);
        header.appendChild(titleInput);
        header.appendChild(addActBtn);
        header.appendChild(deleteBtn);
        card.appendChild(header);

        // ---- Acts list ----
        const actsList = document.createElement('div');
        actsList.className = 'scene-acts';

        if (scene.acts.length === 0) {
            const hint = document.createElement('div');
            hint.className = 'act-empty-hint';
            hint.innerHTML = '<i class="fa-solid fa-layer-group"></i><span>No Acts yet — click "+ Act" to add one</span>';
            actsList.appendChild(hint);
        } else {
            scene.acts.forEach((act, actIdx) => {
                actsList.appendChild(renderActCard(scene, act, actIdx));
            });
        }

        card.appendChild(actsList);
        scenesListEl.appendChild(card);
    });
}

function renderActCard(scene, act, actIdx) {
    const actCard = document.createElement('div');
    actCard.className = 'act-card';
    actCard.dataset.sceneId = scene.id;
    actCard.dataset.actId = act.id;

    // Act header
    const actHeader = document.createElement('div');
    actHeader.className = 'act-card-header';

    const actBadge = document.createElement('div');
    actBadge.className = 'act-number';
    actBadge.textContent = actIdx + 1;

    const actTitleInput = document.createElement('input');
    actTitleInput.type = 'text';
    actTitleInput.className = 'act-title-input';
    actTitleInput.value = act.title;
    actTitleInput.addEventListener('change', () => {
        act.title = actTitleInput.value.trim() || `Act ${actIdx + 1}`;
        saveScenes();
    });

    const actDeleteBtn = document.createElement('button');
    actDeleteBtn.className = 'act-delete-btn';
    actDeleteBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    actDeleteBtn.title = 'Delete act';
    actDeleteBtn.addEventListener('click', () => {
        if (confirm(`Delete "${act.title}"?`)) deleteAct(scene.id, act.id);
    });

    actHeader.appendChild(actBadge);
    actHeader.appendChild(actTitleInput);
    actHeader.appendChild(actDeleteBtn);
    actCard.appendChild(actHeader);

    // Act track list (drop target for library tracks)
    const trackList = document.createElement('div');
    trackList.className = 'act-tracks';

    if (act.tracks.length === 0) {
        const hint = document.createElement('div');
        hint.className = 'scene-drop-hint';
        hint.innerHTML = '<i class="fa-solid fa-arrow-down-to-line"></i><span>Drop tracks here</span>';
        trackList.appendChild(hint);
    } else {
        act.tracks.forEach((track, trackIdx) => {
            const item = document.createElement('div');
            item.className = 'scene-track-item';
            item.draggable = true;
            item.dataset.sceneId = scene.id;
            item.dataset.actId = act.id;
            item.dataset.trackIdx = trackIdx;

            item.innerHTML = `
                <button class="scene-track-play-btn" title="Play track">
                    <i class="fa-solid fa-play"></i>
                </button>
                <span class="scene-track-name">${track.name}</span>
                <span class="scene-track-duration">${formatTime(track.duration || 0)}</span>
                <button class="scene-track-remove-btn" title="Remove from act">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `;

            item.querySelector('.scene-track-play-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                playSceneTrack(track);
            });

            item.querySelector('.scene-track-remove-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                removeTrackFromAct(scene.id, act.id, trackIdx);
            });

            // Drag track within/between acts
            item.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', JSON.stringify({
                    source: 'act',
                    sceneId: scene.id,
                    actId: act.id,
                    trackIdx
                }));
            });
            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });

            trackList.appendChild(item);
        });
    }

    actCard.appendChild(trackList);

    // ---- Drop handling on the act card (receives library tracks, editor clips, or moved act tracks) ----
    actCard.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        actCard.classList.add('drag-over');
    });

    actCard.addEventListener('dragleave', (e) => {
        if (!actCard.contains(e.relatedTarget)) {
            actCard.classList.remove('drag-over');
        }
    });

    actCard.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        actCard.classList.remove('drag-over');

        let data;
        try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }

        if (data.source === 'library') {
            const track = playlist[data.index];
            if (!track) return;
            if (act.tracks.some(t => t.name === track.name)) {
                showSceneToast(`"${track.name}" is already in this act`);
                return;
            }
            act.tracks.push({ ...track });
            saveScenes();
            renderScenes();
        } else if (data.source === 'editor') {
            // A freshly cut clip dragged straight from the Music Editor panel
            const clip = editorClips.find(c => c.id === data.clipId);
            if (!clip) return;
            if (act.tracks.some(t => t.name === clip.name)) {
                showSceneToast(`"${clip.name}" is already in this act`);
                return;
            }
            act.tracks.push({ name: clip.name, artist: clip.artist, duration: clip.duration, url: clip.url });
            saveScenes();
            renderScenes();
            showSceneToast(`Added "${clip.name}" to ${act.title}`);
        } else if (data.source === 'act') {
            // Moving a track from one act to another (or reordering within the same act)
            const fromScene = scenes.find(s => s.id === data.sceneId);
            const fromAct = fromScene && fromScene.acts.find(a => a.id === data.actId);
            if (!fromAct) return;

            const [moved] = fromAct.tracks.splice(data.trackIdx, 1);
            if (!moved) return;

            if (fromAct.id === act.id) {
                // same act: just push to end (simple reorder-to-end)
                act.tracks.push(moved);
            } else {
                if (act.tracks.some(t => t.name === moved.name)) {
                    showSceneToast(`"${moved.name}" is already in this act`);
                    // put it back where it came from
                    fromAct.tracks.splice(data.trackIdx, 0, moved);
                } else {
                    act.tracks.push(moved);
                }
            }
            saveScenes();
            renderScenes();
        }
    });

    return actCard;
}

// Play a scene/act track by finding it in the library, or playing directly from its stored URL
function playSceneTrack(track) {
    const libIdx = playlist.findIndex(t => t.name === track.name);
    if (libIdx !== -1) {
        playTrack(libIdx);
    } else if (track.url) {
        currentAudio.src = track.url;
        currentAudio.volume = volumeSlider.value;
        currentAudio.play().then(() => {
            isPlaying = true;
            playIcon.classList.replace('fa-play', 'fa-pause');
            trackTitleEl.textContent = track.name;
            trackArtistEl.textContent = track.artist || 'Scene Track';
        }).catch(() => {
            showSceneToast('Track unavailable — re-upload the file');
        });
    } else {
        showSceneToast('Track unavailable — re-upload the file');
    }
}

function showSceneToast(msg) {
    let toast = document.getElementById('scene-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'scene-toast';
        toast.style.cssText = `
            position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
            background: #27272a; color: #e4e4e7; padding: 10px 20px;
            border-radius: 20px; font-size: 13px; z-index: 999;
            border: 1px solid #3f3f46; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            transition: opacity 0.3s;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

// ==================== PLAYER FUNCTIONS ====================

function formatTime(seconds) {
    if (!seconds) return "0:00";
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

document.getElementById('file-input').addEventListener('change', function(e) {
    const files = Array.from(e.target.files);
    files.forEach(file => {
        if (file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3')) {
            const url = URL.createObjectURL(file);
            playlist.push({
                name: file.name.replace(/\.(mp3|MP3)$/, ''),
                url: url,
                artist: 'Local File',
                duration: 0
            });
        }
    });
    saveLibrary();
    renderPlaylist();
    refreshEditorSourceOptions();
    if (currentTrackIndex === -1 && playlist.length > 0) {
        playTrack(0);
    }
});

function playTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    const track = playlist[index];
    currentTrackIndex = index;
    const oldAudio = currentAudio;
    currentAudio = nextAudio;
    nextAudio = oldAudio;
    currentAudio.src = track.url;
    currentAudio.volume = 0;
    trackTitleEl.textContent = track.name;
    trackArtistEl.textContent = track.artist;
    crossfadeToNewTrack();
    renderPlaylist();
}

function crossfadeToNewTrack() {
    if (fadeInterval) clearInterval(fadeInterval);
    const startTime = Date.now();
    const oldAudio = nextAudio;
    currentAudio.play().then(() => {
        isPlaying = true;
        playIcon.classList.replace('fa-play', 'fa-pause');
        albumArtContainer.classList.add('playing');
        fadeInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / CROSSFADE_DURATION, 1);
            currentAudio.volume = progress * volumeSlider.value;
            if (oldAudio && !oldAudio.paused) {
                oldAudio.volume = (1 - progress) * volumeSlider.value;
            }
            if (progress >= 1) {
                clearInterval(fadeInterval);
                if (oldAudio) { oldAudio.pause(); oldAudio.volume = 0; }
            }
        }, 16);
    }).catch(err => console.error(err));
}

function togglePlay() {
    if (currentTrackIndex === -1) {
        if (playlist.length > 0) playTrack(0);
        return;
    }
    if (isPlaying) {
        currentAudio.pause();
        playIcon.classList.replace('fa-pause', 'fa-play');
        albumArtContainer.classList.remove('playing');
    } else {
        currentAudio.play();
        playIcon.classList.replace('fa-play', 'fa-pause');
        albumArtContainer.classList.add('playing');
    }
    isPlaying = !isPlaying;
}

function nextTrack() {
    if (playlist.length === 0) return;
    let next = currentTrackIndex + 1;
    if (next >= playlist.length) next = 0;
    playTrack(next);
}

function prevTrack() {
    if (playlist.length === 0) return;
    let prev = currentTrackIndex - 1;
    if (prev < 0) prev = playlist.length - 1;
    playTrack(prev);
}

function updateProgress() {
    if (!currentAudio.duration || isDragging) return;
    const progress = (currentAudio.currentTime / currentAudio.duration) * 100;
    progressBar.style.width = `${progress}%`;
    progressThumb.style.left = `${progress}%`;
    currentTimeEl.textContent = formatTime(currentAudio.currentTime);
    durationEl.textContent = formatTime(currentAudio.duration);
}

audio1.addEventListener('timeupdate', () => { if (currentAudio === audio1) updateProgress(); });
audio2.addEventListener('timeupdate', () => { if (currentAudio === audio2) updateProgress(); });

audio1.addEventListener('ended', () => { if (currentAudio === audio1) nextTrack(); });
audio2.addEventListener('ended', () => { if (currentAudio === audio2) nextTrack(); });

audio1.addEventListener('loadedmetadata', () => {
    if (currentAudio === audio1 && playlist[currentTrackIndex]) {
        playlist[currentTrackIndex].duration = audio1.duration;
        renderPlaylist();
    }
});
audio2.addEventListener('loadedmetadata', () => {
    if (currentAudio === audio2 && playlist[currentTrackIndex]) {
        playlist[currentTrackIndex].duration = audio2.duration;
        renderPlaylist();
    }
});

function seek(e) {
    if (currentTrackIndex === -1) return;
    const rect = progressContainer.getBoundingClientRect();
    let pos = (e.clientX - rect.left) / rect.width;
    pos = Math.max(0, Math.min(1, pos));
    currentAudio.currentTime = pos * currentAudio.duration;
}

progressContainer.addEventListener('mousedown', (e) => { isDragging = true; seek(e); });
document.addEventListener('mousemove', (e) => { if (isDragging) seek(e); });
document.addEventListener('mouseup', () => { isDragging = false; });

volumeSlider.addEventListener('input', () => {
    if (currentAudio) currentAudio.volume = volumeSlider.value;
});

function filterPlaylist() {
    const term = searchInput.value.toLowerCase().trim();
    if (!term) { renderPlaylist(); return; }
    const filtered = playlist.filter(track => track.name.toLowerCase().includes(term));
    renderPlaylist(filtered);
}

function clearLibrary() {
    if (confirm("Clear entire library?")) {
        playlist = [];
        currentTrackIndex = -1;
        audio1.pause(); audio2.pause();
        audio1.src = ''; audio2.src = '';
        localStorage.removeItem('vibevault_library');
        renderPlaylist();
        refreshEditorSourceOptions();
        trackTitleEl.textContent = "No track selected";
        trackArtistEl.textContent = "Upload some music to get started";
        playIcon.classList.replace('fa-pause', 'fa-play');
        albumArtContainer.classList.remove('playing');
    }
}

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowRight') nextTrack();
    if (e.code === 'ArrowLeft') prevTrack();
});

// ==================== MUSIC EDITOR ====================
// Lets the user pick any track currently in the Library, trim it down to a
// start/end selection using two drag handles, preview the selection, and
// then "Cut" it into a standalone clip. Cutting is done fully client-side
// with the Web Audio API (decode -> slice the PCM buffer -> re-encode as a
// WAV blob), so no server and no extra codec library is needed. The
// resulting clip behaves just like a Library track: it can be dragged into
// an Act, or added to the Library with one click.

const editorSourceSelect = document.getElementById('editor-source-select');
const editorTrimArea = document.getElementById('editor-trim-area');
const editorEmptyHint = document.getElementById('editor-empty-hint');
const editorTrackRange = document.getElementById('editor-track-range');
const editorRangeFill = document.getElementById('editor-range-fill');
const editorHandleStart = document.getElementById('editor-handle-start');
const editorHandleEnd = document.getElementById('editor-handle-end');
const editorStartLabel = document.getElementById('editor-start-label');
const editorEndLabel = document.getElementById('editor-end-label');
const editorSelectionLabel = document.getElementById('editor-selection-label');
const editorStatus = document.getElementById('editor-status');
const editorCutBtn = document.getElementById('editor-cut-btn');
const editorClipsList = document.getElementById('editor-clips-list');
const editorPreviewAudio = document.getElementById('editor-preview-audio');

let audioCtx = null;
let editorDecodedBuffer = null; // AudioBuffer for the currently selected source track
let editorSourceIndex = -1;     // index into `playlist` of the track being edited
let editorRangeStart = 0;       // seconds
let editorRangeEnd = 0;         // seconds
let editorDraggingHandle = null; // 'start' | 'end' | null
let editorClips = [];           // [{ id, name, artist, duration, url, blob }]
let editorClipIdCounter = 0;

function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function refreshEditorSourceOptions() {
    const prevValue = editorSourceSelect.value;
    editorSourceSelect.innerHTML = '<option value="">Select a track from Library to edit…</option>';
    playlist.forEach((track, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = track.name;
        editorSourceSelect.appendChild(opt);
    });
    // Keep the current selection if that track still exists at the same index/name
    if (prevValue !== '' && playlist[prevValue]) {
        editorSourceSelect.value = prevValue;
    } else if (editorSourceIndex !== -1 && !playlist[editorSourceIndex]) {
        // The track being edited was removed from the library
        resetEditorTrimArea();
    }
}

async function onEditorSourceChange() {
    const idx = editorSourceSelect.value;
    if (idx === '') {
        resetEditorTrimArea();
        return;
    }
    const track = playlist[parseInt(idx)];
    if (!track) return;

    editorSourceIndex = parseInt(idx);
    resetEditorPreview();
    editorStatus.textContent = 'Decoding audio…';
    editorTrimArea.classList.add('hidden');
    editorEmptyHint.classList.remove('hidden');
    editorEmptyHint.textContent = 'Decoding audio…';

    try {
        const arrayBuffer = await fetch(track.url).then(r => r.arrayBuffer());
        const ctx = getAudioCtx();
        // decodeAudioData detaches/consumes the buffer, so this is safe to call once per load
        editorDecodedBuffer = await ctx.decodeAudioData(arrayBuffer);

        editorRangeStart = 0;
        editorRangeEnd = editorDecodedBuffer.duration;

        editorEmptyHint.classList.add('hidden');
        editorTrimArea.classList.remove('hidden');
        editorStatus.textContent = '';
        renderEditorRange();
    } catch (err) {
        console.error(err);
        editorEmptyHint.textContent = 'Could not decode this file for editing.';
        editorTrimArea.classList.add('hidden');
        editorDecodedBuffer = null;
    }
}

function resetEditorTrimArea() {
    editorSourceIndex = -1;
    editorDecodedBuffer = null;
    editorTrimArea.classList.add('hidden');
    editorEmptyHint.classList.remove('hidden');
    editorEmptyHint.textContent = 'Pick a track above to start trimming.';
    editorStatus.textContent = '';
}

function renderEditorRange() {
    if (!editorDecodedBuffer) return;
    const total = editorDecodedBuffer.duration;
    const startPct = (editorRangeStart / total) * 100;
    const endPct = (editorRangeEnd / total) * 100;

    editorHandleStart.style.left = `calc(${startPct}% - 6px)`;
    editorHandleEnd.style.left = `calc(${endPct}% - 6px)`;
    editorRangeFill.style.left = `${startPct}%`;
    editorRangeFill.style.width = `${Math.max(0, endPct - startPct)}%`;

    editorStartLabel.textContent = formatTime(editorRangeStart);
    editorEndLabel.textContent = formatTime(editorRangeEnd);
    editorSelectionLabel.textContent = formatTime(Math.max(0, editorRangeEnd - editorRangeStart));
}

// ---- Live playhead: shows exactly where preview playback currently is ----
const editorPlayhead = document.getElementById('editor-playhead');
const editorPlayheadTime = document.getElementById('editor-playhead-time');

// True only while editorPreviewAudio is being used to preview the trim
// selection (as opposed to playing a finished cut clip from the list below),
// so the playhead line only ever appears on the bar it's relevant to.
let editorPreviewIsActive = false;

function updateEditorPlayhead() {
    if (!editorPreviewIsActive || !editorDecodedBuffer) return;
    const total = editorDecodedBuffer.duration;
    if (!total) return;
    const pct = Math.max(0, Math.min(100, (editorPreviewAudio.currentTime / total) * 100));
    editorPlayhead.style.left = `${pct}%`;
    editorPlayheadTime.textContent = formatTime(editorPreviewAudio.currentTime);
}

function showEditorPlayhead() {
    editorPreviewIsActive = true;
    editorPlayhead.classList.remove('hidden');
    updateEditorPlayhead();
}

function hideEditorPlayhead() {
    editorPreviewIsActive = false;
    editorPlayhead.classList.add('hidden');
}

editorPreviewAudio.addEventListener('timeupdate', updateEditorPlayhead);

function editorPositionFromEvent(e) {
    const rect = editorTrackRange.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let pos = (clientX - rect.left) / rect.width;
    pos = Math.max(0, Math.min(1, pos));
    return pos * editorDecodedBuffer.duration;
}

function startEditorHandleDrag(which) {
    return (e) => {
        e.preventDefault();
        if (!editorDecodedBuffer) return;
        editorDraggingHandle = which;
        (which === 'start' ? editorHandleStart : editorHandleEnd).classList.add('active-handle');
    };
}

editorHandleStart.addEventListener('mousedown', startEditorHandleDrag('start'));
editorHandleEnd.addEventListener('mousedown', startEditorHandleDrag('end'));
editorHandleStart.addEventListener('touchstart', startEditorHandleDrag('start'));
editorHandleEnd.addEventListener('touchstart', startEditorHandleDrag('end'));

function handleEditorDragMove(e) {
    if (!editorDraggingHandle || !editorDecodedBuffer) return;
    resetEditorPreview();
    const time = editorPositionFromEvent(e);
    const minGap = Math.min(0.25, editorDecodedBuffer.duration / 2 || 0.25);

    if (editorDraggingHandle === 'start') {
        editorRangeStart = Math.min(time, editorRangeEnd - minGap);
        editorRangeStart = Math.max(0, editorRangeStart);
    } else {
        editorRangeEnd = Math.max(time, editorRangeStart + minGap);
        editorRangeEnd = Math.min(editorDecodedBuffer.duration, editorRangeEnd);
    }
    renderEditorRange();
}

function stopEditorDrag() {
    if (editorDraggingHandle) {
        editorHandleStart.classList.remove('active-handle');
        editorHandleEnd.classList.remove('active-handle');
    }
    editorDraggingHandle = null;
}

document.addEventListener('mousemove', handleEditorDragMove);
document.addEventListener('mouseup', stopEditorDrag);
document.addEventListener('touchmove', handleEditorDragMove);
document.addEventListener('touchend', stopEditorDrag);

// Click anywhere on the track to move the nearest handle there (quick adjust)
editorTrackRange.addEventListener('mousedown', (e) => {
    if (e.target === editorHandleStart || e.target === editorHandleEnd || !editorDecodedBuffer) return;
    resetEditorPreview();
    const time = editorPositionFromEvent(e);
    const distToStart = Math.abs(time - editorRangeStart);
    const distToEnd = Math.abs(time - editorRangeEnd);
    if (distToStart <= distToEnd) {
        editorRangeStart = Math.min(time, editorRangeEnd - 0.1);
    } else {
        editorRangeEnd = Math.max(time, editorRangeStart + 0.1);
    }
    renderEditorRange();
});

const editorPreviewBtn = document.getElementById('editor-preview-btn');
const editorPreviewIcon = document.getElementById('editor-preview-icon');
const editorPreviewLabel = document.getElementById('editor-preview-label');

let editorPreviewState = 'stopped'; // 'stopped' | 'playing' | 'paused'

// Toggles the Preview button between Play and Pause. Uses the lightweight
// <audio> element with the original file + currentTime range rather than
// re-decoding, for a fast preview. Calling play() while already playing
// pauses instead; calling it again resumes from where it left off (not
// from the start) until the selection's end is reached or it's reset.
function toggleEditorPreview() {
    if (!editorDecodedBuffer) return;

    if (editorPreviewState === 'playing') {
        pauseEditorPreview();
        return;
    }

    const track = playlist[editorSourceIndex];
    if (!track) return;

    // Fresh start (not resuming a pause): load the source and seek to the
    // selection start. On resume, keep whatever currentTime is already set.
    if (editorPreviewState === 'stopped') {
        editorPreviewAudio.src = track.url;
        editorPreviewAudio.currentTime = editorRangeStart;
    }

    editorPreviewAudio.play();
    editorPreviewState = 'playing';
    setEditorPreviewButton('pause');
    showEditorPlayhead();

    clearTimeout(editorPreviewAudio._stopTimer);
    const remainingMs = Math.max(0, (editorRangeEnd - editorPreviewAudio.currentTime) * 1000);
    editorPreviewAudio._stopTimer = setTimeout(() => {
        pauseEditorPreview();
        editorPreviewState = 'stopped'; // selection finished naturally -> next press restarts from the beginning
        hideEditorPlayhead();
    }, remainingMs);
}

function pauseEditorPreview() {
    editorPreviewAudio.pause();
    clearTimeout(editorPreviewAudio._stopTimer);
    if (editorPreviewState === 'playing') editorPreviewState = 'paused';
    setEditorPreviewButton('play');
    // Leave the playhead visible at its paused position — that's useful
    // feedback on its own — it only fully disappears on resetEditorPreview().
}

// Fully stops and rewinds the preview state (used when the user changes the
// source track or drags the trim handles, since the old selection/preview
// position is no longer valid).
function resetEditorPreview() {
    editorPreviewAudio.pause();
    clearTimeout(editorPreviewAudio._stopTimer);
    editorPreviewState = 'stopped';
    setEditorPreviewButton('play');
    hideEditorPlayhead();
}

function setEditorPreviewButton(mode) {
    if (mode === 'pause') {
        editorPreviewIcon.classList.replace('fa-play', 'fa-pause');
        editorPreviewLabel.textContent = 'Pause';
    } else {
        editorPreviewIcon.classList.replace('fa-pause', 'fa-play');
        editorPreviewLabel.textContent = 'Preview';
    }
}

editorPreviewAudio.addEventListener('ended', () => {
    editorPreviewState = 'stopped';
    setEditorPreviewButton('play');
    hideEditorPlayhead();
});

async function cutEditorSelection() {
    if (!editorDecodedBuffer) return;
    const track = playlist[editorSourceIndex];
    if (!track) return;

    const duration = editorRangeEnd - editorRangeStart;
    if (duration <= 0) {
        showSceneToast('Selection is empty — drag the handles to pick a range');
        return;
    }

    editorCutBtn.disabled = true;
    editorStatus.textContent = 'Cutting…';

    try {
        const buffer = editorDecodedBuffer;
        const sampleRate = buffer.sampleRate;
        const startSample = Math.floor(editorRangeStart * sampleRate);
        const endSample = Math.floor(editorRangeEnd * sampleRate);
        const frameCount = endSample - startSample;

        const ctx = getAudioCtx();
        const slicedBuffer = ctx.createBuffer(buffer.numberOfChannels, frameCount, sampleRate);
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const sourceData = buffer.getChannelData(ch).subarray(startSample, endSample);
            slicedBuffer.copyToChannel(sourceData, ch);
        }

        const wavBlob = audioBufferToWavBlob(slicedBuffer);
        const url = URL.createObjectURL(wavBlob);

        const clipName = `${track.name} (cut ${formatTime(editorRangeStart)}-${formatTime(editorRangeEnd)})`;
        const clip = {
            id: editorClipIdCounter++,
            name: clipName,
            artist: track.artist || 'Local File',
            duration: duration,
            url: url,
            blob: wavBlob
        };
        editorClips.unshift(clip);
        renderEditorClips();
        editorStatus.textContent = 'Cut complete';
        showSceneToast(`Cut "${clipName}"`);
    } catch (err) {
        console.error(err);
        editorStatus.textContent = 'Cut failed';
    } finally {
        editorCutBtn.disabled = false;
        setTimeout(() => { if (editorStatus.textContent === 'Cut complete') editorStatus.textContent = ''; }, 2000);
    }
}

// Encode a (possibly multi-channel) AudioBuffer as a 16-bit PCM WAV Blob.
// WAV is used instead of re-encoding to MP3 because MP3 encoding needs an
// external codec library; WAV keeps everything dependency-free and lossless.
function audioBufferToWavBlob(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const numFrames = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = numFrames * blockAlign;
    const bufferSize = 44 + dataSize;

    const arrBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrBuffer);

    function writeString(offset, str) {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }

    writeString(0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);          // fmt chunk size
    view.setUint16(20, 1, true);           // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true); // byte rate
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);          // bits per sample
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Interleave channels and write 16-bit PCM samples
    const channelData = [];
    for (let ch = 0; ch < numChannels; ch++) channelData.push(buffer.getChannelData(ch));

    let offset = 44;
    for (let i = 0; i < numFrames; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            let sample = channelData[ch][i];
            sample = Math.max(-1, Math.min(1, sample));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
            offset += 2;
        }
    }

    return new Blob([arrBuffer], { type: 'audio/wav' });
}

function renderEditorClips() {
    editorClipsList.innerHTML = '';

    if (editorClips.length === 0) {
        editorClipsList.innerHTML = `
            <div class="editor-clips-empty text-xs text-zinc-600 text-center py-8 border border-dashed border-zinc-700 rounded-2xl">
                Clips you cut will appear here.<br>Drag them into Library or an Act.
            </div>
        `;
        return;
    }

    editorClips.forEach((clip) => {
        const card = document.createElement('div');
        card.className = 'editor-clip-card';
        card.draggable = true;
        card.dataset.clipId = clip.id;

        card.innerHTML = `
            <div class="editor-clip-icon"><i class="fa-solid fa-scissors"></i></div>
            <div class="editor-clip-info">
                <p class="editor-clip-name">${clip.name}</p>
                <p class="editor-clip-meta">${formatTime(clip.duration)} • WAV clip</p>
            </div>
            <div class="editor-clip-actions">
                <button class="editor-clip-btn play-clip" title="Play"><i class="fa-solid fa-play"></i></button>
                <button class="editor-clip-btn add-to-library" title="Add to Library"><i class="fa-solid fa-list"></i></button>
                <button class="editor-clip-btn remove-clip" title="Discard clip"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `;

        card.querySelector('.play-clip').addEventListener('click', (e) => {
            e.stopPropagation();
            resetEditorPreview();
            editorPreviewAudio.src = clip.url;
            clearTimeout(editorPreviewAudio._stopTimer);
            editorPreviewAudio.play();
        });

        card.querySelector('.add-to-library').addEventListener('click', (e) => {
            e.stopPropagation();
            addClipToLibrary(clip.id);
        });

        card.querySelector('.remove-clip').addEventListener('click', (e) => {
            e.stopPropagation();
            editorClips = editorClips.filter(c => c.id !== clip.id);
            renderEditorClips();
        });

        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'editor', clipId: clip.id }));
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });

        editorClipsList.appendChild(card);
    });
}

function addClipToLibrary(clipId) {
    const clip = editorClips.find(c => c.id === clipId);
    if (!clip) return;
    if (playlist.some(t => t.name === clip.name)) {
        showSceneToast(`"${clip.name}" is already in your Library`);
        return;
    }
    playlist.push({ name: clip.name, url: clip.url, artist: clip.artist, duration: clip.duration });
    saveLibrary();
    renderPlaylist();
    refreshEditorSourceOptions();
    showSceneToast(`Added "${clip.name}" to Library`);
}

function init() {
    playlist = [];
    currentTrackIndex = -1;
    isPlaying = false;
    localStorage.removeItem('vibevault_library');
    audio1.pause(); audio2.pause();
    audio1.src = ''; audio2.src = '';
    playIcon.classList.replace('fa-pause', 'fa-play');
    albumArtContainer.classList.remove('playing');
    trackTitleEl.textContent = "No track selected";
    trackArtistEl.textContent = "Upload some music to get started";
    renderPlaylist();
    loadScenes();   // scenes/acts persist across refresh
    refreshEditorSourceOptions();
    renderEditorClips();
    setupLibraryDropTarget();
    console.log('%cCLSF SoundBoard ready 🎵', 'color: #eab308; font-size: 13px; font-family: monospace');
}

window.onload = init;
