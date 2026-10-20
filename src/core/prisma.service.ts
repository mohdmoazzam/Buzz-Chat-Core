import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config/env";
import { PrismaClient } from "../../prisma/generated/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    constructor() {
        // Prisma 7 talks to Postgres through the node-postgres driver adapter (pooled URL)
        super({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
    }

    // Fail at startup, not on the first request, if the database is unreachable
    async onModuleInit(): Promise<void> {
        await this.$connect();
    }

    async onModuleDestroy(): Promise<void> {
        await this.$disconnect();
    }

    async isReady(): Promise<boolean> {
        try {
            await this.$queryRaw`SELECT 1`;
            return true;
        } catch {
            return false;
        }
    }
}
