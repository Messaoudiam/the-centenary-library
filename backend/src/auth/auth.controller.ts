// nestjs
import {
  Controller,
  Post,
  Body,
  Get,
  Req,
  Res,
  HttpStatus,
  UseGuards,
  Logger,
  HttpCode,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';
import { Public } from './decorators/public.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiCookieAuth,
  ApiBearerAuth,
} from '@nestjs/swagger';

// services
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

// dto & schemas
import { LoginUserDto } from '../users/dto/login-user.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import {
  AuthResponseDto,
  MessageResponseDto,
  ErrorResponseDto,
  UserResponseDto,
} from '../common/dto/api-response.dto';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @ApiOperation({
    summary: 'Inscription',
    description: 'Permet de créer un compte utilisateur',
  })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({
    status: 201,
    description: 'Inscription réussie',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Données invalides',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Email déjà utilisé',
    type: ErrorResponseDto,
  })
  @Public()
  @Post('register')
  async register(
    @Body() registerDto: CreateUserDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const user = await this.authService.register(
        registerDto.email,
        registerDto.password,
      );

      const tokens = await this.authService.generateTokens(user);

      // Set cookies
      this.authService.setAccessTokenCookie(response, tokens.accessToken);
      this.authService.setRefreshTokenCookie(response, tokens.refreshToken);

      return {
        message: 'Inscription réussie',
        user: {
          id: user.id,
          email: user.email,
        },
      };
    } catch (error) {
      // Gérer les erreurs spécifiques
      if (error.message === 'Cet email est déjà utilisé') {
        return response.status(HttpStatus.CONFLICT).json({
          message: error.message,
        });
      }

      // Réponse générique pour les autres erreurs
      return response.status(HttpStatus.BAD_REQUEST).json({
        message:
          error.message || "Une erreur est survenue lors de l'inscription",
      });
    }
  }

  @ApiOperation({
    summary: 'Connexion',
    description: 'Permet de se connecter avec email et mot de passe',
  })
  @ApiBody({ type: LoginUserDto })
  @ApiResponse({
    status: 200,
    description: 'Connexion réussie',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Identifiants invalides',
    type: ErrorResponseDto,
  })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() loginDto: LoginUserDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      // Appel direct du service au lieu de passer par le PassportStrategy
      const user = await this.authService.validateUser(
        loginDto.email,
        loginDto.password,
      );

      const tokens = await this.authService.generateTokens(user);

      // Set cookies
      this.authService.setAccessTokenCookie(response, tokens.accessToken);
      this.authService.setRefreshTokenCookie(response, tokens.refreshToken);

      return {
        message: 'Connexion réussie',
        user: {
          id: user.id,
          email: user.email,
          nom: user.nom,
          prenom: user.prenom,
          role: user.role,
        },
      };
    } catch (error) {
      this.logger.error(
        `Échec de connexion pour ${loginDto.email}: ${error.message}`,
        error.stack,
      );

      // Gérer les différents types d'erreurs
      if (error.message.includes('verrouillé')) {
        return response.status(HttpStatus.UNAUTHORIZED).json({
          message: error.message,
        });
      }

      // Erreur générique d'authentification
      return response.status(HttpStatus.UNAUTHORIZED).json({
        message: 'Email ou mot de passe incorrect',
      });
    }
  }

  @ApiOperation({
    summary: 'Déconnexion',
    description: 'Permet de se déconnecter',
  })
  @ApiResponse({
    status: 200,
    description: 'Déconnexion réussie',
    type: MessageResponseDto,
  })
  @ApiCookieAuth()
  @Post('logout')
  async logout(@Res() response: Response) {
    // Supprimer les cookies
    response.clearCookie('access_token');
    response.clearCookie('refresh_token');
    // S'assurer aussi de supprimer les anciens noms de cookies par prudence
    response.clearCookie('accessToken');
    response.clearCookie('refreshToken');

    return response.status(HttpStatus.OK).json({
      message: 'Déconnexion réussie',
    });
  }

  @ApiOperation({
    summary: 'Rafraîchir le token',
    description:
      "Permet de générer un nouveau token d'accès à partir du refresh token",
  })
  @ApiResponse({
    status: 200,
    description: 'Token rafraîchi avec succès',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh token invalide ou expiré',
    type: ErrorResponseDto,
  })
  @ApiCookieAuth('refresh-token')
  @UseGuards(JwtRefreshAuthGuard)
  @Post('refresh')
  async refreshToken(
    @Req() request: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      // L'ID de l'utilisateur est extrait du refresh token par la stratégie JwtRefreshStrategy
      const userId = request.user.id;

      // Récupérer les informations complètes de l'utilisateur
      const user = await this.usersService.findOneUser(userId);

      if (!user) {
        return response.status(HttpStatus.UNAUTHORIZED).json({
          message: 'Utilisateur non trouvé',
        });
      }

      // Générer de nouveaux tokens
      const tokens = await this.authService.generateTokens(user);

      // Mettre à jour les cookies
      this.authService.setAccessTokenCookie(response, tokens.accessToken);
      this.authService.setRefreshTokenCookie(response, tokens.refreshToken);

      return {
        message: 'Token rafraîchi avec succès',
      };
    } catch (error) {
      this.logger.error('Erreur lors du rafraîchissement du token:', error);
      return response.status(HttpStatus.UNAUTHORIZED).json({
        message: 'Échec du rafraîchissement du token',
      });
    }
  }

  @ApiOperation({
    summary: 'Vérifier authentification',
    description:
      "Vérifie si l'utilisateur est authentifié et renvoie ses informations",
  })
  @ApiResponse({
    status: 200,
    description: 'Utilisateur authentifié',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Non authentifié',
    type: ErrorResponseDto,
  })
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard)
  @Get('check-auth')
  async checkAuth(@Req() request: any) {
    try {
      // L'ID utilisateur est disponible dans request.user.id grâce au JwtStrategy
      const userId = request.user.id;
      const user = await this.usersService.findOneUser(userId);

      if (!user) {
        return {
          authenticated: false,
          message: 'Utilisateur non trouvé',
        };
      }

      return {
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      };
    } catch (error) {
      this.logger.error(
        "Erreur lors de la vérification de l'authentification:",
        error,
      );
      throw error;
    }
  }

  @ApiOperation({
    summary: 'Profil utilisateur',
    description: 'Récupère les informations du profil utilisateur connecté',
  })
  @ApiResponse({
    status: 200,
    description: 'Profil récupéré avec succès',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Non authentifié',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Utilisateur non trouvé',
    type: ErrorResponseDto,
  })
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Req() request: any, @Res() response: Response) {
    try {
      // L'ID utilisateur est maintenant disponible dans request.user.id grâce au JwtStrategy
      const userId = request.user.id;

      const user = await this.usersService.findOneUser(userId);

      if (!user) {
        this.logger.warn('Utilisateur non trouvé avec ID:', userId);
        return response.status(HttpStatus.NOT_FOUND).json({
          message: 'Utilisateur non trouvé',
        });
      }

      return response.status(HttpStatus.OK).json(user);
    } catch (error) {
      this.logger.error('Erreur lors de la récupération du profil:', error);
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: 'Erreur lors de la récupération du profil',
      });
    }
  }
}
