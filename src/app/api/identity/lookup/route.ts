import { NextRequest, NextResponse } from 'next/server';
import { BusinessIdentity } from '@/lib/identity';

export const dynamic = 'force-dynamic';

const ARWEAVE_GRAPHQL = 'https://arweave.net/graphql';

interface ArweaveEdge {
  node: {
    id: string;
    tags: Array<{ name: string; value: string }>;
  };
}

/**
 * GET /api/identity/lookup?wallet=<address>
 *
 * Looks up a business identity on Arweave by wallet address.
 * Returns the identity if found, or { found: false } if not.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get('wallet');

    if (!wallet) {
      return NextResponse.json({ error: 'Missing wallet parameter' }, { status: 400 });
    }

    // Validate wallet address format
    if (wallet.length < 32 || wallet.length > 44) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    console.log('[identity/lookup] Looking up identity for wallet:', wallet);

    // Query Arweave GraphQL for identity by wallet tag
    const query = `
      query {
        transactions(
          tags: [
            { name: "App-Name", values: ["Wino-Business"] },
            { name: "Content-Type", values: ["application/json"] },
            { name: "Type", values: ["business-identity"] },
            { name: "Owner-Wallet", values: ["${wallet}"] }
          ],
          first: 1,
          sort: HEIGHT_DESC
        ) {
          edges {
            node {
              id
              tags {
                name
                value
              }
            }
          }
        }
      }
    `;

    const response = await fetch(ARWEAVE_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      console.error('[identity/lookup] Arweave GraphQL error:', response.status);
      return NextResponse.json({
        found: false,
        identity: null,
        arweave_tx_id: null,
        error: 'Arweave query failed',
      });
    }

    const data = await response.json();
    const edges: ArweaveEdge[] = data.data?.transactions?.edges || [];

    if (edges.length === 0) {
      console.log('[identity/lookup] No identity found for wallet:', wallet);
      return NextResponse.json({
        found: false,
        identity: null,
        arweave_tx_id: null,
      });
    }

    const txId = edges[0].node.id;
    console.log('[identity/lookup] Found identity TX:', txId);

    // Fetch the actual identity data from Arweave
    const dataResponse = await fetch(`https://arweave.net/${txId}`);

    if (!dataResponse.ok) {
      console.error('[identity/lookup] Failed to fetch identity data:', dataResponse.status);
      return NextResponse.json({
        found: false,
        identity: null,
        arweave_tx_id: txId,
        error: 'Failed to fetch identity data',
      });
    }

    const identity: BusinessIdentity = await dataResponse.json();

    // Validate the identity belongs to the requested wallet
    if (identity.owner !== wallet) {
      console.error('[identity/lookup] Identity owner mismatch');
      return NextResponse.json({
        found: false,
        identity: null,
        arweave_tx_id: txId,
        error: 'Identity owner mismatch',
      });
    }

    console.log('[identity/lookup] Identity found:', identity.name);

    return NextResponse.json({
      found: true,
      identity: {
        ...identity,
        arweave_tx_id: txId,
      },
      arweave_tx_id: txId,
    });

  } catch (error: any) {
    console.error('[identity/lookup] Error:', error);
    return NextResponse.json({
      found: false,
      identity: null,
      arweave_tx_id: null,
      error: error.message || 'Lookup failed',
    });
  }
}
