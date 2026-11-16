'use client';

import { createContext, useContext } from 'react';

/** The signed-in person's name, for friendly greetings. Empty when Google did not share one. */
export const UserNameContext = createContext('');

export function useUserName(): string {
  return useContext(UserNameContext);
}
