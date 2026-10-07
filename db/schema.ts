import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
export const journalMessages=sqliteTable('journal_messages',{
  id:text('id').primaryKey(),
  ownerId:text('owner_id').notNull(),
  astronautId:text('astronaut_id').notNull(),
  role:text('role').notNull(),
  content:text('content').notNull(),
  language:text('language').notNull(),
  createdAt:text('created_at').notNull(),
  vectorStatus:text('vector_status').notNull().default('pending'),
  replyTo:text('reply_to'),
  references:text('references_json').notNull().default('[]')
},table=>[index('journal_owner_astronaut_time').on(table.ownerId,table.astronautId,table.createdAt)]);
