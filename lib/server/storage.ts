// S3 attachment storage. Active when S3_ATTACHMENTS_BUCKET is configured;
// otherwise the app falls back to inline previews (the pre-AWS behavior).
// Interim: shares the madenkorea bucket under a dedicated prefix — move to
// a dedicated bucket by changing the env var.

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { uid } from '@/lib/utils';

const bucket = process.env.S3_ATTACHMENTS_BUCKET;
const prefix = process.env.S3_ATTACHMENTS_PREFIX ?? 'crm-attachments/';

let client: S3Client | null = null;

export function s3Enabled(): boolean {
  return Boolean(bucket && process.env.AWS_ACCESS_KEY_ID);
}

function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

/** Uploads a base64 data-URL payload; returns the object key. */
export async function uploadAttachment(
  dataUrl: string,
  mimeType: string,
  originalName: string,
): Promise<string> {
  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
  const body = Buffer.from(base64, 'base64');
  const safeName = originalName.replace(/[^\w.\-]+/g, '_').slice(0, 80);
  const key = `${prefix}${uid('att')}-${safeName}`;
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: mimeType,
    }),
  );
  return key;
}

/** Short-lived download/preview URL for a stored object. */
export async function attachmentUrl(key: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 15 * 60 },
  );
}

export async function deleteAttachment(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

const INLINE_IMAGE_CAP = 400_000;

/**
 * Store an uploaded attachment payload: S3 when configured; inline small
 * images otherwise (the pre-AWS fallback).
 */
export async function storeAttachment(a: {
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
}): Promise<{ dataUrl: string | null; s3Key: string | null }> {
  if (a.dataUrl && s3Enabled()) {
    const s3Key = await uploadAttachment(a.dataUrl, a.type, a.name);
    return { dataUrl: null, s3Key };
  }
  const inline =
    a.dataUrl && a.type.startsWith('image/') && a.size <= INLINE_IMAGE_CAP
      ? a.dataUrl
      : null;
  return { dataUrl: inline, s3Key: null };
}
