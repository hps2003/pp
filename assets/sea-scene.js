import * as THREE from 'three';

// Minimal GLB reader: geometry + PBR factors only (no textures, no animation).
const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(json, bin, index) {
  const acc = json.accessors[index];
  const TA = COMP[acc.componentType];
  const items = SIZE[acc.type];
  const view = json.bufferViews[acc.bufferView];
  const base = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const stride = view.byteStride || items * TA.BYTES_PER_ELEMENT;
  const packed = stride === items * TA.BYTES_PER_ELEMENT;
  if (packed) return { array: new TA(bin, base, acc.count * items), items, normalized: !!acc.normalized };
  const out = new TA(acc.count * items);
  const dv = new DataView(bin);
  const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[acc.componentType];
  for (let i = 0; i < acc.count; i++) for (let c = 0; c < items; c++) {
    out[i * items + c] = dv[get](base + i * stride + c * TA.BYTES_PER_ELEMENT, true);
  }
  return { array: out, items, normalized: !!acc.normalized };
}

function makeMaterial(json, index, hasColor) {
  const def = (index != null && json.materials && json.materials[index]) || {};
  const pbr = def.pbrMetallicRoughness || {};
  const f = pbr.baseColorFactor || [1, 1, 1, 1];
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(f[0], f[1], f[2]),
    metalness: pbr.metallicFactor != null ? pbr.metallicFactor : 1,
    roughness: pbr.roughnessFactor != null ? pbr.roughnessFactor : 1,
    vertexColors: hasColor,
    side: def.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
  m.name = def.name || '';
  return m;
}

function buildNode(json, bin, nodeIndex, matCache) {
  const def = json.nodes[nodeIndex];
  const group = new THREE.Group();
  group.name = def.name || '';
  if (def.matrix) group.applyMatrix4(new THREE.Matrix4().fromArray(def.matrix));
  else {
    if (def.translation) group.position.fromArray(def.translation);
    if (def.rotation) group.quaternion.fromArray(def.rotation);
    if (def.scale) group.scale.fromArray(def.scale);
  }
  if (def.mesh != null) {
    const mesh = json.meshes[def.mesh];
    mesh.primitives.forEach((prim, i) => {
      const geom = new THREE.BufferGeometry();
      const attrMap = { POSITION: 'position', NORMAL: 'normal', COLOR_0: 'color', TEXCOORD_0: 'uv', TANGENT: 'tangent' };
      let hasColor = false;
      for (const key in prim.attributes) {
        const name = attrMap[key];
        if (!name) continue;
        const a = readAccessor(json, bin, prim.attributes[key]);
        geom.setAttribute(name, new THREE.BufferAttribute(a.array, a.items, a.normalized));
        if (key === 'COLOR_0') hasColor = true;
      }
      if (prim.indices != null) {
        const idx = readAccessor(json, bin, prim.indices);
        geom.setIndex(new THREE.BufferAttribute(idx.array, 1));
      }
      if (!geom.attributes.normal) geom.computeVertexNormals();
      const key = prim.material + '|' + hasColor;
      if (!matCache.has(key)) matCache.set(key, makeMaterial(json, prim.material, hasColor));
      const m = new THREE.Mesh(geom, matCache.get(key));
      m.name = (mesh.name || 'mesh') + (i ? '_' + i : '');
      group.add(m);
    });
  }
  (def.children || []).forEach((c) => group.add(buildNode(json, bin, c, matCache)));
  return group;
}

function parseGLB(buffer) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB file');
  let offset = 12, json = null, bin = null;
  while (offset < dv.byteLength) {
    const len = dv.getUint32(offset, true);
    const type = dv.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, len)));
    else if (type === 0x004e4942) bin = buffer.slice(start, start + len);
    offset = start + len + ((4 - (len % 4)) % 4);
  }
  const scene = new THREE.Group();
  const matCache = new Map();
  const sceneDef = json.scenes[json.scene || 0];
  sceneDef.nodes.forEach((n) => scene.add(buildNode(json, bin, n, matCache)));
  return { scene };
}

function loadGLB(url) {
  return fetch(url).then((r) => r.arrayBuffer()).then(parseGLB);
}


const DUR = 12;              // loop length in seconds
const W = (Math.PI * 2) / DUR; // base angular frequency -> perfect loop

// Coarse/small screens run a lighter water shader (fewer fbm octaves) and a
// capped frame rate. Desktop keeps the full 4-octave look. This only changes
// noise detail slightly on phones — the sea style is unchanged.
const IS_MOBILE = (function () { try { return matchMedia('(max-width:768px), (pointer:coarse)').matches; } catch (e) { return false; } })();
const FBM_ITER = IS_MOBILE ? 3 : 4;

const VERT = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
const float W = ${W.toFixed(8)};
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uTime;
uniform vec2 uCover;
uniform vec2 uOffset;
uniform float uAmp;
uniform float uSparkle;
uniform float uGlitter;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = hash(i), b = hash(i+vec2(1.0,0.0)), c = hash(i+vec2(0.0,1.0)), d = hash(i+vec2(1.0,1.0));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for(int i=0;i<${FBM_ITER};i++){ s += a*vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}

// loop-safe animated noise: walk the noise domain on a circle
vec2 orbit(float speed, float r){
  float t = uTime * W * speed;
  return vec2(cos(t), sin(t)) * r;
}

float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main(){
  vec2 uv = (vUv - 0.5) * uCover + 0.5 + uOffset;

  // two counter-drifting noise fields -> rippling refraction
  float n1 = fbm(uv * vec2(9.0, 22.0) + orbit(1.0, 1.4));
  float n2 = fbm(uv * vec2(15.0, 34.0) - orbit(2.0, 0.9) + 31.7);
  vec2 disp = vec2(n1 - 0.5, (n2 - 0.5) * 0.55) * uAmp;

  // slow swell that shears the whole surface horizontally
  disp.x += sin(uv.y * 14.0 + uTime * W * 1.0) * uAmp * 0.35;
  disp.y += sin(uv.x * 8.0 - uTime * W * 1.0) * uAmp * 0.18;

  vec3 col = texture2D(uTex, uv + disp).rgb;
  // chromatic separation reads as water depth
  col.r = texture2D(uTex, uv + disp * 1.06).r;
  col.b = texture2D(uTex, uv + disp * 0.94).b;

  float L = lum(col);

  // existing highlights breathe in and out of focus
  float hi = smoothstep(0.66, 0.94, L);
  float grain = hash(floor((uv + disp) * 900.0));
  float flick = 0.45 + 0.55 * sin(uTime * W * 7.0 + grain * 43.0);
  col += hi * flick * uSparkle;

  // new specks born on the wave crests
  float crest = smoothstep(0.52, 0.86, L) * smoothstep(0.55, 0.9, n1);
  float speck = pow(vnoise((uv + disp) * 420.0 + orbit(3.0, 6.0)), 9.0);
  col += crest * speck * uGlitter * vec3(1.0, 0.98, 0.9) * 6.0;

  // broad sun glitter band sliding across the surface
  float band = exp(-pow((uv.y - (0.5 + 0.28 * sin(uTime * W))) * 3.2, 2.0));
  col += hi * band * 0.18;

  // gentle vignette to seat the type
  float v = smoothstep(1.25, 0.35, length((vUv - 0.5) * vec2(1.15, 1.0)) * 1.6);
  col *= mix(0.9, 1.05, v) * 1.12;

  gl_FragColor = vec4(col, 1.0);
}
`;


// split a merged glyph mesh into connected components (one per letter)
function splitComponents(geom) {
  const g = geom.index ? geom.toNonIndexed() : geom;
  const pos = g.attributes.position.array;
  const triCount = pos.length / 9;
  const keyOf = (i) => `${Math.round(pos[i*3]*1e4)},${Math.round(pos[i*3+1]*1e4)},${Math.round(pos[i*3+2]*1e4)}`;
  const vid = new Map();
  const parent = [];
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  const triVerts = [];
  for (let t = 0; t < triCount; t++) {
    const ids = [];
    for (let k = 0; k < 3; k++) {
      const key = keyOf(t * 3 + k);
      let id = vid.get(key);
      if (id === undefined) { id = parent.length; vid.set(key, id); parent.push(id); }
      ids.push(id);
    }
    union(ids[0], ids[1]); union(ids[1], ids[2]);
    triVerts.push(ids);
  }
  const buckets = new Map();
  for (let t = 0; t < triCount; t++) {
    const r = find(triVerts[t][0]);
    if (!buckets.has(r)) buckets.set(r, []);
    buckets.get(r).push(t);
  }
  const attrs = Object.keys(g.attributes);
  const out = [];
  for (const tris of buckets.values()) {
    const ng = new THREE.BufferGeometry();
    for (const name of attrs) {
      const a = g.attributes[name];
      const items = a.itemSize;
      const arr = new a.array.constructor(tris.length * 3 * items);
      let o = 0;
      for (const t of tris) for (let k = 0; k < 3; k++) for (let c = 0; c < items; c++) arr[o++] = a.array[(t * 3 + k) * items + c];
      ng.setAttribute(name, new THREE.BufferAttribute(arr, items, a.normalized));
    }
    ng.computeBoundingBox();
    out.push(ng);
  }
  return out;
}

class SeaScene extends HTMLElement {
  connectedCallback() {
    if (this._init) return;
    this._init = true;
    this.style.display = 'block';
    this.style.position = 'absolute';
    this.style.inset = '0';
    this.style.width = '100%';
    this.style.height = '100%';
    this.style.overflow = 'hidden';
    this.style.background = '#0d2b33';

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    this.appendChild(canvas);

    // preserveDrawingBuffer:false — nothing reads the canvas back (no export /
    // screenshot), so the browser can discard the buffer each frame (cheaper).
    // Antialias is dropped on mobile (MSAA is costly) — the shader is soft anyway.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_MOBILE, preserveDrawingBuffer: false, alpha: false, powerPreference: 'high-performance' });
    // Adaptive DPR: fewer pixels per frame on phones (biggest WebGL cost).
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, IS_MOBILE ? 1.25 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;

    // --- background pass
    const tex = new THREE.TextureLoader().load(this.getAttribute('image') || 'uploads/IMG_3874.JPG', (t) => {
      this._imgAspect = t.image.width / t.image.height;
      this.resize();
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
    tex.minFilter = THREE.LinearFilter;

    this.bgUniforms = {
      uTex: { value: tex },
      uTime: { value: 0 },
      uCover: { value: new THREE.Vector2(1, 1) },
      uOffset: { value: new THREE.Vector2(0, 0) },
      uAmp: { value: parseFloat(this.getAttribute('ripple') || '0.012') },
      uSparkle: { value: parseFloat(this.getAttribute('sparkle') || '0.35') },
      uGlitter: { value: parseFloat(this.getAttribute('glitter') || '0.9') },
    };
    this.bgScene = new THREE.Scene();
    this.bgScene.add(new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.bgUniforms, depthTest: false, depthWrite: false })
    ));
    this.bgCam = new THREE.Camera();

    // --- foreground 3D text
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 100);
    this.camera.position.set(0, 0.35, 6);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.HemisphereLight(0xdff3ff, 0x0e3a44, 1.1));
    const key = new THREE.DirectionalLight(0xfff3d8, 2.6);
    key.position.set(-2.5, 3.2, 3.5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fe6ff, 1.5);
    rim.position.set(3.0, -1.0, -2.0);
    this.scene.add(rim);

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    loadGLB(this.getAttribute('model') || 'uploads/Project_3_yellow_v2.glb').then((gltf) => {
      const obj = gltf.scene;
      obj.updateMatrixWorld(true);

      // split the merged meshes, then cluster the pieces back into letters
      const parts = [];
      const sources = [];
      obj.traverse((o) => { if (o.isMesh) sources.push(o); });
      for (const src of sources) {
        const mat = src.material;
        if ('roughness' in mat) mat.roughness = Math.min(mat.roughness ?? 0.5, 0.35);
        if ('metalness' in mat) mat.metalness = Math.max(mat.metalness ?? 0, 0.25);
        mat.envMapIntensity = 1.2;
        const baked = src.geometry.clone();
        baked.applyMatrix4(src.matrixWorld);
        for (const geo of splitComponents(baked)) {
          const bb = geo.boundingBox;
          parts.push({ geo, mat, minX: bb.min.x, maxX: bb.max.x, cy: (bb.min.y + bb.max.y) / 2, cx: (bb.min.x + bb.max.x) / 2 });
        }
      }

      const full = new THREE.Box3();
      for (const p of parts) full.union(p.geo.boundingBox);
      const size = full.getSize(new THREE.Vector3());
      const center = full.getCenter(new THREE.Vector3());
      const s = 2.6 / Math.max(size.x, 0.0001);
      const gapTol = size.x * 0.012;

      const glyphs = new THREE.Group();
      const makeLine = (list) => {
        list.sort((a, b) => a.minX - b.minX);
        const clusters = [];
        for (const p of list) {
          const last = clusters[clusters.length - 1];
          if (last && p.minX <= last.maxX + gapTol) { last.parts.push(p); last.maxX = Math.max(last.maxX, p.maxX); }
          else clusters.push({ parts: [p], maxX: p.maxX });
        }
        return clusters.map((cl) => {
          const bb = new THREE.Box3();
          for (const p of cl.parts) bb.union(p.geo.boundingBox);
          const c = bb.getCenter(new THREE.Vector3());
          const holder = new THREE.Group();
          for (const p of cl.parts) {
            const g = p.geo;
            g.translate(-c.x, -c.y, -c.z);
            g.computeBoundingBox();
            holder.add(new THREE.Mesh(g, p.mat));
          }
          holder.position.copy(c);
          glyphs.add(holder);
          return holder;
        });
      };
      const top = makeLine(parts.filter((p) => p.cy >= center.y));
      const bot = makeLine(parts.filter((p) => p.cy < center.y));

      // relayout both lines: even tracking, tight leading, PENG larger and left, SYUN right
      const measure = (l) => { const b = new THREE.Box3().setFromObject(l); return { w: b.max.x - b.min.x, h: b.max.y - b.min.y, b }; };
      const layout = (line, scale, shiftX, lineY) => {
        if (!line.length) return 0;
        line.forEach((l) => l.scale.setScalar(scale));
        const ms = line.map(measure);
        const gap = size.x * 0.038 * scale;
        const total = ms.reduce((a, m) => a + m.w, 0) + gap * (line.length - 1);
        let x = -total / 2;
        line.forEach((l, i) => {
          const m = ms[i];
          const cx = (m.b.min.x + m.b.max.x) / 2 - l.position.x;   // holder-origin offset
          const cy = (m.b.min.y + m.b.max.y) / 2 - l.position.y;
          l.position.x = x + m.w / 2 - cx + shiftX;
          l.position.y = lineY - cy;
          x += m.w + gap;
        });
        return Math.max(...ms.map((m) => m.h));
      };
      const topScale = 1.14;
      const hTop = layout(top, topScale, -size.x * 0.095, 0);
      const hBot = layout(bot, 1.0, size.x * 0.095, 0);
      const lead = (hTop + hBot) * 0.5 * 0.62;   // tight leading
      top.forEach((l) => (l.position.y += lead));
      bot.forEach((l) => (l.position.y -= lead));

      const root = new THREE.Group();
      root.add(glyphs);
      root.scale.setScalar(s);
      const nb = new THREE.Box3().setFromObject(glyphs);
      glyphs.position.copy(nb.getCenter(new THREE.Vector3())).multiplyScalar(-1);
      this.pivot.add(root);

      // each glyph floats on its own phase
      this.glyphs = [...top, ...bot].map((l, i) => ({
        o: l,
        base: l.position.clone(),
        ph: i * 1.7 + (i % 3) * 0.9,
        amp: size.y * 0.028 * (0.7 + ((i * 7) % 5) / 5),
        spd: 1 + (i % 3) * 0.5,
      }));

      // soft mirrored reflection sitting on the water
      const refl = new THREE.Group();
      const rg = glyphs.clone(true);
      rg.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.opacity = 0.16;
          o.material.depthWrite = false;
        }
      });
      refl.add(rg);
      refl.scale.set(s, -s, s);
      refl.position.y -= size.y * s * 0.9;
      this.reflection = refl;
      this.reflGlyphs = rg.children;
      this.pivot.add(refl);

      // Measure the word's world-space extents (main glyphs only, not the
      // reflection) so resize() can guarantee the full text always fits.
      this.scene.updateMatrixWorld(true);
      const fitBox = new THREE.Box3().setFromObject(glyphs);
      const fitSize = fitBox.getSize(new THREE.Vector3());
      this._fit = { w: fitSize.x, h: fitSize.y };
      this.resize();

      this.render(this.time || 0);
    }).catch((e) => console.error('model load failed', e));

    this.time = 0;
    this.paused = false;
    this._t0 = performance.now();

    this._onSeek = (e) => {
      this.paused = true;
      const t = (e.detail && e.detail.time) != null ? e.detail.time : ((e.detail && e.detail.frame) || 0) / 30;
      this.render(t);
      clearTimeout(this._resumeTimer);
      this._resumeTimer = setTimeout(() => { this.paused = false; this._t0 = performance.now() - this.time * 1000; }, 400);
    };
    this.addEventListener('data-om-seek-to-time-frame', this._onSeek);

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(this);
    this.resize();

    // --- render loop, gated so the GPU only works when the hero is on screen ---
    // The hero lives in an iframe, so it can't see the parent's scroll. The parent
    // page observes the hero and posts {type:'sea-visible'} messages; we also pause
    // when the tab/app is backgrounded. Off-screen or hidden => cancelAnimationFrame
    // (no idle GPU). Mobile is capped to ~30 FPS via a frame interval.
    this._inView = true;
    this._active = false;
    this._lastFrame = 0;
    this._frameInterval = IS_MOBILE ? 33 : 0;   // 0 = uncapped (up to display refresh)

    const loop = (now) => {
      if (!this._active) return;
      this._raf = requestAnimationFrame(loop);
      if (this.paused) return;
      if (this._frameInterval && (now - this._lastFrame) < this._frameInterval) return;
      this._lastFrame = now;
      this.render(((performance.now() - this._t0) / 1000) % DUR);
    };
    this._start = () => {
      if (this._active || !this._inView || document.hidden) return;
      this._active = true;
      this._t0 = performance.now() - (this.time || 0) * 1000;   // continue smoothly
      this._raf = requestAnimationFrame(loop);
    };
    this._stop = () => { this._active = false; cancelAnimationFrame(this._raf); };

    this._onVis = () => { if (document.hidden) this._stop(); else this._start(); };
    document.addEventListener('visibilitychange', this._onVis);
    this._onMsg = (e) => {
      const d = e.data;
      if (d && d.type === 'sea-visible') { this._inView = !!d.visible; this._inView ? this._start() : this._stop(); }
    };
    window.addEventListener('message', this._onMsg);

    this._start();
  }

  disconnectedCallback() {
    this._stop && this._stop();
    cancelAnimationFrame(this._raf);
    this._ro && this._ro.disconnect();
    document.removeEventListener('visibilitychange', this._onVis);
    window.removeEventListener('message', this._onMsg);
  }

  resize() {
    const w = this.clientWidth || 1280;
    const h = this.clientHeight || 720;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the whole 3D word inside the frustum at any aspect ratio. The camera
    // is dollied back only when the current aspect can't already frame the text,
    // so a wide/desktop viewport stays at the design distance (z = 6) and its
    // framing is unchanged, while a narrow/portrait phone pulls back just enough
    // that "PENG SYUN" is never cropped at the sides. This scales the entire word
    // uniformly — glyphs, spacing and animation are untouched.
    if (this._fit) {
      const fovV = this.camera.fov * Math.PI / 180;
      const fovH = 2 * Math.atan(Math.tan(fovV / 2) * (w / h));
      const margin = 1.12;
      const distV = (this._fit.h * margin / 2) / Math.tan(fovV / 2);
      const distH = (this._fit.w * margin / 2) / Math.tan(fovH / 2);
      this.camera.position.z = Math.max(6, distH, distV);
      this.camera.lookAt(0, 0, 0);
    }
    this.camera.updateProjectionMatrix();
    const ia = this._imgAspect || 16 / 9;
    const va = w / h;
    const c = this.bgUniforms.uCover.value;
    if (va > ia) { c.set(1, ia / va); } else { c.set(va / ia, 1); }
    this.render(this.time);
  }

  render(t) {
    this.time = t;
    this.bgUniforms.uTime.value = t;
    const a = t * W;
    if (this.pivot) {
      this.pivot.position.y = Math.sin(a) * 0.11 + Math.sin(a * 2.0 + 1.1) * 0.035;
      this.pivot.position.x = Math.sin(a * 1.0 + 0.6) * 0.06;
      this.pivot.rotation.z = Math.sin(a + 0.9) * 0.026;
      this.pivot.rotation.x = Math.sin(a * 2.0) * 0.035;
      this.pivot.rotation.y = Math.sin(a * 1.0 + 2.2) * 0.12;
    }
    if (this.glyphs) {
      for (const g of this.glyphs) {
        g.o.position.y = g.base.y + Math.sin(a * g.spd + g.ph) * g.amp;
        g.o.position.x = g.base.x + Math.sin(a * g.spd * 0.5 + g.ph * 1.3) * g.amp * 0.25;
        g.o.rotation.z = Math.sin(a * g.spd + g.ph * 0.7) * 0.05;
        g.o.rotation.x = Math.sin(a * g.spd * 0.5 + g.ph) * 0.06;
      }
    }
    if (this.reflection) this.reflection.rotation.y = Math.sin(a * 1.0 + 2.2) * 0.12;
    this.renderer.clear();
    this.renderer.render(this.bgScene, this.bgCam);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
  }
}

customElements.define('sea-scene', SeaScene);
