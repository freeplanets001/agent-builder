import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('auth_user', {
  id:text('id').primaryKey(), name:text('name').notNull(), email:text('email').notNull().unique(),
  emailVerified:integer('emailVerified',{mode:'boolean'}).notNull(), image:text('image'),
  createdAt:integer('createdAt',{mode:'timestamp_ms'}).notNull(), updatedAt:integer('updatedAt',{mode:'timestamp_ms'}).notNull(),
});
export const session = sqliteTable('auth_session', {
  id:text('id').primaryKey(), token:text('token').notNull().unique(), userId:text('userId').notNull().references(()=>user.id,{onDelete:'cascade'}),
  expiresAt:integer('expiresAt',{mode:'timestamp_ms'}).notNull(), createdAt:integer('createdAt',{mode:'timestamp_ms'}).notNull(), updatedAt:integer('updatedAt',{mode:'timestamp_ms'}).notNull(), ipAddress:text('ipAddress'), userAgent:text('userAgent'),
});
export const account = sqliteTable('auth_account', {
  id:text('id').primaryKey(), accountId:text('accountId').notNull(), providerId:text('providerId').notNull(),userId:text('userId').notNull().references(()=>user.id,{onDelete:'cascade'}),
  accessToken:text('accessToken'),refreshToken:text('refreshToken'),idToken:text('idToken'),scope:text('scope'),password:text('password'),
  accessTokenExpiresAt:integer('accessTokenExpiresAt',{mode:'timestamp_ms'}),refreshTokenExpiresAt:integer('refreshTokenExpiresAt',{mode:'timestamp_ms'}),
  createdAt:integer('createdAt',{mode:'timestamp_ms'}).notNull(),updatedAt:integer('updatedAt',{mode:'timestamp_ms'}).notNull(),
});
export const verification = sqliteTable('auth_verification', {
  id:text('id').primaryKey(),identifier:text('identifier').notNull(),value:text('value').notNull(),expiresAt:integer('expiresAt',{mode:'timestamp_ms'}).notNull(),createdAt:integer('createdAt',{mode:'timestamp_ms'}),updatedAt:integer('updatedAt',{mode:'timestamp_ms'}),
});
export const rateLimit=sqliteTable('rateLimit',{id:text('id').primaryKey(),key:text('key').notNull().unique(),count:integer('count').notNull(),lastRequest:integer('lastRequest').notNull()});
