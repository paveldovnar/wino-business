'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getBusiness } from '@/lib/storage';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const business = getBusiness();
    if (business) {
      router.replace('/dashboard');
    } else {
      router.replace('/welcome');
    }
  }, [router]);

  return null;
}
