import { Controller, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller('choices')
@UseGuards(JwtAuthGuard)
export class ChoicesController {
  // Stub: PATCH/DELETE routes will be added in Tasks 3.8-3.9
}
