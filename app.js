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
  { id: 'fipsacrefrancais', brand: 'FIP', name: 'Sacré Français', color: 'var(--fip)' },
  { id: 'franceinter', brand: 'Radio France', name: 'France Inter', color: 'var(--inter)', logo: 'logos/franceinter.svg' },
  { id: 'franceculture', brand: 'Radio France', name: 'France Culture', color: 'var(--culture)', logo: 'logos/franceculture.svg' },
];
for (const s of STATIONS) s.logo ??= 'logos/fip.svg';
const DEFAULT_ID = 'fipelectro';
const ORDER_KEY = 'radiosvelo-order';

const audio = document.getElementById('audio');
const grid = document.getElementById('grid');
const statusEl = document.getElementById('status');
const currentEl = document.getElementById('current');
const currentLogo = document.getElementById('current-logo');
const toggleBtn = document.getElementById('toggle');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const overlay = document.getElementById('overlay');
const editBtn = document.getElementById('edit');
const resetBtn = document.getElementById('reset');

let current = STATIONS.find((s) => s.id === DEFAULT_ID);
let wantPlaying = false;
let retryTimer = null;
let retryDelay = 2000;
let switching = false;
let editing = false;
let order = loadOrder();

const label = (s) => (s.brand === 'FIP' && s.name !== 'FIP' ? `FIP ${s.name}` : s.name);

function setStatus(text, kind = '') {
  statusEl.textContent = text;
  statusEl.className = `now-label ${kind}`;
}

// Ordre personnalisé : stations connues dans l'ordre enregistré, les nouvelles à la fin
function loadOrder() {
  let ids = [];
  try {
    ids = JSON.parse(localStorage.getItem(ORDER_KEY)) || [];
  } catch {}
  const byId = new Map(STATIONS.map((s) => [s.id, s]));
  const saved = ids.map((id) => byId.get(id)).filter(Boolean);
  return [...saved, ...STATIONS.filter((s) => !saved.includes(s))];
}

function saveOrder() {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order.map((s) => s.id)));
  } catch {}
}

function move(station, delta) {
  const i = order.indexOf(station);
  const j = i + delta;
  if (j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  saveOrder();
  render();
}

function render() {
  grid.innerHTML = '';
  grid.classList.toggle('editing', editing);
  order.forEach((s, i) => {
    const tile = document.createElement(editing ? 'div' : 'button');
    tile.className = 'station';
    tile.style.setProperty('--c', s.color);
    tile.dataset.id = s.id;
    tile.innerHTML = `<img class="logo" src="${s.logo}" alt=""><span class="name">${s.name}</span>`;
    if (editing) {
      const controls = document.createElement('div');
      controls.className = 'move';
      for (const [delta, text, aria] of [[-1, '▲', 'Monter'], [1, '▼', 'Descendre']]) {
        const b = document.createElement('button');
        b.textContent = text;
        b.setAttribute('aria-label', `${aria} ${label(s)}`);
        b.disabled = i + delta < 0 || i + delta >= order.length;
        b.addEventListener('click', () => move(s, delta));
        controls.appendChild(b);
      }
      tile.appendChild(controls);
    } else {
      tile.addEventListener('click', () => play(s));
    }
    grid.appendChild(tile);
  });
  editBtn.textContent = editing ? 'Terminé' : 'Réorganiser les radios';
  editBtn.classList.toggle('primary', editing);
  resetBtn.hidden = !editing;
  updateUI();
}

function updateUI() {
  currentEl.textContent = label(current);
  currentLogo.src = current.logo;
  for (const btn of grid.children) {
    btn.classList.toggle('active', btn.dataset.id === current.id);
  }
  iconPlay.toggleAttribute('hidden', wantPlaying);
  iconPause.toggleAttribute('hidden', !wantPlaying);
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
  const i = order.indexOf(current);
  play(order[(i + delta + order.length) % order.length]);
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
editBtn.addEventListener('click', () => {
  editing = !editing;
  render();
});
resetBtn.addEventListener('click', () => {
  order = [...STATIONS];
  saveOrder();
  render();
});

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
play(current);
