import { ConfigModule } from '@nestjs/config';
import { Module, Global } from '@nestjs/common';

import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [StorageService],
  exports: [StorageService],
  controllers: [StorageController],
})
export class StorageModule {}
