import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ColumnsModule } from './columns/columns.module';
import { ChoicesModule } from './choices/choices.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [PrismaModule, HealthModule, AuthModule, UsersModule, ColumnsModule, ChoicesModule],
})
export class AppModule {}
