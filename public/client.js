// Initialize Socket.io client (supports loading via file:// in OBS)
const socket = io(window.location.protocol === 'file:' ? 'http://localhost:3000' : undefined);

// Get or generate a persistent Client ID for queue ownership
let clientId = localStorage.getItem('raika_client_id');
if (!clientId) {
  clientId = 'client_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  localStorage.setItem('raika_client_id', clientId);
}

// Get or initialize list of registered queue IDs belonging to this user
let myQueueIds = [];
try {
  const savedQueues = localStorage.getItem('raika_my_queues');
  if (savedQueues) {
    myQueueIds = JSON.parse(savedQueues);
  }
} catch (e) {
  myQueueIds = [];
}

// Helper: Save my queue IDs to localStorage
function saveMyQueues() {
  localStorage.setItem('raika_my_queues', JSON.stringify(myQueueIds));
}

// DOM Elements
const activeGameBadge = document.getElementById('activeGameBadge');
const registrationForm = document.getElementById('registrationForm');
const usernameInput = document.getElementById('usernameInput');
const queueList = document.getElementById('queueList');

// Listen for successful registration
socket.on('registration_success', (itemId) => {
  if (!myQueueIds.includes(itemId)) {
    myQueueIds.push(itemId);
    saveMyQueues();
  }
});

// Listen for registration error from server
socket.on('registration_error', (message) => {
  alert(message);
});

// Listen for real-time state updates from the server
socket.on('state_update', ({ queue, activeGame, isPlayingActive, currentPlayingIndex, queueLimit }) => {
  // Update Game Badge
  if (activeGameBadge) {
    activeGameBadge.textContent = activeGame;
  }

  // Update Input field status based on limit
  if (usernameInput) {
    if (queueLimit > 0) {
      const currentCount = queue.length;
      if (currentCount >= queueLimit) {
        usernameInput.disabled = true;
        usernameInput.placeholder = `คิวเต็มแล้ว (${currentCount}/${queueLimit})`;
        usernameInput.value = '';
      } else {
        usernameInput.disabled = false;
        usernameInput.placeholder = `ชื่อในเกม (จำกัด ${queueLimit} คิว - ขณะนี้ ${currentCount}/${queueLimit})`;
      }
    } else {
      usernameInput.disabled = false;
      usernameInput.placeholder = 'ชื่อในเกม';
    }
  }

  // Update Queue List
  if (queueList) {
    queueList.innerHTML = '';

    if (queue.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'queue-item color-normal';
      emptyItem.style.justifyContent = 'center';
      emptyItem.style.fontSize = '1.3rem';
      emptyItem.style.opacity = '0.6';
      emptyItem.textContent = 'ยังไม่มีคิวในขณะนี้';
      queueList.appendChild(emptyItem);
      return;
    }

    queue.forEach((item, index) => {
      const displayIndex = index + 1;
      const li = document.createElement('li');
      li.className = 'queue-item pop-anim';
      li.style.animationDelay = `${index * 0.05}s`;

      // Determine text color based on queue index and currentPlayingIndex
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

      // Container for index & name
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

      // If this item was registered by this browser/session, add a delete button
      if (myQueueIds.includes(item.id)) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete-queue';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = 'ลบคิวของคุณ';
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          // Emit delete event to server
          socket.emit('delete_queue', { id: item.id, clientId });

          // Remove from local storage list
          myQueueIds = myQueueIds.filter(id => id !== item.id);
          saveMyQueues();
        });
        li.appendChild(deleteBtn);
      }

      queueList.appendChild(li);
    });
  }
});

// Handle form submission
if (registrationForm) {
  registrationForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = usernameInput.value.trim();
    if (name) {
      socket.emit('register_queue', { name, clientId });
      usernameInput.value = '';
    }
  });
}
