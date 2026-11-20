import { subject } from '@casl/ability';

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Athlete } from '@openathlete/database';
import {
  AthleteInjury,
  INJURY_STATUS,
  SaveInjuryLog,
} from '@openathlete/shared';

import { CaslAbilityFactory } from 'src/modules/auth';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

@Injectable()
export class InjuryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: CaslAbilityFactory,
  ) {}

  /**
   * Get all injuries for the authenticated user or specific athlete
   */
  async getInjuries(
    user: AuthUser,
    athleteId?: Athlete['athleteId'],
  ): Promise<AthleteInjury[]> {
    const ability = await this.abilities.getFor({ user });

    // Determine which athlete's injuries to fetch
    let targetAthleteId: number;

    if (athleteId) {
      // Check if user can access this athlete's data
      const athlete = await this.prisma.athlete.findUnique({
        where: { athleteId: athleteId },
      });

      if (!athlete) {
        throw new NotFoundException('Athlete not found');
      }

      if (!ability.can('read', subject('Athlete', athlete))) {
        throw new ForbiddenException('Not allowed to access this athlete');
      }

      targetAthleteId = athleteId;
    } else {
      // Use current user's athlete ID
      const athlete = await this.prisma.athlete.findFirst({
        where: {
          user: {
            userId: user.userId,
          },
        },
        select: {
          athleteId: true,
        },
      });

      if (!athlete) {
        throw new NotFoundException('Athlete not found');
      }

      targetAthleteId = athlete.athleteId;
    }

    const injuries = await this.prisma.athleteInjury.findMany({
      where: {
        athleteId: targetAthleteId,
        ...(targetAthleteId !== user.athlete?.athleteId && athleteId
          ? { privateLog: false }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Map Prisma injury_status to shared INJURY_STATUS enum
    const mappedInjuries = injuries.map((injury) => ({
      ...injury,
      status: injury.status as INJURY_STATUS,
    }));

    return mappedInjuries;
  }

  async createLog(user: AuthUser, data: SaveInjuryLog): Promise<AthleteInjury> {
    const athleteId = user.athlete?.athleteId;
    if (!athleteId) throw new ForbiddenException('Athlete profile required');

    const entry = await this.prisma.athleteInjury.create({
      data: { ...data, athleteId, privateLog: true },
    });
    return { ...entry, status: entry.status as INJURY_STATUS };
  }

  async updateLog(user: AuthUser, id: number, data: SaveInjuryLog) {
    const result = await this.prisma.athleteInjury.updateMany({
      where: {
        athleteInjuryId: id,
        privateLog: true,
        athlete: { userId: user.userId },
      },
      data,
    });
    if (!result.count)
      throw new NotFoundException('Injury log entry not found');
  }

  async deleteLog(user: AuthUser, id: number) {
    const result = await this.prisma.athleteInjury.deleteMany({
      where: {
        athleteInjuryId: id,
        privateLog: true,
        athlete: { userId: user.userId },
      },
    });
    if (!result.count)
      throw new NotFoundException('Injury log entry not found');
  }
}
