// Outbound email via SES. Active when SES_FROM_ADDRESS is configured;
// otherwise callers fall back to log-only (the pre-AWS behavior).
// Uses the dedicated SES credential pair from the shared account.

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

let client: SESClient | null = null;

export function sesEnabled(): boolean {
  return Boolean(
    process.env.SES_FROM_ADDRESS &&
      (process.env.SES_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID),
  );
}

function ses(): SESClient {
  if (!client) {
    client = new SESClient({
      region: process.env.SES_REGION ?? process.env.AWS_REGION,
      credentials: {
        accessKeyId:
          process.env.SES_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey:
          process.env.SES_SECRET_ACCESS_KEY ??
          process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  await ses().send(
    new SendEmailCommand({
      Source: process.env.SES_FROM_ADDRESS,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Text: { Data: body, Charset: 'UTF-8' } },
      },
    }),
  );
}
