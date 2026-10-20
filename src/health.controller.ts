import { Controller, Get, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import { PrismaService } from "./core/prisma.service";

@ApiTags("Health")
@Controller()
@SkipThrottle()
export class HealthController {
    constructor(private readonly prisma: PrismaService) {}

    @Get()
    root(): string {
        return "Server is running";
    }

    @Get("health")
    async health(@Res() res: Response): Promise<void> {
        const ready = await this.prisma.isReady();
        res.status(ready ? 200 : 503).json({
            status: ready ? "ok" : "degraded",
            uptime: Math.round(process.uptime()),
        });
    }
}
