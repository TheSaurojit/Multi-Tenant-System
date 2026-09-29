import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',

  datasource: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://saas_user:saas_password@localhost:5432/saas_analytics?schema=public',

  },
  migrations: {
    path: "prisma/migrations",
    seed: 'tsx prisma/seed.ts',
  },
})
