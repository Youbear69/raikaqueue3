// Shared renderer for the list-style widget (used by control.js preview and widget-list.js)
function renderListWidgetRows(ulElement, { queue, isPlayingActive, currentPlayingIndex }) {
  ulElement.innerHTML = '';

  // Show current playing person (if active) and everyone after them
  const startIndex = isPlayingActive && currentPlayingIndex >= 0
    ? currentPlayingIndex
    : currentPlayingIndex + 1;
  const visible = queue.slice(Math.max(0, startIndex));

  if (visible.length === 0) {
    const li = document.createElement('li');
    li.className = 'lw-row lw-empty';
    li.textContent = '- ไม่มีคิว -';
    ulElement.appendChild(li);
    return;
  }

  visible.forEach((item, i) => {
    const queueIndex = Math.max(0, startIndex) + i;
    const li = document.createElement('li');
    li.className = 'lw-row';
    if (isPlayingActive && queueIndex === currentPlayingIndex) {
      li.classList.add('color-playing');
    }

    const nameSpan = document.createElement('span');
    nameSpan.className = 'lw-name';
    nameSpan.textContent = `${queueIndex + 1}) ${item.name}`;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'lw-time';
    timeSpan.textContent = item.time;

    li.appendChild(nameSpan);
    li.appendChild(timeSpan);
    ulElement.appendChild(li);
  });
}
