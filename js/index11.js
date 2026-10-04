import * as THREE from './three.module.min.js';

gsap.registerPlugin(ScrollTrigger);

let lenis;
let items = [];
let wraps = [];
let textures = [];
let planes = [];
let renderer;
let scene;
let camera;
let lastTop = null;
let needsRender = true;
const viewport = { width: 0, height: 0 };
const marqueeInner = document.querySelector('.mark > .mark__inner'); // Select the inner element of the marquee
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const textureLoader = new THREE.TextureLoader();

const preloadTextures = (selector) => {
  return Promise.all(
    gsap.utils.toArray(selector).map((item) => {
      const url = item.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)[1];
      return textureLoader.loadAsync(url);
    })
  );
};

// --------------------------------
// Shaders
// --------------------------------

const vertexShader = /* glsl */ `
  uniform vec2 uSize;
  uniform float uFlow;

  attribute vec2 aCenter;
  attribute vec3 aRandom;

  varying vec2 vUv;
  varying float vLight;
  varying float vTurn;

  // Turns v around the unit axis k (Rodrigues' rotation formula).
  vec3 rotate(vec3 v, vec3 k, float angle) {
    return v * cos(angle) + cross(k, v) * sin(angle) + k * dot(k, v) * (1.0 - cos(angle));
  }

  void main() {
    // The part of the image furthest into the viewport settles first, sweeping across it on a slight diagonal.
    // The sweep starts right at the viewport edge and is short, so every row turns while it's still in view.
    float lead = uFlow < 0.0 ? aCenter.y + 0.5 : 0.5 - aCenter.y;
    lead = lead * 0.75 + (aCenter.x + 0.5) * 0.25;
    float start = lead * 0.3 + aRandom.x * 0.05;
    float t = clamp((abs(uFlow) - start) / 0.55, 0.0, 1.0);

    // Leaving, the tiles set off straight away. Coming in, they land softly.
    float turn = uFlow > 0.0 ? 1.0 - (1.0 - t) * (1.0 - t) : t * t * (3.0 - 2.0 * t);

    // Each tile is turned out of place by one to three quarter turns, and turns back into place...
    float quarters = 1.0 + floor(aRandom.y * 3.0);
    float angle = turn * quarters * 1.5708 * (aRandom.z < 0.5 ? -1.0 : 1.0);

    vec3 tile = vec3((position.xy - aCenter) * uSize, 0.0);
    tile.xy = mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * tile.xy * (1.0 - turn * 0.2);

    // ...lifting towards the viewer and tilting a little on the way.
    float lift = sin(turn * 3.1416);
    vec3 axis = normalize(vec3(aRandom.z - 0.5, aRandom.x - 0.5, 0.0) + 0.0001);
    tile = rotate(tile, axis, lift * 0.5);

    vec3 pos = vec3(aCenter * uSize, lift * 60.0) + tile;

    vUv = uv;
    vLight = rotate(vec3(0.0, 0.0, 1.0), axis, lift * 0.5).z;
    vTurn = turn;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec2 uSize;
  uniform vec2 uImageSize;

  varying vec2 vUv;
  varying float vLight;
  varying float vTurn;

  void main() {
    // Same as background-size: cover
    vec2 ratio = vec2(
      min((uSize.x / uSize.y) / (uImageSize.x / uImageSize.y), 1.0),
      min((uSize.y / uSize.x) / (uImageSize.y / uImageSize.x), 1.0)
    );
    vec3 color = texture2D(uTexture, (vUv - 0.5) * ratio + 0.5).rgb;

    color *= mix(0.3, 1.0, vLight) * (1.0 - vTurn * 0.35);

    gl_FragColor = vec4(color, 1.0);
  }
`;

// --------------------------------
// Smooth Scrolling
// --------------------------------

function initSmoothScrolling() {
  lenis = new Lenis();

  lenis.on('scroll', ScrollTrigger.update);

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });

  gsap.ticker.lagSmoothing(0);
}

// --------------------------------
// Gallery Structure
// --------------------------------

function createGalleryWrappers() {
  items = gsap.utils.toArray('.gallery__item');

  items.forEach((item) => {
    const wrapper = document.createElement('div');
    wrapper.classList.add('gallery__item-wrap');

    item.parentNode.insertBefore(wrapper, item);
    wrapper.appendChild(item);
  });

  wraps = gsap.utils.toArray('.gallery__item-wrap');
}

// --------------------------------
// Gallery Layout
// --------------------------------

function positionGalleryItems() {
  const freeSpace = (window.innerWidth - wraps[0].offsetWidth) / 2;
  const amplitude = Math.min(window.innerWidth * 0.15, freeSpace);

  wraps.forEach((wrap, i) => {
    const angle = i * 0.7;

    gsap.set(wrap, {
      x: Math.sin(angle) * amplitude,
    });
  });
}

// --------------------------------
// Tiles
// --------------------------------

function createTilesGeometry(cols, rows) {
  const positions = [];
  const uvs = [];
  const centers = [];
  const randoms = [];
  const indices = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const corners = [
        [x / cols, y / rows],
        [(x + 1) / cols, y / rows],
        [(x + 1) / cols, (y + 1) / rows],
        [x / cols, (y + 1) / rows],
      ];
      const center = [(x + 0.5) / cols - 0.5, (y + 0.5) / rows - 0.5];
      const random = [Math.random(), Math.random(), Math.random()];
      const index = positions.length / 3;

      // Every tile gets its own four vertices, so it can move on its own.
      corners.forEach(([u, v]) => {
        positions.push(u - 0.5, v - 0.5, 0);
        uvs.push(u, v);
        centers.push(...center);
        randoms.push(...random);
      });

      indices.push(index, index + 1, index + 2, index, index + 2, index + 3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aCenter', new THREE.Float32BufferAttribute(centers, 2));
  geometry.setAttribute('aRandom', new THREE.Float32BufferAttribute(randoms, 3));
  geometry.setIndex(indices);

  return geometry;
}

// --------------------------------
// WebGL
// --------------------------------

function initWebGL() {
  renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector('.webgl'),
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 10, 5000);
  camera.position.z = 1000;

  planes = textures.map((texture) => {
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const plane = new THREE.Mesh(
      createTilesGeometry(14, 9),
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        side: THREE.DoubleSide,
        uniforms: {
          uTexture: { value: texture },
          uImageSize: { value: new THREE.Vector2(texture.image.width, texture.image.height) },
          uSize: { value: new THREE.Vector2() },
          uFlow: { value: 0 },
        },
      })
    );
    plane.frustumCulled = false;
    scene.add(plane);

    return plane;
  });

  resizeWebGL();
}

function resizeWebGL() {
  viewport.width = renderer.domElement.clientWidth;
  viewport.height = renderer.domElement.clientHeight;

  renderer.setSize(viewport.width, viewport.height, false);
  camera.aspect = viewport.width / viewport.height;
  // Match the field of view to the viewport, so 1 unit equals 1 pixel at z = 0.
  camera.fov = 2 * Math.atan(viewport.height / 2 / camera.position.z) * (180 / Math.PI);
  camera.updateProjectionMatrix();
  needsRender = true;
}

function render() {
  // Only draw when something has changed, so a still page costs nothing.
  const top = items[0].getBoundingClientRect().top;
  if (!needsRender && top === lastTop) return;
  needsRender = false;
  lastTop = top;

  updateGallery();
  renderer.render(scene, camera);
}

// --------------------------------
// Gallery Animation
// --------------------------------

function updateGallery() {
  planes.forEach((plane, i) => {
    const rect = items[i].getBoundingClientRect();
    const { uniforms } = plane.material;
    const offset = viewport.height / 2 - rect.top - rect.height / 2;

    // The tiles turn into place while the image comes in through the bottom of the viewport, stay in place
    // while all of it is in view, and turn out of place again once its top reaches the top of the viewport.
    const comingIn = gsap.utils.clamp(0, 1, (rect.bottom - viewport.height) / rect.height);
    const goingOut = gsap.utils.clamp(0, 1, -rect.top / rect.height);
    uniforms.uFlow.value = reduceMotion ? 0 : goingOut > 0 ? goingOut : -comingIn;

    // Keep every plane on top of its (hidden) gallery item.
    plane.position.x = rect.left + rect.width / 2 - viewport.width / 2;
    plane.position.y = offset;
    uniforms.uSize.value.set(rect.width, rect.height);
  });
}

// --------------------------------
// Marquee Animation
// --------------------------------
const animateMarquee = () => {
  gsap
    .timeline({
      scrollTrigger: {
        trigger: document.querySelector('.gallery'),
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
        invalidateOnRefresh: true,
      },
    })
    .fromTo(
      marqueeInner,
      {
        x: '100vw',
      },
      {
        x: '-100%',
        ease: 'none',
      }
    );
};

// --------------------------------
// Events
// --------------------------------

function initEvents() {
  window.addEventListener('resize', () => {
    positionGalleryItems();
    resizeWebGL();
  });
}

// ------------------------------------------------------------
// INITIALIZATION
// ------------------------------------------------------------

function init() {
  createGalleryWrappers();
  positionGalleryItems();
  initWebGL();
  animateMarquee();
  initEvents();

  // Keep native scrolling and flat images when reduced motion is preferred.
  if (!reduceMotion) {
    initSmoothScrolling();
  }

  gsap.ticker.add(render);
}

document.addEventListener('DOMContentLoaded', async () => {
  textures = await preloadTextures('.gallery__item');
  document.body.classList.remove('loading');
  init();
});
