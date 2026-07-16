// Initialize Socket.io client (supports loading via file:// in OBS)
const socket = io(window.location.protocol === 'file:' ? 'http://localhost:3000' : undefined);

// DOM Elements
const obsListBox = document.getElementById('obsListBox');
const obsListTitle = document.getElementById('obsListTitle');
const obsListRows = document.getElementById('obsListRows');

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
