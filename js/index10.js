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

  attribute vec2 aCenter;
  attribute vec3 aRandom;

  varying vec2 vUv;
  varying float vLight;
  varying float vScatter;

  // Rotation about an arbitrary axis, after Neil Mendoza's GLSL snippet:
  // https://www.neilmendoza.com/glsl-rotation-about-an-arbitrary-axis/
  mat3 rotateAxis(vec3 axis, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;

    return mat3(
      oc * axis.x * axis.x + c, oc * axis.x * axis.y + axis.z * s, oc * axis.z * axis.x - axis.y * s,
      oc * axis.x * axis.y - axis.z * s, oc * axis.y * axis.y + c, oc * axis.y * axis.z + axis.x * s,
      oc * axis.z * axis.x + axis.y * s, oc * axis.y * axis.z - axis.x * s, oc * axis.z * axis.z + c
    );
  }

  void main() {
    // 0 in the middle of the scroll, 1 at both ends.
    float edge = abs(uProgress - 0.5) * 2.0;
    float entering = step(uProgress, 0.5);

    // Rows that are further inside the viewport settle first, with a bit of randomness.
    float row = mix(0.5 - aCenter.y, aCenter.y + 0.5, entering);
    float start = 0.15 + row * 0.35 + aRandom.x * 0.2;
    float scatter = smoothstep(start, start + 0.3, edge);

    // Tiles flip around either their horizontal or their vertical axis.
    vec3 axis = aRandom.z < 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    mat3 rotation = rotateAxis(axis, scatter * 3.14159 * (1.0 + aRandom.y));

    vec3 tile = vec3((position.xy - aCenter) * uSize, 0.0) * (1.0 - scatter * 0.3);
    vec3 center = vec3(aCenter * uSize, 0.0);
    center.y += scatter * (entering * 2.0 - 1.0) * -120.0 * aRandom.z;
    center.z += scatter * mix(-600.0, 120.0, aRandom.y);

    vec3 pos = center + rotation * tile;

    vUv = uv;
    vLight = (rotation * vec3(0.0, 0.0, 1.0)).z;
    vScatter = scatter;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec2 uSize;
  uniform vec2 uImageSize;

  varying vec2 vUv;
  varying float vLight;
  varying float vScatter;

  void main() {
    // Same as background-size: cover
    vec2 ratio = vec2(
      min((uSize.x / uSize.y) / (uImageSize.x / uImageSize.y), 1.0),
      min((uSize.y / uSize.x) / (uImageSize.y / uImageSize.x), 1.0)
    );
    vec3 color = texture2D(uTexture, (vUv - 0.5) * ratio + 0.5).rgb;

    float light = gl_FrontFacing ? max(vLight, 0.0) : max(-vLight, 0.0) * 0.5;
    color *= mix(0.25, 1.0, light) * (1.0 - vScatter * 0.4);

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
  const amplitude = Math.min(window.innerWidth * 0.1, freeSpace);

  wraps.forEach((wrap, i) => {
    const angle = i * 0.35;

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
      createTilesGeometry(12, 8),
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        side: THREE.DoubleSide,
        uniforms: {
          uTexture: { value: texture },
          uImageSize: { value: new THREE.Vector2(texture.image.width, texture.image.height) },
          uSize: { value: new THREE.Vector2() },
          uProgress: { value: 0.5 },
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

    // Scattered tiles sink up to 620px behind the screen, and perspective pulls them towards
    // the middle of the viewport, so start (and end) that much earlier.
    const getReach = () => ((viewport.height / 2) * 620) / camera.position.z;

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
