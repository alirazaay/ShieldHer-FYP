import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import logger from '../utils/logger';

const TAG = '[alertRetryQueue]';
const STORAGE_KEY = '@shieldher_pending_alerts';
const RETRY_INTERVAL_MS = 10000;
const MAX_RETRIES = 10;

let pendingAlertsCache = [];
let initialized = false;
let retryTimer = null;
let networkUnsubscribe = null;
let isRetryInProgress = false;

let sendAlertHandler = null;
let maxRetryHandler = null;

export function calculateRetryDelayMs(retries) {
  // Base interval for first 5 failures; then exponential backoff.
  if (retries <= 5) return RETRY_INTERVAL_MS;
  const exponent = Math.min(retries - 5, 5); // cap growth
  return RETRY_INTERVAL_MS * 2 ** exponent;
}

function cloneAlert(alert) {
  return {
    alertId: alert.alertId,
    userId: alert.userId,
    location: alert.location,
    triggerType: alert.triggerType === 'AI' ? 'AI' : 'manual',
    timestamp: alert.timestamp,
    retries: Number(alert.retries || 0),
    status: alert.status || 'pending_retry',
    userName: alert.userName || null,
    source: alert.source || null,
    detectedAt: Number(alert.detectedAt || 0) || null,
    nextRetryAt: Number(alert.nextRetryAt || 0),
    lastError: alert.lastError || null,
  };
}

async function loadQueueFromStorage() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      pendingAlertsCache = [];
      return pendingAlertsCache;
    }

    const parsed = JSON.parse(raw);
    pendingAlertsCache = Array.isArray(parsed) ? parsed.map(cloneAlert) : [];
    return pendingAlertsCache;
  } catch (error) {
    logger.error(TAG, 'Failed loading retry queue:', error?.message || error);
    pendingAlertsCache = [];
    return pendingAlertsCache;
  }
}

async function persistQueue() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pendingAlertsCache));
  } catch (error) {
    logger.error(TAG, 'Failed persisting retry queue:', error?.message || error);
  }
}

function ensureTimer() {
  if (retryTimer) return;
  retryTimer = setInterval(() => {
    retryPendingAlertsNow('interval').catch((err) => {
      logger.error(TAG, 'Interval retry failed:', err?.message || err);
    });
  }, RETRY_INTERVAL_MS);
}

function clearTimer() {
  if (!retryTimer) return;
  clearInterval(retryTimer);
  retryTimer = null;
}

export async function enqueuePendingAlert(alert) {
  if (!alert?.alertId || !alert?.userId || !alert?.location) {
    throw new Error('alertId, userId, and location are required for retry queue');
  }

  if (!initialized) {
    await loadQueueFromStorage();
  }

  const existingIndex = pendingAlertsCache.findIndex((item) => item.alertId === alert.alertId);
  const nowTs = Date.now();
  const next = {
    ...cloneAlert(alert),
    retries: Number(alert.retries || 0),
    status: 'pending_retry',
    timestamp: alert.timestamp || nowTs,
    nextRetryAt: Number(alert.nextRetryAt || nowTs),
  };

  if (existingIndex >= 0) {
    pendingAlertsCache[existingIndex] = {
      ...pendingAlertsCache[existingIndex],
      ...next,
      retries: Math.min(pendingAlertsCache[existingIndex].retries, next.retries),
      nextRetryAt: Math.min(
        pendingAlertsCache[existingIndex].nextRetryAt || nowTs,
        next.nextRetryAt
      ),
    };
  } else {
    pendingAlertsCache.push(next);
  }

  await persistQueue();
  logger.warn(TAG, 'Queued alert for retry', {
    alertId: next.alertId,
    retries: next.retries,
    queueSize: pendingAlertsCache.length,
  });

  ensureTimer();
  return next;
}

async function removeAlertFromQueue(alertId) {
  const before = pendingAlertsCache.length;
  pendingAlertsCache = pendingAlertsCache.filter((item) => item.alertId !== alertId);
  if (pendingAlertsCache.length !== before) {
    await persistQueue();
    if (pendingAlertsCache.length === 0) {
      clearTimer();
    }
  }
}

async function updateAlertInQueue(updatedItem) {
  const idx = pendingAlertsCache.findIndex((item) => item.alertId === updatedItem.alertId);
  if (idx < 0) return;
  pendingAlertsCache[idx] = updatedItem;
  await persistQueue();
}

export async function getPendingAlerts() {
  if (!initialized) {
    await loadQueueFromStorage();
    initialized = true;
  }
  return [...pendingAlertsCache];
}

export async function retryPendingAlertsNow(reason = 'manual') {
  if (!initialized) {
    await loadQueueFromStorage();
    initialized = true;
  }

  if (!sendAlertHandler) {
    logger.warn(TAG, 'Retry attempted without sendAlert handler');
    return { retried: 0, delivered: 0, failed: 0 };
  }

  if (isRetryInProgress) {
    return { retried: 0, delivered: 0, failed: 0, skipped: true };
  }

  const netState = await NetInfo.fetch();
  const online = netState.isConnected && netState.isInternetReachable !== false;
  if (!online) {
    logger.debug(TAG, 'Skipping retry while offline');
    return { retried: 0, delivered: 0, failed: 0, offline: true };
  }

  isRetryInProgress = true;
  const nowTs = Date.now();
  let retried = 0;
  let delivered = 0;
  let failed = 0;

  try {
    const dueItems = pendingAlertsCache.filter((item) => (item.nextRetryAt || 0) <= nowTs);
    if (dueItems.length === 0) {
      if (pendingAlertsCache.length === 0) {
        clearTimer();
      }
      return { retried, delivered, failed, idle: true };
    }

    logger.info(TAG, 'Processing retry batch', {
      reason,
      dueItems: dueItems.length,
      queueSize: pendingAlertsCache.length,
    });

    for (const item of dueItems) {
      retried += 1;
      try {
        await sendAlertHandler(item);

        await removeAlertFromQueue(item.alertId);
        delivered += 1;

        logger.info(TAG, 'Retry success', {
          alertId: item.alertId,
          retries: item.retries,
        });
      } catch (error) {
        const nextRetries = Number(item.retries || 0) + 1;
        const updated = {
          ...item,
          retries: nextRetries,
          lastError: error?.message || String(error),
          nextRetryAt: Date.now() + calculateRetryDelayMs(nextRetries),
          status: 'pending_retry',
        };

        if (nextRetries >= MAX_RETRIES) {
          await removeAlertFromQueue(item.alertId);
          failed += 1;

          logger.error(TAG, 'Max retries reached; triggering backup flow', {
            alertId: item.alertId,
            retries: nextRetries,
          });

          if (maxRetryHandler) {
            try {
              await maxRetryHandler(updated);
            } catch (fallbackErr) {
              logger.error(TAG, 'Backup flow failed:', fallbackErr?.message || fallbackErr);
            }
          }
          continue;
        }

        await updateAlertInQueue(updated);
        failed += 1;

        logger.warn(TAG, 'Retry failed; scheduled next attempt', {
          alertId: item.alertId,
          retries: nextRetries,
          nextRetryAt: updated.nextRetryAt,
        });
      }
    }

    return { retried, delivered, failed };
  } finally {
    isRetryInProgress = false;
  }
}

export async function initializeAlertRetryQueue({ onSendAlert, onMaxRetriesReached }) {
  sendAlertHandler = onSendAlert || null;
  maxRetryHandler = onMaxRetriesReached || null;

  if (!initialized) {
    await loadQueueFromStorage();
    initialized = true;
  }

  if (pendingAlertsCache.length > 0) {
    ensureTimer();
  }

  if (!networkUnsubscribe) {
    networkUnsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected && state.isInternetReachable !== false;
      if (online) {
        retryPendingAlertsNow('connectivity-restored').catch((err) => {
          logger.error(TAG, 'Connectivity-triggered retry failed:', err?.message || err);
        });
      }
    });
  }

  return {
    queueSize: pendingAlertsCache.length,
  };
}

export function shutdownAlertRetryQueue() {
  clearTimer();
  if (networkUnsubscribe) {
    networkUnsubscribe();
    networkUnsubscribe = null;
  }
}
