const STREAM = (mount) => `https://icecast.radiofrance.fr/${mount}-hifi.aac?id=radiofrance`;

const STATIONS = [
  { id: 'fipelectro', brand: 'FIP', name: 'Electro', color: 'var(--fip)' },
  { id: 'fipgroove', brand: 'FIP', name: 'Groove', color: 'var(--fip)' },
  { id: 'fipreggae', brand: 'FIP', name: 'Reggae', color: 'var(--fip)' },
  { id: 'fiphiphop', brand: 'FIP', name: 'Hip-Hop', color: 'var(--fip)' },
  { id: 'franceculture', brand: 'Radio France', name: 'France Culture', color: 'var(--culture)', logo: 'logos/franceculture.svg' },
  { id: 'franceinter', brand: 'Radio France', name: 'France Inter', color: 'var(--inter)', logo: 'logos/franceinter.svg' },
  { id: 'fip', brand: 'FIP', name: 'FIP', color: 'var(--fip)' },
  { id: 'fiprock', brand: 'FIP', name: 'Rock', color: 'var(--fip)' },
  { id: 'fipjazz', brand: 'FIP', name: 'Jazz', color: 'var(--fip)' },
  { id: 'fippop', brand: 'FIP', name: 'Pop', color: 'var(--fip)' },
  { id: 'fipworld', brand: 'FIP', name: 'Monde', color: 'var(--fip)' },
  { id: 'fipmetal', brand: 'FIP', name: 'Metal', color: 'var(--fip)' },
  { id: 'fipnouveautes', brand: 'FIP', name: 'Nouveautés', color: 'var(--fip)' },
  { id: 'fipcultes', brand: 'FIP', name: 'Cultes', color: 'var(--fip)' },
  { id: 'fipsacrefrancais', brand: 'FIP', name: 'Sacré Français', color: 'var(--fip)' },
  {
    id: 'radiomeuh',
    brand: 'Radio Meuh',
    name: 'Radio Meuh',
    color: 'var(--meuh)',
    logo: 'logos/radiomeuh.png',
    url: 'https://radiomeuh2.ice.infomaniak.ch/radiomeuh2-128.mp3',
    disabled: true, // pubs dans le flux
  },
].filter((s) => !s.disabled);
for (const s of STATIONS) s.logo ??= 'logos/fip.svg';
const DEFAULT_ID = 'fipelectro';
const ORDER_KEY = 'radiosvelo-order';

const audio = document.getElementById('audio');
const grid = document.getElementById('grid');
const editBtn = document.getElementById('edit');
const resetBtn = document.getElementById('reset');

let current = STATIONS.find((s) => s.id === DEFAULT_ID);
let wantPlaying = false;
let retryTimer = null;
let retryDelay = 2000;
let switching = false;
let editing = false;
// Aucune radio n'est mise en avant tant qu'on n'en a pas touché une (ou que la lecture n'a pas démarré)
let started = false;
let status = { text: '', kind: '' };
let order = loadOrder();

const label = (s) => (s.brand === 'FIP' && s.name !== 'FIP' ? `FIP ${s.name}` : s.name);

const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

function setStatus(text, kind = '') {
  status = { text, kind };
  updateUI();
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
    tile.innerHTML = `<img class="logo" src="${s.logo}" alt="">
      <span class="info"><span class="name">${s.name}</span><span class="status"></span></span>`;
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
      const toggle = document.createElement('span');
      toggle.className = 'toggle';
      toggle.setAttribute('aria-hidden', 'true');
      tile.appendChild(toggle);
      tile.addEventListener('click', () => {
        // Toucher la radio en cours = lecture/pause, une autre = changer de radio
        if (s === current && started && wantPlaying) pause();
        else play(s);
      });
    }
    grid.appendChild(tile);
  });
  editBtn.textContent = editing ? 'Terminé' : 'Réorganiser les radios';
  editBtn.classList.toggle('primary', editing);
  resetBtn.hidden = !editing;
  updateUI();
}

function updateUI() {
  for (const tile of grid.children) {
    const active = started && tile.dataset.id === current.id;
    tile.classList.toggle('active', active);
    const st = tile.querySelector('.status');
    st.textContent = active ? status.text : '';
    st.className = `status ${active ? status.kind : ''}`;
    const toggle = tile.querySelector('.toggle');
    if (toggle) toggle.innerHTML = active ? (wantPlaying ? ICON_PAUSE : ICON_PLAY) : '';
  }

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: label(current),
      artist: current.brand === 'FIP' ? 'Radio France' : current.brand,
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
  const url = station.url ?? STREAM(station.id);
  audio.src = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
}

async function play(station = current, auto = false) {
  if (!auto) started = true;
  wantPlaying = true;
  // Toujours repartir du direct, jamais d'un tampon en différé
  if (station !== current || audio.paused || audio.error) load(station);
  updateUI();
  setStatus('Connexion…');
  try {
    await audio.play();
  } catch (err) {
    switching = false;
    if (err.name === 'NotAllowedError') {
      // Lecture auto bloquée (iPhone) : on attend un toucher sur une radio
      wantPlaying = false;
      setStatus('');
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

// Petit bip de confirmation au toucher (Web Audio, aucun fichier à charger)
let beepCtx = null;
function beep() {
  try {
    beepCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (beepCtx.state === 'suspended') beepCtx.resume();
    const t = beepCtx.currentTime;
    const osc = beepCtx.createOscillator();
    const gain = beepCtx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(gain).connect(beepCtx.destination);
    osc.start(t);
    osc.stop(t + 0.09);
  } catch {}
}

function step(delta) {
  const i = order.indexOf(current);
  play(order[(i + delta + order.length) % order.length]);
}

audio.addEventListener('playing', () => {
  started = true;
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

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn && !btn.disabled) beep();
}, true);

window.addEventListener('online', () => wantPlaying && play(current));

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
play(current, true);
