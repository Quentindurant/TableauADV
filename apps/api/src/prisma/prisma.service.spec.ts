import { Test } from '@nestjs/testing';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it("appelle $connect à l'initialisation du module", async () => {
    const service = new PrismaService();
    const connectSpy = jest
      .spyOn(service, '$connect')
      .mockResolvedValue(undefined as never);

    await service.onModuleInit();

    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('est fourni et exporté par PrismaModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
    }).compile();

    const service = moduleRef.get(PrismaService);
    expect(service).toBeDefined();
    expect(service).toHaveProperty('onModuleInit');
    expect(service).toHaveProperty('$connect');
  });
});
