import { writable } from 'svelte/store';

export const currentUser = writable(null);

/** Count of open modals — used to suppress Escape handling in parent layouts */
export const modalCount = writable(0);
