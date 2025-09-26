"use client";

import type { ReactNode } from "react";

import { MetaMaskProvider } from "@/hooks/metamask/useMetaMaskProvider";
import { InMemoryStorageProvider } from "@/hooks/useInMemoryStorage";
import { MetaMaskEthersSignerProvider } from "@/hooks/metamask/useMetaMaskEthersSigner";
// FhevmProvider is not needed - useFhevm hook handles initialization

type Props = {
  children: ReactNode;
};

export function Providers({ children }: Props) {
  return (
    <MetaMaskProvider>
      <MetaMaskEthersSignerProvider initialMockChains={{ 
        31337: "http://localhost:8545",
        11155111: process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.infura.io/v3/9da1f96d3ca24c4e81089a685509cb4b"
      }}>
        <InMemoryStorageProvider>{children}</InMemoryStorageProvider>
      </MetaMaskEthersSignerProvider>
    </MetaMaskProvider>
  );
}
