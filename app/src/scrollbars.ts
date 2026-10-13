// Barra de rolagem que só aparece enquanto se rola (o fade é CSS, em `[data-scrolling]`).
const timers = new WeakMap<Element, number>()
window.addEventListener('scroll', (e) => {
  const el = e.target instanceof Element ? e.target : document.documentElement
  el.setAttribute('data-scrolling', '')
  clearTimeout(timers.get(el))
  timers.set(el, window.setTimeout(() => el.removeAttribute('data-scrolling'), 800))
}, { capture: true, passive: true })
