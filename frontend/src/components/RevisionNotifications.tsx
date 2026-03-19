import { useEffect } from 'react';

interface RevisionTask {
  id: string;
  subject: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  status: 'Pending' | 'In Progress' | 'Completed';
}

export default function RevisionNotifications() {
  useEffect(() => {
    // Check permission on mount
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }

    const checkReminders = () => {
      const saved = localStorage.getItem('revision_tasks');
      if (!saved) return;
      
      try {
        const tasks: RevisionTask[] = JSON.parse(saved);
        const now = new Date();
        
        tasks.forEach(task => {
          if (task.status === 'Completed') return;
          
          const taskTime = new Date(`${task.date}T${task.time}`);
          const diffMinutes = (taskTime.getTime() - now.getTime()) / 1000 / 60;
          
          // Notify ~15 minutes before (allow 1 min window due to interval)
          if (diffMinutes >= 14 && diffMinutes < 15) {
             if (Notification.permission === 'granted') {
               new Notification(`Upcoming Task: ${task.subject}`, {
                 body: `Starts in 15 minutes! (${task.time})`,
                 icon: '/favicon.ico' // Optional
               });
             }
          }
        });
      } catch (e) {
        console.error("Failed to parse revision tasks for notifications", e);
      }
    };

    // Check every minute
    const interval = setInterval(checkReminders, 60000);
    
    // Initial check
    checkReminders();

    return () => clearInterval(interval);
  }, []);

  return null; // Logic only component
}
