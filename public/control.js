// Initialize Socket.io client (supports loading via file:// in OBS)
const socket = io(window.location.protocol === 'file:' ? 'http://localhost:3000' : undefined);

// DOM Elements
const gameToggleBtn = document.getElementById('gameToggleBtn');
const currentGameText = document.getElementById('currentGameText');
const gameDropdownMenu = document.getElementById('gameDropdownMenu');
const resetQueueBtn = document.getElementById('resetQueueBtn');
const adminQueueList = document.getElementById('adminQueueList');
const nextStepBtn = document.getElementById('nextStepBtn');
const limitInput = document.getElementById('limitInput');
const resetLimitBtn = document.getElementById('resetLimitBtn');

// Widget Preview Elements
const widgetPlayingName = document.getElementById('widgetPlayingName');
const widgetPlaying = document.getElementById('widgetPlaying');
const widgetQueueNames = document.getElementById('widgetQueueNames');
const widgetCapsule = document.getElementById('widgetCapsule');

// List Widget Preview Elements
const previewListBox = document.getElementById('previewListBox');
const previewListTitle = document.getElementById('previewListTitle');
const previewListRows = document.getElementById('previewListRows');
const listOpacitySlider = document.getElementById('listOpacitySlider');

// Confirmation Modal Elements
const resetModal = document.getElementById('resetModal');
const confirmResetBtn = document.getElementById('confirmResetBtn');
const cancelResetBtn = document.getElementById('cancelResetBtn');

// Game dropdown toggle handler
gameToggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  gameDropdownMenu.classList.toggle('show');
});

// Close dropdown on click outside
document.addEventListener('click', () => {
  gameDropdownMenu.classList.remove('show');
});

// Select game from dropdown
gameDropdownMenu.addEventListener('click', (e) => {
  if (e.target.classList.contains('game-dropdown-item')) {
    const selectedGame = e.target.getAttribute('data-game');
    socket.emit('admin_change_game', selectedGame);
    gameDropdownMenu.classList.remove('show');
  }
});

// Reset Queue Modal Show
resetQueueBtn.addEventListener('click', () => {
  resetModal.classList.add('show');
});

// Modal Confirm
confirmResetBtn.addEventListener('click', () => {
  socket.emit('admin_reset');
  resetModal.classList.remove('show');
});

// Modal Cancel
cancelResetBtn.addEventListener('click', () => {
  resetModal.classList.remove('show');
});

// Next queue step button
nextStepBtn.addEventListener('click', () => {
  socket.emit('admin_next');
});

// Limit input handlers
if (limitInput) {
  limitInput.addEventListener('input', () => {
    const val = parseInt(limitInput.value, 10);
    if (!isNaN(val) && val >= 0) {
      socket.emit('admin_change_limit', val);
    } else if (limitInput.value === '') {
      socket.emit('admin_change_limit', 0);
    }
  });
}

if (resetLimitBtn) {
  resetLimitBtn.addEventListener('click', () => {
    socket.emit('admin_change_limit', 0);
    if (limitInput) {
      limitInput.value = 0;
    }
  });
}

// List widget opacity slider
if (listOpacitySlider) {
  listOpacitySlider.addEventListener('input', () => {
    socket.emit('admin_change_list_opacity', listOpacitySlider.value / 100);
  });
}

// Copy widget URL buttons
document.querySelectorAll('.btn-copy-url').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const url = (window.location.protocol === 'file:' ? 'http://localhost:3000' : window.location.origin) + btn.dataset.url;
    try {
      await navigator.clipboard.writeText(url);
    } catch (err) {
      // Fallback for older browsers / non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    const originalText = btn.textContent;
    btn.textContent = 'คัดลอกแล้ว ✓';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove('copied');
    }, 1500);
  });
});

// Listen for state updates from the server
socket.on('state_update', ({ queue, activeGame, isPlayingActive, currentPlayingIndex, queueLimit, listOpacity }) => {
  // 1. Update Game Display
  currentGameText.textContent = activeGame;

  // Update Limit Input (if not active typing)
  if (limitInput && document.activeElement !== limitInput) {
    limitInput.value = queueLimit !== undefined ? queueLimit : 0;
  }

  // 2. Render Admin Queue List
  adminQueueList.innerHTML = '';
  if (queue.length === 0) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'queue-item color-normal';
    emptyLi.style.justifyContent = 'center';
    emptyLi.style.fontSize = '1.3rem';
    emptyLi.style.opacity = '0.6';
    emptyLi.textContent = 'ไม่มีคิวในขณะนี้';
    adminQueueList.appendChild(emptyLi);
  } else {
    queue.forEach((item, index) => {
      const displayIndex = index + 1;
      const li = document.createElement('li');
      li.className = 'queue-item pop-anim';
      li.style.animationDelay = `${index * 0.03}s`;

      // Determine text color class based on queue index and currentPlayingIndex
      let colorClass = 'color-normal';
      const isPlayed = index < currentPlayingIndex || (index === currentPlayingIndex && !isPlayingActive);
      
      if (isPlayed) {
        colorClass = 'color-played'; // Faded gray for previously played
      } else if (index === currentPlayingIndex && isPlayingActive) {
        colorClass = 'color-playing'; // Neon green for active player
      } else {
        const pendingPosition = index - currentPlayingIndex;
        if (pendingPosition >= 4) {
          colorClass = 'color-warn'; // Yellow for 4th pending and beyond
        }
      }

      // Container for Index & Name
      const infoDiv = document.createElement('div');
      infoDiv.className = `queue-info ${colorClass}`;
      
      const textSpan = document.createElement('span');
      textSpan.textContent = `${displayIndex} : ${item.name}`;
      infoDiv.appendChild(textSpan);

      // Time display
      const timeSpan = document.createElement('span');
      timeSpan.className = `queue-time ${colorClass}`;
      timeSpan.textContent = item.time;

      li.appendChild(infoDiv);
      li.appendChild(timeSpan);

      // Admin delete button (allows admin to remove any queue entry)
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-delete-queue';
      deleteBtn.innerHTML = '×';
      deleteBtn.title = `ลบคิวของ ${item.name}`;
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        socket.emit('admin_delete_queue', { id: item.id });
      });
      li.appendChild(deleteBtn);

      adminQueueList.appendChild(li);
    });
  }

  // 2.5 Update List Widget Preview
  previewListTitle.textContent = activeGame;
  renderListWidgetRows(previewListRows, { queue, isPlayingActive, currentPlayingIndex });
  if (typeof listOpacity === 'number') {
    previewListBox.style.backgroundColor = `rgba(0, 0, 0, ${listOpacity})`;
    if (listOpacitySlider && document.activeElement !== listOpacitySlider) {
      listOpacitySlider.value = Math.round(listOpacity * 100);
    }
  }

  // 3. Update Widget Preview
  const oldPlaying = widgetPlayingName.textContent;
  const oldQueue = widgetQueueNames.textContent;
  
  let newPlaying = '-';
  let newQueue = '-';

  if (isPlayingActive && currentPlayingIndex >= 0 && currentPlayingIndex < queue.length) {
    // Current playing user
    const activePlayer = queue[currentPlayingIndex];
    newPlaying = activePlayer.name;

    // Dynamic sizing based on active name length
    const nameLength = activePlayer.name.length;
    if (nameLength > 15) {
      widgetPlaying.style.fontSize = '1.3rem';
    } else if (nameLength > 8) {
      widgetPlaying.style.fontSize = '1.7rem';
    } else {
      widgetPlaying.style.fontSize = '2.3rem';
    }

    // Remaining people are in the next queue list
    const nextQueueItems = queue.slice(currentPlayingIndex + 1);
    if (nextQueueItems.length > 0) {
      newQueue = nextQueueItems.map(item => item.name).join(' - ');
    }
  } else {
    // No active playing session
    newPlaying = '-';
    widgetPlaying.style.fontSize = '2.3rem';
    
    // Remaining unplayed users are listed in queue preview
    const pendingQueueItems = queue.slice(currentPlayingIndex + 1);
    if (pendingQueueItems.length > 0) {
      newQueue = pendingQueueItems.map(item => item.name).join(' - ');
    }
  }

  // Update text content
  widgetPlayingName.textContent = newPlaying;
  widgetQueueNames.textContent = newQueue;

  // Trigger CSS update animation if values changed
  if (oldPlaying !== newPlaying || oldQueue !== newQueue) {
    // 1. Capsule update pop animation
    widgetCapsule.classList.remove('animate-capsule-update');
    void widgetCapsule.offsetWidth; // Trigger reflow to restart
    widgetCapsule.classList.add('animate-capsule-update');

    // 2. Active player text slide animation
    if (oldPlaying !== newPlaying) {
      widgetPlayingName.classList.remove('animate-text-slide');
      void widgetPlayingName.offsetWidth; // Trigger reflow
      widgetPlayingName.classList.add('animate-text-slide');
    }

    // 3. Queue text slide animation
    if (oldQueue !== newQueue) {
      widgetQueueNames.classList.remove('animate-text-slide');
      void widgetQueueNames.offsetWidth; // Trigger reflow
      widgetQueueNames.classList.add('animate-text-slide');
    }
  }
});
