const INVOICE_ID = 'dada58d6-9096-468b-a202-af08cd950203';
const API_BASE = 'https://wino-business.vercel.app';
const TX_SIG = '3o85GhWQ1yUZX7JSZvQRHZ5hnYnwueB9RS3kumN3suedgS6aaCbiPFyNVBBUzRdrJxXTz18gcMka8cKuE9797HhG';

async function checkInvoiceStatus() {
  console.log(`\n🔍 Monitoring invoice: ${INVOICE_ID}`);
  console.log(`📝 Transaction: ${TX_SIG}\n`);

  const startTime = Date.now();
  const timeout = 60000; // 60 seconds
  let iteration = 0;

  while (Date.now() - startTime < timeout) {
    iteration++;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    try {
      const response = await fetch(`${API_BASE}/api/invoices/${INVOICE_ID}`);

      if (response.ok) {
        const data = await response.json();
        const invoice = data.invoice;

        console.log(`[${elapsed}s] Iteration ${iteration}: status=${invoice.status}`);

        if (invoice.status === 'paid' || invoice.status === 'completed' || invoice.status === 'confirmed') {
          console.log('\n✅ SUCCESS! Invoice marked as PAID');
          console.log('Final invoice state:', JSON.stringify(invoice, null, 2));
          return { success: true, invoice, elapsed };
        }

        if (invoice.status === 'expired' || invoice.status === 'failed') {
          console.log('\n❌ Invoice marked as', invoice.status);
          console.log('Final invoice state:', JSON.stringify(invoice, null, 2));
          return { success: false, invoice, elapsed };
        }
      } else {
        console.log(`[${elapsed}s] API error: ${response.status} ${response.statusText}`);
      }
    } catch (err: any) {
      console.log(`[${elapsed}s] Network error:`, err.message);
    }

    // Wait 2 seconds between checks
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n⏱️ TIMEOUT: Invoice status did NOT update within 60 seconds');

  // Final check
  try {
    const response = await fetch(`${API_BASE}/api/invoices/${INVOICE_ID}`);
    const data = await response.json();
    console.log('Final invoice state:', JSON.stringify(data.invoice, null, 2));
    return { success: false, invoice: data.invoice, elapsed: 60 };
  } catch {
    return { success: false, invoice: null, elapsed: 60 };
  }
}

checkInvoiceStatus()
  .then((result) => {
    if (result.success) {
      process.exit(0);
    } else {
      console.log('\n❌ Payment was sent on-chain but invoice status did NOT update');
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
