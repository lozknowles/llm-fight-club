for (const button of document.querySelectorAll('[data-topic]')) {
  button.addEventListener('click', () => { document.querySelector('#premise').value = button.dataset.topic; });
}
// Let the same-origin portfolio frame fit the form and transcript on every screen.
let lastHeight = 0;
new ResizeObserver(() => {
  const height = Math.ceil(document.body.getBoundingClientRect().height) + 32;
  if (height !== lastHeight && parent !== window) {
    lastHeight = height;
    parent.postMessage({ type: 'llm-debate-height', height }, location.origin);
  }
}).observe(document.body);
