"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useBlindEscrowMini } from "../hooks/useBlindEscrowMini";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface DealState {
  id: bigint | null;
  buyer: string;
  amount: string;
  ask: string;
  bid: string;
  currentStep: number;
  dealInfo: any;
}

export default function BlindEscrowMiniDemo() {
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";
  
  console.log("🔍 Environment Debug:", {
    NEXT_PUBLIC_CONTRACT_ADDRESS: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
    contractAddress: contractAddress,
    isCorrectAddress: contractAddress === "0x38F3f250C4AD10d34b79558541d0db25C2c0b74d"
  });
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
  } = useBlindEscrowMini(contractAddress);

  // Check if contract is deployed
  const isContractDeployed = contractAddress !== "0x0000000000000000000000000000000000000000";

  const [deal, setDeal] = useState<DealState>({
    id: null,
    buyer: "",
    amount: "",
    ask: "",
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
    dealBuyer: deal.buyer,
    dealAmount: deal.amount,
    buttonDisabled: busy || !deal.buyer || !deal.amount
  });

  // Step 1: Create Deal
  const handleCreateDeal = async () => {
    clearError();
    try {
      // Validation
      if (!deal.buyer || deal.buyer === "0x0000000000000000000000000000000000000000") {
        throw new Error("Please enter buyer address");
      }
      if (!deal.amount || parseFloat(deal.amount) <= 0) {
        throw new Error("Please enter a valid ETH amount");
      }
      
      console.log("Creating deal with params:", {
        buyer: deal.buyer,
        amount: deal.amount
      });
      
      const result = await createDeal(deal.buyer, deal.amount);
      
      console.log("Deal created successfully! Deal ID:", result.dealId.toString());
      setDeal(prev => ({ ...prev, id: result.dealId, currentStep: 2 }));
      setTxHash(result.receipt.hash);
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
    console.log("Ask:", deal.ask);
    
    try {
      await sellerSubmit(
        deal.id,
        parseInt(deal.ask)
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
        parseInt(deal.bid)
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

  // Step 5: Oracle Finalize
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
      buyer: "",
      amount: "",
      ask: "",
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
        <h1 className="text-3xl font-bold mb-2">Blind Escrow Mini Demo</h1>
        <p className="text-gray-600">
          Giao dịch mù tối thiểu với FHE - Chỉ P2P, ETH escrow, so sánh bid ≤ ask
        </p>
      </div>


      {!isContractDeployed && (
        <Alert className="mb-6" variant="destructive">
          <AlertDescription>
            ❌ <strong>Contract chưa được deploy!</strong><br/>
            Vui lòng deploy contract BlindEscrowMini trước khi sử dụng.<br/>
            Contract Address: <code className="text-sm">{contractAddress}</code>
          </AlertDescription>
        </Alert>
      )}

      {isContractDeployed && (
        <Alert className="mb-6">
          <AlertDescription>
            ✅ <strong>Contract đã được deploy!</strong><br/>
            Contract Address: <code className="text-sm">{contractAddress}</code><br/>
            FHEVM Status: <code className="text-sm">{isFhevmReady ? '✅ Ready' : `⏳ ${fhevmStatus}`}</code>
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
                Create Deal (P2P)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="buyer">Buyer Address</Label>
                <Input
                  id="buyer"
                  placeholder="0x..."
                  value={deal.buyer}
                  onChange={(e) => setDeal(prev => ({ ...prev, buyer: e.target.value }))}
                />
              </div>

              <div>
                <Label htmlFor="amount">ETH Amount (PUBLIC)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.001"
                  placeholder="0.1"
                  value={deal.amount}
                  onChange={(e) => setDeal(prev => ({ ...prev, amount: e.target.value }))}
                />
              </div>

              <Button 
                onClick={handleCreateDeal} 
                disabled={busy || !deal.buyer || !deal.amount}
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

                <Button 
                  onClick={handleSellerSubmit} 
                  disabled={busy || !isFhevmReady || !deal.ask}
                  className="w-full"
                >
                  {busy && <span className="mr-2">⏳</span>}
                  Submit Encrypted Ask
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
                    Giá mua (được mã hóa) + ETH escrow
                  </p>
                </div>

                <Button 
                  onClick={handlePlaceBid} 
                  disabled={busy || !isFhevmReady || !deal.bid}
                  className="w-full"
                >
                  {busy && <span className="mr-2">⏳</span>}
                  Place Bid & Escrow ETH
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
                  FHE sẽ so sánh: bid ≤ ask (encrypted)
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
                    <span className="font-medium">State:</span>
                    <span>
                      {deal.dealInfo.state === 0 && "None"}
                      {deal.dealInfo.state === 1 && "Created"}
                      {deal.dealInfo.state === 2 && "Ready"}
                      {deal.dealInfo.state === 3 && "OutcomeComputed"}
                      {deal.dealInfo.state === 4 && "Settled"}
                      {deal.dealInfo.state === 5 && "Canceled"}
                    </span>
                    <span className="font-medium">Seller:</span>
                    <span className="font-mono text-xs">{deal.dealInfo.seller}</span>
                    <span className="font-medium">Buyer:</span>
                    <span className="font-mono text-xs">{deal.dealInfo.buyer}</span>
                    <span className="font-medium">Amount:</span>
                    <span>{ethers.formatEther(deal.dealInfo.amount)} ETH</span>
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
                    <div><strong>Flow:</strong></div>
                    <div className="ml-2">1. Seller tạo deal với buyer</div>
                    <div className="ml-2">2. Seller submit ask (encrypted)</div>
                    <div className="ml-2">3. Buyer place bid + escrow ETH</div>
                    <div className="ml-2">4. Compute outcome: bid ≤ ask</div>
                    <div className="ml-2">5. Oracle finalize</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>FHE Logic (Mini)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-gray-50 p-3 rounded text-sm font-mono">
                <div className="text-gray-600 mb-2">Encrypted Values:</div>
                <div>ask: euint32 (hidden)</div>
                <div>bid: euint32 (hidden)</div>
              </div>
              
              <div className="bg-gray-50 p-3 rounded text-sm font-mono">
                <div className="text-gray-600 mb-2">FHE Comparison:</div>
                <div>encOutcome = FHE.le(bid, ask)</div>
                <div>// bid ≤ ask (encrypted)</div>
              </div>

              <div className="bg-gray-50 p-3 rounded text-sm font-mono">
                <div className="text-gray-600 mb-2">Oracle Pattern:</div>
                <div>1. FHE.computeOutcome() → encOutcome</div>
                <div>2. Oracle decrypts encOutcome</div>
                <div>3. Oracle signs outcome</div>
                <div>4. finalizeWithOracle(outcome, sig)</div>
                <div className="text-xs text-gray-500 mt-1">
                  Only the boolean outcome is revealed
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
