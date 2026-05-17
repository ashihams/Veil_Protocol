import { createFileRoute } from '@tanstack/react-router';
import { StealthApp } from '@/pages/stealth';

export const Route = createFileRoute('/')({
  component: StealthApp,
});
