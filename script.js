/*
  FocusFlow — script.js
  ======================
  This file is the BRAIN of the app. It handles:
    1. Timer logic (count down, switch modes)
    2. Progress ring animation (SVG stroke math)
    3. Dark / Light mode toggle
    4. To-do list (add, complete, delete, filter)
    5. Motivational quotes
    6. Notification sound (Web Audio API — no files needed!)
    7. Toast notifications
    8. Stats tracking
    9. LocalStorage (saves tasks + stats between page visits)

  HOW TO READ THIS FILE:
  It's split into clear sections. Each section starts with a
  big comment block. Read top-to-bottom the first time.
*/

'use strict'; // Helps catch common JS mistakes early

/* ================================================================
   ██████  ██████  ███    ██ ███████ ██  ██████
  ██      ██    ██ ████   ██ ██      ██ ██
  ██      ██    ██ ██ ██  ██ █████   ██ ██  ███
  ██      ██    ██ ██  ██ ██ ██      ██ ██    ██
   ██████  ██████  ██   ████ ██      ██  ██████
  ================================================================ */

// ── Timer Settings ────────────────────────────────────────────────
const FOCUS_MINUTES  = 25;   // Minutes in a focus session
const BREAK_MINUTES  = 5;    // Minutes in a break session
const SESSIONS_TOTAL = 4;    // Pomodoros before a long break

// Ring SVG math: circumference = 2 × π × radius
// Our SVG circle has r="95", so 2 × 3.14159 × 95 ≈ 597
const RING_CIRCUMFERENCE = 597;

// ── Timer State (all live info about the timer right now) ─────────
let timerState = {
  isRunning:       false,    // Is the timer actively counting down?
  isPaused:        false,    // Has the user paused it mid-session?
  currentMode:     'focus',  // 'focus' or 'break'
  secondsLeft:     FOCUS_MINUTES * 60,  // Total seconds remaining
  totalSeconds:    FOCUS_MINUTES * 60,  // Total seconds for THIS session
  sessionCount:    1,        // Which pomodoro we're on (1–4)
  intervalId:      null,     // Holds the setInterval reference so we can clear it
};

// ── Stats State ────────────────────────────────────────────────────
let stats = {
  pomodoros:    0,   // How many focus sessions completed
  minutesFocused: 0, // Total minutes focused
  tasksDone:    0,   // Total tasks completed
};

// ── Tasks State ────────────────────────────────────────────────────
let tasks       = [];      // Array of task objects: { id, text, done }
let activeFilter = 'all';  // Current filter: 'all', 'active', 'done'

/* ================================================================
   DOM REFERENCES
   We grab every HTML element we'll touch and store it in variables.
   This is more efficient than calling getElementById() each time.
   ================================================================ */

// Timer elements
const timerDisplay  = document.getElementById('timerDisplay');
const timerSub      = document.getElementById('timerSub');
const ringProgress  = document.getElementById('ringProgress');
const timerRing     = document.querySelector('.timer-ring');

// Mode & session
const modeBadge     = document.getElementById('modeBadge');
const modeText      = document.getElementById('modeText');
const sessionInfo   = document.getElementById('sessionInfo');

// Control buttons
const startBtn  = document.getElementById('startBtn');
const pauseBtn  = document.getElementById('pauseBtn');
const resetBtn  = document.getElementById('resetBtn');

// Mode switcher (Focus / Break tabs)
const focusBtn  = document.getElementById('focusBtn');
const breakBtn  = document.getElementById('breakBtn');

// Quote elements
const quoteText     = document.getElementById('quoteText');
const quoteAuthor   = document.getElementById('quoteAuthor');
const refreshQuote  = document.getElementById('refreshQuote');

// To-do elements
const todoInput     = document.getElementById('todoInput');
const addTaskBtn    = document.getElementById('addTaskBtn');
const taskList      = document.getElementById('taskList');
const emptyState    = document.getElementById('emptyState');
const todoCount     = document.getElementById('todoCount');
const clearDoneBtn  = document.getElementById('clearDoneBtn');

// Filter buttons (NodeList → we'll forEach over them)
const filterBtns = document.querySelectorAll('.filter-btn');

// Stats display
const statPomodoros = document.getElementById('statPomodoros');
const statMinutes   = document.getElementById('statMinutes');
const statTasks     = document.getElementById('statTasks');

// Toast
const toast     = document.getElementById('toast');
const toastMsg  = document.getElementById('toastMsg');

// Theme toggle
const themeToggle = document.getElementById('themeToggle');
const themeIcon   = document.getElementById('themeIcon');
const themeLabel  = document.getElementById('themeLabel');

/* ================================================================
   MOTIVATIONAL QUOTES
   Array of { text, author } objects. We'll pick one randomly.
   ================================================================ */
const quotes = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { text: "Concentrate all your thoughts upon the work at hand.", author: "Alexander Graham Bell" },
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "You are never too old to set another goal or dream a new dream.", author: "C.S. Lewis" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { text: "The expert in anything was once a beginner.", author: "Helen Hayes" },
  { text: "Small steps every day lead to massive results.", author: "Anonymous" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "Deep work is the superpower of the 21st century.", author: "Cal Newport" },
  { text: "Your future is created by what you do today, not tomorrow.", author: "Robert Kiyosaki" },
  { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
];

// Keep track of last quote index to avoid showing the same one twice
let lastQuoteIndex = -1;

/* ================================================================
   TIMER FUNCTIONS
   ================================================================ */

/**
 * formatTime(seconds)
 * Converts total seconds into "MM:SS" string.
 * Example: 90 → "01:30"
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);   // whole minutes
  const secs = seconds % 60;               // remaining seconds
  // padStart(2, '0') ensures we always get "09" not "9"
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * updateRing(secondsLeft, totalSeconds)
 * Animates the SVG progress circle.
 *
 * HOW stroke-dashoffset WORKS:
 * - stroke-dasharray = 597 means the dash is 597 units long (= full circle).
 * - stroke-dashoffset = 0   → full circle is visible (100% progress).
 * - stroke-dashoffset = 597 → nothing is visible (0% progress).
 *
 * So as time runs out, offset goes from 0 → 597.
 */
function updateRing(secondsLeft, totalSeconds) {
  // What fraction of time remains? (1.0 → 0.0)
  const fraction = secondsLeft / totalSeconds;
  // How much of the ring should be "hidden"?
  const offset = RING_CIRCUMFERENCE * (1 - fraction);
  ringProgress.style.strokeDashoffset = offset;
}

/**
 * updateTimerDisplay()
 * Updates the big digits and sub-label on screen.
 */
function updateTimerDisplay() {
  timerDisplay.textContent = formatTime(timerState.secondsLeft);
  updateRing(timerState.secondsLeft, timerState.totalSeconds);
}

/**
 * setMode(mode)
 * Switches the app between 'focus' and 'break' modes.
 * Resets timer to the appropriate duration.
 * @param {string} mode — 'focus' or 'break'
 */
function setMode(mode) {
  // Stop any running timer first
  stopTimer();

  timerState.currentMode = mode;

  if (mode === 'focus') {
    timerState.totalSeconds = FOCUS_MINUTES * 60;
    timerState.secondsLeft  = FOCUS_MINUTES * 60;

    // UI: update badge
    modeBadge.classList.remove('break-mode');
    modeText.textContent = 'Focus Mode';
    timerSub.textContent = 'until break';

    // Highlight Focus tab
    focusBtn.classList.add('active');
    breakBtn.classList.remove('active');

    // Ring color
    ringProgress.classList.remove('break-mode');
    timerRing.classList.remove('break-mode');

  } else {
    timerState.totalSeconds = BREAK_MINUTES * 60;
    timerState.secondsLeft  = BREAK_MINUTES * 60;

    // UI: update badge
    modeBadge.classList.add('break-mode');
    modeText.textContent = 'Break Mode';
    timerSub.textContent = 'until focus';

    // Highlight Break tab
    breakBtn.classList.add('active');
    focusBtn.classList.remove('active');

    // Ring color
    ringProgress.classList.add('break-mode');
    timerRing.classList.add('break-mode');
  }

  updateTimerDisplay();
  showToast(mode === 'focus' ? '🎯 Focus session ready!' : '☕ Break time!');
}

/**
 * startTimer()
 * Begins the countdown. Called when user clicks "Start".
 */
function startTimer() {
  if (timerState.isRunning) return; // Don't start twice

  timerState.isRunning = true;
  timerState.isPaused  = false;

  // Show Pause button, hide Start button
  startBtn.classList.add('hidden');
  pauseBtn.classList.remove('hidden');

  // setInterval calls a function every X milliseconds.
  // 1000ms = 1 second. We decrement secondsLeft each tick.
  timerState.intervalId = setInterval(() => {

    timerState.secondsLeft--;      // Subtract one second
    updateTimerDisplay();          // Refresh the screen

    // Update browser tab title too
    document.title = `${formatTime(timerState.secondsLeft)} — FocusFlow`;

    // ── Timer finished ──
    if (timerState.secondsLeft <= 0) {
      handleTimerComplete();
    }

  }, 1000); // every 1000 milliseconds = every 1 second
}

/**
 * pauseTimer()
 * Pauses (but doesn't reset) the countdown.
 */
function pauseTimer() {
  if (!timerState.isRunning) return;

  timerState.isRunning = false;
  timerState.isPaused  = true;

  // Stop the interval (prevents further decrement)
  clearInterval(timerState.intervalId);
  timerState.intervalId = null;

  // Swap buttons: show Start (resume), hide Pause
  pauseBtn.classList.add('hidden');
  startBtn.classList.remove('hidden');

  // Change Start button text to "Resume"
  startBtn.querySelector('span:last-child').textContent = 'Resume';
  startBtn.querySelector('.btn-icon').textContent = '▶';
}

/**
 * stopTimer()
 * Fully stops the interval (used before mode change / reset).
 */
function stopTimer() {
  clearInterval(timerState.intervalId);
  timerState.intervalId = null;
  timerState.isRunning  = false;
  timerState.isPaused   = false;

  // Reset buttons
  pauseBtn.classList.add('hidden');
  startBtn.classList.remove('hidden');
  startBtn.querySelector('span:last-child').textContent = 'Start';
  startBtn.querySelector('.btn-icon').textContent = '▶';

  // Reset browser tab title
  document.title = 'FocusFlow — Study Timer';
}

/**
 * resetTimer()
 * Resets to the beginning of the current mode (keeps focus/break).
 */
function resetTimer() {
  stopTimer();
  // Reset to full duration for current mode
  timerState.secondsLeft  = timerState.totalSeconds;
  updateTimerDisplay();
}

/**
 * handleTimerComplete()
 * Called when the countdown hits 0. Plays a sound, shows a toast,
 * updates stats, then auto-switches to the next mode.
 */
function handleTimerComplete() {
  stopTimer();

  // Flash the digits briefly (CSS animation)
  timerDisplay.classList.add('flash');
  setTimeout(() => timerDisplay.classList.remove('flash'), 2000);

  playBeepSound();  // Sound alert

  if (timerState.currentMode === 'focus') {
    // ── Finished a focus session ──
    stats.pomodoros++;
    stats.minutesFocused += FOCUS_MINUTES;
    updateStatsDisplay();
    saveToStorage();

    // Update session counter
    if (timerState.sessionCount < SESSIONS_TOTAL) {
      timerState.sessionCount++;
    } else {
      timerState.sessionCount = 1;  // Reset after 4 sessions
    }
    sessionInfo.textContent = `Session ${timerState.sessionCount} of ${SESSIONS_TOTAL}`;

    showToast('🎉 Focus session done! Time for a break.');
    showNotification('FocusFlow', '✅ Focus session complete! Take a break.');

    // Auto-switch to break mode
    setTimeout(() => setMode('break'), 1500);

  } else {
    // ── Finished a break ──
    showToast('⚡ Break over! Back to work!');
    showNotification('FocusFlow', '⚡ Break over! Start your next focus session.');

    // Auto-switch back to focus mode
    setTimeout(() => setMode('focus'), 1500);
  }

  // Refresh the quote on each session end
  loadNewQuote();
}

/* ================================================================
   SOUND — WEB AUDIO API
   We generate a beep programmatically using the browser's audio engine.
   This means NO audio files are needed!
   ================================================================ */

/**
 * playBeepSound()
 * Creates a multi-tone chime using the Web Audio API.
 * No external files needed — it generates the sound in the browser.
 */
function playBeepSound() {
  try {
    // AudioContext is the entry point to the Web Audio API
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // We'll play 3 quick notes to make a pleasant chime
    const notes = [523, 659, 784]; // C5, E5, G5 (a major chord)

    notes.forEach((frequency, index) => {
      // OscillatorNode generates a tone at a given frequency
      const oscillator = ctx.createOscillator();
      // GainNode controls volume
      const gainNode   = ctx.createGain();

      oscillator.connect(gainNode);      // wire oscillator → gain
      gainNode.connect(ctx.destination); // wire gain → speakers

      oscillator.type      = 'sine';   // smooth sine wave tone
      oscillator.frequency.value = frequency;

      // Start this note slightly after the previous one (staggered)
      const startTime = ctx.currentTime + index * 0.2;

      // Fade the note in quickly and out slowly (envelope)
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05);  // fade in
      gainNode.gain.linearRampToValueAtTime(0, startTime + 0.5);     // fade out

      oscillator.start(startTime);
      oscillator.stop(startTime + 0.5);
    });

  } catch (e) {
    // If audio isn't available (e.g. autoplay blocked), fail silently
    console.log('Audio not available:', e);
  }
}

/* ================================================================
   BROWSER NOTIFICATIONS
   Shows an OS-level notification when the timer ends.
   Only works if user grants permission.
   ================================================================ */

/**
 * requestNotificationPermission()
 * Asks the user to allow notifications (runs once on page load).
 */
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

/**
 * showNotification(title, body)
 * Shows an OS notification if permission was granted.
 */
function showNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '' });
  }
}

/* ================================================================
   TOAST NOTIFICATION
   The small pop-up bar at the bottom of the screen.
   ================================================================ */

let toastTimeout = null; // Store timeout so we can cancel it

/**
 * showToast(message)
 * Shows the toast bar with a message for 3 seconds.
 */
function showToast(message) {
  // Clear any existing toast timer
  clearTimeout(toastTimeout);

  toastMsg.textContent = message;
  toast.classList.add('show');  // CSS makes it slide up

  // Auto-hide after 3 seconds
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

/* ================================================================
   QUOTES
   ================================================================ */

/**
 * loadNewQuote()
 * Picks a random quote (different from the last one) and displays it.
 */
function loadNewQuote() {
  let index;
  // Keep picking until we get a different index
  do {
    index = Math.floor(Math.random() * quotes.length);
  } while (index === lastQuoteIndex && quotes.length > 1);

  lastQuoteIndex = index;
  const { text, author } = quotes[index];

  // Animate: fade out → update text → fade in
  quoteText.classList.remove('fade-in');
  quoteText.textContent  = `"${text}"`;
  quoteAuthor.textContent = `— ${author}`;

  // Force browser to notice the class was removed before re-adding
  void quoteText.offsetWidth;
  quoteText.classList.add('fade-in');
}

/* ================================================================
   TO-DO LIST
   ================================================================ */

/**
 * generateId()
 * Creates a unique ID for each task using timestamp + random number.
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * addTask()
 * Reads the input field, creates a new task object, saves it, re-renders.
 */
function addTask() {
  const text = todoInput.value.trim(); // .trim() removes leading/trailing spaces

  if (!text) {
    // Shake the input if empty
    todoInput.style.animation = 'none';
    void todoInput.offsetWidth; // force reflow
    todoInput.focus();
    return;
  }

  const newTask = {
    id:   generateId(),
    text: text,
    done: false,
  };

  tasks.unshift(newTask); // unshift adds to the FRONT of the array

  todoInput.value = ''; // Clear the input
  todoInput.focus();    // Keep focus in the input for quick entry

  renderTasks();
  saveToStorage();
}

/**
 * toggleTask(id)
 * Flips a task between done and not done.
 * @param {string} id — The task's unique ID
 */
function toggleTask(id) {
  tasks = tasks.map(task => {
    if (task.id === id) {
      // If we're marking it done (wasn't done before), increment stat
      if (!task.done) {
        stats.tasksDone++;
        updateStatsDisplay();
      }
      return { ...task, done: !task.done }; // flip the done flag
    }
    return task;
  });
  renderTasks();
  saveToStorage();
}

/**
 * deleteTask(id)
 * Removes a task by its ID.
 */
function deleteTask(id) {
  tasks = tasks.filter(task => task.id !== id); // keep all except this one
  renderTasks();
  saveToStorage();
}

/**
 * clearDone()
 * Removes all completed tasks at once.
 */
function clearDone() {
  tasks = tasks.filter(task => !task.done); // keep only unfinished tasks
  renderTasks();
  saveToStorage();
}

/**
 * getFilteredTasks()
 * Returns tasks based on the active filter.
 */
function getFilteredTasks() {
  switch (activeFilter) {
    case 'active': return tasks.filter(t => !t.done);
    case 'done':   return tasks.filter(t => t.done);
    default:       return tasks;  // 'all'
  }
}

/**
 * renderTasks()
 * Clears and re-draws the entire task list from the tasks[] array.
 * This is the "single source of truth" render approach.
 */
function renderTasks() {
  const filtered = getFilteredTasks();

  // Update the task count badge
  const activeCount = tasks.filter(t => !t.done).length;
  todoCount.textContent = `${activeCount} task${activeCount !== 1 ? 's' : ''}`;

  // If nothing to show, display empty state
  if (filtered.length === 0) {
    taskList.innerHTML = ''; // clear
    taskList.appendChild(emptyState);
    emptyState.classList.remove('hidden');
    return;
  }

  // Remove the empty state placeholder
  emptyState.classList.add('hidden');

  // Build all task HTML at once (more efficient than appending one by one)
  taskList.innerHTML = filtered.map(task => `
    <li class="task-item ${task.done ? 'done' : ''}" data-id="${task.id}">
      <button class="task-check" onclick="toggleTask('${task.id}')" title="${task.done ? 'Mark undone' : 'Mark done'}">
        ${task.done ? '✓' : ''}
      </button>
      <span class="task-text">${escapeHtml(task.text)}</span>
      <button class="task-delete" onclick="deleteTask('${task.id}')" title="Delete task">✕</button>
    </li>
  `).join('');
}

/**
 * escapeHtml(text)
 * Prevents XSS attacks by escaping special HTML characters.
 * Important whenever you put user input into innerHTML!
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ================================================================
   STATS
   ================================================================ */

/**
 * updateStatsDisplay()
 * Refreshes the three stat numbers at the bottom of the to-do section.
 */
function updateStatsDisplay() {
  statPomodoros.textContent = stats.pomodoros;
  statMinutes.textContent   = stats.minutesFocused;
  statTasks.textContent     = stats.tasksDone;
}

/* ================================================================
   DARK / LIGHT MODE TOGGLE
   ================================================================ */

/**
 * toggleTheme()
 * Reads the current theme from the <html> element and swaps it.
 */
function toggleTheme() {
  const html = document.documentElement; // the <html> element
  const currentTheme = html.getAttribute('data-theme');

  if (currentTheme === 'dark') {
    html.setAttribute('data-theme', 'light');
    themeIcon.textContent  = '🌙';
    themeLabel.textContent = 'Dark Mode';
    localStorage.setItem('focusflow-theme', 'light');
  } else {
    html.setAttribute('data-theme', 'dark');
    themeIcon.textContent  = '☀️';
    themeLabel.textContent = 'Light Mode';
    localStorage.setItem('focusflow-theme', 'dark');
  }
}

/**
 * loadSavedTheme()
 * On page load, restore the theme the user chose last time.
 */
function loadSavedTheme() {
  const saved = localStorage.getItem('focusflow-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    if (saved === 'light') {
      themeIcon.textContent  = '🌙';
      themeLabel.textContent = 'Dark Mode';
    }
  }
}

/* ================================================================
   LOCAL STORAGE — Persist data between page visits
   localStorage is like a tiny browser-side database (key-value pairs).
   ================================================================ */

/**
 * saveToStorage()
 * Saves tasks and stats to localStorage.
 * JSON.stringify converts JS objects to a string for storage.
 */
function saveToStorage() {
  localStorage.setItem('focusflow-tasks', JSON.stringify(tasks));
  localStorage.setItem('focusflow-stats', JSON.stringify(stats));
}

/**
 * loadFromStorage()
 * On page load, restores tasks and stats from localStorage.
 * JSON.parse converts the string back to JS objects.
 */
function loadFromStorage() {
  const savedTasks = localStorage.getItem('focusflow-tasks');
  const savedStats = localStorage.getItem('focusflow-stats');

  if (savedTasks) {
    try {
      tasks = JSON.parse(savedTasks);
    } catch (e) {
      tasks = []; // If parsing fails, start fresh
    }
  }

  if (savedStats) {
    try {
      const parsed = JSON.parse(savedStats);
      // Merge saved stats, keeping defaults for any missing keys
      stats = { ...stats, ...parsed };
    } catch (e) {
      // Keep default stats
    }
  }
}

/* ================================================================
   EVENT LISTENERS
   These connect user actions (clicks, keypresses) to our functions.
   ================================================================ */

// ── Timer Controls ─────────────────────────────────────────────────
startBtn.addEventListener('click', startTimer);
pauseBtn.addEventListener('click', pauseTimer);
resetBtn.addEventListener('click', resetTimer);

// ── Mode Switcher ──────────────────────────────────────────────────
focusBtn.addEventListener('click', () => setMode('focus'));
breakBtn.addEventListener('click', () => setMode('break'));

// ── Theme Toggle ───────────────────────────────────────────────────
themeToggle.addEventListener('click', toggleTheme);

// ── Quotes ─────────────────────────────────────────────────────────
refreshQuote.addEventListener('click', loadNewQuote);

// ── To-Do: Add task ────────────────────────────────────────────────
// Click the add (+) button
addTaskBtn.addEventListener('click', addTask);

// Press Enter in the input field
todoInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') addTask();
});

// ── To-Do: Filter buttons ──────────────────────────────────────────
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // Remove 'active' from all filter buttons
    filterBtns.forEach(b => b.classList.remove('active'));
    // Add 'active' to the clicked one
    btn.classList.add('active');
    // Update the active filter state
    activeFilter = btn.dataset.filter; // reads the data-filter attribute in HTML
    renderTasks();
  });
});

// ── To-Do: Clear completed ─────────────────────────────────────────
clearDoneBtn.addEventListener('click', clearDone);

// ── Keyboard shortcut: Spacebar to start/pause ────────────────────
document.addEventListener('keydown', (event) => {
  // Only trigger if user isn't typing in the input field
  if (document.activeElement === todoInput) return;

  if (event.code === 'Space') {
    event.preventDefault(); // Prevent page scroll
    if (timerState.isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  }
});

/* ================================================================
   INITIALISATION
   This runs once when the page first loads.
   ================================================================ */

function init() {
  // 1. Restore saved theme
  loadSavedTheme();

  // 2. Load saved tasks and stats from localStorage
  loadFromStorage();
  renderTasks();
  updateStatsDisplay();

  // 3. Set initial timer display
  updateTimerDisplay();

  // 4. Load a random quote
  loadNewQuote();

  // 5. Ask for notification permission (browser shows a popup to user)
  requestNotificationPermission();

  // 6. Log a friendly message for devs looking at the console
  console.log(
    '%c🎯 FocusFlow loaded! %cTip: Press Spacebar to start/pause.',
    'color:#f5a623;font-weight:bold;font-size:14px;',
    'color:#9896a0;font-size:12px;'
  );
}

// Run init() as soon as the page loads
init();
