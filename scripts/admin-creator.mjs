import {randomBytes, scryptSync} from "node:crypto";
import {createInterface} from "node:readline";
import {stdin as input, stdout as output} from "node:process";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

/** Opt-in: allow short passwords that fail the normal strength policy (e.g. admin:admin). */
const ALLOW_INSECURE_FLAG = "--allow-insecure";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function question(rl, text) {
    return new Promise((resolve) => rl.question(text, resolve));
}

function fail(message) {
    console.error(`\nError: ${message}`);
    process.exitCode = 1;
    console.error(); // trailing blank line for readability
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

/** Read all piped stdin lines (reliable for non-interactive / test use). */
function readPipedLines() {
    return new Promise((resolve, reject) => {
        let data = "";
        input.setEncoding("utf8");
        input.on("data", (chunk) => {
            data += chunk;
        });
        input.on("end", () => {
            const lines = data.split(/\r?\n/);
            // Drop trailing empty line from final newline
            if (lines.length > 0 && lines[lines.length - 1] === "") {
                lines.pop();
            }
            resolve(lines);
        });
        input.on("error", reject);
    });
}

/**
 * Read username + password + confirm.
 * Interactive TTY uses hidden password entry; piped stdin reads three lines.
 */
async function promptCredentials() {
    if (!input.isTTY) {
        const lines = await readPipedLines();
        const rawUsername = lines[0] ?? "";
        const password = lines[1] ?? "";
        const passwordConfirm = lines[2] ?? "";
        output.write("Admin username: " + rawUsername + "\n");
        output.write("Admin password: " + "*".repeat(Math.max(password.length, 0)) + "\n");
        output.write(
            "Repeat admin password: " + "*".repeat(Math.max(passwordConfirm.length, 0)) + "\n",
        );
        return {rawUsername, password, passwordConfirm};
    }

    const rl = createInterface({input, output, terminal: true});
    try {
        const rawUsername = await question(rl, "Admin username: ");
        rl.pause();
        const password = await askHidden("Admin password: ");
        const passwordConfirm = await askHidden("Repeat admin password: ");
        return {rawUsername, password, passwordConfirm};
    } finally {
        rl.close();
    }
}

function normalizeUsernameInput(value) {
    return value.replace(/[\u0000-\u001F\u007F]/g, "").normalize("NFKC").trim();
}

function validateUsernameInput(value) {
    return value.length >= 1 && value.length <= 64 && /^[a-zA-Z0-9._@-]+$/.test(value);
}

/** Single source of truth shared with lib/password-policy.ts */
const passwordPolicy = JSON.parse(
    fs.readFileSync(path.resolve(projectRoot, "lib/password-policy.json"), "utf8"),
);
const MIN_PASSWORD_LENGTH = passwordPolicy.minPasswordLength;
const MAX_PASSWORD_LENGTH = passwordPolicy.maxPasswordLength;

function parseAllowInsecure(argv = process.argv.slice(2)) {
    return argv.includes(ALLOW_INSECURE_FLAG);
}

/**
 * Default: min + max length. With allowInsecure: non-empty + max only.
 * @param {string} value
 * @param {{allowInsecure?: boolean}} [options]
 */
function validatePasswordInput(value, options = {}) {
    if (value.length < 1 || value.length > MAX_PASSWORD_LENGTH) {
        return false;
    }
    if (options.allowInsecure) {
        return true;
    }
    return value.length >= MIN_PASSWORD_LENGTH;
}

/**
 * @param {string} plainPassword
 * @param {{allowInsecure?: boolean}} [options]
 */
function hashAdminPasswordForEnv(plainPassword, options = {}) {
    if (!validatePasswordInput(plainPassword, options)) {
        throw new Error("Invalid password.");
    }

    const salt = randomBytes(16);
    const derivedKey = scryptSync(plainPassword, salt, 64);

    return `scrypt$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

async function main() {
    const allowInsecure = parseAllowInsecure();

    if (allowInsecure) {
        console.warn(
            `\nWarning: ${ALLOW_INSECURE_FLAG} is set. Short/weak passwords are allowed (not for production).\n`,
        );
    }

    try {
        const {rawUsername, password, passwordConfirm} = await promptCredentials();

        const username = normalizeUsernameInput(rawUsername);

        if (!validateUsernameInput(username)) {
            fail("Invalid username. Allowed: 1-64 characters (a-z, A-Z, 0-9, ., _, @, -)");
        }

        if (password !== passwordConfirm) {
            fail("Passwords do not match.");
        }

        if (!validatePasswordInput(password, {allowInsecure})) {
            if (password.length < 1) {
                fail("Invalid password. Password cannot be empty.");
            }
            if (password.length > MAX_PASSWORD_LENGTH) {
                fail(`Invalid password. Maximum length is ${MAX_PASSWORD_LENGTH} characters.`);
            }
            fail(
                `Invalid password. Minimum length is ${MIN_PASSWORD_LENGTH} characters.` +
                    ` To allow short passwords (not for production), re-run with:` +
                    `\n  npm run setup:admin -- ${ALLOW_INSECURE_FLAG}` +
                    `\n  npm run setup:admin:insecure` +
                    `\n(Note: npm requires \`--\` before script flags; ` +
                    `\`npm run setup:admin ${ALLOW_INSECURE_FLAG}\` does not pass the flag through.)`,
            );
        }

        const passwordHash = hashAdminPasswordForEnv(password, {allowInsecure});
        const secret = randomBytes(48).toString("base64url");

        const escapedPasswordHash = passwordHash.replace(/\$/g, "\\$");

        const envContent = [
            `ADMIN_USERNAME=${username}`,
            `ADMIN_PASSWORD_HASH=${escapedPasswordHash}`,
            `ADMIN_SESSION_SECRET=${secret}`,
            "",
        ].join("\n");

        const envPath = path.resolve(process.cwd(), ".env.local");
        const mergedLines = [];
        if (fs.existsSync(envPath)) {
            const backupPath = path.resolve(process.cwd(), `.env.local.bak.${Date.now()}`);
            fs.copyFileSync(envPath, backupPath);
            console.log(`Existing .env.local backed up to: ${path.basename(backupPath)}`);
            const previous = fs.readFileSync(envPath, "utf8");
            const replaced = new Set(["ADMIN_USERNAME", "ADMIN_PASSWORD_HASH", "ADMIN_SESSION_SECRET"]);
            for (const line of previous.split(/\r?\n/)) {
                if (!line || line.startsWith("#")) {
                    mergedLines.push(line);
                    continue;
                }
                const eq = line.indexOf("=");
                const key = eq === -1 ? line : line.slice(0, eq);
                if (replaced.has(key)) {
                    continue;
                }
                mergedLines.push(line);
            }
            while (mergedLines.length > 0 && mergedLines[mergedLines.length - 1] === "") {
                mergedLines.pop();
            }
            if (mergedLines.length > 0) {
                mergedLines.push("");
            }
        }

        const output = mergedLines.length > 0
            ? `${mergedLines.join("\n")}${envContent}`
            : envContent;

        fs.writeFileSync(envPath, output, {encoding: "utf8", mode: 0o600});

        console.log("\nDone.");
        console.log(".env.local has been created.");
        if (allowInsecure) {
            console.log(`Insecure password policy was used (${ALLOW_INSECURE_FLAG}).`);
        }
        console.log("Please restart the app.");
    } catch (error) {
        console.error("\nError:", error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

void main();
