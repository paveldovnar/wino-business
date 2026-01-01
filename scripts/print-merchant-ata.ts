#!/usr/bin/env tsx
/**
 * Print merchant USDC ATA (Associated Token Account)
 *
 * This script computes the merchant's USDC ATA address that MUST be configured
 * in the Helius webhook "accountAddresses" array.
 *
 * Usage:
 *   npx tsx scripts/print-merchant-ata.ts
 */

import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, USDC_MINT } from '../src/server/solana/utils';

const MERCHANT_WALLET = process.env.NEXT_PUBLIC_MERCHANT_WALLET || 'G7Jhr2df7tEYxmjcHTUJuGyourBDHYw2Zh46ms6NjRDJ';

async function main() {
  console.log('=== Merchant USDC ATA Configuration ===\n');

  const merchantPubkey = new PublicKey(MERCHANT_WALLET);
  const usdcMint = new PublicKey(USDC_MINT);
  const merchantAta = await getAssociatedTokenAddress(merchantPubkey, usdcMint);

  console.log('Merchant Wallet:', MERCHANT_WALLET);
  console.log('USDC Mint:      ', USDC_MINT);
  console.log('Merchant ATA:   ', merchantAta.toBase58());
  console.log('\n=== Helius Webhook Configuration ===\n');
  console.log('Your Helius webhook MUST watch BOTH addresses:');
  console.log('  1. Merchant Wallet:', MERCHANT_WALLET);
  console.log('  2. Merchant ATA:   ', merchantAta.toBase58());
  console.log('\nIMPORTANT: Include the ATA address in "accountAddresses" to ensure webhooks trigger for USDC transfers.\n');
}

main().catch(console.error);
