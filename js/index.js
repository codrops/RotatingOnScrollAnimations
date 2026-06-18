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
  // Maximum horizontal displacement.
  const amplitude = window.innerWidth * 0.2;

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
