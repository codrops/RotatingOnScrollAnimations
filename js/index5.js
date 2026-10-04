gsap.registerPlugin(ScrollTrigger);

let lenis;
let items = [];
let wraps = [];
const marqueeInner = document.querySelector('.mark > .mark__inner'); // Select the inner element of the marquee
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const preloadImages = (selector) => {
  return Promise.all(
    gsap.utils.toArray(selector).map((item) => {
      const image = new Image();
      image.src = item.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)[1];
      return image.decode().catch(() => {}); // A broken image never blocks the page
    })
  );
};

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
  const amplitude = Math.min(window.innerWidth * 0.05, freeSpace);

  wraps.forEach((wrap, i) => {
    const angle = i * 0.9;

    gsap.set(wrap, {
      x: Math.sin(angle) * amplitude,
    });
  });
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
  items.forEach((item) => {
    const rotationX = gsap.utils.random(130, 220);
    const rotationZ = -50;

    const setTransform = gsap.quickSetter(item, 'css');
    const setFilter = gsap.quickSetter(item, 'filter');

    ScrollTrigger.create({
      trigger: item,
      start: 'top bottom+=20%',
      end: 'bottom top-=20%',
      scrub: true,

      onUpdate(self) {
        const t = holdAtMiddle(self.progress, 0.25);

        const rX = gsap.utils.interpolate(-rotationX, rotationX, t);
        const rZ = gsap.utils.interpolate(-rotationZ, rotationZ, t);
        const z = Math.sin(t * Math.PI) * -750;
        const blur = Math.pow(Math.cos(t * Math.PI), 2) * 12;
        const scaleX = 1 + Math.pow(Math.cos(t * Math.PI), 2) * 0.6;
        const scaleY = 0.5 + Math.pow(Math.sin(t * Math.PI), 2) * 0.5;
        const brightness = Math.pow(Math.sin(t * Math.PI), 6);

        setTransform({
          scaleX,
          scaleY,
          rotationX: rX,
          rotationZ: rZ,
          z,
        });

        setFilter(`blur(${blur}px) brightness(${brightness})`);
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
  window.addEventListener('resize', positionGalleryItems);
}

// ------------------------------------------------------------
// INITIALIZATION
// ------------------------------------------------------------

function init() {
  createGalleryWrappers();
  positionGalleryItems();
  animateMarquee();
  initEvents();

  // Keep native scrolling and flat images when reduced motion is preferred.
  if (reduceMotion) return;

  initSmoothScrolling();
  initGalleryAnimation();
}

document.addEventListener('DOMContentLoaded', async () => {
  await preloadImages('.gallery__item');
  document.body.classList.remove('loading');
  init();
});
