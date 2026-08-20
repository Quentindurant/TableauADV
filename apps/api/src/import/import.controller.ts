import { Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { ImportFusionReportDTO } from '@suivi/shared';
import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { validationFailed } from '../common/api.exception';
import { ImportFusionService } from './fusion.service';

/** Taille maximale du classeur accepté : 10 Mo. */
export const TAILLE_MAX_FICHIER = 10 * 1024 * 1024;

/**
 * Forme minimale du fichier multipart déposé par multer (stockage mémoire par
 * défaut) — évite de dépendre des types globaux `Express.Multer.File`.
 */
export interface FichierImporte {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller('import')
@UseGuards(JwtAuthGuard)
export class ImportController {
  constructor(private readonly fusion: ImportFusionService) {}

  /**
   * Import fusion du classeur Zoho « TABLEAU SUIVI COMMANDES ».
   * Multipart, champ `file`. Réservé aux membres connectés — l'application
   * n'a pas de rôle admin distinct, la garde JWT est LA garde d'accès.
   * Au-delà de 10 Mo, multer rejette la requête (413).
   */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: TAILLE_MAX_FICHIER } }))
  async importer(
    @UploadedFile() fichier: FichierImporte | undefined,
    @CurrentUserId() userId: string,
  ): Promise<ImportFusionReportDTO> {
    if (fichier === undefined) {
      throw validationFailed('Fichier .xlsx requis (champ multipart « file »).');
    }
    if (!fichier.originalname.toLowerCase().endsWith('.xlsx')) {
      throw validationFailed('Seul un classeur .xlsx est accepté.');
    }
    return this.fusion.fusionnerClasseur(fichier.buffer, userId);
  }
}
