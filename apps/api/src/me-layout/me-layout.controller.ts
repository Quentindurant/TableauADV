import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { updateUserColumnLayoutSchema, type UserColumnLayoutDTO } from '@suivi/shared';
import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { parseOrThrow } from '../common/api-error';
import { MeLayoutService } from './me-layout.service';

@Controller('me/column-layout')
@UseGuards(JwtAuthGuard)
export class MeLayoutController {
  constructor(private readonly layout: MeLayoutService) {}

  @Get()
  list(@CurrentUserId() userId: string): Promise<UserColumnLayoutDTO[]> {
    return this.layout.list(userId);
  }

  @Patch(':columnId')
  update(
    @CurrentUserId() userId: string,
    @Param('columnId') columnId: string,
    @Body() body: unknown,
  ): Promise<UserColumnLayoutDTO> {
    return this.layout.upsert(userId, columnId, parseOrThrow(updateUserColumnLayoutSchema, body));
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  reset(@CurrentUserId() userId: string): Promise<{ deleted: number }> {
    return this.layout.reset(userId);
  }
}
