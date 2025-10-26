// Get DOM elements
const taskInput = document.getElementById('taskInput');
const reminderInput = document.getElementById('reminderInput');
const addTaskBtn = document.getElementById('addTaskBtn');
const tasksList = document.getElementById('tasksList');
const emptyState = document.getElementById('emptyState');
const themeToggle = document.getElementById('themeToggle');
const totalTasksEl = document.getElementById('totalTasks');
const completedTasksEl = document.getElementById('completedTasks');
const pendingTasksEl = document.getElementById('pendingTasks');

let tasks = [];
let theme = 'light';

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadData();
  applyTheme();
  renderTasks();
  setupEventListeners();
  setMinDateTime();
}

// Load data from storage
async function loadData() {
  const data = await (chrome.storage || browser.storage).local.get(['tasks', 'theme']);
  tasks = data.tasks || [];
  theme = data.theme || 'light';
}

// Save tasks to storage
async function saveTasks() {
  try {
    await (chrome.storage || browser.storage).local.set({ tasks });
    renderTasks();
  } catch (error) {
    console.error('Error saving tasks:', error);
  }
}

// Save theme to storage
async function saveTheme() {
  try {
    await (chrome.storage || browser.storage).local.set({ theme });
  } catch (error) {
    console.error('Error saving theme:', error);
  }
}

// Apply theme
function applyTheme() {
  document.body.setAttribute('data-theme', theme);
}

// Setup event listeners
function setupEventListeners() {
  addTaskBtn.addEventListener('click', addTask);
  
  taskInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTask();
  });
  
  // Add input validation for task text
  taskInput.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    if (value.length > 100) {
      showError('Task description cannot exceed 100 characters');
      e.target.value = value.substring(0, 100);
    }
  });
  
  // Only store the reminder value, validate during task addition
  reminderInput.addEventListener('change', (e) => {
    // Clear any previous error styling
    reminderInput.classList.remove('invalid');
  });
  
  themeToggle.addEventListener('click', toggleTheme);
}

// Set minimum datetime for reminder input
function setMinDateTime() {
  // Don't set a minimum time - we'll validate when adding the task instead
  reminderInput.min = '';
  
  // Set the default value to current time + 1 minute for convenience
  const setDefaultTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const defaultTime = now.toISOString().slice(0, 16);
    
    // Only set default if no value is currently entered
    if (!reminderInput.value) {
      reminderInput.value = defaultTime;
    }
  };
  
  setDefaultTime();
}

// Validate reminder date and return validation result
function validateReminder(reminderValue) {
  if (!reminderValue) return { isValid: true, date: null };

  try {
    const reminderDate = new Date(reminderValue + ':00');
    if (isNaN(reminderDate.getTime())) {
      return {
        isValid: false,
        error: 'Invalid date format'
      };
    }

    const now = new Date();
    const reminderTimestamp = reminderDate.getTime();
    const nowTimestamp = now.getTime();

    // Allow reminders that are at least 10 seconds in the future
    if (reminderTimestamp <= nowTimestamp + 10000) { // 10 second buffer
      return {
        isValid: false,
        error: 'Please set the reminder at least 10 seconds in the future'
      };
    }

    const oneYearFromNow = new Date(now);
    oneYearFromNow.setFullYear(now.getFullYear() + 1);
    if (reminderTimestamp > oneYearFromNow.getTime()) {
      return {
        isValid: false,
        error: 'Reminder cannot be set more than 1 year in the future'
      };
    }

    return {
      isValid: true,
      date: reminderDate
    };
  } catch (error) {
    console.error('Error validating reminder:', error);
    return {
      isValid: false,
      error: 'Invalid date format'
    };
  }
}

// Add new task
async function addTask() {
  const text = taskInput.value.trim();
  
  // Validate task text
  if (!text) {
    showError('Task description cannot be empty');
    return;
  }
  
  if (text.length < 3) {
    showError('Task description must be at least 3 characters long');
    return;
  }

  // Validate reminder if provided
  const reminder = reminderInput.value;
  const reminderValidation = validateReminder(reminder);

  // Create task object regardless of reminder validity
  const task = {
    id: Date.now().toString(),
    text,
    completed: false,
    createdAt: new Date().toISOString(),
    reminder: reminderValidation.isValid && reminderValidation.date ? 
             reminderValidation.date.toISOString() : null
  };

  // Add task to list and save
  tasks.unshift(task);
  await saveTasks();

  // Handle reminder setup if valid
  if (reminder && reminderValidation.isValid && reminderValidation.date) {
    try {
      const api = chrome.alarms || browser.alarms;
      const storage = chrome.storage || browser.storage;
      
      // Create the alarm
      await api.create(`task_${task.id}`, {
        when: reminderValidation.date.getTime()
      });
      
      // Store task info for notification
      await storage.local.set({
        [`reminder_${task.id}`]: {
          taskText: task.text,
          taskId: task.id,
          scheduledFor: reminderValidation.date.toISOString()
        }
      });
    } catch (error) {
      console.error('Error setting reminder:', error);
      // Show error but don't prevent task creation
      showError('Failed to set reminder, but task was saved');
    }
  } else if (reminder && !reminderValidation.isValid) {
    // Show error after task is saved if reminder was invalid
    showError(reminderValidation.error + ' - Task saved without reminder');
  }

  // Clear inputs
  taskInput.value = '';
  reminderInput.value = '';
}

// Toggle task completion
async function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (task) {
    task.completed = !task.completed;
    await saveTasks();
  }
}

// Delete task
async function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  await saveTasks();
  
  // Clear alarm if exists
  await browser.alarms.clear(`task_${id}`);
  await browser.storage.local.remove(`reminder_${id}`);
}

// Toggle theme
async function toggleTheme() {
  theme = theme === 'light' ? 'dark' : 'light';
  applyTheme();
  await saveTheme();
}

// Render tasks
function renderTasks() {
  tasksList.innerHTML = '';
  
  if (tasks.length === 0) {
    emptyState.classList.remove('hidden');
    updateStats();
    return;
  }
  
  emptyState.classList.add('hidden');
  
  tasks.forEach(task => {
    const taskEl = createTaskElement(task);
    tasksList.appendChild(taskEl);
  });
  
  updateStats();
}

// Create task element
function createTaskElement(task) {
  const taskEl = document.createElement('div');
  taskEl.className = 'task-item';
  
  const checkbox = document.createElement('div');
  checkbox.className = `task-checkbox ${task.completed ? 'checked' : ''}`;
  checkbox.addEventListener('click', () => toggleTask(task.id));
  
  const content = document.createElement('div');
  content.className = 'task-content';
  
  const text = document.createElement('div');
  text.className = `task-text ${task.completed ? 'completed' : ''}`;
  text.textContent = task.text;
  
  content.appendChild(text);
  
  if (task.reminder) {
    const reminder = document.createElement('div');
    reminder.className = 'task-reminder';
    reminder.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
      ${formatReminder(task.reminder)}
    `;
    content.appendChild(reminder);
  }
  
  const actions = document.createElement('div');
  actions.className = 'task-actions';
  
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-icon btn-delete';
  deleteBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
  `;
  deleteBtn.addEventListener('click', () => deleteTask(task.id));
  
  actions.appendChild(deleteBtn);
  
  taskEl.appendChild(checkbox);
  taskEl.appendChild(content);
  taskEl.appendChild(actions);
  
  return taskEl;
}

// Show error message
function showError(message) {
  // Remove existing error if any
  const existingError = document.querySelector('.error-message');
  if (existingError) {
    existingError.remove();
  }

  // Create new error message
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);

  // Remove error after 3 seconds
  setTimeout(() => {
    errorDiv.remove();
  }, 3000);
}

// Format reminder time
function formatReminder(reminder) {
  const date = new Date(reminder);
  const now = new Date();
  const diff = date - now;
  
  if (diff < 0) {
    return 'Overdue';
  }
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `in ${days} day${days > 1 ? 's' : ''}`;
  } else if (hours > 0) {
    return `in ${hours} hour${hours > 1 ? 's' : ''}`;
  } else {
    const minutes = Math.floor(diff / (1000 * 60));
    return `in ${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
}

// Update statistics
function updateStats() {
  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const pending = total - completed;
  
  totalTasksEl.textContent = total;
  completedTasksEl.textContent = completed;
  pendingTasksEl.textContent = pending;
}