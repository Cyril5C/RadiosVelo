const STREAM = (mount) => `https://icecast.radiofrance.fr/${mount}-hifi.aac?id=radiofrance`;

const STATIONS = [
  { id: 'fipelectro', brand: 'FIP', name: 'Electro', color: 'var(--fip)' },
  { id: 'fip', brand: 'FIP', name: 'FIP', color: 'var(--fip)' },
  { id: 'fiprock', brand: 'FIP', name: 'Rock', color: 'var(--fip)' },
  { id: 'fipjazz', brand: 'FIP', name: 'Jazz', color: 'var(--fip)' },
  { id: 'fipgroove', brand: 'FIP', name: 'Groove', color: 'var(--fip)' },
  { id: 'fiphiphop', brand: 'FIP', name: 'Hip-Hop', color: 'var(--fip)' },
  { id: 'fippop', brand: 'FIP', name: 'Pop', color: 'var(--fip)' },
  { id: 'fipworld', brand: 'FIP', name: 'Monde', color: 'var(--fip)' },
  { id: 'fipreggae', brand: 'FIP', name: 'Reggae', color: 'var(--fip)' },
  { id: 'fipmetal', brand: 'FIP', name: 'Metal', color: 'var(--fip)' },
  { id: 'fipnouveautes', brand: 'FIP', name: 'Nouveautés', color: 'var(--fip)' },
  { id: 'fipcultes', brand: 'FIP', name: 'Cultes', color: 'var(--fip)' },
  { id: 'franceinter', brand: 'Radio France', name: 'France Inter', color: 'var(--inter)' },
  { id: 'franceculture', brand: 'Radio France', name: 'France Culture', color: 'var(--culture)' },
];
const DEFAULT_ID = 'fipelectro';

const audio = document.getElementById('audio');
const grid = document.getElementById('grid');
const statusEl = document.getElementById('status');
const currentEl = document.getElementById('current');
const toggleBtn = document.getElementById('toggle');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const overlay = document.getElementById('overlay');

let current = STATIONS.find((s) => s.id === DEFAULT_ID);
let wantPlaying = false;
let retryTimer = null;
let retryDelay = 2000;
let switching = false;

const label = (s) => (s.brand === 'FIP' && s.name !== 'FIP' ? `FIP ${s.name}` : s.name);

function setStatus(text, kind = '') {
  statusEl.textContent = text;
  statusEl.className = `now-label ${kind}`;
}

function render() {
  grid.innerHTML = '';
  for (const s of STATIONS) {
    const btn = document.createElement('button');
    btn.className = 'station';
    btn.style.setProperty('--c', s.color);
    btn.dataset.id = s.id;
    btn.innerHTML = `<span class="brand">${s.brand}</span><span class="name">${s.name}</span>`;
    btn.addEventListener('click', () => play(s));
    grid.appendChild(btn);
  }
}

function updateUI() {
  currentEl.textContent = label(current);
  for (const btn of grid.children) {
    btn.classList.toggle('active', btn.dataset.id === current.id);
  }
  iconPlay.hidden = wantPlaying;
  iconPause.hidden = !wantPlaying;
  toggleBtn.setAttribute('aria-label', wantPlaying ? 'Pause' : 'Lecture');

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: label(current),
      artist: 'Radio France',
      album: 'Radios Vélo',
      artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
    navigator.mediaSession.playbackState = wantPlaying ? 'playing' : 'paused';
  }
}

function load(station) {
  clearTimeout(retryTimer);
  current = station;
  switching = true;
  // Paramètre anti-cache pour forcer une nouvelle connexion au flux live
  audio.src = `${STREAM(station.id)}&t=${Date.now()}`;
}

async function play(station = current) {
  wantPlaying = true;
  // Toujours repartir du direct, jamais d'un tampon en différé
  if (station !== current || audio.paused || audio.error) load(station);
  updateUI();
  setStatus('Connexion…');
  try {
    await audio.play();
    overlay.hidden = true;
  } catch (err) {
    switching = false;
    if (err.name === 'NotAllowedError') {
      wantPlaying = false;
      updateUI();
      setStatus('Prêt');
      document.getElementById('overlay-name').textContent = label(current);
      overlay.hidden = false;
    } else if (err.name !== 'AbortError') {
      scheduleRetry();
    }
  }
}

function pause() {
  wantPlaying = false;
  clearTimeout(retryTimer);
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  updateUI();
  setStatus('En pause');
}

function scheduleRetry() {
  if (!wantPlaying) return;
  clearTimeout(retryTimer);
  setStatus(`Reconnexion dans ${Math.round(retryDelay / 1000)} s…`, 'error');
  retryTimer = setTimeout(() => {
    if (wantPlaying) play(current).catch(() => {});
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 15000);
}

function step(delta) {
  const i = STATIONS.indexOf(current);
  play(STATIONS[(i + delta + STATIONS.length) % STATIONS.length]);
}

audio.addEventListener('playing', () => {
  switching = false;
  retryDelay = 2000;
  setStatus('En direct', 'live');
});
audio.addEventListener('waiting', () => wantPlaying && setStatus('Chargement…'));
audio.addEventListener('error', () => wantPlaying && audio.src && scheduleRetry());
audio.addEventListener('ended', () => wantPlaying && scheduleRetry());
audio.addEventListener('stalled', () => wantPlaying && setStatus('Réseau lent…'));
audio.addEventListener('pause', () => {
  // Pause imposée par le système (appel, autre app…) : refléter l'état
  if (wantPlaying && !switching && !audio.ended && !audio.error) {
    wantPlaying = false;
    updateUI();
    setStatus('En pause');
  }
});

window.addEventListener('online', () => wantPlaying && play(current));

toggleBtn.addEventListener('click', () => (wantPlaying ? pause() : play()));
document.getElementById('start').addEventListener('click', () => play());

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', () => play());
  ms.setActionHandler('pause', pause);
  ms.setActionHandler('stop', pause);
  ms.setActionHandler('nexttrack', () => step(1));
  ms.setActionHandler('previoustrack', () => step(-1));
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

render();
updateUI();
play(current);
