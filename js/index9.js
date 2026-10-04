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
  uniform float uRotation;
  uniform float uTwist;

  varying vec2 vUv;
  varying vec3 vFacing;

  void main() {
    vec3 pos = position * vec3(uSize, 1.0);

    // Every row turns around the vertical axis, the top rows leading the way.
    float angle = uRotation - uTwist * (uv.y - 0.5);
    float s = sin(angle);
    float c = cos(angle);

    pos = vec3(pos.x * c, pos.y, -pos.x * s);

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

    vec3 normal = normalize(gl_FrontFacing ? vFacing : -vFacing);
    float light = max(normal.z, 0.0);
    // A soft highlight runs along the ribbon as it turns.
    float highlight = pow(max(dot(normal, normalize(vec3(0.6, 0.0, 1.0))), 0.0), 30.0);

    color = color * mix(0.2, 1.0, light) + highlight * 0.15;

    if (!gl_FrontFacing) {
      color *= 0.45;
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

  const geometry = new THREE.PlaneGeometry(1, 1, 1, 128);

  planes = textures.map((texture) => {
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
          uRotation: { value: 0 },
          uTwist: { value: 0 },
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
// Progress helper
// --------------------------------

function holdAtMiddle(progress, hold = 0.2) {
  const half = hold * 0.5;

  if (progress < 0.5 - half) {
    return gsap.utils.mapRange(0, 0.5 - half, 0, 0.5, progress);
  }

  if (progress > 0.5 + half) {
    return gsap.utils.mapRange(0.5 + half, 1, 0.5, 1, progress);
  }

  return 0.5;
}

// --------------------------------
// Gallery Animation
// --------------------------------

function initGalleryAnimation() {
  planes.forEach((plane, i) => {
    const { uniforms } = plane.material;
    // Neighbouring ribbons twist in opposite directions.
    const direction = i % 2 === 0 ? 1 : -1;

    // Rows turning away sink up to half the image width behind the screen, and perspective pulls
    // them towards the middle of the viewport, so start (and end) that much earlier.
    const getReach = () => ((viewport.height / 2) * items[i].offsetWidth * 0.5) / camera.position.z;

    ScrollTrigger.create({
      trigger: items[i],
      start: () => `top bottom+=${getReach()}`,
      end: () => `bottom top-=${getReach()}`,
      scrub: true,

      onUpdate(self) {
        needsRender = true;
        const t = holdAtMiddle(self.progress, 0.1);
        const turn = Math.cos(t * Math.PI);

        uniforms.uRotation.value = direction * Math.sign(turn) * Math.pow(Math.abs(turn), 1.5) * Math.PI;
        uniforms.uTwist.value = direction * Math.abs(turn) * Math.PI;
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
