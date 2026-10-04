gsap.registerPlugin(ScrollTrigger);

let lenis;
let items = [];
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

// ------------------------------------------------------------
// INITIALIZATION
// ------------------------------------------------------------

function init() {
  createGalleryWrappers();
  animateMarquee();

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
