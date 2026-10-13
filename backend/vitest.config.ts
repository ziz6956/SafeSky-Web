import { defineConfig } from "vitest/config";

// Конфиг vitest (SAF-300): coverage по эндпоинтам авторизации и провайдерам
// телефонии с порогом 80 %. CI гоняет `npm run coverage` на каждом пуше в
// main и в каждом PR (.github/workflows/ci.yml) — регресс 502 не проскочит.
export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/routes/auth.ts", "src/auth/**", "src/sms/**", "src/middleware/error.ts"],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
