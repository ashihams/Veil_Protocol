import { createRootRoute, Outlet } from '@tanstack/react-router';
import * as pino from 'pino';
import { ThemeProvider } from '@/components/theme-provider';
import { StealthAppProvider } from '@/modules/midnight/stealth-sdk/contexts';

export const logger = pino.pino({
  level: 'trace',
});

const stealthContractAddress =
  import.meta.env.VITE_STEALTH_CONTRACT_ADDRESS ??
  '0000000000000000000000000000000000000000000000000000000000000000';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <StealthAppProvider logger={logger} contractAddress={stealthContractAddress}>
        <Outlet />
      </StealthAppProvider>
    </ThemeProvider>
  );
}
