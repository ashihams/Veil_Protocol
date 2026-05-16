import { createRootRoute, Outlet } from '@tanstack/react-router';
import * as pino from 'pino';
import { ThemeProvider } from '@/components/theme-provider';
import { MidnightMeshProvider } from '@/modules/midnight/wallet-widget/contexts/wallet';
import { CounterAppProvider } from '@/modules/midnight/counter-sdk/contexts';
import { StealthAppProvider } from '@/modules/midnight/stealth-sdk/contexts';
import { MainLayout } from '@/layouts/layout';

export const logger = pino.pino({
  level: 'trace',
});

// Update this with your deployed contract address
const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS!;
const stealthContractAddress = import.meta.env.VITE_STEALTH_CONTRACT_ADDRESS ?? contractAddress;

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <MidnightMeshProvider logger={logger}>
        <CounterAppProvider logger={logger} contractAddress={contractAddress}>
          <StealthAppProvider logger={logger} contractAddress={stealthContractAddress}>
            <MainLayout>
              <Outlet />
            </MainLayout>
          </StealthAppProvider>
        </CounterAppProvider>
      </MidnightMeshProvider>
    </ThemeProvider>
  );
}
