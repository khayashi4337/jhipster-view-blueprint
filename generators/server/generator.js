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

          // Make REST API read-only (remove POST/PUT/PATCH/DELETE endpoints)
          const resourceFilePath = `${application.srcMainJava}${packagePath}/web/rest/${entity.entityClass}Resource.java`;

          if (this.existsDestination(resourceFilePath)) {
            this.log.info(`Making REST API read-only for ${entity.name}`);
            this.editFile(resourceFilePath, content => {
              // Remove @PostMapping method (create)
              content = this._removeMethodByAnnotation(content, '@PostMapping');
              // Remove @PutMapping method (update)
              content = this._removeMethodByAnnotation(content, '@PutMapping');
              // Remove @PatchMapping method (partial update)
              content = this._removeMethodByAnnotation(content, '@PatchMapping');
              // Remove @DeleteMapping method (delete)
              content = this._removeMethodByAnnotation(content, '@DeleteMapping');

              // Add comment to class indicating read-only
              if (!content.includes('Read-only REST controller for database view')) {
                content = content.replace(
                  /(@RestController\n@RequestMapping)/,
                  `/**\n * Read-only REST controller for database view: ${entity.entityTableName}\n * POST/PUT/PATCH/DELETE operations are not supported for views.\n */\n$1`
                );
              }

              // Remove unused imports
              content = this._removeUnusedImports(content);

              return content;
            });
          }

          // Make Service read-only (remove save/delete methods)
          const serviceFilePath = `${application.srcMainJava}${packagePath}/service/${entity.entityClass}Service.java`;

          if (this.existsDestination(serviceFilePath)) {
            this.log.info(`Making Service read-only for ${entity.name}`);
            this.editFile(serviceFilePath, content => {
              // Remove save method
              content = this._removeMethod(content, 'public .+ save\\(');
              // Remove partialUpdate method
              content = this._removeMethod(content, 'public .+ partialUpdate\\(');
              // Remove update method
              content = this._removeMethod(content, 'public .+ update\\(');
              // Remove delete method
              content = this._removeMethod(content, 'public void delete\\(');

              // Add comment to class indicating read-only
              if (!content.includes('Read-only service for database view')) {
                content = content.replace(
                  /(@Service\n@Transactional)/,
                  `/**\n * Read-only service for database view: ${entity.entityTableName}\n * Create/Update/Delete operations are not supported for views.\n */\n$1`
                );
              }

              return content;
            });
          }
        }
      },
    });
  }

  /**
   * Remove a method from Java source by its annotation
   * @param {string} content - Java source code
   * @param {string} annotation - Annotation to match (e.g., '@PostMapping')
   * @returns {string} - Modified source code
   */
  _removeMethodByAnnotation(content, annotation) {
    // Match annotation with optional parameters, followed by the method
    // Pattern: annotation + optional whitespace/newlines + method signature + method body (balanced braces)
    const annotationRegex = new RegExp(
      `\\s*${annotation.replace('@', '@')}[^\\n]*\\n` + // Annotation line
        `(?:\\s*@[A-Za-z]+[^\\n]*\\n)*` + // Optional additional annotations
        `\\s*public[^{]+\\{` + // Method signature
        `[^}]*(?:\\{[^}]*\\}[^}]*)*` + // Method body (handles nested braces one level)
        `\\}`,
      'g'
    );

    return content.replace(annotationRegex, '');
  }

  /**
   * Remove a method from Java source by matching its signature pattern
   * @param {string} content - Java source code
   * @param {string} signaturePattern - Regex pattern for method signature
   * @returns {string} - Modified source code
   */
  _removeMethod(content, signaturePattern) {
    // Match method with optional annotations, signature, and body
    const methodRegex = new RegExp(
      `\\s*(?:@[A-Za-z]+[^\\n]*\\n)*` + // Optional annotations
        `\\s*${signaturePattern}[^{]*\\{` + // Method signature
        `[^}]*(?:\\{[^}]*\\}[^}]*)*` + // Method body (handles nested braces one level)
        `\\}`,
      'g'
    );

    return content.replace(methodRegex, '');
  }

  /**
   * Remove unused imports from Java source
   * @param {string} content - Java source code
   * @returns {string} - Modified source code
   */
  _removeUnusedImports(content) {
    const importsToCheck = [
      'import org.springframework.web.bind.annotation.PostMapping;',
      'import org.springframework.web.bind.annotation.PutMapping;',
      'import org.springframework.web.bind.annotation.PatchMapping;',
      'import org.springframework.web.bind.annotation.DeleteMapping;',
      'import jakarta.validation.Valid;',
      'import java.net.URI;',
      'import java.net.URISyntaxException;',
      'import tech.jhipster.web.util.HeaderUtil;',
    ];

    for (const importLine of importsToCheck) {
      const className = importLine.match(/\.([A-Za-z]+);$/)?.[1];
      if (className && !content.includes(`@${className}`) && !content.includes(`${className}.`) && !content.includes(`new ${className}`)) {
        // Check if the class name is used anywhere (excluding the import itself)
        const contentWithoutImport = content.replace(importLine, '');
        if (!contentWithoutImport.includes(className)) {
          content = content.replace(importLine + '\n', '');
        }
      }
    }

    return content;
  }
}
