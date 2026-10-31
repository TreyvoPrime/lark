(() => {
  const gallery = document.getElementById('bird-gallery');
  window.LarkBirds.birds.forEach((bird, index) => {
    const card = document.createElement('article'); card.className = 'bird-card';
    const top = document.createElement('div'); top.className = 'card-top';
    const number = document.createElement('span'); number.textContent = String(index + 1).padStart(2, '0');
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.backgroundColor = bird[2]; top.append(number, dot);
    const portrait = document.createElement('div'); portrait.className = 'portrait'; portrait.append(window.LarkBirds.make(bird[0], 96));
    const title = document.createElement('h3'); title.textContent = bird[1];
    const note = document.createElement('p'); note.textContent = index === 0 ? 'The friendly original bird' : 'Lark Share portrait';
    const sizes = document.createElement('div'); sizes.className = 'sizes'; sizes.setAttribute('aria-label', 'Portrait displayed at 24, 32, 48 and 64 pixels');
    [24,32,48,64].forEach(size => sizes.append(window.LarkBirds.make(bird[0], size)));
    card.append(top, portrait, title, note, sizes); gallery.append(card);
  });
})();
