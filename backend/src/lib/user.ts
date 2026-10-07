import type { User } from "@prisma/client";

// Публичная проекция пользователя — без внутренних полей (id, метки времени).
export function publicUser(u: User) {
  return { phone: u.phone, airport: u.airport, callsEnabled: u.callsEnabled };
}
