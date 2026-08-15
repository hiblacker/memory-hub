import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
})

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const memoryCandidates = pgTable('memory_candidates', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  memoryType: text('memory_type').notNull(),
  source: text('source').notNull(),
  project: text('project'),
  sensitivity: text('sensitivity').notNull(),
  confidence: integer('confidence').notNull(),
  renderStyle: text('render_style').notNull().default('xhs_note'),
  emojiEnabled: boolean('emoji_enabled').notNull().default(true),
  rejectionReason: text('rejection_reason'),
  captureTime: timestamp('capture_time', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const archiveDeliveries = pgTable('archive_deliveries', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
