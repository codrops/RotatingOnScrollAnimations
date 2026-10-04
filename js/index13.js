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
  uniform float uProgress;
  uniform float uDirection;

  attribute float aSlice;

  varying vec2 vUv;
  varying vec3 vFacing;

  void main() {
    vec3 pos = position * vec3(uSize, 1.0);

    // 0 in the middle of the scroll, 1 at both ends.
    float edge = abs(uProgress - 0.5) * 2.0;

    // The slices close one after another, the ones further inside the viewport first,
    // and open again in the same order on the way out.
    float order = uProgress < 0.5 ? aSlice : 1.0 - aSlice;
    float start = 0.1 + order * 0.35;
    float open = smoothstep(start, start + 0.5, edge);

    // Each slice turns around the vertical centre line, the leading ones furthest, fanning the image out...
    float angle = uDirection * open * mix(1.0, 2.2, 1.0 - order);
    float s = sin(angle);
    float c = cos(angle);

    // ...and curls a little as it turns.
    float curl = pos.x * pos.x / uSize.x * abs(s) * 0.35;
    pos = vec3(pos.x * c, pos.y, -pos.x * s - curl);

    vUv = uv;
    vFacing = vec3(s, 0.0, c);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec2 uSize;
  uniform vec2 uImageSize;

  varying vec2 vUv;
  varying vec3 vFacing;

  void main() {
    // Same as background-size: cover
    vec2 ratio = vec2(
      min((uSize.x / uSize.y) / (uImageSize.x / uImageSize.y), 1.0),
      min((uSize.y / uSize.x) / (uImageSize.y / uImageSize.x), 1.0)
    );
    vec3 color = texture2D(uTexture, (vUv - 0.5) * ratio + 0.5).rgb;

    vec3 normal = gl_FrontFacing ? vFacing : -vFacing;
    color *= mix(0.3, 1.0, max(normal.z, 0.0));

    if (!gl_FrontFacing) {
      color *= 0.5;
    }

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
  const amplitude = Math.min(window.innerWidth * 0.2, freeSpace);

  wraps.forEach((wrap, i) => {
    const angle = i * 0.8;

    gsap.set(wrap, {
      x: Math.sin(angle) * amplitude,
    });
  });
}

// --------------------------------
// Slices
// --------------------------------

function createSlicesGeometry(count, columns) {
  const positions = [];
  const uvs = [];
  const slices = [];
  const indices = [];

  // Every slice gets its own vertices, so it can turn on its own.
  for (let y = 0; y < count; y++) {
    const index = positions.length / 3;

    for (let row = 0; row <= 1; row++) {
      for (let x = 0; x <= columns; x++) {
        positions.push(x / columns - 0.5, (y + row) / count - 0.5, 0);
        uvs.push(x / columns, (y + row) / count);
        slices.push((y + 0.5) / count);
      }
    }

    for (let x = 0; x < columns; x++) {
      const a = index + x;
      const b = a + columns + 1;

      indices.push(a, a + 1, b + 1, a, b + 1, b);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aSlice', new THREE.Float32BufferAttribute(slices, 1));
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

  const geometry = createSlicesGeometry(14, 12);

  planes = textures.map((texture, i) => {
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const plane = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        side: THREE.DoubleSide,
        uniforms: {
          uTexture: { value: texture },
          uImageSize: { value: new THREE.Vector2(texture.image.width, texture.image.height) },
          uSize: { value: new THREE.Vector2() },
          uProgress: { value: 0.5 },
          // Neighbouring images fan out in opposite directions.
          uDirection: { value: i % 2 === 0 ? 1 : -1 },
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

  // Keep every plane on top of its (hidden) gallery item.
  planes.forEach((plane, i) => {
    const rect = items[i].getBoundingClientRect();

    plane.position.x = rect.left + rect.width / 2 - viewport.width / 2;
    plane.position.y = viewport.height / 2 - rect.top - rect.height / 2;
    plane.material.uniforms.uSize.value.set(rect.width, rect.height);
  });

  renderer.render(scene, camera);
}

// --------------------------------
// Gallery Animation
// --------------------------------

function initGalleryAnimation() {
  planes.forEach((plane, i) => {
    const { uniforms } = plane.material;

    // Slices turning away sink up to 60% of the image width behind the screen, and perspective pulls
    // them towards the middle of the viewport, so start (and end) that much earlier.
    const getReach = () => ((viewport.height / 2) * items[i].offsetWidth * 0.6) / camera.position.z;

    ScrollTrigger.create({
      trigger: items[i],
      start: () => `top bottom+=${getReach()}`,
      end: () => `bottom top-=${getReach()}`,
      scrub: true,

      onUpdate(self) {
        needsRender = true;
        uniforms.uProgress.value = self.progress;
      },
    });
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
    initGalleryAnimation();
  }

  gsap.ticker.add(render);
}

document.addEventListener('DOMContentLoaded', async () => {
  textures = await preloadTextures('.gallery__item');
  document.body.classList.remove('loading');
  init();
});
