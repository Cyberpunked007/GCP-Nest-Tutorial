import { http, cloudEvent } from '@google-cloud/functions-framework';
import type { Request, Response } from '@google-cloud/functions-framework';
// The string 'greet' is the entry point name. We reference it at deploy time.

interface StorageObjectData {
  bucket: string;
  name: string;
  contentType: string;
  size: string;
  timeCreated: string;
}

http('greet', (req: Request, res: Response) => {
  const name = req.query.name || req.body?.name || 'Cloud Wanderer';
  res.status(200).json({
    message: `Hello, ${name}! This ran on Cloud Run Functions.`,
    timestamp: new Date().toISOString(),
  });
});

cloudEvent('onFileUpload', (event: any) => {
  const file = event.data as StorageObjectData;
  if (!file) {
    console.error('No file data on the event');
    return;
  }
  console.log(`New upload detected!`);
  console.log(`Bucket: ${file.bucket}`);
  console.log(`File: ${file.name}`);
  console.log(`Type: ${file.contentType}`);
  console.log(`Size: ${Number(file.size) / 1024} KB`);
  // This is where you'd do the real work: resize an image,
  // extract metadata, push a job onto a queue, etc.
});
