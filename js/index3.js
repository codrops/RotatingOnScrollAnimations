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
// Gallery Animation
// --------------------------------

function initGalleryAnimation() {
  items.forEach((item) => {
    const setTransform = gsap.quickSetter(item, 'css');
    const setFilter = gsap.quickSetter(item, 'filter');

    ScrollTrigger.create({
      trigger: item,
      start: 'top bottom+=20%',
      end: 'bottom top-=20%',
      scrub: true,
      invalidateOnRefresh: true,

      onUpdate(self) {
        const progress = self.progress;

        const rotationX =
          Math.sign(Math.cos(progress * Math.PI)) *
          Math.pow(Math.abs(Math.cos(progress * Math.PI)), 0.6) *
          90;
        const z = Math.pow(Math.sin(progress * Math.PI), 8) * -800;
        const yPercent = 1 + Math.pow(Math.cos(progress * Math.PI), 2) * -40;
        const saturate = Math.pow(Math.sin(progress * Math.PI), 3);
        const brightness = Math.pow(Math.sin(progress * Math.PI), 3);

        setTransform({
          rotationX,
          z,
          yPercent,
        });

        setFilter(`saturate(${saturate}) brightness(${brightness})`);
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
    ScrollTrigger.refresh();
  });
}

// ------------------------------------------------------------
// INITIALIZATION
// ------------------------------------------------------------

function init() {
  initSmoothScrolling();
  createGalleryWrappers();
  initGalleryAnimation();
  animateMarquee();
  initEvents();
}

document.addEventListener('DOMContentLoaded', async () => {
  await preloadImages('.gallery__item');
  document.body.classList.remove('loading');
  init();
});
