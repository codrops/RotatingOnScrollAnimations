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
  uniform float uRoll;
  uniform float uAngle;
  uniform float uRadius;

  varying vec2 vUv;
  varying float vLight;

  void main() {
    vec3 pos = position * vec3(uSize, 1.0);
    vec3 facing = vec3(0.0, 0.0, 1.0);

    // The paper rolls downwards while entering and upwards while leaving.
    vec2 dir = vec2(sin(uAngle), -cos(uAngle)) * sign(uRoll);
    float extent = dot(abs(dir), uSize * 0.5);
    float edge = mix(extent, -extent, abs(uRoll));
    float dist = dot(pos.xy, dir) - edge;

    if (dist > 0.0) {
      float angle = dist / uRadius;
      // Each turn gets a little tighter, so the layers never overlap.
      float radius = uRadius - angle * 1.5;

      pos.xy += dir * (sin(angle) * radius - dist);
      pos.z = uRadius - cos(angle) * radius;
      facing = vec3(-dir * sin(angle), cos(angle));
    }

    vUv = uv;
    vLight = facing.z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec2 uSize;
  uniform vec2 uImageSize;

  varying vec2 vUv;
  varying float vLight;

  void main() {
    // Same as background-size: cover
    vec2 ratio = vec2(
      min((uSize.x / uSize.y) / (uImageSize.x / uImageSize.y), 1.0),
      min((uSize.y / uSize.x) / (uImageSize.y / uImageSize.x), 1.0)
    );
    vec3 color = texture2D(uTexture, (vUv - 0.5) * ratio + 0.5).rgb;

    if (gl_FrontFacing) {
      color *= mix(0.3, 1.0, max(vLight, 0.0));
    } else {
      float gray = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(color, vec3(gray), 0.4) * mix(0.25, 0.6, max(-vLight, 0.0));
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
    const angle = i * 0.6;

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

  const geometry = new THREE.PlaneGeometry(1, 1, 64, 64);

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
          uRoll: { value: 0 },
          uAngle: { value: gsap.utils.random(-0.35, 0.35) },
          uRadius: { value: 50 },
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

    // A tilted roll reaches past the image edge, so start (and end) as soon as it's in view.
    const getReach = () =>
      (items[i].offsetWidth / 2) * Math.sin(2 * Math.abs(uniforms.uAngle.value)) + uniforms.uRadius.value;

    ScrollTrigger.create({
      trigger: items[i],
      start: () => `top bottom+=${getReach()}`,
      end: () => `bottom top-=${getReach()}`,
      scrub: true,

      onUpdate(self) {
        needsRender = true;
        const t = holdAtMiddle(self.progress, 0.1);

        uniforms.uRoll.value = Math.cos(t * Math.PI);
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
