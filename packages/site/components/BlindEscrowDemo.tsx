"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useBlindEscrowV2 } from "../hooks/useBlindEscrowV2";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
// import { Loader2, CheckCircle, XCircle } from "lucide-react";

// ERC20 tokens from environment variables
const TOKENS = [
  { 
    address: process.env.NEXT_PUBLIC_USDC_ADDRESS || "0x1234567890123456789012345678901234567890", 
    symbol: "USDC", 
    decimals: 6 
  },
  { 
    address: process.env.NEXT_PUBLIC_USDT_ADDRESS || "0x2345678901234567890123456789012345678901", 
    symbol: "USDT", 
    decimals: 6 
  },
  { 
    address: process.env.NEXT_PUBLIC_DAI_ADDRESS || "0x3456789012345678901234567890123456789012", 
    symbol: "DAI", 
    decimals: 18 
  },
];

interface DealState {
  id: bigint | null;
  mode: 0 | 1;
  token: string;
  amount: string;
  buyerOpt: string;
  ask: string;
  threshold: string;
  bid: string;
  currentStep: number;
  dealInfo: any;
}

export default function BlindEscrowDemo() {
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";
  const { 
    busy, 
    isFhevmReady,
    fhevmStatus,
    fhevmError,
    createDeal, 
    sellerSubmit, 
    placeBid, 
    computeOutcome,
    finalizeWithOracle,
    getDealInfo 
  } = useBlindEscrowV2(contractAddress);

  // Check if contract is deployed
  const isContractDeployed = contractAddress !== "0x0000000000000000000000000000000000000000";

  const [deal, setDeal] = useState<DealState>({
    id: null,
    mode: 0,
    token: "",
    amount: "",
    buyerOpt: "",
    ask: "",
    threshold: "",
    bid: "",
    currentStep: 1,
    dealInfo: null
  });

  const [txHash, setTxHash] = useState<string>("");
  const [error, setError] = useState<string>("");

  const clearError = () => setError("");

  // Debug FHEVM status
  console.log("FHEVM Debug:", {
    isFhevmReady,
    fhevmStatus,
    fhevmError,
    dealToken: deal.token,
    dealAmount: deal.amount,
    dealMode: deal.mode,
    dealBuyerOpt: deal.buyerOpt,
    buttonDisabled: busy || !deal.token || !deal.amount || (deal.mode === 0 && !deal.buyerOpt)
  });

  // Step 1: Create Deal
  const handleCreateDeal = async () => {
    clearError();
    try {
      // Validation
      if (deal.mode !== 0 && deal.mode !== 1) {
        throw new Error(`Invalid mode: ${deal.mode}. Must be 0 (P2P) or 1 (OPEN)`);
      }
      if (!deal.token || deal.token === "0x0000000000000000000000000000000000000000") {
        throw new Error("Please select a valid token");
      }
      if (!deal.amount || parseFloat(deal.amount) <= 0) {
        throw new Error("Please enter a valid amount");
      }
      if (deal.mode === 0 && (!deal.buyerOpt || deal.buyerOpt === "0x0000000000000000000000000000000000000000")) {
        throw new Error("Please enter buyer address for P2P mode");
      }
      
      console.log("Creating deal with params:", {
        mode: deal.mode,
        modeType: typeof deal.mode,
        token: deal.token,
        amount: deal.amount,
        buyerOpt: deal.buyerOpt
      });
      
      // Get token decimals
      const selectedToken = TOKENS.find(t => t.address === deal.token);
      const decimals = selectedToken?.decimals || 18;
      
      const result = await createDeal(
        deal.mode,
        deal.token,
        ethers.parseUnits(deal.amount, decimals).toString(), // Use correct decimals
        deal.buyerOpt || undefined
      );
      
      // Extract deal ID from event
      const event = result.logs.find((log: any) => log.topics[0] === ethers.id("DealCreated(uint256,uint8,address,address,address,uint256)"));
      if (event) {
        const dealId = BigInt(event.topics[1]);
        console.log("Deal created successfully! Deal ID:", dealId.toString());
        setDeal(prev => ({ ...prev, id: dealId, currentStep: 2 }));
        setTxHash(result.hash);
      } else {
        console.error("DealCreated event not found in logs:", result.logs);
      }
    } catch (err: any) {
      setError(err.message || "Failed to create deal");
    }
  };

  // Step 2: Seller Submit
  const handleSellerSubmit = async () => {
    clearError();
    if (!deal.id) {
      console.error("No deal ID available for seller submit");
      setError("No deal ID available. Please create a deal first.");
      return;
    }
    
    console.log("Seller submit with deal ID:", deal.id.toString());
    console.log("Ask:", deal.ask, "Threshold:", deal.threshold);
    
    try {
      await sellerSubmit(
        deal.id,
        parseInt(deal.ask),
        parseInt(deal.threshold)
      );
      setDeal(prev => ({ ...prev, currentStep: 3 }));
    } catch (err: any) {
      console.error("Seller submit error:", err);
      setError(err.message || "Failed to submit seller data");
    }
  };

  // Step 3: Place Bid
  const handlePlaceBid = async () => {
    clearError();
    if (!deal.id) return;
    
    try {
      await placeBid(
        deal.id,
        parseInt(deal.bid),
        deal.token,
        ethers.parseUnits(deal.amount, 18).toString()
      );
      setDeal(prev => ({ ...prev, currentStep: 4 }));
    } catch (err: any) {
      setError(err.message || "Failed to place bid");
    }
  };

  // Step 4: Compute Outcome
  const handleComputeOutcome = async () => {
    clearError();
    if (!deal.id) return;
    
    try {
      const result = await computeOutcome(deal.id);
      setTxHash(result.hash);
      setDeal(prev => ({ ...prev, currentStep: 5 }));
    } catch (err: any) {
      setError(err.message || "Failed to compute outcome");
    }
  };

  // Step 5: Finalize with Oracle
  const handleFinalizeWithOracle = async () => {
    clearError();
    if (!deal.id) return;
    
    try {
      const result = await finalizeWithOracle(deal.id);
      setTxHash(result.hash);
      
      // Fetch updated deal info
      const dealInfo = await getDealInfo(deal.id);
      setDeal(prev => ({ ...prev, dealInfo: dealInfo }));
    } catch (err: any) {
      setError(err.message || "Failed to finalize with oracle");
    }
  };

  // Fetch deal info when deal ID is available
  useEffect(() => {
    if (deal.id && deal.currentStep > 1) {
      getDealInfo(deal.id).then(dealInfo => {
        setDeal(prev => ({ ...prev, dealInfo: dealInfo }));
      });
    }
  }, [deal.id, deal.currentStep, getDealInfo]);

  const resetDemo = () => {
    setDeal({
      id: null,
      mode: 0,
      token: "",
      amount: "",
      buyerOpt: "",
      ask: "",
      threshold: "",
      bid: "",
      currentStep: 1,
      dealInfo: null
    });
    setTxHash("");
    setError("");
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Blind Escrow V2 Demo</h1>
        <p className="text-gray-600">
          Giao dịch mù với Fully Homomorphic Encryption - Logic định giá được giữ kín
        </p>
      </div>

      {!isContractDeployed && (
        <Alert className="mb-6" variant="destructive">
          <AlertDescription>
            ❌ <strong>Contract chưa được deploy!</strong><br/>
            Vui lòng deploy contract BlindEscrowV2 trước khi sử dụng.<br/>
            Contract Address: <code className="text-sm">{contractAddress}</code>
          </AlertDescription>
        </Alert>
      )}

      {isContractDeployed && (
        <Alert className="mb-6">
          <AlertDescription>
            ✅ <strong>Contract đã được deploy!</strong><br/>
            Contract Address: <code className="text-sm">{contractAddress}</code><br/>
            Oracle Address: <code className="text-sm">{process.env.NEXT_PUBLIC_ORACLE_ADDRESS}</code><br/>
            FHEVM Status: <code className="text-sm">{isFhevmReady ? '✅ Ready' : `⏳ ${fhevmStatus}`}</code><br/>
            Network: {process.env.NEXT_PUBLIC_NETWORK} (Chain ID: {process.env.NEXT_PUBLIC_CHAIN_ID})
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert className="mb-6" variant="destructive">
          <AlertDescription>❌ {error}</AlertDescription>
        </Alert>
      )}

      {txHash && (
        <Alert className="mb-6">
          <AlertDescription>
            ✅ Transaction: <code className="text-sm">{txHash}</code>
          </AlertDescription>
        </Alert>
      )}

      {/* Progress Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4, 5].map((step) => (
            <div key={step} className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                step <= deal.currentStep 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-200 text-gray-600'
              }`}>
                {step}
              </div>
              <span className="text-xs mt-1 text-center">
                {step === 1 && "Create Deal"}
                {step === 2 && "Seller Submit"}
                {step === 3 && "Place Bid"}
                {step === 4 && "Compute Outcome"}
                {step === 5 && "Oracle Finalize"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel - Controls */}
        <div className="space-y-6">
          {/* Step 1: Create Deal */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="text-blue-500">1.</span>
                Create Deal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="mode">Deal Mode</Label>
                <Select 
                  value={deal.mode.toString()} 
                  onValueChange={(value) => setDeal(prev => ({ ...prev, mode: parseInt(value) as 0 | 1 }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">P2P (Private)</SelectItem>
                    <SelectItem value="1">OPEN (Public)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="token">Payment Token</Label>
                <Select 
                  value={deal.token} 
                  onValueChange={(value) => setDeal(prev => ({ ...prev, token: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select token" />
                  </SelectTrigger>
                  <SelectContent>
                    {TOKENS.map((token) => (
                      <SelectItem key={token.address} value={token.address}>
                        {token.symbol}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="amount">Amount (PUBLIC)</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="100"
                  value={deal.amount}
                  onChange={(e) => setDeal(prev => ({ ...prev, amount: e.target.value }))}
                />
              </div>

              {deal.mode === 0 && (
                <div>
                  <Label htmlFor="buyerOpt">Buyer Address (P2P)</Label>
                  <Input
                    id="buyerOpt"
                    placeholder="0x..."
                    value={deal.buyerOpt}
                    onChange={(e) => setDeal(prev => ({ ...prev, buyerOpt: e.target.value }))}
                  />
                </div>
              )}

              <Button 
                onClick={handleCreateDeal} 
                disabled={busy || !deal.token || !deal.amount || (deal.mode === 0 && !deal.buyerOpt)}
                className="w-full"
              >
                {busy && <span className="mr-2">⏳</span>}
                Create Deal
              </Button>
            </CardContent>
          </Card>

          {/* Step 2: Seller Submit */}
          {deal.currentStep >= 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-blue-500">2.</span>
                  Seller Submit (ENCRYPTED)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="ask">Ask Price (ENCRYPTED)</Label>
                  <Input
                    id="ask"
                    type="number"
                    placeholder="1000"
                    value={deal.ask}
                    onChange={(e) => setDeal(prev => ({ ...prev, ask: e.target.value }))}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Giá bán mong muốn (được mã hóa)
                  </p>
                </div>

                <div>
                  <Label htmlFor="threshold">Threshold (ENCRYPTED)</Label>
                  <Input
                    id="threshold"
                    type="number"
                    placeholder="1200"
                    value={deal.threshold}
                    onChange={(e) => setDeal(prev => ({ ...prev, threshold: e.target.value }))}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Ngưỡng giá tối đa (được mã hóa)
                  </p>
                </div>

                <Button 
                  onClick={handleSellerSubmit} 
                  disabled={busy || !isFhevmReady || !deal.ask || !deal.threshold}
                  className="w-full"
                >
                  {busy && <span className="mr-2">⏳</span>}
                  Submit Encrypted Data
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Place Bid */}
          {deal.currentStep >= 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-blue-500">3.</span>
                  Place Bid (ENCRYPTED)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="bid">Bid Price (ENCRYPTED)</Label>
                  <Input
                    id="bid"
                    type="number"
                    placeholder="1100"
                    value={deal.bid}
                    onChange={(e) => setDeal(prev => ({ ...prev, bid: e.target.value }))}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Giá mua (được mã hóa) + Escrow amount
                  </p>
                </div>

                <Button 
                  onClick={handlePlaceBid} 
                  disabled={busy || !isFhevmReady || !deal.bid}
                  className="w-full"
                >
                  {busy && <span className="mr-2">⏳</span>}
                  Place Bid & Escrow
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Compute Outcome */}
          {deal.currentStep >= 4 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-blue-500">4.</span>
                  Compute Outcome
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600">
                  FHE sẽ so sánh: bid ≤ ask && ask ≤ threshold
                </p>

                <Button 
                  onClick={handleComputeOutcome} 
                  disabled={busy}
                  className="w-full"
                >
                  {busy && <span className="mr-2">⏳</span>}
                  Compute Outcome
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Oracle Finalize */}
          {deal.currentStep >= 5 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-blue-500">5.</span>
                  Oracle Finalize
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600">
                  Oracle sẽ decrypt kết quả và ký signature
                </p>

                <Button 
                  onClick={handleFinalizeWithOracle} 
                  disabled={busy}
                  className="w-full"
                >
                  {busy && <span className="mr-2">⏳</span>}
                  Finalize with Oracle
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Panel - Deal Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Deal Information</CardTitle>
            </CardHeader>
            <CardContent>
              {deal.dealInfo ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="font-medium">Deal ID:</span>
                    <span>{deal.id?.toString()}</span>
                    <span className="font-medium">Mode:</span>
                    <span>{deal.dealInfo.mode === 0 ? "P2P" : "OPEN"}</span>
                    <span className="font-medium">State:</span>
                    <span>
                      {deal.dealInfo.state === 0 && "None"}
                      {deal.dealInfo.state === 1 && "Created"}
                      {deal.dealInfo.state === 2 && "A_Submitted"}
                      {deal.dealInfo.state === 3 && "Ready"}
                      {deal.dealInfo.state === 4 && "Settled"}
                      {deal.dealInfo.state === 5 && "Canceled"}
                    </span>
                    <span className="font-medium">Seller:</span>
                    <span className="font-mono text-xs">{deal.dealInfo.seller}</span>
                    <span className="font-medium">Buyer:</span>
                    <span className="font-mono text-xs">{deal.dealInfo.buyer}</span>
                    <span className="font-medium">Amount:</span>
                    <span>{ethers.formatEther(deal.dealInfo.amount)}</span>
                    <span className="font-medium">Success:</span>
                    <span className={deal.dealInfo.success ? "text-green-600" : "text-red-600"}>
                      {deal.dealInfo.success ? "✓ Match" : "✗ No Match"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-gray-500">No deal information available</p>
                  <div className="text-xs text-gray-400">
                    <div><strong>Available Tokens:</strong></div>
                    {TOKENS.map((token) => (
                      <div key={token.address} className="ml-2">
                        {token.symbol}: <code className="text-xs">{token.address}</code>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>FHE Logic</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-gray-50 p-3 rounded text-sm font-mono">
                <div className="text-gray-600 mb-2">Encrypted Values:</div>
                <div>ask: euint32 (hidden)</div>
                <div>threshold: euint32 (hidden)</div>
                <div>bid: euint32 (hidden)</div>
              </div>
              
              <div className="bg-gray-50 p-3 rounded text-sm font-mono">
                <div className="text-gray-600 mb-2">FHE Comparison:</div>
                <div>ok1 = FHE.le(bid, ask)</div>
                <div>ok2 = FHE.le(ask, threshold)</div>
                <div>success = FHE.and(ok1, ok2)</div>
              </div>

              <div className="bg-gray-50 p-3 rounded text-sm font-mono">
                <div className="text-gray-600 mb-2">Oracle Pattern:</div>
                <div>1. FHE.computeOutcome() → encOutcome</div>
                <div>2. Oracle decrypts encOutcome</div>
                <div>3. Oracle signs outcome</div>
                <div>4. finalizeWithOracle(outcome, signature)</div>
                <div className="text-xs text-gray-500 mt-1">
                  Only the boolean outcome is revealed publicly
                </div>
              </div>
            </CardContent>
          </Card>

          <Button onClick={resetDemo} variant="outline" className="w-full">
            Reset Demo
          </Button>
        </div>
      </div>
    </div>
  );
}
