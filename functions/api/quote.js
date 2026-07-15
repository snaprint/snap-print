/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Cloudflare Pages Function: Quote Submission
   
   POST /api/quote
   
   Receives quote form data (file + details) and sends an email
   to the seller with the quote request details and attached file.
   
   Env vars: RESEND_API_KEY, SELLER_EMAIL
   ═══════════════════════════════════════════════════════════════ */

export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const formData = await request.formData();

    const name = formData.get('name');
    const email = formData.get('email');
    const phone = formData.get('phone');
    const material = formData.get('material');
    const notes = formData.get('notes') || '';
    const file = formData.get('file');

    // Validate required fields
    if (!name || !email || !phone || !material) {
      return jsonError('Missing required fields', 400);
    }

    if (!file || !(file instanceof File)) {
      return jsonError('No design file uploaded', 400);
    }

    // Validate file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.stl') && !fileName.endsWith('.step') && !fileName.endsWith('.stp')) {
      return jsonError('Invalid file type. Please upload STL, STEP, or STP files.', 400);
    }

    // Validate file size (25MB)
    if (file.size > 25 * 1024 * 1024) {
      return jsonError('File too large. Maximum size is 25MB.', 400);
    }

    console.log(`Quote request from ${name} (${email}) — Material: ${material}, File: ${file.name}`);

    // Send email notification to seller
    const resendApiKey = env.RESEND_API_KEY;
    const sellerEmail = env.SELLER_EMAIL || 'queries@snaprint.in';

    if (resendApiKey) {
      // Convert file to base64 for email attachment
      const fileBuffer = await file.arrayBuffer();
      const fileBase64 = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));

      // Seller notification with attachment
      const sellerRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Snap Print <orders@snaprint.in>',
          to: sellerEmail,
          reply_to: 'queries@snaprint.in',
          subject: `🔧 New Quote Request from ${escapeHtml(name)}`,
          html: `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;padding:24px;color:#1a1a1a;">
              <h2 style="margin:0 0 16px;">New Custom Part Quote Request</h2>

              <h3 style="margin:16px 0 8px;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Contact Details</h3>
              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <tr><td style="padding:6px 0;color:#666;width:120px;">Name</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(name)}</td></tr>
                <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;">${escapeHtml(email)}</td></tr>
                <tr><td style="padding:6px 0;color:#666;">Phone</td><td style="padding:6px 0;">${escapeHtml(phone)}</td></tr>
              </table>

              <h3 style="margin:20px 0 8px;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Specifications</h3>
              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <tr><td style="padding:6px 0;color:#666;width:120px;">Material</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(material)}</td></tr>
                <tr><td style="padding:6px 0;color:#666;">File</td><td style="padding:6px 0;">${escapeHtml(file.name)} (${(file.size / 1024).toFixed(1)} KB)</td></tr>
                ${notes ? `<tr><td style="padding:6px 0;color:#666;">Notes</td><td style="padding:6px 0;">${escapeHtml(notes)}</td></tr>` : ''}
              </table>

              <p style="color:#888;font-size:12px;margin-top:20px;">The design file is attached to this email. Reply directly to respond to the customer.</p>
            </div>
          `,
          attachments: [
            {
              filename: file.name,
              content: fileBase64,
            },
          ],
        }),
      });

      if (!sellerRes.ok) {
        const err = await sellerRes.text();
        console.error('Seller email failed:', err);
      } else {
        console.log(`Quote notification sent to seller (${sellerEmail})`);
      }
    } else {
      console.log('Email skipped (RESEND_API_KEY not set). Quote data:', { name, email, phone, material, notes, fileName: file.name });
    }

    return new Response(JSON.stringify({ success: true, message: 'Quote request submitted' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Quote submission error:', err);
    return jsonError('Internal server error', 500);
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: true, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
