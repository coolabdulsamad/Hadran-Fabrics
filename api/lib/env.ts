import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const env = {
<<<<<<< HEAD
  appId: required("APP_ID"),
  appSecret: required("APP_SECRET"),
=======
>>>>>>> 0b9da5b (Remove unused APP_ID/APP_SECRET env requirements)
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
};
