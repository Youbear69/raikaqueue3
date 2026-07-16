// Initialize Socket.io client (supports loading via file:// in OBS)
const socket = io(window.location.protocol === 'file:' ? 'http://localhost:3000' : undefined);

// DOM Elements
const obsListBox = document.getElementById('obsListBox');
const obsListTitle = document.getElementById('obsListTitle');
const obsListRows = document.getElementById('obsListRows');

// Position via URL params: /widget-list?x=1300&y=80 (pixels from top-left).
// Lets the browser source stay full-canvas in OBS so a Composite Blur
// "Source Mask" pointed at this source follows the widget automatically.
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('x') || urlParams.has('y')) {
  document.body.style.justifyContent = 'flex-start';
  document.body.style.alignItems = 'flex-start';
  obsListBox.style.position = 'absolute';
  obsListBox.style.left = (parseInt(urlParams.get('x'), 10) || 0) + 'px';
  obsListBox.style.top = (parseInt(urlParams.get('y'), 10) || 0) + 'px';
}
if (urlParams.has('w')) {
  obsListBox.style.maxWidth = (parseInt(urlParams.get('w'), 10) || 580) + 'px';
}

socket.on('state_update', (state) => {
  const oldContent = obsListTitle.textContent + obsListRows.innerHTML;

  obsListTitle.textContent = state.activeGame;
  renderListWidgetRows(obsListRows, state);
  if (typeof state.listOpacity === 'number') {
    obsListBox.style.backgroundColor = `rgba(0, 0, 0, ${state.listOpacity})`;
  }

  // Pulse animation when content changes
  if (oldContent !== obsListTitle.textContent + obsListRows.innerHTML) {
    obsListBox.classList.remove('animate-capsule-update');
    void obsListBox.offsetWidth; // Trigger reflow to restart
    obsListBox.classList.add('animate-capsule-update');
  }
});
