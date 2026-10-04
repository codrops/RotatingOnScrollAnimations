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
  // Maximum horizontal displacement, capped so items stay on screen.
  const freeSpace = (window.innerWidth - wraps[0].offsetWidth) / 2;
  const amplitude = Math.min(window.innerWidth * 0.2, freeSpace);

  wraps.forEach((wrap, i) => {
    const angle = i * 0.45;

    // Offset each item using a sine wave.
    // The result is a flowing left/right distribution.
    gsap.set(wrap, {
      x: Math.sin(angle) * amplitude,
    });
  });
}

// --------------------------------
// Gallery Animation
// --------------------------------

function initGalleryAnimation() {
  items.forEach((item) => {
    // Give each item a unique starting orientation.
    const rotationX = gsap.utils.random(70, 120);
    const rotationY = gsap.utils.random(-20, 20);
    const rotationZ = gsap.utils.random(-20, 20);
    const setZ = gsap.quickSetter(item, 'z', 'px');

    gsap.fromTo(
      item,
      {
        rotationX,
        rotationY,
        rotationZ,
      },
      {
        rotationX: -rotationX,
        rotationY: -rotationY,
        rotationZ: -rotationZ,
        ease: 'none',
        scrollTrigger: {
          trigger: item,
          start: 'top bottom+=20%',
          end: 'bottom top-=20%',
          scrub: true,
          invalidateOnRefresh: true,
          onUpdate(self) {
            const progress = self.progress;
            const z = Math.sin(progress * Math.PI) * -50;
            setZ(z);
          },
        },
      }
    );
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
