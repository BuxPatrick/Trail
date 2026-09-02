import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS citext`.execute(db)
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.execute(db)

  await db.schema.createTable('users')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('email', sql`citext`, c => c.notNull().unique())
    .addColumn('password_hash', 'text', c => c.notNull())
    .addColumn('display_name', 'text', c => c.notNull())
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema.createTable('sessions')
    .addColumn('id', 'text', c => c.primaryKey())
    .addColumn('user_id', 'uuid', c =>
      c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('expires_at', 'timestamptz', c => c.notNull())
    .addColumn('user_agent', 'text')
    .execute()
  await db.schema.createIndex('sessions_user_id_idx')
    .on('sessions').column('user_id').execute()

  await db.schema.createTable('workspaces')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'text', c => c.notNull())
    .addColumn('kind', 'text', c =>
      c.notNull().check(sql`kind IN ('personal','team')`))
    .addColumn('mode', 'text', c =>
      c.notNull().defaultTo('free').check(sql`mode IN ('free','managed')`))
    .addColumn('owner_id', 'uuid', c =>
      c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()

  // Exactly one personal workspace per user; team workspaces are unlimited.
  await sql`
    CREATE UNIQUE INDEX workspaces_one_personal_per_owner
        ON workspaces (owner_id) WHERE kind = 'personal'
  `.execute(db)

  await db.schema.createTable('workspace_members')
    .addColumn('workspace_id', 'uuid', c =>
      c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', c =>
      c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('role', 'text', c =>
      c.notNull().check(sql`role IN ('admin','member')`))
    .addColumn('joined_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('workspace_members_pk', ['workspace_id', 'user_id'])
    .execute()

  await db.schema.createTable('projects')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', c =>
      c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('name', 'text', c => c.notNull())
    .addColumn('key', 'text', c => c.notNull())
    .addColumn('description', 'text')
    .addColumn('mode', 'text', c => c.check(sql`mode IN ('free','managed')`))
    .addColumn('ticket_counter', 'integer', c => c.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('archived_at', 'timestamptz')
    .addUniqueConstraint('projects_workspace_key_unique', ['workspace_id', 'key'])
    .execute()

  await db.schema.createTable('epics')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', c =>
      c.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('title', 'text', c => c.notNull())
    .addColumn('description', 'text')
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema.createTable('tickets')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', c =>
      c.notNull().references('projects.id').onDelete('cascade'))
    // SET NULL, never CASCADE: deleting an epic must not delete the work in it.
    .addColumn('epic_id', 'uuid', c =>
      c.references('epics.id').onDelete('set null'))
    .addColumn('number', 'integer', c => c.notNull())
    .addColumn('title', 'text', c => c.notNull())
    .addColumn('description', 'text')
    .addColumn('status', 'text', c => c.notNull().defaultTo('backlog')
      .check(sql`status IN ('backlog','todo','in_progress','blocked','done','closed')`))
    .addColumn('priority', 'text', c => c.notNull().defaultTo('medium')
      .check(sql`priority IN ('low','medium','high','urgent')`))
    .addColumn('assignee_id', 'uuid', c =>
      c.references('users.id').onDelete('set null'))
    .addColumn('reporter_id', 'uuid', c => c.notNull().references('users.id'))
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('tickets_project_number_unique', ['project_id', 'number'])
    .execute()

  await db.schema.createIndex('tickets_project_id_idx')
    .on('tickets').column('project_id').execute()
  await db.schema.createIndex('tickets_assignee_id_idx')
    .on('tickets').column('assignee_id').execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['tickets', 'epics', 'projects', 'workspace_members',
                   'workspaces', 'sessions', 'users']) {
    await db.schema.dropTable(t).ifExists().execute()
  }
}
