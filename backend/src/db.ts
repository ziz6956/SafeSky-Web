import { PrismaClient } from "@prisma/client";

// Синглтон PrismaClient. Соединение ленивое — конструктор сам по себе к БД не ходит.
export const db = new PrismaClient();
