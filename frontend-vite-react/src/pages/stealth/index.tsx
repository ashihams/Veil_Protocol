import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildX402PaymentHeader,
  createPaymentAuthorization,
  createStealthAnnouncementForX402,
} from '@eddalabs/stealth-contract/bridge';
import type { PaymentRequired, SettlementResponse, TaskRequest, TaskResponse } from '@agent-server/types';
import {
  deriveCompactStealthAddress,
  generateCompactStealthKeys,
  scanCompactAnnouncements,
  type CompactScannedPayment,
  type CompactStealthAnnouncement,
} from '@eddalabs/stealth-contract';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Copy,
  CreditCard,
  KeyRound,
  Lock,
  Radar,
  RefreshCw,
  Server,
  Shield,
  Sparkles,
} from 'lucide-react';

const AGENT_SERVER = import.meta.env.VITE_AGENT_SERVER_URL ?? 'http://localhost:3402';
const X402_SECRET = import.meta.env.VITE_X402_SECRET ?? 'midnight-demo-secret';

const TASK_DEFAULT: TaskRequest = { op: 'add', a: 42, b: 58 };

/** Preview defaults — override with VITE_* in `.env` / Vercel (see `scripts/deployments.json`). */
const ONCHAIN_CONTRACTS = {
  stealthKeyRegistry:
    import.meta.env.VITE_STEALTH_KEY_REGISTRY_ADDRESS ??
    '05fdff7371c9f498f2b3a3953606b1c3f6d8dfbddefd0948c25134a52efb6fd4',
  stealthSend:
    import.meta.env.VITE_STEALTH_SEND_ADDRESS ??
    'eb2c89ce96c09b5ebe5164d430675991185a8b8ee79df0449df476f485f8528b',
  announcementLog:
    import.meta.env.VITE_ANNOUNCEMENT_LOG_ADDRESS ??
    'a10237a50fc0e285601189ca3e8ac163da91e0d98642ff823a6012d1ea0e67bf',
} as const;

type FlowStatus = 'idle' | 'payment_required' | 'complete' | 'error';

type StealthKeys = ReturnType<typeof generateCompactStealthKeys>;

function truncateKey(hex: string, head = 10, tail = 8): string {
  if (!hex || hex.length <= head + tail + 2) return hex;
  const h = hex.startsWith('0x') ? hex : `0x${hex}`;
  return `${h.slice(0, 2 + head)}…${h.slice(-tail)}`;
}

async function copyText(label: string, text: string, onDone: (msg: string) => void): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    onDone(`${label} copied`);
  } catch {
    onDone('Copy failed');
  }
}

function parseSettlementHeader(b64: string | null): SettlementResponse | null {
  if (!b64) return null;
  try {
    let raw: string;
    if (typeof Buffer !== 'undefined') {
      raw = Buffer.from(b64, 'base64').toString('utf8');
    } else {
      raw = decodeURIComponent(escape(atob(b64)));
    }
    return JSON.parse(raw) as SettlementResponse;
  } catch {
    return null;
  }
}

export function StealthApp() {
  const [buyerKeys, setBuyerKeys] = useState<StealthKeys | null>(null);
  const [sellerKeys, setSellerKeys] = useState<StealthKeys | null>(null);

  const [task] = useState<TaskRequest>(TASK_DEFAULT);
  const [challenge, setChallenge] = useState<PaymentRequired | null>(null);
  const [flowStatus, setFlowStatus] = useState<FlowStatus>('idle');
  const [busy, setBusy] = useState<'request' | 'pay' | 'scan' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [derived, setDerived] = useState<ReturnType<typeof deriveCompactStealthAddress> | null>(null);
  const [announcements, setAnnouncements] = useState<CompactStealthAnnouncement[]>([]);
  const [taskResult, setTaskResult] = useState<TaskResponse | null>(null);
  const [settlement, setSettlement] = useState<SettlementResponse | null>(null);
  const [scanHits, setScanHits] = useState<CompactScannedPayment[]>([]);
  const [hasScanned, setHasScanned] = useState(false);
  const [auditorDisclosed, setAuditorDisclosed] = useState(false);
  const [onchainOpen, setOnchainOpen] = useState(false);

  useEffect(() => {
    setBuyerKeys(generateCompactStealthKeys());
    setSellerKeys(generateCompactStealthKeys());
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  const sellerPublic = useMemo(() => {
    if (!sellerKeys) return null;
    return {
      spendingPublicKey: sellerKeys.spendingPublicKey,
      viewingPublicKey: sellerKeys.viewingPublicKey,
    };
  }, [sellerKeys]);

  const walkthroughStep = useMemo(() => {
    if (!buyerKeys || !sellerKeys) return 0;
    let s = 1;
    if (challenge || flowStatus === 'payment_required' || flowStatus === 'complete' || flowStatus === 'error') {
      s = Math.max(s, 2);
    }
    if (challenge || flowStatus === 'payment_required') s = Math.max(s, 3);
    if (flowStatus === 'complete') s = Math.max(s, 4);
    if (hasScanned) s = Math.max(s, 5);
    if (hasScanned && flowStatus === 'complete') s = Math.max(s, 6);
    return s;
  }, [buyerKeys, sellerKeys, challenge, flowStatus, hasScanned]);

  const regenerateBuyer = useCallback(() => {
    setBuyerKeys(generateCompactStealthKeys());
    setToast('Buyer keys regenerated');
  }, []);

  const requestTask = useCallback(async () => {
    setError(null);
    setBusy('request');
    setChallenge(null);
    setDerived(null);
    setTaskResult(null);
    setSettlement(null);
    setFlowStatus('idle');
    try {
      const url = `${AGENT_SERVER.replace(/\/$/, '')}/task`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
      if (res.status !== 402) {
        const t = await res.text();
        throw new Error(`Expected HTTP 402, got ${res.status}: ${t.slice(0, 120)}`);
      }
      const body = (await res.json()) as PaymentRequired;
      if (body.x402Version !== 2 || !body.accepts?.[0]) {
        throw new Error('Invalid PaymentRequired payload');
      }
      setChallenge(body);
      setFlowStatus('payment_required');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request failed';
      setError(msg);
      setFlowStatus('error');
    } finally {
      setBusy(null);
    }
  }, [task]);

  const payWithStealth = useCallback(async () => {
    if (!challenge || !sellerPublic) return;
    setError(null);
    setBusy('pay');
    try {
      const { stealthResult, announcement } = createStealthAnnouncementForX402(sellerPublic, challenge);
      setDerived(stealthResult);
      setAnnouncements((prev) => [...prev, announcement]);

      const auth = createPaymentAuthorization(task, challenge);
      const secretBytes = new TextEncoder().encode(X402_SECRET);
      const paymentHeader = buildX402PaymentHeader(auth, secretBytes, challenge);

      const url = `${AGENT_SERVER.replace(/\/$/, '')}/task`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Payment-Signature': paymentHeader,
        },
        body: JSON.stringify(task),
      });

      if (res.status !== 200) {
        const t = await res.text();
        throw new Error(`Payment rejected ${res.status}: ${t.slice(0, 160)}`);
      }

      const resultJson = (await res.json()) as TaskResponse;
      setTaskResult(resultJson);
      const settle = parseSettlementHeader(res.headers.get('x-payment-response'));
      setSettlement(settle);
      setFlowStatus('complete');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Payment failed';
      setError(msg);
      setFlowStatus('error');
    } finally {
      setBusy(null);
    }
  }, [challenge, sellerPublic, task]);

  const runScan = useCallback(() => {
    if (!sellerKeys) return;
    setBusy('scan');
    setHasScanned(true);
    const hits = scanCompactAnnouncements(
      announcements,
      sellerKeys.viewingPrivateKey,
      sellerKeys.spendingPublicKey,
      sellerKeys.spendingPrivateKey,
    );
    setScanHits(hits);
    setBusy(null);
  }, [sellerKeys, announcements]);

  const challengeMeta = challenge?.accepts[0];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a1628] via-[#120a22] to-[#06030f] text-zinc-100">
      <header className="border-b border-violet-500/20 bg-[#0a1628]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-5 flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-600/20 p-2 border border-violet-400/30">
              <Shield className="h-8 w-8 text-violet-300" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">Veil Protocol</h1>
              <p className="text-sm text-violet-200/75 font-medium">
                Stealth × x402 — client-side DKSAP + agent-server payment challenge (Midnight Preview)
              </p>
            </div>
          </div>
          <div className="text-xs font-mono text-violet-300/80 rounded-lg border border-violet-500/25 bg-black/30 px-3 py-2">
            <span className="text-zinc-500">agent-server </span>
            {AGENT_SERVER}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {error && (
          <div
            className="rounded-xl border border-red-500/40 bg-red-950/50 px-4 py-3 text-sm text-red-100"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* LEFT — Agent A (Buyer) */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-violet-300">
              <CreditCard className="h-5 w-5" />
              <h2 className="text-lg font-semibold text-white">Agent A (Buyer)</h2>
            </div>

            <Card className="border-violet-500/20 bg-[#121826]/90 backdrop-blur-sm rounded-2xl shadow-lg shadow-black/40">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2 text-base">
                  <KeyRound className="h-4 w-4 text-violet-400" />
                  My Stealth Keys
                </CardTitle>
                <CardDescription className="text-violet-200/60">
                  Buyer identity keys (compact curve); public keys are safe to share.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={regenerateBuyer}
                  className="border-violet-500/35 text-violet-100 hover:bg-violet-950/50"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate Keys
                </Button>
                {buyerKeys && (
                  <div className="space-y-3">
                    <KeyRow
                      label="Spending public"
                      value={buyerKeys.spendingPublicKey}
                      onCopy={(v) => void copyText('Spending pubkey', v, setToast)}
                    />
                    <KeyRow
                      label="Viewing public"
                      value={buyerKeys.viewingPublicKey}
                      onCopy={(v) => void copyText('Viewing pubkey', v, setToast)}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-violet-500/20 bg-[#121826]/90 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2 text-base">
                  <Server className="h-4 w-4 text-amber-400" />
                  Request Paid Service
                </CardTitle>
                <CardDescription className="text-violet-200/60">
                  POST /task with no payment header — expect HTTP 402 + challenge.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <pre className="rounded-lg bg-black/40 border border-violet-500/20 p-3 text-xs font-mono text-emerald-200/90 overflow-x-auto">
                  {JSON.stringify(task, null, 2)}
                </pre>
                <Button
                  onClick={() => void requestTask()}
                  disabled={busy !== null}
                  className="w-full sm:w-auto bg-amber-600 hover:bg-amber-500 text-white"
                >
                  {busy === 'request' ? 'Requesting…' : 'Request Task'}
                </Button>

                {challenge && challengeMeta && (
                  <div className="rounded-xl border border-amber-500/35 bg-amber-950/25 p-4 space-y-2 text-sm">
                    <p className="text-amber-200 font-medium flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      HTTP 402 challenge
                    </p>
                    <ul className="font-mono text-xs text-amber-100/90 space-y-1">
                      <li>
                        <span className="text-amber-400/80">scheme</span> {challengeMeta.scheme}
                      </li>
                      <li>
                        <span className="text-amber-400/80">network</span> {challengeMeta.network}
                      </li>
                      <li>
                        <span className="text-amber-400/80">amount</span> {challengeMeta.amount} {challengeMeta.asset}{' '}
                        <span className="text-amber-500/70">(atomic)</span>
                      </li>
                      <li className="break-all">
                        <span className="text-amber-400/80">payTo</span> {challengeMeta.payTo}
                      </li>
                    </ul>
                  </div>
                )}

                <StatusPill
                  variant={flowStatus === 'payment_required' ? 'amber' : flowStatus === 'complete' ? 'green' : 'muted'}
                  label={
                    flowStatus === 'payment_required'
                      ? '⚡ Payment Required'
                      : flowStatus === 'complete'
                        ? '✅ Payment Complete'
                        : flowStatus === 'error'
                          ? 'Error'
                          : 'Waiting for request'
                  }
                />
              </CardContent>
            </Card>

            <Card className="border-emerald-500/25 bg-[#121826]/90 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2 text-base">
                  <Lock className="h-4 w-4 text-emerald-400" />
                  Pay Privately via Stealth
                </CardTitle>
                <CardDescription className="text-violet-200/60">
                  Derive a one-time address for <strong className="text-violet-200">Agent B</strong> public keys, record
                  the announcement, then sign x402 with HMAC (<code className="text-violet-300">midnight-hmac</code>).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  onClick={() => void payWithStealth()}
                  disabled={!challenge || busy !== null || !sellerPublic}
                  className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40"
                >
                  {busy === 'pay' ? 'Paying…' : 'Derive Stealth Address & Pay'}
                </Button>

                {derived && (
                  <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-4 space-y-2 text-xs font-mono text-emerald-100/90 break-all">
                    <Row label="Stealth address" value={derived.stealthAddress} />
                    <Row label="Ephemeral R" value={derived.ephemeralPublicKey} />
                    <Row label="View tag" value={String(derived.viewTag)} />
                  </div>
                )}

                {taskResult && (
                  <div className="rounded-xl border border-emerald-500/30 bg-black/35 p-4 space-y-1 text-sm">
                    <p className="text-emerald-300 font-medium">Task result</p>
                    <p className="font-mono text-white text-lg">
                      {task.a} + {task.b} = <span className="text-emerald-400">{taskResult.result}</span>
                    </p>
                    <p className="text-xs text-violet-300/80">
                      agentId: <span className="font-mono">{taskResult.agentId}</span>
                    </p>
                    {settlement && (
                      <p className="text-xs text-violet-200/80 pt-2 border-t border-white/10 mt-2">
                        Settlement tx:{' '}
                        <span className="font-mono text-amber-200/90">{settlement.transaction}</span>
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT — Agent B (Seller) */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-sky-300">
              <Bot className="h-5 w-5" />
              <h2 className="text-lg font-semibold text-white">Agent B (Seller / Scanner)</h2>
            </div>

            <Card className="border-sky-500/25 bg-[#121826]/90 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-white text-base">Agent B Profile</CardTitle>
                <CardDescription className="text-violet-200/60">
                  <span className="text-sky-300 font-semibold">ComputeBot</span> — service provider stealth keys
                  (auto-generated).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {sellerKeys && (
                  <>
                    <KeyRow
                      label="Spending public"
                      value={sellerKeys.spendingPublicKey}
                      onCopy={(v) => void copyText('Seller spend pub', v, setToast)}
                    />
                    <KeyRow
                      label="Viewing public"
                      value={sellerKeys.viewingPublicKey}
                      onCopy={(v) => void copyText('Seller view pub', v, setToast)}
                    />
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-sky-500/25 bg-[#121826]/90 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2 text-base">
                  <Radar className="h-4 w-4 text-sky-400" />
                  Scan for Incoming Payments
                </CardTitle>
                <CardDescription className="text-violet-200/60">
                  Scan announcements in local demo state with Agent B viewing + spending secrets.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-sky-200/70">
                  Announcements in memory:{' '}
                  <span className="font-mono tabular-nums text-white">{announcements.length}</span>
                </p>
                <Button
                  onClick={runScan}
                  disabled={!sellerKeys || announcements.length === 0 || busy !== null}
                  className="bg-sky-600 hover:bg-sky-500 text-white"
                >
                  {busy === 'scan' ? 'Scanning…' : 'Scan Announcements'}
                </Button>

                {hasScanned && (
                  <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-4 text-sm space-y-2">
                    {scanHits.length > 0 ? (
                      <>
                        <p className="text-sky-300 font-medium flex items-center gap-2">
                          <span className="text-lg">✅</span> Matched — derived stealth private key
                        </p>
                        {scanHits.map((hit, i) => (
                          <div key={`${hit.stealthAddress}-${i}`} className="text-xs font-mono text-sky-100/90 break-all space-y-1">
                            <p>
                              stealth priv: {truncateKey(hit.stealthPrivateKey, 8, 6)}
                            </p>
                            <p className="text-sky-400/80">{hit.stealthAddress}</p>
                          </div>
                        ))}
                      </>
                    ) : (
                      <p className="text-rose-300/90 flex items-center gap-2">
                        <span className="text-lg">❌</span> No announcement matched these keys (yet).
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-violet-500/20 bg-[#121826]/90 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-white text-base">Privacy Dashboard — Selective Disclosure</CardTitle>
                <CardDescription className="text-violet-200/60">
                  Three views of the same payment: public rail metadata, receiver-only stealth data, optional auditor.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="rounded-xl border border-zinc-600/40 bg-black/30 p-4 space-y-2 min-h-[180px]">
                    <p className="text-sm font-semibold text-zinc-300 flex items-center gap-1">🌍 Public</p>
                    <hr className="border-zinc-700" />
                    <p className="text-zinc-200">
                      Payment occurred {flowStatus === 'complete' ? '✓' : '—'}
                    </p>
                    <p>
                      <span className="text-zinc-500">Scheme</span>{' '}
                      <span className="font-mono text-violet-200">{challengeMeta?.scheme ?? '—'}</span>
                    </p>
                    <p>
                      <span className="text-zinc-500">Network</span>{' '}
                      <span className="font-mono text-violet-200">preview</span>
                    </p>
                  </div>

                  <div className="rounded-xl border border-violet-500/30 bg-violet-950/15 p-4 space-y-2 min-h-[180px]">
                    <p className="text-sm font-semibold text-violet-200 flex items-center gap-1">🔑 Receiver</p>
                    <hr className="border-violet-500/20" />
                    <p>
                      <span className="text-violet-400/80">Amount</span>{' '}
                      <span className="font-mono text-white">
                        {challengeMeta ? `${challengeMeta.amount} ${challengeMeta.asset}` : '—'}{' '}
                      </span>
                      <span className="text-violet-500/70">atomic</span>
                    </p>
                    <p className="break-all">
                      <span className="text-violet-400/80">Stealth</span>{' '}
                      <span className="font-mono text-violet-100">
                        {derived ? truncateKey(derived.stealthAddress, 14, 10) : '—'}
                      </span>
                    </p>
                    <p className="break-all">
                      <span className="text-violet-400/80">Ephemeral R</span>{' '}
                      <span className="font-mono text-violet-100">
                        {derived ? truncateKey(derived.ephemeralPublicKey, 10, 8) : '—'}
                      </span>
                    </p>
                    <p className="break-all">
                      <span className="text-violet-400/80">Settlement</span>{' '}
                      <span className="font-mono text-amber-200/90">
                        {settlement ? truncateKey(settlement.transaction, 12, 10) : '—'}
                      </span>
                    </p>
                  </div>

                  <div className="rounded-xl border border-amber-500/25 bg-amber-950/10 p-4 space-y-2 min-h-[180px]">
                    <p className="text-sm font-semibold text-amber-200 flex items-center gap-1">🔍 Auditor</p>
                    <hr className="border-amber-500/20" />
                    <label className="flex items-center gap-2 cursor-pointer text-amber-100/90">
                      <input
                        type="checkbox"
                        checked={auditorDisclosed}
                        onChange={(e) => setAuditorDisclosed(e.target.checked)}
                        className="rounded border-amber-500/50"
                      />
                      Disclose payment amount to auditor (demo)
                    </label>
                    <p className="font-mono text-amber-100/80 pt-1">
                      Amount:{' '}
                      {auditorDisclosed && challengeMeta
                        ? `${challengeMeta.amount} ${challengeMeta.asset} (atomic)`
                        : auditorDisclosed
                          ? '—'
                          : '(hidden)'}
                    </p>
                    {auditorDisclosed && derived && (
                      <p className="text-amber-300/70 break-all">Stealth (disclosed): {derived.stealthAddress}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="rounded-2xl border border-violet-500/20 bg-[#0c101c] overflow-hidden">
              <button
                type="button"
                onClick={() => setOnchainOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-violet-200 hover:bg-violet-950/30"
              >
                <span>On-Chain Info (deployed contracts)</span>
                {onchainOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {onchainOpen && (
                <div className="px-4 pb-4 space-y-3 text-[11px] font-mono text-violet-200/85 border-t border-violet-500/15 pt-3">
                  <ContractRow label="StealthKeyRegistry" id={ONCHAIN_CONTRACTS.stealthKeyRegistry} />
                  <ContractRow label="StealthSend" id={ONCHAIN_CONTRACTS.stealthSend} />
                  <ContractRow label="AnnouncementLog" id={ONCHAIN_CONTRACTS.announcementLog} />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Bottom walkthrough */}
      <footer className="sticky bottom-0 z-40 border-t border-violet-500/25 bg-[#0a1628]/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <p className="text-[10px] uppercase tracking-wider text-violet-400/70 mb-2 font-semibold">Demo walkthrough</p>
          <div className="flex flex-wrap gap-2 md:gap-3 justify-center md:justify-between">
            {(
              [
                [1, 'Generate Keys'],
                [2, 'Request Service'],
                [3, 'Get 402'],
                [4, 'Stealth Pay'],
                [5, 'Scan'],
                [6, 'Privacy View'],
              ] as const
            ).map(([n, label]) => {
              const active = walkthroughStep >= n;
              return (
                <div
                  key={n}
                  className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                    active
                      ? 'border-violet-400/60 bg-violet-600/25 text-white'
                      : 'border-zinc-700/60 bg-black/30 text-zinc-500'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                      active ? 'bg-violet-500 text-white' : 'bg-zinc-800 text-zinc-500'
                    }`}
                  >
                    {n}
                  </span>
                  {label}
                </div>
              );
            })}
          </div>
        </div>
      </footer>

      {toast && (
        <div
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-emerald-500/40 bg-emerald-950/95 px-4 py-2 text-sm text-emerald-50 shadow-lg"
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function KeyRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (v: string) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg bg-black/35 border border-violet-500/15 px-3 py-2">
      <span className="text-[10px] uppercase tracking-wide text-violet-400/80 shrink-0 w-36">{label}</span>
      <span className="font-mono text-[11px] text-violet-100/90 break-all flex-1">{truncateKey(value, 12, 10)}</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="shrink-0 h-8 text-violet-300 hover:text-white"
        onClick={() => onCopy(value)}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-emerald-400/80 mr-2">{label}</span>
      {value}
    </p>
  );
}

function StatusPill({ variant, label }: { variant: 'amber' | 'green' | 'muted'; label: string }) {
  const cls =
    variant === 'amber'
      ? 'border-amber-500/40 bg-amber-950/40 text-amber-100'
      : variant === 'green'
        ? 'border-emerald-500/40 bg-emerald-950/35 text-emerald-100'
        : 'border-zinc-600/50 bg-zinc-900/50 text-zinc-400';
  return (
    <div className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium ${cls}`}>{label}</div>
  );
}

function ContractRow({ label, id }: { label: string; id: string }) {
  return (
    <div>
      <p className="text-violet-400/90 mb-1">{label}</p>
      <p className="break-all text-violet-200 selection:bg-violet-500/30">{id}</p>
    </div>
  );
}
