import { Test } from '@nestjs/testing';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  beforeAll(() => {
    // Mock $connect at prototype level to prevent actual DB connection during testing
    jest.spyOn(PrismaService.prototype, '$connect').mockResolvedValue(undefined as never);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("appelle $connect à l'initialisation du module", async () => {
    const service = new PrismaService();
    const connectSpy = jest.spyOn(service, '$connect');

    await service.onModuleInit();

    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('est fourni et exporté par PrismaModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
    }).compile();

    const service = moduleRef.get(PrismaService);
    // PrismaClient breaks instanceof due to internal Proxy/Symbol usage
    // Verify the service has the expected interface instead
    expect(service.constructor.name).toBe('PrismaService');
    expect(service.onModuleInit).toBeDefined();
    expect(typeof service.onModuleInit).toBe('function');
    expect(service.$connect).toBeDefined();
  });
});
