import express from 'express';
import twilio from 'twilio';
import { handleIncoming } from '../services/geminiClient.js';
import { sendWhatsApp } from '../services/reminders.js';

const router = express.Router();

router.post('/twilio', async (req, res) => {
  try {
    const from = req.body.From;
    const body = req.body.Body || '';

    if (body.toLowerCase().startsWith('remind:')) {
      const payload = body.slice(7).trim();
      await sendWhatsApp({ to: from, text: `Reminder scheduled: ${payload}` });
      return res.send('<Response></Response>');
    }

    const reply = await handleIncoming({ from, text: body });

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(reply);
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml.toString());
  } catch (err) {
    console.error('Webhook error', err);
    res.status(500).send('<Response></Response>');
  }
});

export default router;
