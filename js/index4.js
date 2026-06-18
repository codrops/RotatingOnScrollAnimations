gsap.registerPlugin(ScrollTrigger);

let lenis;
let items = [];
let wraps = [];
const marqueeInner = document.querySelector('.mark > .mark__inner'); // Select the inner element of the marquee

let scrollVelocity = 0;
let blurAmount = 0;
let filterSetters = [];

const preloadImages = (selector = 'img') => {
  return new Promise((resolve) => {
    imagesLoaded(document.querySelectorAll(selector), { background: true }, resolve);
  });
};

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
    // Velocity based:
    const velocityNorm = Math.min(scrollVelocity / 40, 1);
    const targetBlur = velocityNorm * 15;
    blurAmount = gsap.utils.interpolate(blurAmount, targetBlur, 0.45);
    const saturation = 1 - velocityNorm;
    const filter = `blur(${blurAmount}px) saturate(${saturation})`;
    filterSetters.forEach((setFilter) => setFilter(filter));
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
  filterSetters = items.map((item) => gsap.quickSetter(item, 'filter'));
}

// --------------------------------
// Gallery Layout
// --------------------------------

function positionGalleryItems() {
  const amplitude = window.innerWidth * 0.2;

  wraps.forEach((wrap, i) => {
    gsap.set(wrap, {
      x: Math.sin(i) * amplitude,
    });
  });
}

// --------------------------------
// Gallery Animation
// --------------------------------

function initGalleryAnimation() {
  items.forEach((item) => {
    const rotationX = gsap.utils.random(-10, 10);
    const rotationY = gsap.utils.random(200, 290);
    const rotationZ = gsap.utils.random(-10, 10);
    const setTransform = gsap.quickSetter(item, 'css');

    ScrollTrigger.create({
      trigger: item,
      start: 'top bottom+=20%',
      end: 'bottom top-=20%',
      scrub: true,

      onUpdate(self) {
        const p = self.progress;
        const z = Math.sin(p * Math.PI) * -150;

        setTransform({
          rotationX: gsap.utils.interpolate(rotationX, -rotationX, p),
          rotationY: gsap.utils.interpolate(rotationY, -rotationY, p),
          rotationZ: gsap.utils.interpolate(rotationZ, -rotationZ, p),
          z,
        });
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
    ScrollTrigger.refresh();
  });
}

// ------------------------------------------------------------
// INITIALIZATION
// ------------------------------------------------------------

function init() {
  initSmoothScrolling();
  createGalleryWrappers();
  positionGalleryItems();
  initGalleryAnimation();
  animateMarquee();
  initEvents();
}

document.addEventListener('DOMContentLoaded', async () => {
  await preloadImages('.gallery__item');
  document.body.classList.remove('loading');
  init();
});
