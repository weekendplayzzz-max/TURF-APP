'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function DashboardRouter() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    console.log('Dashboard router - checking role:', role);

    if (!user) {
      router.push('/login');
      return;
    }

    // Route based on role
    switch (role) {
      case 'superadmin':
        console.log('Routing to superadmin');
        router.push('/superadmin');
        break;
      case 'treasurer':
        console.log('Routing to treasurer');
        router.push('/treasurer');
        break;
      case 'secretary':
        console.log('Routing to secretary');
        router.push('/secretary');
        break;
      case 'player':
        console.log('Routing to player');
        router.push('/player');
        break;
      default:
        console.log('Unknown role, routing to login');
        router.push('/login');
    }
  }, [user, role, loading, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <p className="text-gray-600">Redirecting to your dashboard...</p>
    </div>
  );
}
