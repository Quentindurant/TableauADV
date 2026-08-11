import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ChoicesModule } from './choices/choices.module';
import { ColumnsModule } from './columns/columns.module';
import { HealthModule } from './health/health.module';
import { MonthsModule } from './months/months.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RowsModule } from './rows/rows.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ColumnsModule,
    ChoicesModule,
    RowsModule,
    MonthsModule,
    RealtimeModule,
  ],
})
export class AppModule {}
