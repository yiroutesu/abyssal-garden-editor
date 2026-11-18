// Abyssal Garden map editor: 2D top-down editing of the terrain primitives, zone tables
// and hand-placed objects. Saves editor/world.json, which build.mjs inlines as WORLD_EDIT.
(() => {
  'use strict';

  const $ = (q) => document.querySelector(q);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const f = (v) => (v == null ? '' : +(+v).toFixed(2));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ---------------------------------------------------------------- registries
  const MESH_NAMES = ['巨石 A', '巨石 B', '巨石 C', '巨石 D', '海绵 A', '海绵 B', '海绵 C', '珊瑚 A', '珊瑚 B', '管状海绵', '鲸尾石雕', '沉船'];
  const MESH_MAT = [1, 1, 1, 1, 4, 4, 4, 5, 5, 4, 2, 3];
  // the hut lives at mesh id 27 (ids 12-26 are animated meshes and LOD copies, not placeable)
  MESH_NAMES[27] = '废弃房屋';
  MESH_MAT[27] = 3;
  MESH_NAMES[28] = '围墙段';
  MESH_MAT[28] = 2;
  const PLACEABLE = MESH_NAMES.reduce((a, n, i) => (n ? a.concat(i) : a), []);
  const ZONE_DEFS = {
    hot: { label: '珊瑚热区', color: '#ff8c3c', fields: [['半径', 2, 1, 6, 90]], make: (x, z) => [x, z, 30] },
    zs: { label: '海绵/珊瑚区', color: '#78c8ff', fields: [['半径', 2, 1, 6, 90], ['权重', 3, 0.05, 0, 1]], make: (x, z) => [x, z, 24, 0.7] },
    magenta: { label: '品红地被', color: '#ff3cb4', fields: [['半径', 2, 1, 4, 40]], make: (x, z) => [x, z, 9] },
    kelp: { label: '海带区', color: '#50dc78', fields: [['半径', 2, 1, 5, 60], ['密度', 3, 0.05, 0, 1]], make: (x, z) => [x, z, 14, 0.85] },
    gardens: { label: '海绵园圃', color: '#ffdc78', fields: [['半径', 2, 1, 3, 30], ['数量', 3, 10, 10, 600]], make: (x, z) => [x, z, 8, 140] },
  };
  // creature spawn groups: the circle is the orbit radius, the numbers are the generator
  // parameters used by world.js (fish: count/radius/y/speed/dir, manta: radius/y/speed/size/phase,
  // jelly: count/spread/y)
  const SPAWN_DEFS = {
    fish: { label: '鱼群', color: '#ffd86e', radius: 3, count: 4, fields: [['数量', 4, 10, 1, 4000], ['半径', 3, 0.5, 1, 120], ['高度 y', 1, 1, -60, 10], ['速度', 5, 0.01, 0, 1], ['方向', 6, 0.1, -3, 3]], make: (x, z) => [+x.toFixed(1), -30, +z.toFixed(1), 15, 400, 0.3, 1] },
    mantas: { label: '蝠鲼', color: '#b48cff', radius: 3, count: null, fields: [['半径', 3, 0.5, 1, 120], ['高度 y', 1, 1, -60, 10], ['速度', 5, 0.005, -0.5, 0.5], ['大小', 6, 0.1, 0.2, 12], ['相位', 4, 0.1, 0, 6.3]], make: (x, z) => [+x.toFixed(1), -25, +z.toFixed(1), 14, 3.0, 0.08, 3.6, 0.1] },
    jellies: { label: '水母群', color: '#ff9ad5', radius: 4, count: 3, fields: [['数量', 3, 1, 1, 60], ['扩散', 4, 0.5, 1, 80], ['高度 y', 1, 1, -60, 10]], make: (x, z) => [+x.toFixed(1), -24, +z.toFixed(1), 6, 11] },
  };
  const PRIM_SPECS = {
    mesa: { label: '台地柱', fields: [['A x', 0, 1], ['A z', 1, 1], ['B x', 2, 1], ['B z', 3, 1], ['半径', 4, 0.5], ['顶面 y', 5, 1], ['悬垂', 6, 0.5], ['腰部', 7, 0.5]] },
    arch: { label: '拱门', fields: [['中心 x', 0, 1], ['中心 y', 1, 1], ['中心 z', 2, 1], ['朝向 °', 3, 5], ['主半径', 4, 0.5], ['管半径', 5, 0.5], ['y 压扁', 6, 0.1]] },
    hole: { label: '隧道', fields: [['A x', 0, 1], ['A y', 1, 1], ['A z', 2, 1], ['半径', 3, 0.5], ['B x', 4, 1], ['B y', 5, 1], ['B z', 6, 1]] },
    clear: { label: '留空区', fields: [['A x', 0, 1], ['A z', 1, 1], ['B x', 2, 1], ['B z', 3, 1], ['半径', 4, 0.5], ['软化', 5, 0.5]] },
  };

  // ---------------------------------------------------------------- data
  const HOUSE = { mesh: 27, x: 6, z: 26, y: null, scale: 1.15, yaw: 12.03, pitch: -1.15, roll: 1.72, mat: 3, seed: 0.35, ts: 1, bob: 0 };
  const defaultData = () => ({
    terrain: { mesas: clone(MESAS), arches: clone(ARCHES), holes: clone(HOLES), clears: clone(CLEARS) },
    objects: [
      { mesh: 10, x: -5, z: -4, y: null, scale: 1, yaw: 68.75, pitch: -17.19, roll: 9.17, mat: 2, seed: 0.3, ts: 1, bob: 0 },
      { mesh: 11, x: 59.5, z: 6, y: -23, scale: 1, yaw: -90, pitch: 18.33, roll: -5.73, mat: 3, seed: 0.5, ts: 1, bob: 0 },
      { ...HOUSE },
    ],
    zones: { hot: clone(HOT), zs: clone(ZS), magenta: clone(MAGENTA), kelp: clone(KELPZ), gardens: clone(GARDENS) },
    spawns: { fish: clone(FISH_SCHOOLS), mantas: clone(MANTA_PATHS), jellies: clone(JELLY_SWARM) },
    cfg: { kelp: 1, ground: 1, props: 1, noise: 1, columns: 1, boulders: 1, debris: 1, reefCover: 0.5, reefHeight: 1, reefRing: 60 },
  });

  const normalize = (d) => {
    const base = defaultData();
    d = d && typeof d === 'object' ? d : {};
    d.terrain = d.terrain || {};
    for (const k of ['mesas', 'arches', 'holes', 'clears']) if (!Array.isArray(d.terrain[k])) d.terrain[k] = base.terrain[k];
    if (!Array.isArray(d.objects)) d.objects = base.objects;
    else if (!d.objects.some((o) => o.mesh === 27)) d.objects.push({ ...HOUSE }); // picked up when the hut was added
    d.zones = d.zones || {};
    for (const k of Object.keys(ZONE_DEFS)) if (!Array.isArray(d.zones[k])) d.zones[k] = base.zones[k];
    d.spawns = d.spawns || {};
    for (const k of Object.keys(SPAWN_DEFS)) if (!Array.isArray(d.spawns[k])) d.spawns[k] = base.spawns[k];
    // hard-coded decor follows the authored content: an emptied map stays empty
    const decorated = d.terrain.mesas.length + d.terrain.arches.length + d.terrain.holes.length || d.objects.length ? 1 : 0;
    d.cfg = Object.assign({ kelp: 1, ground: 1, props: 1, noise: decorated, columns: decorated, boulders: decorated, debris: decorated, reefCover: 0.5, reefHeight: 1, reefRing: 60 }, d.cfg || {});
    return d;
  };

  const STORE = 'abyssalEditor';
  let data;
  try { data = normalize(JSON.parse(localStorage.getItem(STORE) || 'null')); } catch { data = defaultData(); }

  let sel = null;            // { kind, zone?, ref } — set only while one item is selected
  let selSet = [];           // every selected item; box selection can hold several
  let tool = 'select';
  let paletteMesh = 11, paletteZone = 'gardens', paletteSpawn = 'fish';
  const view = { x: 0, z: 0, k: 2 };
  let undo = [], redo = [], snapBefore = null;

  const layers = { zones: true, prims: true, objects: true, spawns: true, grid: true };
  const hiddenMesh = new Set(), hiddenZone = new Set(), hiddenSpawn = new Set(); // per-type visibility from the palettes


  // ---------------------------------------------------------------- dom
  const canvas = $('#map'), ctx = canvas.getContext('2d');
  const stage = $('#stage'), props = $('#props');
  let cw = 1, ch = 1;

  const msg = (t) => { $('#msg').textContent = t; };
  const KIND_NAME = { object: '物体', mesa: '台地', arch: '拱门', hole: '隧道', clear: '留空区', zone: '区域', spawn: '生物群' };
  const autosave = () => { try { localStorage.setItem(STORE, JSON.stringify(payload())); } catch {} };

  function payload() {
    return { version: 1, terrain: data.terrain, objects: data.objects, zones: data.zones, spawns: data.spawns, cfg: data.cfg };
  }

  // ---------------------------------------------------------------- view
  function resize() {
    const r = stage.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cw = Math.max(1, r.width); ch = Math.max(1, r.height);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  const w2s = (x, z) => [cw / 2 + (x - view.x) * view.k, ch / 2 + (z - view.z) * view.k];
  const s2w = (sx, sy) => [view.x + (sx - cw / 2) / view.k, view.z + (sy - ch / 2) / view.k];
  function fitView() {
    view.x = 0; view.z = 0;
    view.k = clamp(ch / SPAN, 0.5, 16); // the map fills the stage from top to bottom
    draw();
  }

  // ---------------------------------------------------------------- terrain preview (reuses dens())
  // the preview covers the game's 384 x 384 m footprint; its texel count follows the screen, so when the map
  // fills the stage vertically one texel lands on roughly one device pixel
  const SPAN = 384, GOX = -192, GOZ = -192;
  let GN = 512, GV = SPAN / GN;
  let gpu = null, gen = 0, timer = 0;
  let heights = null;
  let hasRelief = false;
  const relief = document.createElement('canvas'), rctx = relief.getContext('2d');

  function sizePreview() {
    const dpr = window.devicePixelRatio || 1;
    GN = clamp(Math.ceil((ch * dpr) / 8) * 8, 256, 1024);
    GV = SPAN / GN;
    heights = new Float32Array(GN * GN).fill(NaN);
    relief.width = relief.height = GN;
    hasRelief = false;
  }

  function packTerrain(p) {
    const a = [];
    for (const m of p.mesas) a.push(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7]);
    for (const m of p.arches) a.push(m[0], m[1], m[2], m[3], m[4], m[5], m[6], 0);
    for (const m of p.holes) a.push(m[0], m[1], m[2], m[3], m[4], m[5], m[6], 0);
    for (const m of p.clears) a.push(m[0], m[1], m[2], m[3], m[4], m[5], 0, 0);
    return new Float32Array(a);
  }

  async function initGpu() {
    if (!navigator.gpu) { msg('此浏览器不支持 WebGPU：地形预览不可用，仍可编辑并导出'); return; }
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) { msg('没有可用的 GPU 适配器：地形预览不可用'); return; }
      const device = await adapter.requestDevice();
      const module = device.createShaderModule({ code: W_HEIGHT });
      const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'mainH' } });
      gpu = { device, pipeline };
      await recompute();
    } catch (e) { msg('地形预览初始化失败：' + e.message); }
  }

  const scheduleRecompute = () => { clearTimeout(timer); timer = setTimeout(recompute, 130); };

  async function recompute() {
    if (!gpu) return;
    const my = ++gen, dev = gpu.device;
    msg('地形重算…');
    const P = packTerrain(data.terrain);
    const pb = dev.createBuffer({ size: Math.max(16, P.byteLength), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    dev.queue.writeBuffer(pb, 0, P);
    const BYTES = GN * GN * 4;
    const db = dev.createBuffer({ size: BYTES, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const ub = dev.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const raw = new ArrayBuffer(64), u32 = new Uint32Array(raw), f32 = new Float32Array(raw);
    u32.set([GN, GN, 1, data.cfg.noise ? 1 : 0], 0);
    f32.set([GOX, 4, GOZ, GV], 4);
    u32.set([data.terrain.mesas.length, data.terrain.arches.length, data.terrain.holes.length, data.terrain.clears.length], 8);
    f32.set([data.cfg.reefCover, 26 * data.cfg.reefHeight, data.cfg.reefRing, 17 * data.cfg.reefHeight], 12);
    dev.queue.writeBuffer(ub, 0, raw);
    const bg = dev.createBindGroup({
      layout: gpu.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: ub } }, { binding: 1, resource: { buffer: db } }, { binding: 2, resource: { buffer: pb } }],
    });
    const enc = dev.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(gpu.pipeline);
    pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(Math.ceil(GN / 8), Math.ceil(GN / 8));
    pass.end();
    const rb = dev.createBuffer({ size: BYTES, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    enc.copyBufferToBuffer(db, 0, rb, 0, BYTES);
    dev.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    if (my !== gen) { rb.unmap(); pb.destroy(); db.destroy(); ub.destroy(); rb.destroy(); return; }
    const H = new Float32Array(rb.getMappedRange().slice(0));
    rb.unmap();
    pb.destroy(); db.destroy(); ub.destroy(); rb.destroy();

    heights = new Float32Array(GN * GN).fill(NaN);
    let filled = 0;
    for (let i = 0; i < GN * GN; i++) {
      if (H[i] > -900) { heights[i] = H[i]; filled++; }
    }
    hasRelief = filled > 0;
    paintRelief();
    draw();
    msg('地形已更新');
  }

  function paintRelief() {
    const img = rctx.createImageData(GN, GN), px = img.data;
    const hAt = (x, z) => (x < 0 || z < 0 || x >= GN || z >= GN ? NaN : heights[z * GN + x]);
    const next = (v, fallback) => (Number.isNaN(v) ? fallback : v);
    for (let z = 0; z < GN; z++) for (let x = 0; x < GN; x++) {
      const i = (z * GN + x) * 4, h = heights[z * GN + x];
      let r, g, b;
      if (Number.isNaN(h)) {
        const rr = Math.hypot(x / GN - 0.5, z / GN - 0.5) * 2;
        r = 10 + 4 * (1 - rr); g = 30 + 8 * (1 - rr); b = 41 + 10 * (1 - rr);
      } else {
        const hl = next(hAt(x - 1, z), h), hr = next(hAt(x + 1, z), h);
        const hu = next(hAt(x, z - 1), h), hd = next(hAt(x, z + 1), h);
        const dx = (hr - hl) / (2 * GV), dz = (hd - hu) / (2 * GV);
        const nl = Math.hypot(dx, 1, dz), lx = -0.44, lz = -0.46, ly = 0.77;
        const shade = clamp(((-dx * lx + ly - dz * lz) / nl), 0, 1);
        const hi = clamp((h + 46) / 49, 0, 1);
        // higher ground reads darker; 12 flat bands of ~4 m make the height steps obvious
        const band = Math.floor(hi * 12) / 12;
        const t = hi * 0.25 + band * 0.75;
        r = 172 - 162 * t; g = 216 - 198 * t; b = 222 - 198 * t;
        const k = 0.4 + 0.85 * shade;
        r *= k; g *= k; b *= k;
        // a contour line at each band edge: dark on light ground, light on dark ground
        const bp = (v) => Math.floor(clamp((v + 46) / 49, 0, 1) * 12);
        if (bp(hl) !== bp(h) || bp(hr) !== bp(h) || bp(hu) !== bp(h) || bp(hd) !== bp(h)) {
          if (r + g + b > 300) { r = 46; g = 62; b = 68; } else { r = 198; g = 230; b = 230; }
        }
      }
      px[i] = clamp(r, 0, 255); px[i + 1] = clamp(g, 0, 255); px[i + 2] = clamp(b, 0, 255); px[i + 3] = 255;
    }
    rctx.putImageData(img, 0, 0);
  }

  const surfaceAt = (x, z) => {
    if (!hasRelief) return -45;
    const gx = clamp(Math.round((x - GOX) / GV), 0, GN - 1), gz = clamp(Math.round((z - GOZ) / GV), 0, GN - 1);
    const h = heights[gz * GN + gx];
    return Number.isNaN(h) ? -45 : h;
  };

  // ---------------------------------------------------------------- drawing
  // stadium outline: the glyph covers the real footprint of the primitive, not just its axis
  function capsulePath(a, b, r) {
    const [ax, ay] = w2s(a[0], a[1]), [bx, by] = w2s(b[0], b[1]);
    const rr = Math.max(.6, r * view.k);
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
    ctx.beginPath();
    if (l < .6) { ctx.arc(ax, ay, rr, 0, Math.PI * 2); ctx.closePath(); return; }
    const an = Math.atan2(dy, dx);
    ctx.arc(bx, by, rr, an - Math.PI / 2, an + Math.PI / 2);
    ctx.arc(ax, ay, rr, an + Math.PI / 2, an + Math.PI * 1.5);
    ctx.closePath();
  }

  const isSelRef = (ref) => selSet.some((s) => s.ref === ref);

  // small arrow showing where an object faces (its local +z, yaw in degrees)
  function drawFacing(px, py, deg) {
    const t = deg * Math.PI / 180, dx = Math.sin(t), dz = Math.cos(t), L = 16;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + dx * L, py + dz * L);
    ctx.strokeStyle = 'rgba(95,211,196,.95)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px + dx * (L + 5), py + dz * (L + 5));
    ctx.lineTo(px + dx * L - dz * 4, py + dz * L + dx * 4);
    ctx.lineTo(px + dx * L + dz * 4, py + dz * L - dx * 4);
    ctx.closePath(); ctx.fillStyle = 'rgba(95,211,196,.95)'; ctx.fill();
  }

  function draw() {
    $('#zoomInfo').textContent = `俯视图 · 1 m ≈ ${view.k.toFixed(2)} px`;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#061019'; ctx.fillRect(0, 0, cw, ch);

    if (hasRelief) {
      const [sx, sy] = w2s(GOX, GOZ);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(relief, sx, sy, SPAN * view.k, SPAN * view.k);
    }

    if (layers.grid) {
      ctx.strokeStyle = 'rgba(120,180,200,.07)'; ctx.lineWidth = 1;
      for (let g = -168; g <= 168; g += 24) {
        const [gx] = w2s(g, 0), [, gz] = w2s(0, g);
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, ch); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, gz); ctx.lineTo(cw, gz); ctx.stroke();
      }
      ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(120,220,220,.35)';
      const [cx, cy] = w2s(0, 0);
      ctx.beginPath(); ctx.arc(cx, cy, 172 * view.k, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    if (layers.zones) for (const k of Object.keys(ZONE_DEFS)) {
      if (hiddenZone.has(k)) continue;
      const def = ZONE_DEFS[k];
      for (const p of data.zones[k]) {
        const [px, py] = w2s(p[0], p[1]), r = Math.max(2, p[2] * view.k);
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = def.color + (isSelRef(p) ? '3d' : '26'); ctx.fill();
        ctx.strokeStyle = def.color + 'b3'; ctx.lineWidth = isSelRef(p) ? 2 : 1;
        if (k === 'hot' || k === 'kelp') ctx.setLineDash([5, 4]);
        ctx.stroke(); ctx.setLineDash([]);
        if (isSelRef(p)) { ctx.beginPath(); ctx.arc(px, py, r + 2, 0, Math.PI * 2); ctx.strokeStyle = '#5fd3c4'; ctx.lineWidth = 2; ctx.stroke(); }
      }
    }

    if (layers.spawns) for (const k of Object.keys(SPAWN_DEFS)) {
      if (hiddenSpawn.has(k)) continue;
      const def = SPAWN_DEFS[k];
      for (const p of data.spawns[k]) {
        const [px, py] = w2s(p[0], p[2]), r = Math.max(2, p[def.radius] * view.k);
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = def.color + (isSelRef(p) ? '33' : '1a'); ctx.fill();
        ctx.setLineDash([6, 4]); ctx.strokeStyle = def.color + 'cc'; ctx.lineWidth = isSelRef(p) ? 2 : 1;
        ctx.stroke(); ctx.setLineDash([]);
        if (isSelRef(p)) { ctx.beginPath(); ctx.arc(px, py, r + 2, 0, Math.PI * 2); ctx.strokeStyle = '#5fd3c4'; ctx.lineWidth = 2; ctx.stroke(); }
        if (view.k > 0.8 || isSelRef(p)) {
          ctx.fillStyle = def.color; ctx.font = '10px ui-monospace, monospace';
          const label = def.count == null ? def.label : `${def.label} ${p[def.count]}`;
          ctx.fillText(label, px + 4, py - 4);
        }
      }
    }

    if (layers.prims) {
      // a clear is a soft patch: the falloff band is part of its footprint
      for (const m of data.terrain.clears) {
        capsulePath([m[0], m[1]], [m[2], m[3]], m[4] + m[5]);
        ctx.fillStyle = 'rgba(150,180,200,.06)'; ctx.fill();
        capsulePath([m[0], m[1]], [m[2], m[3]], m[4]);
        ctx.fillStyle = isSelRef(m) ? 'rgba(95,211,196,.20)' : 'rgba(150,180,200,.13)'; ctx.fill();
        ctx.setLineDash([3, 5]); ctx.strokeStyle = isSelRef(m) ? '#5fd3c4' : 'rgba(200,215,225,.45)'; ctx.lineWidth = isSelRef(m) ? 2 : 1; ctx.stroke(); ctx.setLineDash([]);
      }
      for (const m of data.terrain.holes) {
        capsulePath([m[0], m[2]], [m[4], m[6]], m[3]);
        ctx.fillStyle = isSelRef(m) ? 'rgba(95,211,196,.20)' : 'rgba(120,220,255,.15)'; ctx.fill();
        ctx.setLineDash([7, 5]); ctx.strokeStyle = isSelRef(m) ? '#5fd3c4' : 'rgba(120,220,255,.85)'; ctx.lineWidth = isSelRef(m) ? 2 : 1; ctx.stroke(); ctx.setLineDash([]);
      }
      for (const m of data.terrain.mesas) {
        capsulePath([m[0], m[1]], [m[2], m[3]], m[4]);
        ctx.fillStyle = isSelRef(m) ? 'rgba(95,211,196,.22)' : 'rgba(190,215,230,.17)'; ctx.fill();
        ctx.strokeStyle = isSelRef(m) ? '#5fd3c4' : 'rgba(214,232,240,.7)'; ctx.lineWidth = isSelRef(m) ? 2 : 1; ctx.stroke();
      }
      for (const m of data.terrain.arches) {
        const [px, py] = w2s(m[0], m[2]);
        const ro = Math.max(2, (m[4] + m[5]) * view.k), ri = (m[4] - m[5]) * view.k;
        ctx.beginPath();
        ctx.arc(px, py, ro, 0, Math.PI * 2);
        if (ri > .8) ctx.arc(px, py, ri, 0, Math.PI * 2, true);
        ctx.fillStyle = isSelRef(m) ? 'rgba(95,211,196,.25)' : 'rgba(255,220,140,.16)';
        ctx.fill('evenodd');
        ctx.strokeStyle = isSelRef(m) ? '#5fd3c4' : 'rgba(255,220,140,.75)'; ctx.lineWidth = isSelRef(m) ? 2 : 1; ctx.stroke();
      }
    }

    if (layers.objects) for (const o of data.objects) {
      if (hiddenMesh.has(o.mesh)) continue;
      const y = o.y == null ? surfaceAt(o.x, o.z) : o.y;
      const [px, py] = w2s(o.x, o.z), r = Math.max(3.5, 2.6 * view.k * (o.scale || 1));
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = o.mesh === 11 ? 'rgba(255,170,110,.9)' : o.mesh === 10 ? 'rgba(180,230,255,.9)' : o.mesh === 28 ? 'rgba(230,210,170,.85)' : 'rgba(150,255,210,.85)';
      ctx.fill();
      ctx.strokeStyle = isSelRef(o) ? '#5fd3c4' : 'rgba(0,0,0,.6)'; ctx.lineWidth = isSelRef(o) ? 2 : 1; ctx.stroke();
      if (isSelRef(o)) { ctx.beginPath(); ctx.arc(px, py, r + 3, 0, Math.PI * 2); ctx.strokeStyle = '#5fd3c4'; ctx.lineWidth = 2; ctx.stroke(); }
      if (view.k > 1.6 || isSelRef(o)) {
        ctx.fillStyle = 'rgba(225,240,245,.85)'; ctx.font = '10px ui-monospace, monospace';
        ctx.fillText(`${MESH_NAMES[o.mesh]} ${y.toFixed(1)}`, px + r + 4, py + 3);
      }
      // facing arrow: the object's local +z
      if (isSelRef(o) || (aim && aim.o === o)) drawFacing(px, py, o.yaw || 0);
    }

    if (draft) {
      const a = draft.a, b = draft.b;
      if (draft.kind === 'wall') {
        // dashed line with a tick at every 4 m section centre
        const [ax, ay] = w2s(a[0], a[1]), [bx, by] = w2s(b[0], b[1]);
        const L = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.01), n = Math.max(1, Math.round(L / 4)), seg = L / n;
        const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
        ctx.setLineDash([8, 5]); ctx.strokeStyle = 'rgba(235,220,190,.9)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) * seg, [px, py] = w2s(a[0] + ux * t, a[1] + uz * t);
          const nx = -uz * Math.min(seg, 4) * view.k * .5, ny = ux * Math.min(seg, 4) * view.k * .5;
          ctx.beginPath(); ctx.moveTo(px - nx, py - ny); ctx.lineTo(px + nx, py + ny);
          ctx.strokeStyle = 'rgba(235,220,190,.95)'; ctx.lineWidth = 3; ctx.stroke();
        }
      } else if (draft.kind === 'arch') {
        const [px, py] = w2s(a[0], a[1]);
        const ro = Math.max(4, Math.hypot(b[0] - a[0], b[1] - a[1]) * view.k), ri = Math.max(.5, ro - 1.2 * view.k);
        ctx.beginPath(); ctx.arc(px, py, ro, 0, Math.PI * 2); ctx.arc(px, py, ri, 0, Math.PI * 2, true);
        ctx.fillStyle = 'rgba(255,220,140,.16)'; ctx.fill('evenodd');
        ctx.strokeStyle = 'rgba(255,220,140,.9)'; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
      } else {
        capsulePath(a, b, draft.kind === 'mesa' ? 6 : draft.kind === 'hole' ? 3.2 : 5);
        ctx.fillStyle = draft.kind === 'hole' ? 'rgba(120,220,255,.15)' : draft.kind === 'clear' ? 'rgba(150,180,200,.13)' : 'rgba(190,215,230,.17)';
        ctx.fill();
        ctx.strokeStyle = draft.kind === 'hole' ? 'rgba(120,220,255,.9)' : 'rgba(255,255,255,.85)';
        ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    if (marquee) {
      const [ax, ay] = w2s(marquee.a[0], marquee.a[1]), [bx, by] = w2s(marquee.b[0], marquee.b[1]);
      const x = Math.min(ax, bx), y = Math.min(ay, by), w = Math.abs(bx - ax), h = Math.abs(by - ay);
      ctx.fillStyle = 'rgba(95,211,196,.12)'; ctx.fillRect(x, y, w, h);
      ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(95,211,196,.95)'; ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    }
  }

  // ---------------------------------------------------------------- hit test
  const segDist = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
    const t = l < 1e-6 ? 0 : clamp(((px - ax) * dx + (pz - az) * dz) / l, 0, 1);
    return Math.hypot(px - ax - dx * t, pz - az - dz * t);
  };

  // every item under the cursor, topmost first — repeated clicks cycle through this list
  function hitsAt(x, z) {
    const pad = 6 / view.k, out = [];
    if (layers.objects) for (let i = data.objects.length - 1; i >= 0; i--) {
      const o = data.objects[i];
      if (hiddenMesh.has(o.mesh)) continue;
      if (Math.hypot(x - o.x, z - o.z) < Math.max(1.4, 9 / view.k)) out.push({ kind: 'object', ref: o });
    }
    if (layers.prims) {
      for (let i = data.terrain.holes.length - 1; i >= 0; i--) {
        const m = data.terrain.holes[i];
        if (segDist(x, z, m[0], m[2], m[4], m[6]) < m[3] + pad) out.push({ kind: 'hole', ref: m });
      }
      for (let i = data.terrain.mesas.length - 1; i >= 0; i--) {
        const m = data.terrain.mesas[i];
        if (segDist(x, z, m[0], m[1], m[2], m[3]) < m[4] + pad) out.push({ kind: 'mesa', ref: m });
      }
      for (let i = data.terrain.arches.length - 1; i >= 0; i--) {
        const m = data.terrain.arches[i];
        if (Math.abs(Math.hypot(x - m[0], z - m[2]) - m[4]) < m[5] + pad) out.push({ kind: 'arch', ref: m });
      }
      for (let i = data.terrain.clears.length - 1; i >= 0; i--) {
        const m = data.terrain.clears[i];
        if (segDist(x, z, m[0], m[1], m[2], m[3]) < m[4] + pad) out.push({ kind: 'clear', ref: m });
      }
    }
    if (layers.zones) for (const k of ['gardens', 'kelp', 'magenta', 'zs', 'hot']) {
      if (hiddenZone.has(k)) continue;
      const arr = data.zones[k];
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        if (Math.hypot(x - p[0], z - p[1]) < p[2]) out.push({ kind: 'zone', zone: k, ref: p });
      }
    }
    if (layers.spawns) for (const k of Object.keys(SPAWN_DEFS)) {
      if (hiddenSpawn.has(k)) continue;
      const arr = data.spawns[k], ri = SPAWN_DEFS[k].radius;
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        if (Math.hypot(x - p[0], z - p[2]) < p[ri]) out.push({ kind: 'spawn', spawn: k, ref: p });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- selection / inspector
  function select(hit) {
    sel = hit;
    selSet = hit ? [hit] : [];
    renderProps();
    draw();
  }

  // everything whose outline overlaps the box, respecting layer and per-type visibility
  function itemsInBox(r) {
    const box = (x0, z0, x1, z1) => x1 >= r.x0 && x0 <= r.x1 && z1 >= r.z0 && z0 <= r.z1;
    const seg = (m) => box(Math.min(m[0], m[2]) - m[4], Math.min(m[1], m[3]) - m[4], Math.max(m[0], m[2]) + m[4], Math.max(m[1], m[3]) + m[4]);
    const circ = (x, z, rad) => box(x - rad, z - rad, x + rad, z + rad);
    const out = [];
    if (layers.objects) for (const o of data.objects) if (!hiddenMesh.has(o.mesh) && box(o.x, o.z, o.x, o.z)) out.push({ kind: 'object', ref: o });
    if (layers.prims) {
      for (const m of data.terrain.mesas) if (seg(m)) out.push({ kind: 'mesa', ref: m });
      for (const m of data.terrain.clears) if (seg(m)) out.push({ kind: 'clear', ref: m });
      for (const m of data.terrain.holes) if (box(Math.min(m[0], m[4]) - m[3], Math.min(m[2], m[6]) - m[3], Math.max(m[0], m[4]) + m[3], Math.max(m[2], m[6]) + m[3])) out.push({ kind: 'hole', ref: m });
      for (const m of data.terrain.arches) if (circ(m[0], m[2], m[4] + m[5])) out.push({ kind: 'arch', ref: m });
    }
    if (layers.zones) for (const k of Object.keys(ZONE_DEFS)) {
      if (hiddenZone.has(k)) continue;
      for (const p of data.zones[k]) if (circ(p[0], p[1], p[2])) out.push({ kind: 'zone', zone: k, ref: p });
    }
    if (layers.spawns) for (const k of Object.keys(SPAWN_DEFS)) {
      if (hiddenSpawn.has(k)) continue;
      const ri = SPAWN_DEFS[k].radius;
      for (const p of data.spawns[k]) if (circ(p[0], p[2], p[ri])) out.push({ kind: 'spawn', spawn: k, ref: p });
    }
    return out;
  }

  function row(label, attrs, value) {
    return `<div class="row"><label>${label}</label><input type="number" ${attrs} value="${value}"></div>`;
  }

  function renderProps() {
    if (selSet.length > 1) {
      const names = { object: '物体', zone: '区域', spawn: '生物群', mesa: '台地', arch: '拱门', hole: '隧道', clear: '留空区' };
      const kinds = {};
      for (const s of selSet) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
      const detail = Object.keys(kinds).map((k) => `${names[k]} ${kinds[k]}`).join(' · ');
      props.innerHTML = `<div class="kind">已选中 ${selSet.length} 个</div><div class="empty">${detail}<br>拖动任意一个可整体移动，Del 删除全部。</div><div class="btns"><button data-act="del" style="color:#ff9b9b;border-color:#5b2b2b">删除全部</button><button data-act="clear">取消选择</button></div>`;
      return;
    }
    if (!sel) {
      props.innerHTML = '<div class="empty">未选中对象。<br>用选择工具点击地图上的图元、物体或区域，或在空白处拖框选。</div>';
      return;
    }
    let html = '';
    if (sel.kind === 'object') {
      const o = sel.ref;
      const opts = PLACEABLE.map((i) => `<option value="${i}"${i === o.mesh ? ' selected' : ''}>${i} · ${MESH_NAMES[i]}</option>`).join('');
      html += `<div class="kind">物体 · ${MESH_NAMES[o.mesh]}</div>`;
      html += `<div class="row"><label>网格</label><select data-o="mesh">${opts}</select></div>`;
      html += row('x', 'step="0.5" data-o="x"', f(o.x));
      html += row('z', 'step="0.5" data-o="z"', f(o.z));
      html += `<div class="row"><label>y（空=贴地）</label><input type="number" step="0.5" data-o="y" value="${o.y == null ? '' : f(o.y)}" placeholder="自动"></div>`;
      html += row('缩放', 'step="0.05" min="0.05" data-o="scale"', f(o.scale));
      html += row('朝向 °', 'step="5" data-o="yaw"', f(o.yaw));
      html += row('俯仰 °', 'step="5" data-o="pitch"', f(o.pitch));
      html += row('横滚 °', 'step="5" data-o="roll"', f(o.roll));
      html += row('材质', 'step="1" min="0" max="9" data-o="mat"', o.mat);
      html += row('种子', 'step="0.05" min="0" max="1" data-o="seed"', f(o.seed));
      html += row('摆动', 'step="0.1" min="0" data-o="bob"', f(o.bob));
      html += '<div class="btns"><button data-act="del" style="color:#ff9b9b;border-color:#5b2b2b">删除物体</button></div>';
    } else if (sel.kind === 'zone') {
      const def = ZONE_DEFS[sel.zone];
      html += `<div class="kind">${def.label}</div>`;
      for (const [label, idx, step, min, max] of def.fields) {
        html += row(label, `step="${step}" min="${min}" max="${max}" data-i="${idx}"`, f(sel.ref[idx]));
      }
      html += row('x', 'step="0.5" data-i="0"', f(sel.ref[0]));
      html += row('z', 'step="0.5" data-i="1"', f(sel.ref[1]));
      html += '<div class="btns"><button data-act="del" style="color:#ff9b9b;border-color:#5b2b2b">删除区域</button></div>';
    } else if (sel.kind === 'spawn') {
      const def = SPAWN_DEFS[sel.spawn];
      html += `<div class="kind">${def.label}</div>`;
      for (const [label, idx, step, min, max] of def.fields) {
        html += row(label, `step="${step}" min="${min}" max="${max}" data-i="${idx}"`, f(sel.ref[idx]));
      }
      html += row('x', 'step="0.5" data-i="0"', f(sel.ref[0]));
      html += row('z', 'step="0.5" data-i="2"', f(sel.ref[2]));
      html += '<div class="btns"><button data-act="del" style="color:#ff9b9b;border-color:#5b2b2b">删除生物群</button></div>';
    } else {
      const spec = PRIM_SPECS[sel.kind];
      html += `<div class="kind">${spec.label}</div>`;
      for (const [label, idx, step] of spec.fields) {
        const v = sel.kind === 'arch' && idx === 3 ? (sel.ref[3] * 180 / Math.PI).toFixed(1) : f(sel.ref[idx]);
        html += row(label, `step="${step}" data-i="${idx}"`, v);
      }
      html += '<div class="btns"><button data-act="del" style="color:#ff9b9b;border-color:#5b2b2b">删除图元</button></div>';
    }
    html += `<div class="btns"><button data-act="dup">复制一份</button></div>`;
    props.innerHTML = html;
  }

  // ---------------------------------------------------------------- undo
  function pushUndo(snap) {
    undo.push(snap);
    if (undo.length > 60) undo.shift();
    redo.length = 0;
  }
  function doUndo() {
    if (!undo.length) return;
    const cur = JSON.stringify(payload());
    const prev = undo.pop();
    redo.push(cur);
    data = normalize(JSON.parse(prev));
    sel = null; selSet = []; marquee = null;
    syncCfg();
    renderProps(); scheduleRecompute(); autosave(); draw();
  }
  function doRedo() {
    if (!redo.length) return;
    undo.push(JSON.stringify(payload()));
    data = normalize(JSON.parse(redo.pop()));
    sel = null; selSet = []; marquee = null;
    syncCfg();
    renderProps(); scheduleRecompute(); autosave(); draw();
  }

  // ---------------------------------------------------------------- editing
  let draft = null, drag = null, pan = null, marquee = null, hover = [0, 0], spaceDown = false;
  let aim = null; // object just placed with the obj tool, drag sets its yaw
  let pick = { pt: null, ref: null }; // last click, so repeated clicks at one spot cycle through overlaps
  const originOf = (h) => {
    const r = h.ref;
    return h.kind === 'object' ? [r.x, r.z] : h.kind === 'spawn' ? [r[0], r[2]] : h.kind === 'arch' ? [r[0], r[2]] : h.kind === 'zone' ? [r[0], r[1]] : [r[0], r[1], r[2], r[3]];
  };

  function addObject(x, z) {
    pushUndo(JSON.stringify(payload()));
    const o = { mesh: paletteMesh, x: +x.toFixed(1), z: +z.toFixed(1), y: null, scale: 1, yaw: 0, pitch: 0, roll: 0, mat: MESH_MAT[paletteMesh], seed: +(Math.random()).toFixed(2), ts: 1, bob: 0 };
    data.objects.push(o);
    select({ kind: 'object', ref: o });
    autosave();
    return o;
  }

  function addZone(x, z) {
    pushUndo(JSON.stringify(payload()));
    const arr = data.zones[paletteZone];
    const p = ZONE_DEFS[paletteZone].make(+x.toFixed(1), +z.toFixed(1));
    arr.push(p);
    select({ kind: 'zone', zone: paletteZone, ref: p });
    autosave(); draw();
  }

  function addSpawn(x, z) {
    pushUndo(JSON.stringify(payload()));
    const p = SPAWN_DEFS[paletteSpawn].make(x, z);
    data.spawns[paletteSpawn].push(p);
    select({ kind: 'spawn', spawn: paletteSpawn, ref: p });
    autosave(); draw();
  }

  function commitDraft() {
    pushUndo(JSON.stringify(payload()));
    const a = draft.a, b = draft.b, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let hit;
    if (draft.kind === 'wall') {
      // a drawn line becomes a fence of 4 m wall sections laid end to end
      const L = Math.max(len, 0.5), n = Math.max(1, Math.round(L / 4)), seg = L / n;
      const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
      // the section's local x is its length: yaw so that x runs along the line
      const yaw = +(Math.atan2(-uz, ux) * 180 / Math.PI).toFixed(1);
      const made = [];
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) * seg;
        const o = {
          mesh: 28, x: +(a[0] + ux * t).toFixed(1), z: +(a[1] + uz * t).toFixed(1), y: null,
          scale: +(seg / 4).toFixed(3), yaw, pitch: 0, roll: 0, mat: 2, seed: +(Math.random()).toFixed(2), ts: 1, bob: 0,
        };
        data.objects.push(o); made.push(o);
      }
      selSet = made.map((o) => ({ kind: 'object', ref: o }));
      sel = selSet.length === 1 ? selSet[0] : null;
      renderProps(); autosave();
      msg(`已放置 ${n} 段围墙（${L.toFixed(1)} m）`);
      return;
    }
    if (draft.kind === 'mesa') {
      const bb = len < 0.6 ? [a[0] + 0.01, a[1]] : b;
      const m = [+a[0].toFixed(1), +a[1].toFixed(1), +bb[0].toFixed(1), +bb[1].toFixed(1), 7, -16, 5, 3];
      data.terrain.mesas.push(m); hit = { kind: 'mesa', ref: m };
    } else if (draft.kind === 'hole') {
      const bb = len < 0.6 ? [a[0] + 0.01, a[1]] : b;
      const m = [+a[0].toFixed(1), -20, +a[1].toFixed(1), 3.2, +bb[0].toFixed(1), -20, +bb[1].toFixed(1)];
      data.terrain.holes.push(m); hit = { kind: 'hole', ref: m };
    } else if (draft.kind === 'clear') {
      const bb = len < 0.6 ? [a[0] + 0.01, a[1]] : b;
      const m = [+a[0].toFixed(1), +a[1].toFixed(1), +bb[0].toFixed(1), +bb[1].toFixed(1), 5, 4];
      data.terrain.clears.push(m); hit = { kind: 'clear', ref: m };
    } else {
      const r = Math.max(5, len);
      const m = [+a[0].toFixed(1), -10, +a[1].toFixed(1), 0, +r.toFixed(1), 4, 1];
      data.terrain.arches.push(m); hit = { kind: 'arch', ref: m };
    }
    select(hit);
    scheduleRecompute();
    autosave();
  }

  function deleteSelection() {
    if (!selSet.length) return;
    pushUndo(JSON.stringify(payload()));
    let wasPrim = false;
    for (const h of selSet) {
      if (h.kind === 'object') {
        const i = data.objects.indexOf(h.ref); if (i >= 0) data.objects.splice(i, 1);
      } else if (h.kind === 'zone') {
        const a = data.zones[h.zone], i = a.indexOf(h.ref); if (i >= 0) a.splice(i, 1);
      } else if (h.kind === 'spawn') {
        const a = data.spawns[h.spawn], i = a.indexOf(h.ref); if (i >= 0) a.splice(i, 1);
      } else {
        const a = data.terrain[{ mesa: 'mesas', arch: 'arches', hole: 'holes', clear: 'clears' }[h.kind]], i = a.indexOf(h.ref);
        if (i >= 0) a.splice(i, 1);
        wasPrim = true;
      }
    }
    sel = null; selSet = []; renderProps();
    if (wasPrim) scheduleRecompute();
    autosave(); draw();
  }

  function duplicateSel() {
    if (!sel) return;
    pushUndo(JSON.stringify(payload()));
    if (sel.kind === 'object') {
      const o = Object.assign(clone(sel.ref), { x: sel.ref.x + 2, z: sel.ref.z + 2 });
      data.objects.push(o); select({ kind: 'object', ref: o });
    } else if (sel.kind === 'zone') {
      const p = clone(sel.ref); p[0] += 2; p[1] += 2;
      data.zones[sel.zone].push(p); select({ kind: 'zone', zone: sel.zone, ref: p });
    } else if (sel.kind === 'spawn') {
      const p = clone(sel.ref); p[0] += 6; p[2] += 6;
      data.spawns[sel.spawn].push(p); select({ kind: 'spawn', spawn: sel.spawn, ref: p });
    } else {
      const key = { mesa: 'mesas', arch: 'arches', hole: 'holes', clear: 'clears' }[sel.kind];
      const p = clone(sel.ref);
      if (sel.kind === 'arch') p[0] += 2;
      else { p[0] += 2; p[2] += 2; }
      data.terrain[key].push(p); select({ kind: sel.kind, ref: p }); scheduleRecompute();
    }
    autosave(); draw();
  }

  // ---------------------------------------------------------------- pointer
  function localPos(e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    const [sx, sy] = localPos(e), [x, z] = s2w(sx, sy);
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 1 || tool === 'pan' || spaceDown) {
      pan = { sx, sy, vx: view.x, vz: view.z };
      return;
    }
    if (e.button !== 0) return;
    if (tool === 'select') {
      const list = hitsAt(x, z);
      if (!list.length) {
        pick = { pt: null, ref: null };
        marquee = { a: [x, z], b: [x, z] };
        sel = null; selSet = [];
        renderProps(); draw();
        return;
      }
      // clicking the same spot again steps to the next overlapping item, never the current one
      const same = pick.pt && Math.hypot(x - pick.pt[0], z - pick.pt[1]) < 3 / view.k;
      let hit = list[0];
      if (same) {
        const at = list.findIndex((h) => h.ref === pick.ref);
        hit = list[(at + 1) % list.length];
        if (list.length > 1) msg(`此处重叠 ${list.length} 个，已切到 ${kindName(hit)}`);
      } else if (list.length > 1) {
        msg(`此处重叠 ${list.length} 个，再点一次可切换`);
      }
      pick = { pt: [x, z], ref: hit.ref };
      if (!isSelRef(hit.ref)) selSet = [hit];
      sel = selSet.length === 1 ? selSet[0] : null;
      renderProps();
      snapBefore = JSON.stringify(payload());
      drag = { start: [x, z], items: selSet.map((h) => ({ hit: h, orig: originOf(h) })) };
    } else if (tool === 'obj') {
      aim = { o: addObject(x, z), origin: [x, z] };
    } else if (tool === 'zone') {
      addZone(x, z);
    } else if (tool === 'spawn') {
      addSpawn(x, z);
    } else {
      draft = { kind: tool, a: [x, z], b: [x, z] };
    }
    draw();
  });

  canvas.addEventListener('pointermove', (e) => {
    const [sx, sy] = localPos(e), [x, z] = s2w(sx, sy);
    hover = [x, z];
    $('#coords').textContent = `x ${x.toFixed(1)}  z ${z.toFixed(1)}  y ${surfaceAt(x, z).toFixed(1)}`;
    if (pan) {
      view.x = pan.vx - (sx - pan.sx) / view.k;
      view.z = pan.vz - (sy - pan.sy) / view.k;
      draw(); return;
    }
    if (marquee) { marquee.b = [x, z]; draw(); return; }
    if (drag) {
      const dx = x - drag.start[0], dz = z - drag.start[1];
      for (const it of drag.items) {
        const r = it.hit.ref, o = it.orig, k = it.hit.kind;
        if (k === 'object') { r.x = +(o[0] + dx).toFixed(1); r.z = +(o[1] + dz).toFixed(1); }
        else if (k === 'arch') { r[0] = +(o[0] + dx).toFixed(1); r[2] = +(o[1] + dz).toFixed(1); }
        else if (k === 'zone') { r[0] = +(o[0] + dx).toFixed(1); r[1] = +(o[1] + dz).toFixed(1); }
        else if (k === 'spawn') { r[0] = +(o[0] + dx).toFixed(1); r[2] = +(o[1] + dz).toFixed(1); }
        else {
          r[0] = +(o[0] + dx).toFixed(1); r[1] = +(o[1] + dz).toFixed(1);
          r[2] = +(o[2] + dx).toFixed(1); r[3] = +(o[3] + dz).toFixed(1);
        }
      }
      if (sel) renderProps();
      draw(); return;
    }
    if (aim) {
      const dx = x - aim.origin[0], dz = z - aim.origin[1];
      if (Math.hypot(dx, dz) > 0.25) aim.o.yaw = +(Math.atan2(dx, dz) * 180 / Math.PI).toFixed(1);
      draw(); return;
    }
    if (draft) { draft.b = [x, z]; draw(); }
  });

  canvas.addEventListener('pointerup', (e) => {
    if (pan) { pan = null; return; }
    if (aim) {
      autosave();
      msg(`已放置 ${MESH_NAMES[aim.o.mesh]}，朝向 ${aim.o.yaw}°（拖动可改）`);
      aim = null; draw(); return;
    }
    if (marquee) {
      const a = marquee.a, b = marquee.b;
      const r = { x0: Math.min(a[0], b[0]), z0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), z1: Math.max(a[1], b[1]) };
      const tiny = r.x1 - r.x0 < 0.6 && r.z1 - r.z0 < 0.6;
      marquee = null;
      selSet = tiny ? [] : itemsInBox(r);
      sel = selSet.length === 1 ? selSet[0] : null;
      renderProps(); draw();
      if (!tiny) msg(selSet.length ? `框选 ${selSet.length} 个对象` : '框选：没有命中');
      return;
    }
    if (draft) { commitDraft(); draft = null; draw(); return; }
    if (drag) {
      const changed = snapBefore !== JSON.stringify(payload());
      if (changed) { pushUndo(snapBefore); autosave(); }
      if (drag.items.some((it) => it.hit.kind !== 'object' && it.hit.kind !== 'zone' && it.hit.kind !== 'spawn')) scheduleRecompute();
      snapBefore = null; drag = null;
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [sx, sy] = localPos(e), before = s2w(sx, sy);
    view.k = clamp(view.k * Math.exp(-e.deltaY * 0.0012), 0.5, 16);
    const after = s2w(sx, sy);
    view.x += before[0] - after[0];
    view.z += before[1] - after[1];
    draw();
  }, { passive: false });

  // ---------------------------------------------------------------- property edits
  props.addEventListener('focusin', (e) => {
    if (e.target.matches('input,select')) snapBefore = JSON.stringify(payload());
  });
  props.addEventListener('change', () => {
    if (snapBefore && snapBefore !== JSON.stringify(payload())) { pushUndo(snapBefore); autosave(); }
    snapBefore = null;
  });
  props.addEventListener('input', (e) => {
    const t = e.target;
    if (!sel) return;
    if (t.dataset.o !== undefined) {
      const k = t.dataset.o;
      if (k === 'mesh') { sel.ref.mesh = +t.value; sel.ref.mat = MESH_MAT[sel.ref.mesh]; renderProps(); }
      else if (k === 'y') sel.ref.y = t.value === '' ? null : +t.value;
      else if (k === 'mat') sel.ref.mat = +t.value;
      else sel.ref[k] = +t.value;
      draw(); return;
    }
    if (t.dataset.i !== undefined) {
      let v = +t.value;
      if (sel.kind === 'arch' && +t.dataset.i === 3) v = v * Math.PI / 180;
      sel.ref[+t.dataset.i] = v;
      if (sel.kind !== 'object' && sel.kind !== 'zone' && sel.kind !== 'spawn') scheduleRecompute();
      draw();
    }
  });
  props.addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    if (act === 'del') deleteSelection();
    else if (act === 'dup') duplicateSel();
    else if (act === 'clear') { sel = null; selSet = []; renderProps(); draw(); }
  });

  // ---------------------------------------------------------------- tools / panels
  function setTool(t) {
    tool = t;
    if (t !== 'select') pick = { pt: null, ref: null };
    for (const b of document.querySelectorAll('#tools button')) b.classList.toggle('on', b.dataset.tool === t);
    const hints = {
      select: '点击选中并拖动移动 · 空白处拖框选多个 · 属性在右侧改',
      pan: '拖动平移视图',
      mesa: '拖动画一根台地柱（单击=石柱）',
      arch: '拖动设定拱门半径（单击=默认拱）',
      hole: '拖动画隧道（单击=小洞）',
      clear: '拖动画留空区',
      obj: '点击放置，拖动决定朝向，松手确认',
      wall: '拖动画一道围墙（按 4 m 自动分段，房屋与围墙已分离）',
      zone: '点击地图添加当前区域',
      spawn: '点击地图添加当前生物群（位置 / 数量 / 半径在右侧改）',
    };
    $('#hint').textContent = hints[t] || '';
  }

  for (const b of document.querySelectorAll('#tools button')) b.addEventListener('click', () => setTool(b.dataset.tool));

  const pal = $('#pal');
  for (const i of PLACEABLE) {
    const n = MESH_NAMES[i];
    const b = document.createElement('button');
    b.dataset.mesh = i;
    b.innerHTML = `<span class="eye" title="显示 / 隐藏这类物体">◉</span><span class="name">${i} ${n}</span>`;
    b.querySelector('.eye').addEventListener('click', (e) => {
      e.stopPropagation();
      hiddenMesh.has(i) ? hiddenMesh.delete(i) : hiddenMesh.add(i);
      syncPalette(); draw();
    });
    b.addEventListener('click', () => { paletteMesh = i; setTool('obj'); syncPalette(); });
    pal.appendChild(b);
  }

  const zpal = $('#zpal');
  for (const k of Object.keys(ZONE_DEFS)) {
    const b = document.createElement('button');
    b.dataset.zone = k;
    b.innerHTML = `<span class="eye" title="显示 / 隐藏这类区域">◉</span><span class="name">${ZONE_DEFS[k].label}</span>`;
    b.querySelector('.eye').addEventListener('click', (e) => {
      e.stopPropagation();
      hiddenZone.has(k) ? hiddenZone.delete(k) : hiddenZone.add(k);
      syncPalette(); draw();
    });
    b.addEventListener('click', () => { paletteZone = k; setTool('zone'); syncPalette(); });
    zpal.appendChild(b);
  }

  const spal = $('#spal');
  for (const k of Object.keys(SPAWN_DEFS)) {
    const b = document.createElement('button');
    b.dataset.spawn = k;
    b.innerHTML = `<span class="eye" title="显示 / 隐藏这类生物群">◉</span><span class="name">${SPAWN_DEFS[k].label}</span>`;
    b.querySelector('.eye').addEventListener('click', (e) => {
      e.stopPropagation();
      hiddenSpawn.has(k) ? hiddenSpawn.delete(k) : hiddenSpawn.add(k);
      syncPalette(); draw();
    });
    b.addEventListener('click', () => { paletteSpawn = k; setTool('spawn'); syncPalette(); });
    spal.appendChild(b);
  }

  function syncPalette() {
    for (const b of pal.children) {
      const i = +b.dataset.mesh;
      b.classList.toggle('on', i === paletteMesh);
      b.classList.toggle('off', hiddenMesh.has(i));
      b.querySelector('.eye').textContent = hiddenMesh.has(i) ? '○' : '◉';
    }
    for (const b of zpal.children) {
      const k = b.dataset.zone;
      b.classList.toggle('on', k === paletteZone);
      b.classList.toggle('off', hiddenZone.has(k));
      b.querySelector('.eye').textContent = hiddenZone.has(k) ? '○' : '◉';
    }
    for (const b of spal.children) {
      const k = b.dataset.spawn;
      b.classList.toggle('on', k === paletteSpawn);
      b.classList.toggle('off', hiddenSpawn.has(k));
      b.querySelector('.eye').textContent = hiddenSpawn.has(k) ? '○' : '◉';
    }
  }
  syncPalette();
  $('#eyeAll').addEventListener('click', () => { hiddenMesh.clear(); hiddenZone.clear(); hiddenSpawn.clear(); syncPalette(); draw(); });

  for (const [id, key] of [['#lyZones', 'zones'], ['#lyPrims', 'prims'], ['#lyObj', 'objects'], ['#lySpawns', 'spawns'], ['#lyGrid', 'grid']]) {
    $(id).addEventListener('change', (e) => { layers[key] = e.target.checked; draw(); });
  }

  function syncCfg() {
    for (const [id, key] of [['#cfgKelp', 'kelp'], ['#cfgGround', 'ground'], ['#cfgProps', 'props'], ['#cfgReefCover', 'reefCover'], ['#cfgReefHeight', 'reefHeight'], ['#cfgReefRing', 'reefRing']]) $(id).value = data.cfg[key];
    for (const [id, key] of [['#cfgNoise', 'noise'], ['#cfgColumns', 'columns'], ['#cfgBoulders', 'boulders'], ['#cfgDebris', 'debris']]) $(id).checked = !!data.cfg[key];
  }
  for (const [id, key] of [['#cfgKelp', 'kelp'], ['#cfgGround', 'ground'], ['#cfgProps', 'props']]) {
    $(id).addEventListener('input', (e) => { data.cfg[key] = +e.target.value; autosave(); });
  }
  for (const [id, key] of [['#cfgReefCover', 'reefCover'], ['#cfgReefHeight', 'reefHeight'], ['#cfgReefRing', 'reefRing']]) {
    $(id).addEventListener('input', (e) => { data.cfg[key] = +e.target.value; autosave(); scheduleRecompute(); });
  }
  for (const [id, key] of [['#cfgNoise', 'noise'], ['#cfgColumns', 'columns'], ['#cfgBoulders', 'boulders'], ['#cfgDebris', 'debris']]) {
    $(id).addEventListener('change', (e) => {
      data.cfg[key] = e.target.checked ? 1 : 0;
      autosave();
      if (key === 'noise') scheduleRecompute();
    });
  }
  syncCfg();

  // ---------------------------------------------------------------- persistence
  $('#save').addEventListener('click', async () => {
    const body = JSON.stringify(payload(), null, 1);
    localStorage.setItem(STORE, body);
    msg('正在保存并构建…');
    try {
      const res = await fetch('/api/save', { method: 'POST', body });
      msg(res.ok ? '已保存并重新构建 index.html' : '保存失败：' + (await res.text()).slice(0, 160));
    } catch {
      msg('未通过 npm run edit 启动：已保存到浏览器，请用「导出 JSON」');
    }
  });
  $('#export').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(payload(), null, 1)], { type: 'application/json' }));
    a.download = 'world.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      data = normalize(JSON.parse(await file.text()));
      sel = null; selSet = []; marquee = null; undo.length = 0; redo.length = 0;
      syncCfg(); renderProps(); scheduleRecompute(); autosave(); draw();
      msg('已导入 ' + file.name);
    } catch (err) { msg('导入失败：' + err.message); }
    e.target.value = '';
  });
  $('#reset').addEventListener('click', () => {
    if (!confirm('恢复到代码里的默认地形、区域和物体？')) return;
    pushUndo(JSON.stringify(payload()));
    data = defaultData(); sel = null; selSet = []; marquee = null;
    syncCfg(); renderProps(); scheduleRecompute(); autosave(); draw();
    msg('已恢复默认，可 Ctrl+Z 撤销');
  });

  // ---------------------------------------------------------------- keyboard
  addEventListener('keydown', (e) => {
    if (e.target.matches('input,select,textarea')) return;
    if (e.code === 'Space') { spaceDown = true; canvas.style.cursor = 'grab'; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selSet.length) { e.preventDefault(); deleteSelection(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
    if (e.key === 'Escape') { sel = null; selSet = []; marquee = null; draft = null; aim = null; renderProps(); draw(); }
    const keys = { v: 'select', h: 'pan', m: 'mesa', a: 'arch', t: 'hole', c: 'clear', o: 'obj', w: 'wall', z: 'zone', b: 'spawn' };
    const k = e.key.toLowerCase();
    if (!e.ctrlKey && !e.metaKey && keys[k]) setTool(keys[k]);
  });
  addEventListener('keyup', (e) => {
    if (e.code === 'Space') { spaceDown = false; canvas.style.cursor = 'crosshair'; }
  });

  // ---------------------------------------------------------------- boot
  new ResizeObserver(resize).observe(stage);
  setTool('select');
  resize();
  sizePreview();
  fitView();
  initGpu();
})();
