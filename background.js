// Use chrome APIs with fallback to browser APIs
const extensionAPI = typeof chrome !== 'undefined' ? chrome : browser;

// Listen for alarm triggers
extensionAPI.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('task_')) {
    const taskId = alarm.name.replace('task_', '');
    
    try {
      // Get task info from storage
      const data = await extensionAPI.storage.local.get(`reminder_${taskId}`);
      const taskInfo = data[`reminder_${taskId}`];
      
      if (taskInfo) {
        // Show notification with more attention-grabbing options
        await extensionAPI.notifications.create(`notif_${taskId}`, {
          type: 'basic',
          iconUrl: 'icon128.png',
          title: '⏰ Task Reminder',
          message: taskInfo.taskText,
          priority: 2,
          requireInteraction: true, // Notification won't auto-dismiss
          silent: false, // Will play notification sound
          buttons: [
            { title: 'Mark as Done' },
            { title: 'Snooze (5 min)' }
          ]
        });

        // Also add a badge to show there's a pending notification
        await extensionAPI.action.setBadgeText({ text: '!' });
        await extensionAPI.action.setBadgeBackgroundColor({ color: '#EF4444' });
        
        // Keep the reminder data for handling button clicks
        // We'll clean it up when the notification is handled
      }
    } catch (error) {
      console.error('Error handling alarm:', error);
    }
  }
});

// Handle notification button clicks
extensionAPI.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  try {
    const taskId = notificationId.replace('notif_', '');
    
    if (buttonIndex === 0) {
      // Mark as Done
      const data = await extensionAPI.storage.local.get(['tasks']);
      const tasks = data.tasks || [];
      const taskIndex = tasks.findIndex(t => t.id === taskId);
      
      if (taskIndex !== -1) {
        tasks[taskIndex].completed = true;
        await extensionAPI.storage.local.set({ tasks });
      }
    } else if (buttonIndex === 1) {
      // Snooze for 5 minutes
      const data = await extensionAPI.storage.local.get(`reminder_${taskId}`);
      const taskInfo = data[`reminder_${taskId}`];
      
      if (taskInfo) {
        const snoozeTime = Date.now() + 5 * 60 * 1000; // 5 minutes
        await extensionAPI.alarms.create(`task_${taskId}`, {
          when: snoozeTime
        });
      }
    }
    
    // Clear the notification
    await extensionAPI.notifications.clear(notificationId);
    await extensionAPI.action.setBadgeText({ text: '' });
    
  } catch (error) {
    console.error('Error handling notification button click:', error);
  }
});

// Handle notification clicks
extensionAPI.notifications.onClicked.addListener(async (notificationId) => {
  try {
    // Clear the notification
    await extensionAPI.notifications.clear(notificationId);
    await extensionAPI.action.setBadgeText({ text: '' });
    
    // Open the extension popup
    if (extensionAPI.action) {
      await extensionAPI.action.openPopup();
    } else if (extensionAPI.browserAction) {
      // Fallback for older Chrome versions
      await extensionAPI.browserAction.openPopup();
    }
  } catch (error) {
    console.error('Error handling notification click:', error);
  }
});

// Clean up old alarms on startup
extensionAPI.runtime.onStartup.addListener(async () => {
  try {
    const alarms = await extensionAPI.alarms.getAll();
    const now = Date.now();
    
    for (const alarm of alarms) {
      if (alarm.scheduledTime < now) {
        await extensionAPI.alarms.clear(alarm.name);
        await extensionAPI.storage.local.remove(`reminder_${alarm.name.replace('task_', '')}`);
      }
    }
    
    // Clear any leftover badge
    await extensionAPI.action.setBadgeText({ text: '' });
  } catch (error) {
    console.error('Error cleaning up alarms:', error);
  }
});

