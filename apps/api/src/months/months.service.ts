import { Injectable } from '@nestjs/common';
import type { MonthInfo } from '@suivi/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MonthsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Onglets de mois : mois possédant au moins une ligne active, avec le
   * nombre de lignes. "AAAA-MM" se trie lexicographiquement = chronologiquement.
   */
  async list(): Promise<MonthInfo[]> {
    const groups = await this.prisma.row.groupBy({
      by: ['month'],
      where: { archived: false },
      _count: { _all: true },
      orderBy: { month: 'asc' },
    });
    return groups.map((group) => ({ month: group.month, count: group._count._all }));
  }
}
