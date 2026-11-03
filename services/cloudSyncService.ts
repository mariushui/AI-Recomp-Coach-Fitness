
import type { DailyCheckinData } from '../types';

export const syncToCloud = async (url: string, action: 'saveEntry' | 'syncAll' | 'fetchAll', payload: any) => {
  if (!url) return null;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      mode: 'no-cors', // Apps Script requires no-cors for simple triggers or specific setup
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, ...payload }),
    });
    
    // With no-cors we can't read the body, but we assume success if no error is thrown
    return { status: 'sent' };
  } catch (error) {
    console.error("Cloud Sync Error:", error);
    throw error;
  }
};

// Improved fetch that works with cors if the user deployed correctly
export const fetchFromCloud = async (url: string) => {
  if (!url) return null;
  const response = await fetch(`${url}?action=fetchAll`);
  const data = await response.json();
  return data.history;
};
