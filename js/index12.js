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
const swellUniforms = {
  uViewport: { value: new THREE.Vector2() },
  uHeight: { value: 0 },
  uRough: { value: 0 },
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
  uniform vec2 uViewport;
  uniform float uHeight;
  uniform float uRough;

  varying vec2 vUv;
  varying vec3 vFacing;

  // Slow waves that stay in place on the screen: 0 on a crest, down to -uHeight in a trough.
  // Calm in the middle of the viewport, rougher towards its edges.
  float swell(vec2 point) {
    float wave = sin(point.y * 0.006 + point.x * 0.002) * 0.6 + sin(point.y * 0.011 - point.x * 0.004 + 1.3) * 0.4;
    float edge = smoothstep(0.25, 1.0, abs(point.y) / (uViewport.y * 0.5));

    return (wave - 1.0) * 0.5 * edge * (1.0 + uRough) * uHeight;
  }

  void main() {
    vec3 pos = position * vec3(uSize, 1.0);

    // The images ride over the waves as they scroll through, tilting over every crest.
    vec2 point = (modelMatrix * vec4(pos, 1.0)).xy;
    pos.z = swell(point);

    vec2 slope = vec2(
      swell(point + vec2(2.0, 0.0)) - swell(point - vec2(2.0, 0.0)),
      swell(point + vec2(0.0, 2.0)) - swell(point - vec2(0.0, 2.0))
    ) / 4.0;

    vUv = uv;
    vFacing = normalize(vec3(-slope, 1.0));
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

    // Slopes facing the light get brighter, the others darker. Flat, the image is left as it is.
    vec3 light = normalize(vec3(-0.3, 0.6, 1.0));
    color *= 1.0 + (dot(normalize(vFacing), light) - light.z) * 0.8;

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
  const amplitude = Math.min(window.innerWidth * 0.2, freeSpace);

  wraps.forEach((wrap, i) => {
    const angle = i * 0.9;

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

  const geometry = new THREE.PlaneGeometry(1, 1, 32, 48);

  planes = textures.map((texture) => {
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const plane = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          ...swellUniforms,
          uTexture: { value: texture },
          uImageSize: { value: new THREE.Vector2(texture.image.width, texture.image.height) },
          uSize: { value: new THREE.Vector2() },
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

  // With reduced motion the sea is flat.
  swellUniforms.uViewport.value.set(viewport.width, viewport.height);
  swellUniforms.uHeight.value = reduceMotion ? 0 : 280;
}

function render() {
  // Only draw when something has changed, so a still page costs nothing. The swell keeps drawing until it has settled.
  const top = items[0].getBoundingClientRect().top;
  const settling = scrollVelocity > 0 || swellUniforms.uRough.value > 0.001;
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
  // The waves grow with the scroll speed and slowly calm down once scrolling stops.
  const ease = 1 - Math.pow(1 - 0.05, gsap.ticker.deltaRatio());
  const rough = Math.min(scrollVelocity / 40, 1) * 0.6;
  swellUniforms.uRough.value = gsap.utils.interpolate(swellUniforms.uRough.value, rough, ease);

  // Keep every plane on top of its (hidden) gallery item.
  planes.forEach((plane, i) => {
    const rect = items[i].getBoundingClientRect();

    plane.position.x = rect.left + rect.width / 2 - viewport.width / 2;
    plane.position.y = viewport.height / 2 - rect.top - rect.height / 2;
    plane.material.uniforms.uSize.value.set(rect.width, rect.height);
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
