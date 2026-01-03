'use client';

import { ReactNode } from 'react';
import { AuthContextProvider } from '@/context/AuthContext';

interface AuthWrapperProps {
  children: ReactNode;
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  return <AuthContextProvider>{children}</AuthContextProvider>;
}
