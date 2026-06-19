let playlist = [];
let currentTrackIndex = -1;
let isPlaying = false;

let audio1 = document.getElementById('audio-player-1');
let audio2 = document.getElementById('audio-player-2');
let currentAudio = audio1;        // Currently playing audio
let nextAudio = audio2;           // Audio used for next track

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

let isDragging = false;
let fadeInterval = null;
const CROSSFADE_DURATION = 1800; // milliseconds (1.8 seconds)

// Load from localStorage
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
    
    filteredPlaylist.forEach((track) => {
        const originalIndex = playlist.findIndex(t => t.name === track.name);
        const trackEl = document.createElement('div');
        trackEl.className = `track-item px-4 py-3 rounded-2xl flex items-center gap-4 cursor-pointer ${originalIndex === currentTrackIndex ? 'active-track' : ''}`;
        
        trackEl.innerHTML = `
            <div class="w-10 h-10 bg-zinc-700 rounded-xl flex-shrink-0 flex items-center justify-center">
                <i class="fa-solid fa-music text-yellow-400"></i>
            </div>
            <div class="flex-1 min-w-0">
                <p class="font-medium truncate">${track.name}</p>
                <p class="text-xs text-zinc-500 truncate">${track.artist || 'Unknown Artist'}</p>
            </div>
            <div class="text-xs text-zinc-500">${formatTime(track.duration || 0)}</div>
        `;
        
        trackEl.onclick = () => playTrack(originalIndex);
        playlistEl.appendChild(trackEl);
    });
    
    trackCountEl.textContent = `${playlist.length} track${playlist.length === 1 ? '' : 's'}`;
}

function formatTime(seconds) {
    if (!seconds) return "0:00";
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

// Upload files
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
    
    if (currentTrackIndex === -1 && playlist.length > 0) {
        playTrack(0);
    }
});

function playTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    
    const track = playlist[index];
    currentTrackIndex = index;
    
    // Switch active audio references
    const oldAudio = currentAudio;
    currentAudio = nextAudio;
    nextAudio = oldAudio;
    
    // Load next track
    currentAudio.src = track.url;
    currentAudio.volume = 0; // Start faded out
    
    trackTitleEl.textContent = track.name;
    trackArtistEl.textContent = track.artist;
    
    // Start crossfade
    crossfadeToNewTrack();
    
    renderPlaylist();
}

function crossfadeToNewTrack() {
    if (fadeInterval) clearInterval(fadeInterval);
    
    const startTime = Date.now();
    const oldAudio = nextAudio; // The one that was previously playing
    
    currentAudio.play().then(() => {
        isPlaying = true;
        playIcon.classList.replace('fa-play', 'fa-pause');
        albumArtContainer.classList.add('playing');
        
        fadeInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / CROSSFADE_DURATION, 1);
            
            // Fade in new track
            currentAudio.volume = progress * volumeSlider.value;
            
            // Fade out old track
            if (oldAudio && !oldAudio.paused) {
                oldAudio.volume = (1 - progress) * volumeSlider.value;
            }
            
            if (progress >= 1) {
                clearInterval(fadeInterval);
                if (oldAudio) {
                    oldAudio.pause();
                    oldAudio.volume = 0;
                }
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

// Progress handling (only track currentAudio)
function updateProgress() {
    if (!currentAudio.duration || isDragging) return;
    
    const progress = (currentAudio.currentTime / currentAudio.duration) * 100;
    progressBar.style.width = `${progress}%`;
    progressThumb.style.left = `${progress}%`;
    
    currentTimeEl.textContent = formatTime(currentAudio.currentTime);
    durationEl.textContent = formatTime(currentAudio.duration);
}

currentAudio.addEventListener('timeupdate', updateProgress);
audio1.addEventListener('timeupdate', () => { if (currentAudio === audio1) updateProgress(); });
audio2.addEventListener('timeupdate', () => { if (currentAudio === audio2) updateProgress(); });

currentAudio.addEventListener('ended', () => {
    nextTrack();
});

currentAudio.addEventListener('loadedmetadata', () => {
    if (playlist[currentTrackIndex]) {
        playlist[currentTrackIndex].duration = currentAudio.duration;
        renderPlaylist();
    }
});

// Seek (affects current audio)
function seek(e) {
    if (currentTrackIndex === -1) return;
    const rect = progressContainer.getBoundingClientRect();
    let pos = (e.clientX - rect.left) / rect.width;
    pos = Math.max(0, Math.min(1, pos));
    currentAudio.currentTime = pos * currentAudio.duration;
}

// Drag support
progressContainer.addEventListener('mousedown', (e) => {
    isDragging = true;
    seek(e);
});

document.addEventListener('mousemove', (e) => {
    if (isDragging) seek(e);
});

document.addEventListener('mouseup', () => {
    isDragging = false;
});

// Volume control
volumeSlider.addEventListener('input', () => {
    if (currentAudio) currentAudio.volume = volumeSlider.value;
});

// Filter & Clear
function filterPlaylist() {
    const term = searchInput.value.toLowerCase().trim();
    if (!term) {
        renderPlaylist();
        return;
    }
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
        trackTitleEl.textContent = "No track selected";
        trackArtistEl.textContent = "Upload some music to get started";
        playIcon.classList.replace('fa-pause', 'fa-play');
        albumArtContainer.classList.remove('playing');
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowRight') nextTrack();
    if (e.code === 'ArrowLeft') prevTrack();
});

function init() {
    loadLibrary();
    console.log('%cVibeVault with Crossfade ready 🎵', 'color: #eab308; font-size: 13px; font-family: monospace');
}

window.onload = init;