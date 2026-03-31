import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Storage, Bucket } from '@google-cloud/storage';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private storage: Storage;
  private bucket: Bucket;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService) {
    const projectId = this.configService.get<string>('GCP_PROJECT_ID');
    const credentials = this.configService.get<string>('GCP_CREDENTIALS');
    this.bucketName = this.configService.get<string>('GCP_BUCKET_NAME');

    if (credentials) {
      // For production: use base64 encoded credentials
      try {
        const decodedCredentials = JSON.parse(
          Buffer.from(credentials, 'base64').toString('utf-8'),
        );
        this.storage = new Storage({
          projectId,
          credentials: decodedCredentials,
        });
        this.logger.log('GCP Storage initialized with base64 credentials');
      } catch (error) {
        this.logger.error('Failed to decode GCP credentials:', error);
        throw new Error('Failed to initialize GCP Storage with credentials');
      }
    } else {
      // The GOOGLE_APPLICATION_CREDENTIALS env variable is automatically read
      this.storage = new Storage({ projectId });
      this.logger.log(
        'GCP Storage initialized with application default credentials',
      );
    }
    this.bucket = this.storage.bucket(this.bucketName);
    this.logger.log(`GCP Storage initialized with bucket: ${this.bucketName}`);
  }

  async uploadFile(file: Express.Multer.File): Promise<string> {
    try {
      const fileExtension = path.extname(file.originalname);
      const fileName = `${uuidv4()}${fileExtension}`;
      const blob = this.bucket.file(fileName);

      const blobStream = blob.createWriteStream({
        resumable: false,
        metadata: {
          contentType: file.mimetype,
          metadata: {
            originalName: file.originalname,
            uploadedAt: new Date().toISOString(),
          },
        },
      });

      return new Promise((resolve, reject) => {
        blobStream.on('error', (error) => {
          this.logger.error('GCP Upload error:', error);
          reject(new InternalServerErrorException('Failed to upload file'));
        });

        blobStream.on('finish', async () => {
          try {
            const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${fileName}`;
            this.logger.log(`File uploaded successfully: ${publicUrl}`);
            resolve(publicUrl);
          } catch (error) {
            this.logger.error('Error making file public:', error);
            reject(
              new InternalServerErrorException('Failed to make file public'),
            );
          }
        });

        // Write the file buffer to the stream
        blobStream.end(file.buffer);
      });
    } catch (error) {
      this.logger.error('Error uploading file:', error);
      throw new InternalServerErrorException('Failed to upload file');
    }
  }

  async deleteFile(fileUrl: string): Promise<void> {
    try {
      // Extract filename from URL
      const fileName = fileUrl.split(`${this.bucketName}/`)[1];

      if (!fileName) {
        throw new BadRequestException('Invalid file URL provided for deletion');
      }
      const file = this.bucket.file(fileName);
      const [exists] = await file.exists();

      if (!exists) {
        throw new BadRequestException(`File not found: ${fileName}`);
      }

      await file.delete();
      this.logger.log(`File deleted successfully: ${fileName}`);
    } catch (error) {
      throw new InternalServerErrorException('Failed to delete file');
    }
  }

  async listFiles(prefix = ''): Promise<Record<string, string>[]> {
    try {
      const [files] = await this.bucket.getFiles({ prefix });
      return files.map((file) => {
        return { url: file.publicUrl(), name: file.name };
      });
    } catch (error) {
      this.logger.error('Error listing files:', error);
      throw new InternalServerErrorException('Failed to list files');
    }
  }

  async deleteFolder(prefix = ''): Promise<void> {
    try {
      this.logger.log(
        `Attempting to delete all files with prefix: "${prefix}"`,
      );

      const files = await this.listFiles(prefix);

      if (files.length === 0) {
        this.logger.warn(
          `No files found with prefix: "${prefix}". Nothing to delete.`,
        );
        return;
      }

      this.logger.log(`No of files to be deleted: "${files.length}".`);

      const deletePromises = files.map((file) =>
        this.bucket.file(file.name).delete(),
      );
      const results = await Promise.allSettled(deletePromises);

      // Track failed files to provide a clear report at the end
      const failedFiles: string[] = [];

      results.forEach((result, index) => {
        const fileName = files[index];
        if (result.status === 'fulfilled') {
          this.logger.debug(`Successfully deleted: ${fileName}`);
        } else {
          // Construct the URL so you know exactly which one failed
          const fileUrl = `https://storage.googleapis.com/${this.bucketName}/${fileName}`;
          failedFiles.push(fileUrl);

          this.logger.error(
            `FAILED TO DELETE: ${fileName} | URL: ${fileUrl} | Reason: ${result.reason}`,
          );
        }
      });

      // Summary logging
      const total = files.length;
      const failedCount = failedFiles.length;
      const successCount = total - failedCount;

      this.logger.log(
        `Delete operation finished. Success: ${successCount}, Failures: ${failedCount}`,
      );
    } catch (error) {
      this.logger.error(
        `Critical error during bulk delete for prefix "${prefix}":`,
        error,
      );
      throw new InternalServerErrorException('Failed to delete files');
    }
  }

  async generateSignedReadUrl(
    filePath: string,
    expiresInMinutes = 5,
  ): Promise<string> {
    const options = {
      version: 'v4' as const,
      action: 'read' as const,
      expires: Date.now() + expiresInMinutes * 60 * 1000,
    };

    const [url] = await this.storage
      .bucket(this.bucketName)
      .file(filePath)
      .getSignedUrl(options);

    return url;
  }

  async generateSignedUploadUrl(
    filePath: string,
    contentType: string,
    expiresInMinutes = 5,
  ): Promise<string> {
    const options = {
      version: 'v4' as const,
      action: 'write' as const,
      expires: Date.now() + expiresInMinutes * 60 * 1000,
      contentType,
    };

    const [url] = await this.storage
      .bucket(this.bucketName)
      .file(filePath)
      .getSignedUrl(options);

    return url;
  }
}
