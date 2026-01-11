/**
 * JHipster View Blueprint - Liquibase Generator
 * Generates createView changelog entries for View entities
 */
import BaseApplicationGenerator from 'generator-jhipster/generators/liquibase';
import { readFileSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

export default class extends BaseApplicationGenerator {
  constructor(args, opts, features) {
    super(args, opts, { ...features, sbsBlueprint: true });
    // Counter to ensure unique timestamps for multiple views generated in same second
    this._timestampCounter = 0;
  }

  get [BaseApplicationGenerator.PREPARING_EACH_ENTITY]() {
    return this.asPreparingEachEntityTaskGroup({
      prepareViewEntity({ entity }) {
        // Check if entity has @View annotation (JHipster stores annotations in lowercase)
        const isView = entity.annotations?.view || entity.annotations?.View;
        if (isView) {
          entity.isView = true;
          entity.viewSql = entity.annotations?.sql || entity.annotations?.Sql;
          entity.viewSqlFile = entity.annotations?.sqlFile || entity.annotations?.SqlFile || entity.annotations?.sqlfile;

          // Validate empty SQL
          if (entity.viewSql && entity.viewSql.trim() === '') {
            this.log.warn(`Entity ${entity.name}: @Sql annotation is empty`);
            entity.viewSql = null;
          }

          // Suppress fake-data generation for View entities
          entity.skipFakeData = true;

          this.log.info(`View entity detected: ${entity.name}`);
          if (entity.viewSql) {
            const preview = entity.viewSql.length > 50 ? entity.viewSql.substring(0, 50) + '...' : entity.viewSql;
            this.log.info(`  SQL: ${preview}`);
          }
          if (entity.viewSqlFile) {
            this.log.info(`  SQL File: ${entity.viewSqlFile}`);
          }
        }
      },
    });
  }

  get [BaseApplicationGenerator.WRITING_ENTITIES]() {
    return this.asWritingEntitiesTaskGroup({
      async writeChangelogs() {
        this.log.info(`writeChangelogs: ${this.databaseChangelogs?.length || 0} total changelogs`);

        if (this.databaseChangelogs && Array.isArray(this.databaseChangelogs)) {
          // Filter out View entity changelogs (non-destructive)
          const filteredChangelogs = this.databaseChangelogs.filter(changelog => {
            const isView = changelog.entity?.isView;
            if (isView) {
              this.log.info(`Skipping table definition changelog for view entity: ${changelog.entity.name}`);
            }
            return !isView;
          });

          this.log.info(`After filtering: ${filteredChangelogs.length} changelogs for normal entities`);

          // Write changelogs for normal entities only
          return Promise.all(filteredChangelogs.map(databaseChangelog => this.writeChangelog({ databaseChangelog })));
        }
      },
      async writeViewChangelogs({ application, entities }) {
        for (const entity of entities.filter(e => e.isView)) {
          await this._generateViewChangelog(application, entity);
        }
      },
    });
  }

  get [BaseApplicationGenerator.POST_WRITING_ENTITIES]() {
    return this.asPostWritingEntitiesTaskGroup({
      async cleanupViewEntityFiles({ application, entities }) {
        // Remove View entity table definition entries from master.xml
        const viewEntities = entities.filter(e => e.isView);

        for (const entity of viewEntities) {
          const masterChangelogPath = `${application.srcMainResources}config/liquibase/master.xml`;
          if (this.existsDestination(masterChangelogPath)) {
            this.editFile(masterChangelogPath, content => {
              // Patterns for changelog filenames (JHipster generates 14-digit timestamps)
              const patterns = [`_added_entity_${entity.entityClass}.xml`, `_added_entity_constraints_${entity.entityClass}.xml`];

              patterns.forEach(pattern => {
                const escapedPattern = pattern.replace(/\./g, '\\.');
                const regex = new RegExp(`\\s*<include\\s+file="config/liquibase/changelog/\\d{14}${escapedPattern}"[^/>]*/?>\\s*`, 'g');
                content = content.replace(regex, '\n');
              });

              return content;
            });
          }
        }
      },
    });
  }

  get [BaseApplicationGenerator.END]() {
    return this.asEndTaskGroup({
      async removeViewEntityTableDefinitions() {
        this.log.info('END: Removing View entity table definition files');

        const jhipsterDir = this.destinationPath('.jhipster');
        if (!existsSync(jhipsterDir)) {
          return;
        }

        const entityFiles = readdirSync(jhipsterDir).filter(f => f.endsWith('.json'));
        const application = this.sharedData.getApplication();
        const changelogDir = this.destinationPath(`${application.srcMainResources}config/liquibase/changelog`);
        const fakeDataDir = this.destinationPath(`${application.srcMainResources}config/liquibase/fake-data`);

        // Build view entity config list first
        const viewEntityConfigs = [];
        for (const entityFile of entityFiles) {
          let entityConfig;
          try {
            entityConfig = JSON.parse(readFileSync(join(jhipsterDir, entityFile), 'utf8'));
          } catch (err) {
            this.log.warn(`Failed to parse entity file ${entityFile}: ${err.message}. Skipping.`);
            continue;
          }

          const isView = entityConfig.annotations?.view || entityConfig.annotations?.View;
          if (isView) {
            const entityClass = entityFile.replace('.json', '');
            const entityTableName = entityConfig.entityTableName || this._toSnakeCase(entityClass);
            viewEntityConfigs.push({ entityClass, entityTableName });
            this.log.info(`  Cleaning up files for view entity: ${entityClass}`);
          }
        }

        // Scan changelog directory once
        if (existsSync(changelogDir) && viewEntityConfigs.length > 0) {
          const changelogFiles = readdirSync(changelogDir);
          for (const filename of changelogFiles) {
            for (const { entityClass } of viewEntityConfigs) {
              // Strict pattern matching with 14-digit timestamp prefix
              const addedEntityPattern = new RegExp(`^\\d{14}_added_entity_${entityClass}\\.xml$`);
              const constraintsPattern = new RegExp(`^\\d{14}_added_entity_constraints_${entityClass}\\.xml$`);

              if (addedEntityPattern.test(filename) || constraintsPattern.test(filename)) {
                const fullPath = join(changelogDir, filename);
                this.log.info(`    Deleting: ${filename}`);
                try {
                  unlinkSync(fullPath);
                } catch (err) {
                  this.log.warn(`    Failed to delete ${filename}: ${err.message}`);
                }
                break;
              }
            }
          }
        }

        // Delete fake-data files
        for (const { entityTableName } of viewEntityConfigs) {
          const fakeDataFile = join(fakeDataDir, `${entityTableName}.csv`);
          if (existsSync(fakeDataFile)) {
            this.log.info(`    Deleting fake-data: ${entityTableName}.csv`);
            try {
              unlinkSync(fakeDataFile);
            } catch (err) {
              this.log.warn(`    Failed to delete fake-data: ${err.message}`);
            }
          }
        }
      },
    });
  }

  /**
   * Convert PascalCase/camelCase to snake_case
   * Handles consecutive uppercase letters (e.g., XMLParser -> xml_parser)
   */
  _toSnakeCase(str) {
    return str
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toLowerCase();
  }

  async _generateViewChangelog(application, entity) {
    const viewName = entity.entityTableName;
    const timestamp = this._generateTimestamp();
    const changelogFileName = `${timestamp}_create_view_${viewName}.xml`;

    let viewSql = this._resolveViewSql(entity);

    if (!viewSql || viewSql.trim() === '') {
      this.log.warn(`No SQL found for view entity: ${entity.name}. Skipping changelog generation.`);
      return;
    }

    // Extract SELECT statement from CREATE VIEW if present
    viewSql = this._extractSelectStatement(viewSql);

    const changelogPath = `${application.srcMainResources}config/liquibase/changelog/${changelogFileName}`;

    this.log.info(`Generating view changelog: ${changelogFileName}`);

    await this.writeDestination(changelogPath, this._generateChangelogContent(viewName, viewSql, timestamp, entity));

    // Add to master changelog
    await this._addToMasterChangelog(application, changelogFileName);
  }

  _resolveViewSql(entity) {
    // First try inline SQL
    if (entity.viewSql && entity.viewSql.trim()) {
      return entity.viewSql.trim();
    }

    // Then try SQL file
    if (entity.viewSqlFile) {
      // Path traversal protection
      if (entity.viewSqlFile.includes('..')) {
        this.log.error(`Invalid SQL file path (path traversal detected): ${entity.viewSqlFile}`);
        return null;
      }

      const sqlFilePath = join(this.destinationPath(), entity.viewSqlFile);

      // Verify resolved path is within project directory
      const resolvedPath = resolve(sqlFilePath);
      const projectRoot = resolve(this.destinationPath());
      if (!resolvedPath.startsWith(projectRoot)) {
        this.log.error(`SQL file path is outside project directory: ${entity.viewSqlFile}`);
        return null;
      }

      if (existsSync(sqlFilePath)) {
        try {
          return readFileSync(sqlFilePath, 'utf8');
        } catch (err) {
          this.log.error(`Failed to read SQL file: ${entity.viewSqlFile}. Error: ${err.message}`);
          return null;
        }
      } else {
        this.log.warn(`SQL file not found: ${entity.viewSqlFile}`);
      }
    }

    return null;
  }

  _extractSelectStatement(sql) {
    // If it's a CREATE VIEW statement, extract the SELECT part
    // Supports schema.view_name and quoted identifiers
    const createViewMatch = sql.match(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:(?:\w+|"[^"]+"|`[^`]+`)\.)?(?:\w+|"[^"]+"|`[^`]+`)\s+AS\s+(.+)/is);
    if (createViewMatch) {
      return createViewMatch[1].trim();
    }
    // Otherwise return as-is (assume it's already a SELECT statement)
    return sql.trim();
  }

  /**
   * Escape special XML characters to prevent XML injection
   */
  _escapeXml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  _generateChangelogContent(viewName, viewSql, timestamp, entity) {
    // Escape SQL and viewName for XML safety
    const escapedViewSql = this._escapeXml(viewSql);
    const escapedViewName = this._escapeXml(viewName);

    return `<?xml version="1.0" encoding="utf-8"?>
<databaseChangeLog
    xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
                        http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-latest.xsd">

    <!--
        Database view for entity: ${entity.entityClass}
        Generated by JHipster View Blueprint
    -->
    <changeSet id="${timestamp}-create-view-${escapedViewName}" author="jhipster-view-blueprint">
        <createView viewName="${escapedViewName}" replaceIfExists="true">
            ${escapedViewSql}
        </createView>
    </changeSet>

</databaseChangeLog>
`;
  }

  _generateTimestamp() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    // Add counter suffix (3 digits) to ensure uniqueness for multiple views
    return `${timestamp}${String(this._timestampCounter++).padStart(3, '0')}`;
  }

  async _addToMasterChangelog(application, changelogFileName) {
    const masterChangelogPath = `${application.srcMainResources}config/liquibase/master.xml`;

    if (!this.existsDestination(masterChangelogPath)) {
      this.log.warn('Master changelog not found. Please add the view changelog manually.');
      return;
    }

    const includeEntry = `    <include file="config/liquibase/changelog/${changelogFileName}" relativeToChangelogFile="false"/>`;

    this.editFile(masterChangelogPath, content => {
      // Skip if already exists (exact match)
      if (content.includes(`"config/liquibase/changelog/${changelogFileName}"`)) {
        return content;
      }

      // Add before closing tag
      return content.replace(/(<\/databaseChangeLog>)/, `${includeEntry}\n$1`);
    });
  }
}
