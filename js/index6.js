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

    // Every item revolves around the same axis, placed behind the screen.
    gsap.set(item, { transformOrigin: `50% 50% ${-item.offsetWidth * 1.1}px` });

    ScrollTrigger.create({
      trigger: item,
      start: 'top bottom+=20%',
      end: 'bottom top-=20%',
      scrub: true,

      onUpdate(self) {
        const rotationY = gsap.utils.interpolate(120, -120, self.progress);
        const facing = Math.cos((rotationY * Math.PI) / 180);
        const brightness = 0.15 + Math.pow(Math.max(facing, 0), 1.5) * 0.85;

        setTransform({ rotationY });
        setFilter(`brightness(${brightness})`);
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
