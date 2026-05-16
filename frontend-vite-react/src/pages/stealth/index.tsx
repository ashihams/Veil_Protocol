import { useCallback, useEffect, useState } from 'react';
import {
  StealthKeyRegistry,
  deriveStealthAddress,
  generateStealthKeys,
  scanAnnouncements,
  type GeneratedStealthKeys,
  type ScannedPayment,
  type StealthAnnouncement,
} from '@eddalabs/stealth-contract';
import { Loading } from '@/components/loading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, KeyRound, RadioReceiver, CheckCircle2, Send, Shield } from 'lucide-react';
import { useStealthContractSubscription } from '@/modules/midnight/stealth-sdk/hooks/use-stealth-contract-subscription';

type Tab = 'setup' | 'send' | 'receive';

function bytePreview(bytes: Uint8Array, n = 6): string {
  return [...bytes.slice(0, n)].map((b) => b.toString(16).padStart(2, '0')).join('') + '…';
}

/** Umbra-style flow: separate viewing & spending keys, send via derived one-time address, receive by scanning. */
export function StealthApp() {
  const { deployedContractAPI, derivedState, onDeploy, providers } = useStealthContractSubscription();
  const [tab, setTab] = useState<Tab>('setup');
  const [keys, setKeys] = useState<GeneratedStealthKeys | null>(null);
  const [registry] = useState(() => new StealthKeyRegistry());
  /** Mock announcement log — must be React state so Receive tab re-renders after append. */
  const [announcementList, setAnnouncementList] = useState<StealthAnnouncement[]>([]);

  const [recvSpend, setRecvSpend] = useState('');
  const [recvView, setRecvView] = useState('');
  const [sendResult, setSendResult] = useState<ReturnType<typeof deriveStealthAddress> | null>(null);
  const [scanned, setScanned] = useState<ScannedPayment[]>([]);
  const [chainLoading, setChainLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);

  useEffect(() => {
    if (derivedState?.round !== undefined) setChainLoading(false);
  }, [derivedState?.round]);

  useEffect(() => {
    if (!toastMessage) return;
    const id = window.setTimeout(() => setToastMessage(null), 3500);
    return () => window.clearTimeout(id);
  }, [toastMessage]);

  const generate = useCallback(() => {
    const k = generateStealthKeys();
    setKeys(k);
    registry.registerKeys('self', { spendPub: k.spendPub, viewPub: k.viewPub });
    setRecvSpend(k.spendPub);
    setRecvView(k.viewPub);
  }, [registry]);

  const deriveSend = useCallback(() => {
    if (!recvSpend || !recvView) return;
    const derived = deriveStealthAddress({ spendPub: recvSpend as `0x${string}`, viewPub: recvView as `0x${string}` });
    setSendResult(derived);
  }, [recvSpend, recvView]);

  const recordPayment = useCallback(() => {
    if (!sendResult) return;
    const ann: StealthAnnouncement = {
      stealthAddress: sendResult.stealthAddress,
      R: sendResult.R,
      viewTag: sendResult.viewTag,
      ciphertext: sendResult.ciphertext,
      amount: 0n,
      tokenSymbol: 'NIGHT',
      agentId: 'demo',
      txId: `local-${Date.now()}`,
    };
    setAnnouncementList((prev) => {
      const next = [...prev, ann];
      setToastMessage(`Payment recorded · ${next.length} announcement${next.length === 1 ? '' : 's'} in queue`);
      return next;
    });
  }, [sendResult]);

  const runScan = useCallback(() => {
    if (!keys) return;
    const hits = scanAnnouncements(announcementList, keys.viewPriv, keys.spendPub, keys.spendPriv);
    setScanned(hits);
    setHasScanned(true);
  }, [keys, announcementList]);

  const deployNew = async () => {
    await onDeploy();
  };

  const increment = async () => {
    if (deployedContractAPI) await deployedContractAPI.increment();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#12051f] via-[#1a0a2e] to-[#0f0620] text-zinc-100">
      <div className="border-b border-violet-500/20 bg-black/20 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Shield className="h-8 w-8 text-violet-400" aria-hidden />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Stealth Pay</h1>
            <p className="text-sm text-violet-200/80">One-time addresses · Midnight shielded ledger demo</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex gap-2 flex-wrap">
          {(
            [
              ['setup', 'Setup keys', KeyRound],
              ['send', 'Send', Send],
              ['receive', 'Receive', RadioReceiver],
            ] as const
          ).map(([id, label, Icon]) => (
            <Button
              key={id}
              variant={tab === id ? 'default' : 'outline'}
              className={
                tab === id
                  ? 'bg-violet-600 hover:bg-violet-500 text-white'
                  : 'border-violet-500/40 text-violet-100 hover:bg-violet-950/50'
              }
              onClick={() => setTab(id)}
            >
              <Icon className="h-4 w-4 mr-2" />
              {label}
            </Button>
          ))}
        </div>

        {tab === 'setup' && (
          <Card className="border-violet-500/25 bg-zinc-900/50 text-zinc-100">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-violet-400" />
                Your stealth keys
              </CardTitle>
              <CardDescription className="text-violet-200/70">
                Spending key signs funds; viewing key scans incoming payments (dual-key stealth).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={generate} className="bg-violet-600 hover:bg-violet-500">
                Generate new keypair
              </Button>
              {keys && (
                <div className="space-y-2 font-mono text-xs break-all">
                  <p>
                    <span className="text-violet-300">P_spend </span>
                    {keys.spendPub}
                  </p>
                  <p>
                    <span className="text-violet-300">P_view </span>
                    {keys.viewPub}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === 'send' && (
          <Card className="border-violet-500/25 bg-zinc-900/50 text-zinc-100">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Send className="h-5 w-5 text-violet-400" />
                Send to stealth address
              </CardTitle>
              <CardDescription className="text-violet-200/70">
                Paste recipient compressed public keys — a one-time address is derived locally.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="block text-sm text-violet-200/80">Recipient P_spend (hex)</label>
              <textarea
                className="w-full min-h-[72px] rounded-md bg-black/40 border border-violet-500/30 p-2 text-sm"
                value={recvSpend}
                onChange={(e) => setRecvSpend(e.target.value)}
              />
              <label className="block text-sm text-violet-200/80">Recipient P_view (hex)</label>
              <textarea
                className="w-full min-h-[72px] rounded-md bg-black/40 border border-violet-500/30 p-2 text-sm"
                value={recvView}
                onChange={(e) => setRecvView(e.target.value)}
              />
              <div className="flex gap-2 flex-wrap">
                <Button onClick={deriveSend} className="bg-violet-600 hover:bg-violet-500">
                  Derive stealth address
                </Button>
                <Button
                  variant="secondary"
                  onClick={recordPayment}
                  disabled={!sendResult}
                  className="bg-violet-950 text-violet-100 border border-violet-500/40"
                >
                  Record mock payment
                </Button>
              </div>
              <p className="text-sm text-violet-200/90">
                Mock announcement queue:{' '}
                <span className="font-semibold text-white tabular-nums">{announcementList.length}</span>
              </p>
              {sendResult && (
                <div className="rounded-lg bg-black/30 p-3 text-xs font-mono space-y-1 break-all">
                  <p>
                    <span className="text-violet-300">Stealth address </span>
                    {sendResult.stealthAddress}
                  </p>
                  <p>
                    <span className="text-violet-300">R </span>
                    {sendResult.R}
                  </p>
                  <p>
                    <span className="text-violet-300">View tag </span>
                    {sendResult.viewTag}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === 'receive' && (
          <Card className="border-violet-500/25 bg-zinc-900/50 text-zinc-100">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Eye className="h-5 w-5 text-violet-400" />
                Scan for payments
              </CardTitle>
              <CardDescription className="text-violet-200/70">
                Uses your viewing key + spending key to detect announcements intended for you.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!keys ? (
                <p className="text-violet-200/80 text-sm">Generate keys in Setup first.</p>
              ) : (
                <>
                  <p className="text-sm text-violet-200/80">
                    Announcements in mock store: {announcementList.length}
                  </p>
                  <Button onClick={runScan} className="bg-violet-600 hover:bg-violet-500">
                    Scan now
                  </Button>
                  {hasScanned && scanned.length === 0 && announcementList.length > 0 && (
                    <p className="text-sm text-amber-100/90 rounded-lg bg-amber-950/35 border border-amber-500/25 p-3">
                      No announcements matched your keys. Derive and record a payment using the same keys from Setup,
                      then scan again.
                    </p>
                  )}
                  {hasScanned && announcementList.length === 0 && (
                    <p className="text-sm text-violet-200/70">Queue is empty. Record a mock payment on Send.</p>
                  )}
                  {scanned.length > 0 && (
                    <ul className="space-y-3">
                      {scanned.map((hit, i) => (
                        <li
                          key={`${hit.announcement.txId}-${i}`}
                          className="rounded-lg border border-emerald-500/25 bg-emerald-950/20 p-4 space-y-3"
                        >
                          <p className="text-sm font-medium text-emerald-100">Incoming match #{i + 1}</p>
                          <ul className="space-y-2 text-sm">
                            <li className="flex gap-2 items-start">
                              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden />
                              <span>
                                <span className="text-violet-200/80">Matched payment · </span>
                                {hit.announcement.tokenSymbol} {String(hit.announcement.amount)} · tx{' '}
                                <span className="font-mono text-xs break-all">{hit.announcement.txId}</span>
                              </span>
                            </li>
                            <li className="flex gap-2 items-start">
                              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden />
                              <span>
                                <span className="text-violet-200/80">View tag matched · </span>
                                <span className="font-mono">{hit.announcement.viewTag}</span>
                              </span>
                            </li>
                            <li className="flex gap-2 items-start">
                              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden />
                              <span>
                                <span className="text-violet-200/80">Ownership verified · </span>
                                stealth address derived from your keys matches the announcement
                              </span>
                            </li>
                            <li className="flex gap-2 items-start">
                              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden />
                              <span>
                                <span className="text-violet-200/80">Stealth recovery successful · </span>
                                one-time spending secret{' '}
                                <span className="font-mono text-xs">{bytePreview(hit.stealthPriv)}</span>
                              </span>
                            </li>
                          </ul>
                          <p className="text-xs font-mono text-violet-300/80 break-all pt-2 border-t border-white/10">
                            {hit.announcement.stealthAddress}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border-violet-500/25 bg-zinc-900/50 text-zinc-100">
          <CardHeader>
            <CardTitle className="text-white">Midnight ledger (template parity)</CardTitle>
            <CardDescription className="text-violet-200/70">
              Same deploy / prove flow as Counter — separate keys under <code className="text-violet-300">/midnight/stealth</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 relative">
            {chainLoading && <Loading />}
            <div className="flex flex-wrap gap-2">
              <Button onClick={deployNew} className="bg-violet-600 hover:bg-violet-500">
                Deploy stealth contract
              </Button>
              <Button
                onClick={increment}
                disabled={!deployedContractAPI}
                variant="secondary"
                className="border border-violet-500/40"
              >
                Increment on-chain demo
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-black/30 p-3">
                <p className="text-violet-300 text-xs mb-1">Ledger round</p>
                <p className="font-mono">{String(derivedState?.round ?? '—')}</p>
              </div>
              <div className="rounded-lg bg-black/30 p-3">
                <p className="text-violet-300 text-xs mb-1">Private counter (witness)</p>
                <p className="font-mono">{derivedState?.privateState?.privateCounter ?? '—'}</p>
              </div>
            </div>
            {providers?.flowMessage && (
              <p className="text-sm text-violet-200">{providers.flowMessage}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {toastMessage && (
        <div
          className="fixed bottom-6 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-lg border border-emerald-500/40 bg-emerald-950/95 px-4 py-3 text-sm text-emerald-50 shadow-lg shadow-black/40"
          role="status"
          aria-live="polite"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
