// Initialize Socket.io client (supports loading via file:// in OBS)
const socket = io(window.location.protocol === 'file:' ? 'http://localhost:3000' : undefined);

// DOM Elements
const obsWidgetPlayingName = document.getElementById('obsWidgetPlayingName');
const obsWidgetPlaying = document.getElementById('obsWidgetPlaying');
const obsWidgetQueueNames = document.getElementById('obsWidgetQueueNames');
const obsWidgetCapsule = document.getElementById('obsWidgetCapsule');

// Sound indicator or animation helper can go here

socket.on('state_update', ({ queue, activeGame, isPlayingActive, currentPlayingIndex }) => {
  // Save current values for comparison to trigger animation on change
  const oldPlaying = obsWidgetPlayingName.textContent;
  const oldQueue = obsWidgetQueueNames.textContent;

  let newPlaying = '-';
  let newQueue = '-';

  if (isPlayingActive && currentPlayingIndex >= 0 && currentPlayingIndex < queue.length) {
    // Current playing user
    newPlaying = queue[currentPlayingIndex].name;

    // Dynamic sizing based on active name length
    const nameLength = newPlaying.length;
    if (nameLength > 15) {
      obsWidgetPlaying.style.fontSize = '1.3rem';
    } else if (nameLength > 8) {
      obsWidgetPlaying.style.fontSize = '1.7rem';
    } else {
      obsWidgetPlaying.style.fontSize = '2.3rem';
    }

    // Remaining unplayed people are in the next queue
    const nextQueueItems = queue.slice(currentPlayingIndex + 1);
    if (nextQueueItems.length > 0) {
      newQueue = nextQueueItems.map(item => item.name).join(' - ');
    }
  } else {
    // No active playing session
    newPlaying = '-';
    obsWidgetPlaying.style.fontSize = '2.3rem';
    
    // Show remaining unplayed people in the queue
    const pendingQueueItems = queue.slice(currentPlayingIndex + 1);
    if (pendingQueueItems.length > 0) {
      newQueue = pendingQueueItems.map(item => item.name).join(' - ');
    }
  }

  // Update DOM
  obsWidgetPlayingName.textContent = newPlaying;
  obsWidgetQueueNames.textContent = newQueue;

  // Trigger CSS update animation if values changed
  if (oldPlaying !== newPlaying || oldQueue !== newQueue) {
    // 1. Capsule pulse animation
    obsWidgetCapsule.classList.remove('animate-capsule-update');
    void obsWidgetCapsule.offsetWidth; // Trigger reflow to restart
    obsWidgetCapsule.classList.add('animate-capsule-update');

    // 2. Text slide animations
    if (oldPlaying !== newPlaying) {
      obsWidgetPlayingName.classList.remove('animate-text-slide');
      void obsWidgetPlayingName.offsetWidth; // Trigger reflow
      obsWidgetPlayingName.classList.add('animate-text-slide');
    }

    if (oldQueue !== newQueue) {
      obsWidgetQueueNames.classList.remove('animate-text-slide');
      void obsWidgetQueueNames.offsetWidth; // Trigger reflow
      obsWidgetQueueNames.classList.add('animate-text-slide');
    }
  }
});
