import {
  Controller,
  Get,
  Query,
  Delete,
  Post,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StorageService } from './storage.service';

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Get()
  async getAllObjects(@Query('prefix') prefix?: string) {
    return await this.storageService.listFiles(prefix);
  }

  @Post()
  @UseInterceptors(FileInterceptor('fileUpload'))
  async uploadFile(@UploadedFile() fileUpload?: Express.Multer.File) {
    if (!fileUpload) {
      throw new BadRequestException('A file needs to be uploaded');
    }
    return await this.storageService.uploadFile(fileUpload);
  }

  @Delete()
  async deleteFile(@Query('fileUrl') fileUrl?: string) {
    if (!fileUrl) {
      throw new BadRequestException('A file url to be deleted is required');
    }
    return await this.storageService.deleteFile(fileUrl);
  }

  @Delete('folder')
  async deleteFolder(@Query('prefix') prefix?: string) {
    return await this.storageService.deleteFolder(prefix);
  }
}
