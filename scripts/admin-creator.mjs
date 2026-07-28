import {randomBytes, scryptSync} from "node:crypto";
import {createInterface} from "node:readline";
import {stdin as input, stdout as output} from "node:process";
import fs from "node:fs";
import path from "node:path";

function question(rl, text) {
    return new Promise((resolve) => rl.question(text, resolve));
}

function fail(message) {
    console.error(`\nError: ${message}`);
    process.exit(1);
}

function askHidden(query) {
    return new Promise((resolve) => {
        const rl = createInterface({
            input,
            output,
            terminal: true,
            historySize: 0,
        });

        const onDataHandler = (char) => {
            char = String(char);
            switch (char) {
                case "\n":
                case "\r":
                case "\u0004":
                    input.removeListener("data", onDataHandler);
                    break;
                default:
                    output.clearLine(0);
                    output.cursorTo(0);
                    output.write(query + "*".repeat(rl.line.length));
                    break;
            }
        };

        input.on("data", onDataHandler);

        rl.question(query, (value) => {
            rl.close();
            output.write("\n");
            resolve(value);
        });
    });
}

function normalizeUsernameInput(input) {
    return input.replace(/[\u0000-\u001F\u007F]/g, "").normalize("NFKC").trim();
}

function validateUsernameInput(input) {
    return input.length >= 1 && input.length <= 64 && /^[a-zA-Z0-9._@-]+$/.test(input);
}

/** Single source of truth shared with lib/password-policy.ts */
const passwordPolicy = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "lib/password-policy.json"), "utf8"),
);
const MIN_PASSWORD_LENGTH = passwordPolicy.minPasswordLength;
const MAX_PASSWORD_LENGTH = passwordPolicy.maxPasswordLength;

function validatePasswordInput(input) {
    return input.length >= MIN_PASSWORD_LENGTH && input.length <= MAX_PASSWORD_LENGTH;
}

function hashAdminPasswordForEnv(plainPassword) {
    if (!validatePasswordInput(plainPassword)) {
        throw new Error("Invalid password.");
    }

    const salt = randomBytes(16);
    const derivedKey = scryptSync(plainPassword, salt, 64);

    return `scrypt$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

async function main() {
    const rl = createInterface({input, output});

    try {
        const rawUsername = await question(rl, "Admin username: ");
        rl.close();

        const username = normalizeUsernameInput(rawUsername);

        if (!validateUsernameInput(username)) {
            fail("Invalid username. Allowed: 1-64 characters (a-z, A-Z, 0-9, ., _, @, -)");
        }

        const password = await askHidden("Admin password: ");
        const passwordConfirm = await askHidden("Repeat admin password: ");

        if (password !== passwordConfirm) {
            fail("Passwords do not match.");
        }

        if (!validatePasswordInput(password)) {
            fail(`Invalid password. Minimum length is ${MIN_PASSWORD_LENGTH} characters.`);
        }

        const passwordHash = hashAdminPasswordForEnv(password);
        const secret = randomBytes(48).toString("base64url");

        const escapedPasswordHash = passwordHash.replace(/\$/g, "\\$");

        const envContent = [
            `ADMIN_USERNAME=${username}`,
            `ADMIN_PASSWORD_HASH=${escapedPasswordHash}`,
            `ADMIN_SESSION_SECRET=${secret}`,
            "",
        ].join("\n");

        const envPath = path.resolve(process.cwd(), ".env.local");

        if (fs.existsSync(envPath)) {
            const backupPath = path.resolve(process.cwd(), `.env.local.bak.${Date.now()}`);
            fs.copyFileSync(envPath, backupPath);
            console.log(`Existing .env.local backed up to: ${path.basename(backupPath)}`);
        }

        fs.writeFileSync(envPath, envContent, {encoding: "utf8", mode: 0o600});

        console.log("\nDone.");
        console.log(".env.local has been created.");
        console.log("Please restart the app.");
    } catch (error) {
        rl.close();
        console.error("\nError:", error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

void main();
