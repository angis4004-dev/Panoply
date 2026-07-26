import mongoose from 'mongoose';
import { VaultModel } from './src/lib/models/Vault';
import { YieldOpportunityModel } from './src/lib/models/YieldOpportunity';
import { connectToDatabase } from './src/lib/mongo';

async function seedDatabase() {
  try {
    // Connect to database
    await connectToDatabase();
    console.info('Connected to database');

    // Clear existing data
    await VaultModel.deleteMany({});
    await YieldOpportunityModel.deleteMany({});
    console.info('Cleared existing data');

    // Seed vaults
    const vaults = [
      {
        name: 'Aave yUSDC Vault',
        strategy: 'Yield Aggregator',
        riskLevel: 'Low',
        managerScore: 92,
        aum: '$125M',
        apr: 4.8,
      },
      {
        name: 'Yearn ETH Vault',
        strategy: 'Yield Optimizer',
        riskLevel: 'Medium',
        managerScore: 88,
        aum: '$89M',
        apr: 6.2,
      },
      {
        name: 'Curve 3pool Gauge',
        strategy: 'Liquidity Mining',
        riskLevel: 'Low',
        managerScore: 95,
        aum: '$210M',
        apr: 5.1,
      },
      {
        name: 'Convex FRAX Pool',
        strategy: 'Curve Optimizer',
        riskLevel: 'Low',
        managerScore: 90,
        aum: '$156M',
        apr: 7.3,
      },
      {
        name: 'Lido wstETH Vault',
        strategy: 'Liquid Staking',
        riskLevel: 'Low',
        managerScore: 94,
        aum: '$340M',
        apr: 3.9,
      },
    ];

    const createdVaults = await VaultModel.insertMany(vaults);
    console.info(`Created ${createdVaults.length} vaults`);

    // Seed yield opportunities
    const yields = [
      {
        protocol: 'Aave',
        chain: 'Ethereum',
        apr7d: 4.2,
        apr30d: 4.8,
        riskLevel: 'Low',
      },
      {
        protocol: 'Curve',
        chain: 'Ethereum',
        apr7d: 5.1,
        apr30d: 5.8,
        riskLevel: 'Low',
      },
      {
        protocol: 'PancakeSwap',
        chain: 'Binance Smart Chain',
        apr7d: 78.3,
        apr30d: 85.6,
        riskLevel: 'High',
      },
      {
        protocol: 'Uniswap v3',
        chain: 'Ethereum',
        apr7d: 10.2,
        apr30d: 12.3,
        riskLevel: 'Medium',
      },
      {
        protocol: 'Venus',
        chain: 'Binance Smart Chain',
        apr7d: 6.1,
        apr30d: 6.8,
        riskLevel: 'Medium',
      },
      {
        protocol: 'Raydium',
        chain: 'Solana',
        apr7d: 16.8,
        apr30d: 18.9,
        riskLevel: 'Medium',
      },
      {
        protocol: 'Compound',
        chain: 'Ethereum',
        apr7d: 2.9,
        apr30d: 3.1,
        riskLevel: 'Low',
      },
      {
        protocol: 'SushiSwap',
        chain: 'Ethereum',
        apr7d: 38.5,
        apr30d: 42.7,
        riskLevel: 'High',
      },
    ];

    const createdYields = await YieldOpportunityModel.insertMany(yields);
    console.info(`Created ${createdYields.length} yield opportunities`);

    console.info('Database seeding completed successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.info('Disconnected from database');
  }
}

// Run the seed function
seedDatabase();
