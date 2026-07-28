import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { AuthUser, RegisterPayload, LoginPayload } from '@/types/auth';
import { getUserModel } from './mongo';

const USERS_FILE_PATH = path.join(process.cwd(), 'data', 'users.json');

type PersistedUser = AuthUser & {
  passwordHash?: string;
  image?: string;
  googleId?: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: string;
};

function ensureStore() {
  const dir = path.dirname(USERS_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(USERS_FILE_PATH)) {
    fs.writeFileSync(USERS_FILE_PATH, JSON.stringify([], null, 2));
  }
}

function readUsers(): PersistedUser[] {
  ensureStore();
  const fileContent = fs.readFileSync(USERS_FILE_PATH, 'utf8');
  return JSON.parse(fileContent) as PersistedUser[];
}

function writeUsers(users: PersistedUser[]) {
  ensureStore();
  fs.writeFileSync(USERS_FILE_PATH, JSON.stringify(users, null, 2));
}

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [salt, storedKey] = storedHash.split(':');
  if (!salt || !storedKey) return false;
  const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return derivedKey === storedKey;
}

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

function createUserRecord(payload: RegisterPayload, role: 'Admin' | 'Trader' = 'Trader'): AuthUser {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    email: normalizeEmail(payload.email),
    name: payload.fullName.trim(),
    role,
    createdAt: now,
  };
}

export async function seedStarterUsers() {
  const model = await getUserModel();
  if (model) {
    const existing = await model.findOne({
      email: normalizeEmail('alex.thornton@cryptotradeai.io'),
    });
    if (existing) {
      return (await model.find({}).lean()) as unknown as PersistedUser[];
    }

    const starterUsers: PersistedUser[] = [
      {
        id: crypto.randomUUID(),
        email: 'alex.thornton@cryptotradeai.io',
        name: 'Alex Thornton',
        role: 'Trader',
        createdAt: new Date().toISOString(),
        passwordHash: hashPassword('TraderBot#2024'),
      },
      {
        id: crypto.randomUUID(),
        email: 'admin@cryptotradeai.io',
        name: 'Admin',
        role: 'Admin',
        createdAt: new Date().toISOString(),
        passwordHash: hashPassword('AdminAI#Secure99'),
      },
    ];

    await model.insertMany(starterUsers);
    return (await model.find({}).lean()) as unknown as PersistedUser[];
  }

  const users = readUsers();
  const existing = users.some((user) => user.email === 'alex.thornton@cryptotradeai.io');
  if (existing) return users;

  const starterUsers: PersistedUser[] = [
    {
      id: crypto.randomUUID(),
      email: 'alex.thornton@cryptotradeai.io',
      name: 'Alex Thornton',
      role: 'Trader',
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword('TraderBot#2024'),
    },
    {
      id: crypto.randomUUID(),
      email: 'admin@cryptotradeai.io',
      name: 'Admin',
      role: 'Admin',
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword('AdminAI#Secure99'),
    },
  ];

  const seededUsers = [...users, ...starterUsers];
  writeUsers(seededUsers);
  return seededUsers;
}

export async function registerUser(payload: RegisterPayload) {
  const model = await getUserModel();
  if (model) {
    const normalizedEmail = normalizeEmail(payload.email);
    const existing = await model.findOne({ email: normalizedEmail });
    if (existing) {
      throw new Error('An account with this email already exists.');
    }

    const user = createUserRecord(payload);
    const passwordHash = hashPassword(payload.password);
    const savedUser = await model.create({
      ...user,
      email: normalizedEmail,
      passwordHash,
    });
    const { _id, email, name, role, createdAt } = savedUser.toObject();
    return {
      user: {
        id: _id.toString(),
        email,
        name,
        role,
        createdAt,
      },
      // Token is kept for API compatibility but not used for authentication
      token: '',
    };
  }

  const users = await seedStarterUsers();
  const normalizedEmail = normalizeEmail(payload.email);

  if (users.some((user) => user.email === normalizedEmail)) {
    throw new Error('An account with this email already exists.');
  }

  const user = createUserRecord(payload);
  const passwordHash = hashPassword(payload.password);
  const persistedUsers: PersistedUser[] = [
    ...users,
    {
      ...user,
      passwordHash,
    },
  ];

  writeUsers(persistedUsers);
  return {
    user,
    // Token is kept for API compatibility but not used for authentication
    token: '',
  };
}

export async function signInUser(payload: LoginPayload) {
  const model = await getUserModel();
  if (model) {
    const normalizedEmail = normalizeEmail(payload.email);
    const userRecord = await model.findOne({ email: normalizedEmail });

    if (!userRecord) {
      // fall through to JSON fallback by setting model to null
      // (we'll just let the code continue after this if block)
    } else {
      if (!userRecord.passwordHash) {
        throw new Error('Invalid credentials.');
      }

      const passwordMatches = verifyPassword(payload.password, userRecord.passwordHash);
      if (!passwordMatches) {
        throw new Error('Invalid credentials.');
      }

      const { _id, email, name, role, createdAt, kycStatus } = userRecord.toObject();
      return {
        user: {
          id: _id.toString(),
          email,
          name,
          role,
          createdAt,
          kycStatus: kycStatus || 'unverified',
        },
        // Token is kept for API compatibility but not used for authentication
        token: '',
      };
    }
  }

  const users = await seedStarterUsers();
  const normalizedEmail = normalizeEmail(payload.email);
  const userRecord = users.find((user) => user.email === normalizedEmail) as
    PersistedUser | undefined;

  if (!userRecord?.passwordHash) {
    throw new Error('Invalid credentials.');
  }

  const passwordMatches = verifyPassword(payload.password, userRecord.passwordHash);

  if (!passwordMatches) {
    throw new Error('Invalid credentials.');
  }

  const { passwordHash: _passwordHash, ...user } = userRecord;
  return {
    user,
    // Token is kept for API compatibility but not used for authentication
    token: '',
  };
}

export async function getUserByEmail(email: string) {
  const model = await getUserModel();
  if (model) {
    const user = await model.findOne({ email: normalizeEmail(email) }).lean();
    if (user) {
      return {
        ...user,
        id: user._id.toString(),
      };
    }
    return undefined;
  }

  const users = readUsers();
  return users.find((user) => user.email === normalizeEmail(email));
}

export async function updateUser(
  id: string,
  updates: Partial<{
    id: string;
    email: string;
    name: string;
    role: 'Admin' | 'Trader';
    createdAt: string;
    googleId?: string;
    image?: string;
  }>
) {
  const model = await getUserModel();
  if (model) {
    // Remove undefined fields
    const updateData = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );
    await model.updateOne({ _id: id }, { $set: updateData });
    return;
  }

  // Fallback to JSON file
  const users = await readUsers();
  const index = users.findIndex((user) => user.id === id);
  if (index === -1) {
    throw new Error('User not found');
  }
  const updatedUser = { ...users[index], ...updates };
  // Remove undefined fields
  Object.keys(updatedUser).forEach(
    (key) => updatedUser[key] === undefined && delete updatedUser[key]
  );
  users[index] = updatedUser;
  writeUsers(users);
}

/**
 * Generates a password reset token for the given email (if an account exists)
 * and persists it with a 1-hour expiry. Returns the token, or undefined if no
 * account matches - callers should respond identically either way to avoid
 * leaking which emails have accounts.
 */
export async function requestPasswordReset(email: string): Promise<string | undefined> {
  const normalizedEmail = normalizeEmail(email);
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  const model = await getUserModel();
  if (model) {
    const user = await model.findOne({ email: normalizedEmail });
    if (!user) return undefined;
    user.resetPasswordToken = token;
    user.resetPasswordExpires = expires;
    await user.save();
    return token;
  }

  const users = readUsers();
  const index = users.findIndex((user) => user.email === normalizedEmail);
  if (index === -1) return undefined;

  users[index] = {
    ...users[index],
    resetPasswordToken: token,
    resetPasswordExpires: expires.toISOString(),
  } as PersistedUser;
  writeUsers(users);
  return token;
}

/**
 * Verifies a reset token (must be unexpired) and sets a new password,
 * clearing the token afterward so it can't be reused.
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const model = await getUserModel();
  if (model) {
    const user = await model.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    });
    if (!user) {
      throw new Error('This reset link is invalid or has expired.');
    }
    user.passwordHash = hashPassword(newPassword);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    return;
  }

  const users = readUsers();
  const index = users.findIndex(
    (user) =>
      user.resetPasswordToken === token &&
      user.resetPasswordExpires &&
      new Date(user.resetPasswordExpires).getTime() > Date.now()
  );
  if (index === -1) {
    throw new Error('This reset link is invalid or has expired.');
  }

  users[index] = {
    ...users[index],
    passwordHash: hashPassword(newPassword),
    resetPasswordToken: undefined,
    resetPasswordExpires: undefined,
  };
  writeUsers(users);
}

/**
 * Generates an email-verification token for the given user and persists it
 * with a 24-hour expiry. Unlike password reset, this is keyed by user id
 * (called right after registration, when we already have the user), not
 * by email lookup.
 */
export async function requestEmailVerification(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  const model = await getUserModel();
  if (!model) {
    throw new Error('Database connection unavailable');
  }

  await model.findByIdAndUpdate(userId, {
    $set: { emailVerificationToken: token, emailVerificationExpires: expires },
  });

  return token;
}

/**
 * Verifies an email-verification token (must be unexpired) and marks the
 * user's email as verified, clearing the token so it can't be reused.
 * Returns the user id on success, or null if the token is invalid/expired.
 */
export async function verifyEmailToken(token: string): Promise<{ userId: string } | null> {
  const model = await getUserModel();
  if (!model) {
    throw new Error('Database connection unavailable');
  }

  const user = await model.findOne({
    emailVerificationToken: token,
    emailVerificationExpires: { $gt: new Date() },
  });
  if (!user) return null;

  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  return { userId: user._id.toString() };
}

export async function createUser(
  userData: Omit<
    {
      id: string;
      email: string;
      name: string;
      role: 'Admin' | 'Trader';
      createdAt: string;
      googleId?: string;
      image?: string;
    },
    'id'
  >
) {
  const model = await getUserModel();
  if (model) {
    const newUser = {
      ...userData,
      id: crypto.randomUUID(),
    };
    await model.create(newUser);
    return newUser;
  }

  // Fallback to JSON file
  const users = await readUsers();
  const newUser = {
    ...userData,
    id: crypto.randomUUID(),
  };
  users.push(newUser);
  writeUsers(users);
  return newUser;
}
