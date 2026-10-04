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
const viewport = { width: 0, height: 0 };
const marqueeInner = document.querySelector('.mark > .mark__inner'); // Select the inner element of the marquee
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const textureLoader = new THREE.TextureLoader();

// Shared by every image
const towerUniforms = {
  uCurve: { value: 0 },
  uTwist: { value: 0 },
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
  uniform float uTwist;

  varying vec2 vUv;
  varying float vAngle;

  void main() {
    vec3 pos = position * vec3(uSize, 1.0);

    // Wrap the image around a tower. The further it is from the middle of the viewport, the further round it turns.
    float angle = uOffset * uTwist + pos.x * uCurve;
    pos.x = sin(angle) / uCurve;
    pos.z = (cos(angle) - 1.0) / uCurve;

    vUv = uv;
    vAngle = angle;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec2 uSize;
  uniform vec2 uImageSize;

  varying vec2 vUv;
  varying float vAngle;

  void main() {
    // Same as background-size: cover
    vec2 ratio = vec2(
      min((uSize.x / uSize.y) / (uImageSize.x / uImageSize.y), 1.0),
      min((uSize.y / uSize.x) / (uImageSize.y / uImageSize.x), 1.0)
    );
    vec3 color = texture2D(uTexture, (vUv - 0.5) * ratio + 0.5).rgb;

    // Images darken as they turn away. Seen from inside the tower, they're darker still.
    float facing = cos(vAngle);
    float light = gl_FrontFacing ? max(facing, 0.0) : max(-facing, 0.0) * 0.35;
    color *= mix(0.1, 1.0, light);

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

  const geometry = new THREE.PlaneGeometry(1, 1, 64, 1);

  planes = textures.map((texture) => {
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const plane = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        side: THREE.DoubleSide,
        uniforms: {
          ...towerUniforms,
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

  // Half a turn from the middle of the viewport to its edges. With reduced motion the tower is flattened out.
  const radius = items[0].offsetWidth * 0.8;
  towerUniforms.uCurve.value = reduceMotion ? 0.000001 : 1 / radius;
  towerUniforms.uTwist.value = reduceMotion ? 0 : Math.PI / viewport.height;
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

    // How far the image is from the middle of the viewport, which sets how far round the tower it turns.
    uniforms.uOffset.value = viewport.height / 2 - rect.top - rect.height / 2;
    uniforms.uSize.value.set(rect.width, rect.height);
    plane.position.x = rect.left + rect.width / 2 - viewport.width / 2;
    plane.position.y = uniforms.uOffset.value;
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
