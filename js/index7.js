import * as THREE from './three.module.min.js';

gsap.registerPlugin(ScrollTrigger);

let lenis;
let items = [];
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
const drumUniforms = {
  uCurve: { value: 0 },
  uDepth: { value: 0 },
  uLiquid: { value: 0 },
  uTime: { value: 0 },
  uFog: { value: new THREE.Color() },
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
  uniform float uOffset;
  uniform float uCurve;
  uniform float uDepth;
  uniform float uLiquid;
  uniform float uTime;

  varying vec2 vUv;
  varying float vAngle;

  void main() {
    vec3 pos = position * vec3(uSize, 1.0);

    // Liquid: the image sways and ripples while scrolling.
    pos.x += sin(uv.y * 6.0 - uTime * 3.0) * uLiquid * 20.0;
    float ripple = sin(uv.y * 14.0 + uv.x * 4.0 - uTime * 5.0) * uLiquid * 30.0;

    // Bend the image around the inside of a horizontal drum.
    float angle = (uOffset + pos.y) * uCurve;
    pos.y = sin(angle) / uCurve;
    pos.z = (1.0 - cos(angle)) / uCurve - uDepth;
    pos += vec3(0.0, -sin(angle), cos(angle)) * ripple;

    vUv = uv;
    vAngle = angle;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec2 uSize;
  uniform vec2 uImageSize;
  uniform float uLiquid;
  uniform float uTime;
  uniform vec3 uFog;

  varying vec2 vUv;
  varying float vAngle;

  void main() {
    // Nothing is drawn past the floor or the ceiling of the drum.
    if (abs(vAngle) > 1.5708) discard;

    // Same as background-size: cover
    vec2 ratio = vec2(
      min((uSize.x / uSize.y) / (uImageSize.x / uImageSize.y), 1.0),
      min((uSize.y / uSize.x) / (uImageSize.y / uImageSize.x), 1.0)
    );
    vec2 uv = (vUv - 0.5) * ratio + 0.5;

    // Liquid: a wavy refraction, with the colours pulled slightly apart.
    uv.x += sin(uv.y * 24.0 - uTime * 4.0) * 0.006 * uLiquid;
    vec2 shift = vec2(0.0, 0.012 * uLiquid);
    vec3 color = vec3(
      texture2D(uTexture, uv + shift).r,
      texture2D(uTexture, uv).g,
      texture2D(uTexture, uv - shift).b
    );

    // Images lose their colour and fade into the background as they turn away.
    float light = pow(cos(vAngle), 2.5);
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(gray), color, light);
    color = mix(uFog, color, 0.15 + light * 0.85);

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

  // Fade towards the page background (kept as is, like the image colours).
  const background = getComputedStyle(document.body).getPropertyValue('--color-bg').trim();
  drumUniforms.uFog.value.setStyle(background, THREE.LinearSRGBColorSpace);

  const geometry = new THREE.PlaneGeometry(1, 1, 32, 64);

  planes = textures.map((texture) => {
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const plane = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          ...drumUniforms,
          uTexture: { value: texture },
          uImageSize: { value: new THREE.Vector2(texture.image.width, texture.image.height) },
          uSize: { value: new THREE.Vector2() },
          uOffset: { value: 0 },
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

  // The floor and the ceiling of the drum line up with the viewport edges. With reduced motion it's flattened out.
  const radius = viewport.height / 2;
  drumUniforms.uCurve.value = reduceMotion ? 0.000001 : 1 / radius;
  drumUniforms.uDepth.value = reduceMotion ? 0 : radius;
}

function render() {
  // Only draw when something has changed, so a still page costs nothing. The liquid keeps drawing until it has settled.
  const top = items[0].getBoundingClientRect().top;
  const settling = scrollVelocity > 0 || drumUniforms.uLiquid.value > 0.001;
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
  // The liquid follows the scroll speed and slowly settles once scrolling stops.
  const ease = 1 - Math.pow(1 - 0.08, gsap.ticker.deltaRatio());
  const liquid = Math.min(scrollVelocity / 30, 1);
  drumUniforms.uLiquid.value = gsap.utils.interpolate(drumUniforms.uLiquid.value, liquid, ease);
  drumUniforms.uTime.value = gsap.ticker.time;

  planes.forEach((plane, i) => {
    const rect = items[i].getBoundingClientRect();
    const { uniforms } = plane.material;

    // How far the image is from the middle of the viewport, which becomes its place on the drum.
    uniforms.uOffset.value = viewport.height / 2 - rect.top - rect.height / 2;
    uniforms.uSize.value.set(rect.width, rect.height);
    plane.position.x = rect.left + rect.width / 2 - viewport.width / 2;
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
  window.addEventListener('resize', resizeWebGL);
}

// ------------------------------------------------------------
// INITIALIZATION
// ------------------------------------------------------------

function init() {
  createGalleryWrappers();
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
