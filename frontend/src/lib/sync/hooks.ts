"use client";

import { useSyncExternalStore } from "react";

import { INITIAL_STATUS, syncStatus } from "./manager";

export function useSyncStatus() {
  return useSyncExternalStore(syncStatus.subscribe, syncStatus.get, () => INITIAL_STATUS);
}
