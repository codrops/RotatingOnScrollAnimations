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
let scrollVelocity = 0;
const viewport = { width: 0, height: 0 };
const marqueeInner = document.querySelector('.mark > .mark__inner'); // Select the inner element of the marquee
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const textureLoader = new THREE.TextureLoader();

// Shared by every image
const waterUniforms = {
  uStrength: { value: reduceMotion ? 0 : 0.55 },
  uRipple: { value: 0 },
  uTime: { value: 0 },
};

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
  uniform vec2 uCenter;
  uniform float uSwirl;
  uniform float uStrength;
  uniform float uRipple;
  uniform float uTime;

  varying vec2 vUv;
  varying float vDepth;

  mat2 rotate(float angle) {
    return mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
  }

  void main() {
    vec3 pos = position * vec3(uSize, 1.0);
    float strength = uStrength;

    // The whirlpool sits a little off-centre, and its pull fades out softly, so there's no sharp tip.
    vec2 center = uCenter * uSize;
    vec2 local = pos.xy - center;
    float dist = length(local / (uSize * 0.5));
    float pull = exp(-dist * dist * 4.0);

    // The images are always in the whirlpool. Around it they turn faster, then the whole image turns a little and is drawn in.
    pos.xy = center + rotate(uSwirl * pull * 4.0) * local;
    pos.xy = rotate(uSwirl * 0.35) * pos.xy * (1.0 - strength * 0.4);

    // A rounded hollow where it sinks in, with an uneven, softer surface around it.
    pos.z = -pull * strength * 320.0;
    pos.z -= (1.0 + sin(local.x * 0.02 + uSwirl * 2.0) * cos(local.y * 0.017)) * strength * 20.0;

    // Rings run across it while scrolling.
    pos.z += (sin(dist * 18.0 - uTime * 5.0) - 1.0) * uRipple * 8.0 * pull;

    vUv = uv;
    vDepth = pull * strength;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec2 uSize;
  uniform vec2 uImageSize;

  varying vec2 vUv;
  varying float vDepth;

  void main() {
    // Same as background-size: cover
    vec2 ratio = vec2(
      min((uSize.x / uSize.y) / (uImageSize.x / uImageSize.y), 1.0),
      min((uSize.y / uSize.x) / (uImageSize.y / uImageSize.x), 1.0)
    );
    vec3 color = texture2D(uTexture, (vUv - 0.5) * ratio + 0.5).rgb;

    // The deeper into the funnel, the darker.
    color *= 1.0 - vDepth * 0.75;

    gl_FragColor = vec4(color, 1.0);
  }
`;

// --------------------------------
// Smooth Scrolling
// --------------------------------

function initSmoothScrolling() {
  lenis = new Lenis();

  lenis.on('scroll', ({ velocity }) => {
    scrollVelocity = Math.abs(velocity);
    ScrollTrigger.update();
  });

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

  const geometry = new THREE.PlaneGeometry(1, 1, 96, 96);

  planes = textures.map((texture) => {
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const plane = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTexture: { value: texture },
          uImageSize: { value: new THREE.Vector2(texture.image.width, texture.image.height) },
          uSize: { value: new THREE.Vector2() },
          ...waterUniforms,
          uCenter: { value: new THREE.Vector2(gsap.utils.random(-0.15, 0.15), gsap.utils.random(-0.15, 0.15)) },
          uSwirl: { value: 0 },
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
  // Only draw when something has changed, so a still page costs nothing. The ripple keeps drawing until it has settled.
  const top = items[0].getBoundingClientRect().top;
  const settling = scrollVelocity > 0 || waterUniforms.uRipple.value > 0.001;
  if (!needsRender && !settling && top === lastTop) return;
  needsRender = false;
  lastTop = top;

  updateGallery();
  renderer.render(scene, camera);
}

// --------------------------------
// Gallery Animation
// --------------------------------

function updateGallery() {
  // The ripples follow the scroll speed and slowly settle once scrolling stops.
  const ease = 1 - Math.pow(1 - 0.06, gsap.ticker.deltaRatio());
  const ripple = Math.min(scrollVelocity / 30, 1);
  waterUniforms.uRipple.value = gsap.utils.interpolate(waterUniforms.uRipple.value, ripple, ease);
  waterUniforms.uTime.value = gsap.ticker.time;

  planes.forEach((plane, i) => {
    const rect = items[i].getBoundingClientRect();
    const { uniforms } = plane.material;
    const offset = viewport.height / 2 - rect.top - rect.height / 2;
    // Neighbouring whirlpools turn in opposite directions.
    const direction = i % 2 === 0 ? 1 : -1;

    // The swirl follows the image through the viewport: one way below the middle, the other way above.
    uniforms.uSwirl.value = reduceMotion ? 0 : direction * gsap.utils.clamp(-2, 2, offset / (viewport.height / 2));

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
