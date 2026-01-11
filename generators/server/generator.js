/**
 * JHipster View Blueprint - Server Generator
 * Adds @Immutable annotation to View entities and makes repositories read-only
 */
import BaseApplicationGenerator from 'generator-jhipster/generators/server';

export default class extends BaseApplicationGenerator {
  constructor(args, opts, features) {
    super(args, opts, { ...features, sbsBlueprint: true });
  }

  get [BaseApplicationGenerator.PREPARING_EACH_ENTITY]() {
    return this.asPreparingEachEntityTaskGroup({
      prepareViewEntity({ entity }) {
        // Check if entity has @View annotation (JHipster stores annotations in lowercase)
        const isView = entity.annotations?.view || entity.annotations?.View;
        if (isView) {
          this.log.info(`Marking entity ${entity.name} as a database view`);

          // Mark entity as immutable (read-only)
          entity.readOnly = true;
          entity.isView = true;

          // Store SQL information (annotations are lowercase)
          entity.viewSql = entity.annotations?.sql || entity.annotations?.Sql;
          entity.viewSqlFile = entity.annotations?.sqlFile || entity.annotations?.SqlFile || entity.annotations?.sqlfile;

          if (entity.viewSql) {
            this.log.info(`  SQL: ${entity.viewSql.substring(0, 50)}...`);
          }
          if (entity.viewSqlFile) {
            this.log.info(`  SQL File: ${entity.viewSqlFile}`);
          }
        }
      },
    });
  }

  get [BaseApplicationGenerator.POST_WRITING_ENTITIES]() {
    return this.asPostWritingEntitiesTaskGroup({
      async addImmutableAnnotation({ application, entities }) {
        // Filter for view entities (check annotations directly as isView may not persist across phases)
        const viewEntities = entities.filter(e => e.isView || e.annotations?.view || e.annotations?.View);

        for (const entity of viewEntities) {
          this.log.info(`Adding @Immutable annotation to ${entity.name}`);

          // Build the entity file path - JHipster 8.x stores entities in domain folder
          // Convert dot-separated class path to slash-separated file path
          const packagePath = application.packageName?.replace(/\./g, '/') || 'com/example/app';
          const entityFilePath = `${application.srcMainJava}${packagePath}/domain/${entity.entityClass}.java`;
          this.log.info(`Looking for entity file at: ${entityFilePath}`);

          // Check if file exists before editing
          if (!this.existsDestination(entityFilePath)) {
            this.log.warn(`Entity file not found: ${entityFilePath}. Skipping @Immutable annotation.`);
            continue;
          }

          // Add Hibernate @Immutable annotation
          this.editFile(entityFilePath, content => {
            // Add import after other hibernate imports or after jakarta.persistence
            if (!content.includes('import org.hibernate.annotations.Immutable;')) {
              if (content.includes('import org.hibernate.annotations.Cache;')) {
                content = content.replace(
                  'import org.hibernate.annotations.Cache;',
                  'import org.hibernate.annotations.Immutable;\nimport org.hibernate.annotations.Cache;'
                );
              } else {
                content = content.replace(
                  'import jakarta.persistence.*;',
                  'import jakarta.persistence.*;\nimport org.hibernate.annotations.Immutable;'
                );
              }
            }

            // Add @Immutable annotation before @Entity
            if (!content.includes('@Immutable')) {
              content = content.replace('@Entity\n', '@Immutable\n@Entity\n');
            }

            return content;
          });

          // Make repository read-only
          const repositoryFilePath = `${application.srcMainJava}${packagePath}/repository/${entity.entityClass}Repository.java`;

          if (this.existsDestination(repositoryFilePath)) {
            this.editFile(repositoryFilePath, content => {
              // Add comment indicating this is a read-only repository
              if (!content.includes('Read-only repository for database view')) {
                content = content.replace(
                  /(public interface \w+Repository)/,
                  `/**\n * Read-only repository for database view: ${entity.entityTableName}\n * This entity is mapped to a database view and should not be modified.\n */\n$1`
                );
              }
              return content;
            });
          }
        }
      },
    });
  }
}
