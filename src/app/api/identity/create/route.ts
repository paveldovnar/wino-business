import { NextRequest, NextResponse } from 'next/server';
import Arweave from 'arweave';
import { BusinessIdentity, verifySignature } from '@/lib/identity';

export const dynamic = 'force-dynamic';

// Initialize Arweave
const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
});

interface CreateIdentityRequest {
  walletAddress: string;
  name: string;
  logoDataUrl?: string;
  signature: string;
  message: string;
}

/**
 * POST /api/identity/create
 *
 * Creates a new business identity on Arweave.
 * Requires wallet signature to prove ownership.
 *
 * Body:
 * - walletAddress: string
 * - name: string
 * - logoDataUrl?: string (base64 data URL)
 * - signature: string (wallet signature)
 * - message: string (signed message)
 */
export async function POST(req: NextRequest) {
  try {
    const body: CreateIdentityRequest = await req.json();
    const { walletAddress, name, logoDataUrl, signature, message } = body;

    // Validate required fields
    if (!walletAddress || !name || !signature || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate name
    if (name.length < 2 || name.length > 50) {
      return NextResponse.json(
        { error: 'Name must be 2-50 characters' },
        { status: 400 }
      );
    }

    console.log('[identity/create] Creating identity for:', walletAddress);
    console.log('[identity/create] Business name:', name);

    // Verify the signature
    const isValid = await verifySignature(message, signature, walletAddress);
    if (!isValid) {
      console.error('[identity/create] Invalid signature');
      return NextResponse.json(
        { error: 'Invalid signature. Please sign the message with your wallet.' },
        { status: 401 }
      );
    }

    console.log('[identity/create] Signature verified');

    // Get server wallet for Arweave uploads
    const arweaveKeyJson = process.env.ARWEAVE_WALLET_KEY;
    if (!arweaveKeyJson) {
      console.error('[identity/create] ARWEAVE_WALLET_KEY not configured');
      return NextResponse.json(
        { error: 'Arweave not configured. Contact support.' },
        { status: 500 }
      );
    }

    let arweaveKey;
    try {
      arweaveKey = JSON.parse(arweaveKeyJson);
    } catch {
      console.error('[identity/create] Invalid ARWEAVE_WALLET_KEY format');
      return NextResponse.json(
        { error: 'Arweave configuration error' },
        { status: 500 }
      );
    }

    // Upload logo to Arweave if provided
    let logoUri: string | null = null;
    if (logoDataUrl) {
      console.log('[identity/create] Uploading logo to Arweave...');

      try {
        // Parse data URL
        const matches = logoDataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
          return NextResponse.json(
            { error: 'Invalid logo data URL format' },
            { status: 400 }
          );
        }

        const contentType = matches[1];
        const base64Data = matches[2];
        const logoBuffer = Buffer.from(base64Data, 'base64');

        // Check size (max 100KB for logo)
        if (logoBuffer.length > 100 * 1024) {
          return NextResponse.json(
            { error: 'Logo too large. Maximum 100KB.' },
            { status: 400 }
          );
        }

        // Create logo transaction
        const logoTx = await arweave.createTransaction({
          data: logoBuffer,
        }, arweaveKey);

        logoTx.addTag('Content-Type', contentType);
        logoTx.addTag('App-Name', 'Wino-Business');
        logoTx.addTag('Type', 'business-logo');
        logoTx.addTag('Owner-Wallet', walletAddress);

        await arweave.transactions.sign(logoTx, arweaveKey);
        const logoResponse = await arweave.transactions.post(logoTx);

        if (logoResponse.status !== 200 && logoResponse.status !== 202) {
          console.error('[identity/create] Logo upload failed:', logoResponse.status);
          return NextResponse.json(
            { error: 'Failed to upload logo' },
            { status: 500 }
          );
        }

        logoUri = `ar://${logoTx.id}`;
        console.log('[identity/create] Logo uploaded:', logoUri);

      } catch (logoError: any) {
        console.error('[identity/create] Logo upload error:', logoError);
        // Continue without logo
        logoUri = null;
      }
    }

    // Create identity object
    const identity: BusinessIdentity = {
      version: 1,
      identity_type: 'business',
      name: name.trim(),
      logo_uri: logoUri,
      owner: walletAddress,
      created_at: Math.floor(Date.now() / 1000),
    };

    // Upload identity to Arweave
    console.log('[identity/create] Uploading identity to Arweave...');

    const identityTx = await arweave.createTransaction({
      data: JSON.stringify(identity),
    }, arweaveKey);

    identityTx.addTag('Content-Type', 'application/json');
    identityTx.addTag('App-Name', 'Wino-Business');
    identityTx.addTag('Type', 'business-identity');
    identityTx.addTag('Owner-Wallet', walletAddress);
    identityTx.addTag('Identity-Version', '1');
    identityTx.addTag('Business-Name', name.trim());

    await arweave.transactions.sign(identityTx, arweaveKey);
    const identityResponse = await arweave.transactions.post(identityTx);

    if (identityResponse.status !== 200 && identityResponse.status !== 202) {
      console.error('[identity/create] Identity upload failed:', identityResponse.status);
      return NextResponse.json(
        { error: 'Failed to create identity on Arweave' },
        { status: 500 }
      );
    }

    const arweaveTxId = identityTx.id;
    console.log('[identity/create] Identity created!');
    console.log('[identity/create] Arweave TX:', arweaveTxId);
    console.log('[identity/create] ViewBlock:', `https://viewblock.io/arweave/tx/${arweaveTxId}`);

    return NextResponse.json({
      success: true,
      identity: {
        ...identity,
        arweave_tx_id: arweaveTxId,
      },
      arweave_tx_id: arweaveTxId,
      logo_uri: logoUri,
      explorer_url: `https://viewblock.io/arweave/tx/${arweaveTxId}`,
    });

  } catch (error: any) {
    console.error('[identity/create] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create identity' },
      { status: 500 }
    );
  }
}
