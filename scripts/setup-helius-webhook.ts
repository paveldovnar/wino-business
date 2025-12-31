/**
 * Helius Webhook Setup Script
 * Creates or updates a webhook for USDC payment notifications
 *
 * Usage:
 *   ts-node scripts/setup-helius-webhook.ts <merchantWallet> <deploymentUrl>
 *
 * Example:
 *   ts-node scripts/setup-helius-webhook.ts 5nL8...xyz https://wino-business.vercel.app
 */

async function setupHeliusWebhook(merchantWallet: string, deploymentUrl: string) {
  const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
  const HELIUS_WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET;

  if (!HELIUS_API_KEY) {
    console.error('Error: HELIUS_API_KEY environment variable not set');
    process.exit(1);
  }

  if (!HELIUS_WEBHOOK_SECRET) {
    console.error('Error: HELIUS_WEBHOOK_SECRET environment variable not set');
    process.exit(1);
  }

  const webhookURL = `${deploymentUrl}/api/webhooks/helius`;

  console.log('Creating Helius webhook...');
  console.log('Webhook URL:', webhookURL);
  console.log('Watching address:', merchantWallet);

  try {
    const response = await fetch(
      `https://api.helius.xyz/v0/webhooks?api-key=${HELIUS_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhookURL,
          transactionTypes: ['ANY'],
          accountAddresses: [merchantWallet],
          webhookType: 'enhanced',
          txnStatus: 'all',
          authHeader: `Bearer ${HELIUS_WEBHOOK_SECRET}`,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to create webhook:', error);
      process.exit(1);
    }

    const webhook = await response.json();
    console.log('\n✓ Webhook created successfully!');
    console.log('Webhook ID:', webhook.webhookID);
    console.log('Webhook URL:', webhook.webhookURL);
    console.log('\nWebhook details:', JSON.stringify(webhook, null, 2));
  } catch (err) {
    console.error('Error creating webhook:', err);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: ts-node scripts/setup-helius-webhook.ts <merchantWallet> <deploymentUrl>');
  console.log('Example: ts-node scripts/setup-helius-webhook.ts 5nL8...xyz https://wino-business.vercel.app');
  process.exit(1);
}

const [merchantWallet, deploymentUrl] = args;
setupHeliusWebhook(merchantWallet, deploymentUrl);
