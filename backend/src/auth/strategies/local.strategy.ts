import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(LocalStrategy.name);

  constructor(private authService: AuthService) {
    super({
      usernameField: 'email',
      passwordField: 'password',
    });
    ("Stratégie d'authentification locale initialisée");
  }

  async validate(email: string, password: string): Promise<any> {
    try {
      const user = await this.authService.validateUser(email, password);

      if (!user) {
        this.logger.warn(
          `Validation échouée pour: ${email} - Aucun utilisateur retourné`,
        );
        throw new UnauthorizedException('Identifiants invalides');
      }

      return user;
    } catch (error) {
      this.logger.error(
        `Erreur lors de la validation dans LocalStrategy: ${error.message}`,
      );
      throw error;
    }
  }
}
