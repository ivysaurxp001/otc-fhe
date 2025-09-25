#!/usr/bin/env node

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { setTimeout } from 'timers/promises';

const execAsync = promisify(exec);

// Config Parameters
const CONTRACTS_PACKAGE_DIR = 'fhevm-hardhat-template';
const HARDHAT_NODE_PORT = 8545;
const HARDHAT_NODE_HOST = '127.0.0.1';
const HARDHAT_NODE_URL = `http://${HARDHAT_NODE_HOST}:${HARDHAT_NODE_PORT}`;
const TIMEOUT_SECONDS = 60;
const CHECK_INTERVAL_SECONDS = 1000; // milliseconds

async function checkHardhatNode() {
  try {
    const response = await fetch(HARDHAT_NODE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
        id: 1,
      }),
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function runCommand(command, cwd) {
  try {
    await execAsync(command, { cwd });
  } catch (error) {
    throw new Error(`Command failed: ${error.message}`);
  }
}

async function main() {
  const scriptDir = new URL('.', import.meta.url).pathname;
  const contractsPath = `${scriptDir}../packages/${CONTRACTS_PACKAGE_DIR}`;

  try {
    // Check if Hardhat Node is already running
    if (await checkHardhatNode()) {
      console.log('Hardhat Node is ready!');
      await runCommand('npx hardhat deploy --network localhost', contractsPath);
      return;
    }

    console.log('--- Starting Hardhat Node in background ---');
    
    // Start Hardhat Node in background using exec
    const hardhatCommand = process.platform === 'win32' 
      ? 'start /b npx hardhat node'
      : 'npx hardhat node &';
    
    execAsync(hardhatCommand, { cwd: contractsPath });

    console.log('Hardhat Node started. Waiting for it to be ready...');

    // Wait for Hardhat Node to be ready
    let attempts = 0;
    while (attempts < TIMEOUT_SECONDS) {
      if (await checkHardhatNode()) {
        console.log('Hardhat Node is ready!');
        break;
      }
      
      attempts++;
      console.log(`Waiting for Hardhat Node... (Attempt ${attempts}/${TIMEOUT_SECONDS})`);
      await setTimeout(CHECK_INTERVAL_SECONDS);
    }

    if (attempts >= TIMEOUT_SECONDS) {
      console.error(`Error: Hardhat Node did not start within ${TIMEOUT_SECONDS} seconds.`);
      process.exit(1);
    }

    // Deploy contracts
    console.log('--- Deploying FHECounter.sol on Hardhat Node ---');
    try {
      await runCommand('npx hardhat deploy --network localhost', contractsPath);
    } catch (error) {
      console.warn('Deployment failed, but continuing...');
    }

    // Stop Hardhat Node
    console.log('--- Stopping Hardhat Node ---');
    try {
      if (process.platform === 'win32') {
        await execAsync('taskkill /f /im node.exe');
      } else {
        await execAsync('pkill -f "hardhat node"');
      }
    } catch (error) {
      console.warn('Failed to stop Hardhat Node:', error.message);
    }

    // Add extra sleep to avoid possible conflict with next server instance launch
    await setTimeout(1000);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
