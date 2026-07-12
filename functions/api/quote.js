/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Cloudflare Pages Function: Quote Submission
   
   POST /api/quote
   
   Receives quote form data (file + details) and sends an email
   to the seller with the quote request.
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

    // Validate
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
    const sellerEmail = env.SELLER_EMAIL || 'hello@snaprint.in';

    if (resendApiKey) {
      // Convert file to base64 for email attachment
      const fileBuffer = await file.arrayBuffer();
      const fileBase64 = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Snap Print System <quotes@snaprint.in>',
          to: sellerEmail,
          subject: `🔧 New Quote Request from ${name}`,
          html: `
            <div style="font-family:-apple-system,sans-serif;max-width:500px;padding:20px;">
              <h2>New Custom Part Quote Request</h2>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr><td style="padding:6px 0;color:#666;">Name</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(name)}</td></tr>
                <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;">${escapeHtml(email)}</td></tr>
                <tr><td style="padding:6px 0;color:#666;">Phone</td><td style="padding:6px 0;">${escapeHtml(phone)}</td></tr>
                <tr><td style="padding:6px 0;color:#666;">Material</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(material)}</td></tr>
                <tr><td style="padding:6px 0;color:#666;">File</td><td style="padding:6px 0;">${escapeHtml(file.name)} (${(file.size / 1024).toFixed(1)} KB)</td></tr>
                ${notes ? `<tr><td style="padding:6px 0;color:#666;">Notes</td><td style="padding:6px 0;">${escapeHtml(notes)}</td></tr>` : ''}
              </table>
              <p style="color:#666;font-size:12px;">The design file is attached to this email.</p>
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

      // Also send a confirmation to the buyer
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Snap Print <quotes@snaprint.in>',
          to: email,
          subject: 'Quote Request Received — Snap Print',
          html: `
            <div style="font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
              <h2>We received your quote request! 🔧</h2>
              <p>Hi ${escapeHtml(name)},</p>
              <p>Thanks for your interest in a custom 3D printed part. We've received your design file and will review it shortly.</p>
              <p>You should hear back from us within <strong>24 hours</strong> with a personalized quote.</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr><td style="padding:6px 0;color:#666;">Material</td><td style="padding:6px 0;">${escapeHtml(material)}</td></tr>
                <tr><td style="padding:6px 0;color:#666;">File</td><td style="padding:6px 0;">${escapeHtml(file.name)}</td></tr>
              </table>
              <p>If you have any questions, just reply to this email.</p>
              <p style="color:#666;font-size:12px;margin-top:24px;">— Team Snap Print</p>
            </div>
          `,
        }),
      });
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
