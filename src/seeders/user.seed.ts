import { faker } from "@faker-js/faker";
import { hash } from "bcrypt";
import { User } from "../modules/user/user.model.js";

// Seeded users can log in with this password
const SEED_PASSWORD = "password123";

export const createUsers = async (count: number): Promise<void> => {
    const password = await hash(SEED_PASSWORD, 10);
    await User.insertMany(
        Array.from({ length: count }, () => ({
            name: faker.person.fullName(),
            username: faker.internet.userName().replace(/[^a-zA-Z0-9_.]/g, "").slice(0, 20).padEnd(3, "x"),
            bio: faker.lorem.sentence(10).slice(0, 160),
            password,
            avatar: { url: faker.image.avatar(), public_id: faker.system.fileName() },
        })),
        { ordered: false }
    );
    console.log("Users created", count);
};
