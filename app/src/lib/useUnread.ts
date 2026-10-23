import { usePathname } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { getUnreadTotal, subscribeToInbox } from './market';

/** Number of unread chat messages, kept fresh while the site is open. */
export function useUnreadCount(): number {
  const [count, setCount] = useState(0);
  const pathname = usePathname();

  const refresh = useCallback(() => {
    getUnreadTotal()
      .then(setCount)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, pathname]);

  useEffect(() => {
    const unsubscribe = subscribeToInbox(refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [refresh]);

  return count;
}
