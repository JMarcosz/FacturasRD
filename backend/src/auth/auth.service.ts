import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.activo) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }
    const passwordValida = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValida) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const payload = { sub: user.id, email: user.email, rol: user.rol };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol },
    };
  }
}
