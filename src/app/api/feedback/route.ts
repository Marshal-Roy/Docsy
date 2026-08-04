import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { message, email, type } = await req.json();
    
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const apiKey = process.env.EMAIL_API;
    if (!apiKey) {
      console.error('EMAIL_API environment variable is missing');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Docsy <onboarding@resend.dev>',
        to: 'marshalroy911@gmail.com',
        subject: `New Docsy Feedback: ${type || 'General'}`,
        html: `
          <h2>New Feedback from Docsy</h2>
          <p><strong>Feedback Type:</strong> ${type || 'General'}</p>
          <p><strong>Sender Email:</strong> ${email || 'Anonymous'}</p>
          <hr />
          <p><strong>Message:</strong></p>
          <p style="white-space: pre-wrap;">${message}</p>
        `
      })
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('Resend API Error:', data);
      return NextResponse.json({ error: 'Failed to send feedback' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id });
  } catch (err) {
    console.error('Feedback API Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
