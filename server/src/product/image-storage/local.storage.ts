import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import {
  IImageStorage,
  UploadInput,
  UploadedImageMeta,
} from './image-storage.interface';

/**
 * Disk-based image storage. Files land under `<repoRoot>/server/uploads/products/<orgId>/`
 * and are served by `ServeStaticModule` mounted at `/uploads`. Sufficient for
 * dev and any PaaS with persistent disks (Render, Railway). For ephemeral
 * runtimes (Vercel/Lambda) swap in `S3Storage` via `UPLOAD_STORAGE=s3`.
 */
@Injectable()
export class LocalImageStorage implements IImageStorage {
  private readonly logger = new Logger(LocalImageStorage.name);
  private readonly rootDir = join(process.cwd(), 'uploads', 'products');

  async upload(input: UploadInput): Promise<UploadedImageMeta> {
    const orgDir = join(this.rootDir, input.orgId);
    await fs.mkdir(orgDir, { recursive: true });

    const ext = (extname(input.originalName) || '.bin').toLowerCase();
    const filename = `${randomUUID()}${ext}`;
    const fullPath = join(orgDir, filename);

    await fs.writeFile(fullPath, input.buffer);

    const baseUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const url = `${baseUrl}/uploads/products/${input.orgId}/${filename}`;
    const storageKey = `${input.orgId}/${filename}`;

    this.logger.log(`Stored image ${storageKey} (${input.size} bytes)`);

    return { url, mimeType: input.mimeType, size: input.size, storageKey };
  }

  async delete(storageKey: string): Promise<void> {
    const fullPath = join(this.rootDir, storageKey);
    try {
      await fs.unlink(fullPath);
    } catch (err) {
      // Missing files aren't fatal — DB row removal is the source of truth.
      this.logger.warn(`Failed to delete image ${storageKey}: ${err}`);
    }
  }
}
