import { VIEWS } from './detail-config.js';

const $ = (id) => document.getElementById(id);

const RANGES = [
  ['speed', 'kmh', (v) => `${v.toFixed(0)} km/h`],
  ['accel', 'accel', (v) => `${v.toFixed(1)} m/s²`],
  ['azim', 'azim', (v) => `${v.toFixed(0)}°`],
  ['dist', 'dist', (v) => `${v.toFixed(0)} m`],
  ['height', 'height', (v) => `${v.toFixed(1)} m`],
  ['fov', 'fov', (v) => `${v.toFixed(0)}°`],
  ['key', 'key', (v) => v.toFixed(2)],
  ['keydir', 'keydir', (v) => `${v.toFixed(0)}°`],
  ['rim', 'rim', (v) => v.toFixed(2)],
  ['snow', 'snow', (v) => `${v.toFixed(0)}%`],
  ['fog', 'fog', (v) => `${v.toFixed(1)}‰`],
  ['exposure', 'exposure', (v) => v.toFixed(2)],
  ['density', 'density', (v) => `${v.toFixed(0)}%`],
  ['skyline', 'skyline', (v) => `${v.toFixed(0)}%`],
];

const TOGGLES = ['auto', 'panto', 'lamps', 'catenary', 'slab', 'trees', 'city', 'wire'];
const SELECTS = [['view', 'view'], ['theme', 'theme'], ['quality', 'quality']];

export function bindUI(api) {
  const viewSel = $('c-view');
  for (const v of VIEWS) {
    const o = document.createElement('option');
    o.value = v.id;
    o.textContent = v.label;
    viewSel.appendChild(o);
  }

  for (const [id, key, fmt] of RANGES) {
    const input = $(`c-${id}`);
    const out = $(`o-${id}`);
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      out.textContent = fmt(v);
      api.setParam(key, v);
    });
  }

  for (const id of TOGGLES) {
    $(`c-${id}`).addEventListener('change', (e) => api.setParam(id, e.target.checked));
  }

  for (const [id, key] of SELECTS) {
    $(`c-${id}`).addEventListener('change', (e) => {
      if (key === 'view') api.applyView(e.target.value, true);
      else api.setParam(key, e.target.value);
    });
  }

  $('a-reset').addEventListener('click', () => api.reset());
  $('a-random').addEventListener('click', () => api.randomize());
  $('a-export').addEventListener('click', () => api.exportPNG());

  const consist = $('consist');
  const carBtns = [];
  for (let i = 0; i < api.formation; i += 1) {
    const b = document.createElement('button');
    b.type = 'button';
    const head = i === 0 || i === api.formation - 1;
    b.className = head ? 'head' : '';
    if (api.pantoCars.includes(i)) b.classList.add('panto');
    b.textContent = String(i + 1);
    b.title = head ? `${i + 1} 号车 · 头车` : `${i + 1} 号车 · 中间车`;
    b.addEventListener('click', () => api.focusCar(i));
    consist.appendChild(b);
    carBtns.push(b);
  }

  function syncRange(id, key, fmt) {
    const input = $(`c-${id}`);
    const v = api.S[key];
    if (document.activeElement !== input) input.value = String(v);
    $(`o-${id}`).textContent = fmt(v);
  }

  const ui = {
    syncCamera() {
      syncRange('azim', 'azim', RANGES[2][2]);
      syncRange('dist', 'dist', RANGES[3][2]);
      syncRange('height', 'height', RANGES[4][2]);
    },
    syncConsist() {
      carBtns.forEach((b, i) => b.classList.toggle('on', i === api.S.car));
    },
    syncAll() {
      for (const [id, key, fmt] of RANGES) syncRange(id, key, fmt);
      for (const id of TOGGLES) $(`c-${id}`).checked = Boolean(api.S[id]);
      for (const [id, key] of SELECTS) $(`c-${id}`).value = api.S[key];
      ui.syncConsist();
    },
  };
  return ui;
}