import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
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
  references:text('references_json').notNull().default('[]'),
  attachments:text('attachments_json').notNull().default('[]'),
  assistantSource:text('assistant_source').notNull().default('server'),
  wellbeing:text('wellbeing_json')
},table=>[index('journal_owner_astronaut_time').on(table.ownerId,table.astronautId,table.createdAt)]);
export const journalPhotos=sqliteTable('journal_photos',{
  id:text('id').primaryKey(),
  ownerId:text('owner_id').notNull(),
  astronautId:text('astronaut_id').notNull(),
  kind:text('media_kind').notNull().default('photo'),
  duration:integer('duration_ms'),
  frames:text('frames_json').notNull().default('[]'),
  region:text('region').notNull(),
  regionKey:text('region_key').notNull(),
  createdAt:text('created_at').notNull(),
  objectKey:text('object_key').notNull(),
  mime:text('mime').notNull(),
  width:integer('width').notNull(),
  height:integer('height').notNull(),
  bytes:integer('bytes').notNull(),
  digest:text('digest').notNull(),
  vectorStatus:text('vector_status').notNull().default('pending'),
  model:text('model'),
  vector:text('vector_json')
},table=>[index('photos_owner_profile_region_time').on(table.ownerId,table.astronautId,table.regionKey,table.createdAt)]);
export const personalStories=sqliteTable('personal_stories',{
  id:text('id').primaryKey(),
  ownerId:text('owner_id').notNull(),
  authorName:text('author_name').notNull(),
  caption:text('caption').notNull().default(''),
  health:text('health_json'),
  kind:text('media_kind').notNull(),
  objectKey:text('object_key').notNull(),
  posterKey:text('poster_key'),
  mime:text('mime').notNull(),
  bytes:integer('bytes').notNull(),
  width:integer('width').notNull(),
  height:integer('height').notNull(),
  duration:integer('duration_ms'),
  digest:text('digest').notNull(),
  createdAt:text('created_at').notNull()
},table=>[index('stories_owner_time').on(table.ownerId,table.createdAt)]);

export const journalTextVectors=sqliteTable('journal_text_vectors',{
  messageId:text('message_id').primaryKey(),
  ownerId:text('owner_id').notNull(),
  astronautId:text('astronaut_id').notNull(),
  model:text('model').notNull(),
  vectors:text('vectors_json').notNull(),
  indexedAt:text('indexed_at').notNull()
},table=>[index('text_vectors_owner_profile_model').on(table.ownerId,table.astronautId,table.model)]);

export const journalTrainingJobs=sqliteTable('journal_training_jobs',{
  id:text('id').primaryKey(),
  ownerId:text('owner_id').notNull(),
  astronautId:text('astronaut_id').notNull(),
  status:text('status').notNull(),
  exampleCount:integer('example_count').notNull(),
  progress:text('progress_json').notNull().default('{}'),
  createdAt:text('created_at').notNull(),
  updatedAt:text('updated_at').notNull()
},table=>[index('training_owner_profile_time').on(table.ownerId,table.astronautId,table.createdAt)]);

export const generalChatMessages=sqliteTable('general_chat_messages',{
  id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),role:text('role').notNull(),content:text('content').notNull(),createdAt:text('created_at').notNull(),replyTo:text('reply_to'),wellbeing:text('wellbeing_json')
},table=>[index('general_chat_owner_time').on(table.ownerId,table.createdAt,table.id),uniqueIndex('general_chat_owner_reply').on(table.ownerId,table.replyTo)]);

export const personalFavorites=sqliteTable('personal_favorites',{
  id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),sourceType:text('source_type').notNull(),sourceId:text('source_id').notNull(),profileId:text('profile_id'),content:text('content').notNull(),sourceCreatedAt:text('source_created_at').notNull(),createdAt:text('created_at').notNull(),wellbeing:text('wellbeing_json')
},table=>[uniqueIndex('favorites_owner_source').on(table.ownerId,table.sourceType,table.sourceId),index('favorites_owner_time').on(table.ownerId,table.createdAt,table.id)]);

export const activityEvents=sqliteTable('activity_events',{id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),kind:text('kind').notNull(),summary:text('summary').notNull(),createdAt:text('created_at').notNull()},table=>[index('activity_owner_time').on(table.ownerId,table.createdAt,table.id)]);
