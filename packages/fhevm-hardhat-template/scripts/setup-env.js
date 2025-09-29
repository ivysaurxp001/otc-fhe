const fs = require('fs');
const path = require('path');

console.log('🔧 Setting up environment variables...');

// Default values for local development
const defaultEnv = `# Local Development Environment
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
ORACLE_SIGNER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
GAS_PRICE=20000000000
GAS_LIMIT=1000000
ETHERSCAN_API_KEY=YourEtherscanApiKey
`;

const envPath = path.join(__dirname, '..', '.env');

// Check if .env already exists
if (fs.existsSync(envPath)) {
  console.log('⚠️  .env file already exists. Skipping creation.');
  console.log('📝 Current .env content:');
  console.log(fs.readFileSync(envPath, 'utf8'));
} else {
  // Create .env file
  fs.writeFileSync(envPath, defaultEnv);
  console.log('✅ Created .env file with default values');
  console.log('📝 Please update the following values:');
  console.log('   - SEPOLIA_RPC_URL: Your Infura/Alchemy RPC URL');
  console.log('   - PRIVATE_KEY: Your deployer private key');
  console.log('   - ORACLE_SIGNER_ADDRESS: Oracle signer address');
  console.log('   - ETHERSCAN_API_KEY: Your Etherscan API key (optional)');
}

console.log('\n🚀 Ready to deploy! Run: npm run deploy:sepolia');
