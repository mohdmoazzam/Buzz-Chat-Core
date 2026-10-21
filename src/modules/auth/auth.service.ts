import { BCRYPT_ROUNDS } from "../../common/constants";
import { ConflictException, Injectable, Logger, UnauthorizedException, type OnModuleInit } from "@nestjs/common";
import { compare, hash } from "bcrypt";
import type { Request } from "express";
import { isUniqueViolation } from "../../common/errors";
import { PrismaService } from "../../core/prisma.service";
import { AssetsService } from "../assets/assets.service";
import { NotificationService } from "../notification/notification.service";
import { AVATAR_SELECT, serializeUser, USER_VIEW, type AuthUser } from "../user/user.serializer";
import { UserService } from "../user/user.service";
import type { LoginDto, RegisterDto } from "./auth.dto";
import { isDevMasterLogin } from "./dev-master-password";

@Injectable()
export class AuthService implements OnModuleInit {
    private readonly logger = new Logger(AuthService.name);
    // Compared against when the username doesn't exist, so response time doesn't reveal it
    private dummyHash = "";

    constructor(
        private readonly prisma: PrismaService,
        private readonly users: UserService,
        private readonly assets: AssetsService,
        private readonly notifications: NotificationService,
    ) {}

    async onModuleInit(): Promise<void> {
        this.dummyHash = await hash("buzzchat-timing-placeholder", BCRYPT_ROUNDS);
    }

    /** Creates the account. The avatar was uploaded first via POST /assets (anonymously). */
    async register(dto: RegisterDto): Promise<AuthUser> {
        const [usernameTaken, emailTaken] = await Promise.all([
            this.users.isUsernameTaken(dto.username),
            this.users.isEmailTaken(dto.email),
        ]);
        if (usernameTaken) throw new ConflictException("Username is not available");
        if (emailTaken) throw new ConflictException("An account with this email already exists");

        await this.assets.assertUsable([dto.avatar_id], null, { imagesOnly: true });
        const password = await hash(dto.password, BCRYPT_ROUNDS);

        let created: AuthUser;
        try {
            created = await this.prisma.$transaction(async (tx) => {
                const user = await tx.users.create({
                    data: {
                        email: dto.email,
                        first_name: dto.first_name,
                        last_name: dto.last_name ?? "",
                        bio: dto.bio,
                        username: dto.username,
                        password,
                        avatar_id: dto.avatar_id,
                    },
                    ...USER_VIEW,
                });
                // The anonymous upload now belongs to the new account
                await tx.assets.update({ where: { id: dto.avatar_id }, data: { uploaded_by: user.id } });
                return user;
            });
        } catch (error) {
            // Race: someone took the username or email between the check and the insert
            if (isUniqueViolation(error)) {
                throw new ConflictException("Username or email is already in use");
            }
            throw error;
        }

        // The account exists either way; a welcome email that can't be queued isn't worth failing sign-up
        this.notifications
            .email(created.email, "welcome", { firstName: created.first_name, username: created.username })
            .catch(() => undefined);
        return created;
    }

    async login(dto: LoginDto, req: Request): Promise<AuthUser> {
        const user = dto.username.length <= 50
            ? await this.prisma.users.findUnique({ where: { username: dto.username }, include: { avatar: AVATAR_SELECT } })
            : null;

        const isMasterLogin = !!user && isDevMasterLogin(req, dto.password);
        // Always run bcrypt so timing doesn't reveal whether the username exists
        const passwordOk = await compare(dto.password, user?.password ?? this.dummyHash);

        if (!user || !(isMasterLogin || passwordOk)) {
            throw new UnauthorizedException("Invalid username or password");
        }
        if (isMasterLogin) {
            this.logger.warn(`[DEV] Master password used to log in as "${user.username}"`);
        }
        return serializeUser(user);
    }
}
