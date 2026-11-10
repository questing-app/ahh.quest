'use client'

import { useSyncExternalStore } from 'react'
import { isServerDown, onServerChange } from './api'

function onConnectionChange(listener: () => void) {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

/** False while the phone has no connection. Money actions wait for it. */
export function useOnline(): boolean {
  return useSyncExternalStore(onConnectionChange, () => navigator.onLine, () => true)
}

/** True while the phone is online but Quest itself isn't answering. */
export function useServerDown(): boolean {
  return useSyncExternalStore(onServerChange, isServerDown, () => false)
}
