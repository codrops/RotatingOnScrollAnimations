gsap.registerPlugin(ScrollTrigger);

let lenis;
let items = [];
let wraps = [];
const marqueeInner = document.querySelector('.mark > .mark__inner'); // Select the inner element of the marquee

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
  const amplitude = window.innerWidth * 0.05;

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
      invalidateOnRefresh: true,

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
// Events
// --------------------------------

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
