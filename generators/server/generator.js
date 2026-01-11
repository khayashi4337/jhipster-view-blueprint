/**
 * JHipster View Blueprint - Server Generator
 * Adds @Immutable annotation to View entities and makes repositories read-only
 */
import BaseApplicationGenerator from 'generator-jhipster/generators/server';

// Constants
const HIBERNATE_IMMUTABLE_IMPORT = 'import org.hibernate.annotations.Immutable;';
const READ_ONLY_REPOSITORY_MARKER = 'Read-only repository for database view';
const READ_ONLY_RESOURCE_MARKER = 'Read-only REST controller for database view';
const READ_ONLY_SERVICE_MARKER = 'Read-only service for database view';

export default class extends BaseApplicationGenerator {
  constructor(args, opts, features) {
    super(args, opts, { ...features, sbsBlueprint: true });
    this._usagePatternCache = new Map();
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

          // Path traversal protection for SQL file
          const rawSqlFile = entity.annotations?.sqlFile || entity.annotations?.SqlFile || entity.annotations?.sqlfile;
          if (rawSqlFile) {
            if (rawSqlFile.includes('..') || rawSqlFile.startsWith('/') || rawSqlFile.startsWith('\\')) {
              this.log.error(`Invalid SQL file path for ${entity.name}: ${rawSqlFile}. Path traversal detected.`);
              throw new Error(`Security: SQL file path must be relative and not contain '..'`);
            }
            entity.viewSqlFile = rawSqlFile;
          }

          if (entity.viewSql) {
            this.log.debug(`  SQL: ${entity.viewSql}`);
            this.log.info(`  SQL defined inline (${entity.viewSql.length} characters)`);
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
          const packagePath = application.packageName?.replace(/\./g, '/') || 'com/example/app';
          const srcMainJava = application.srcMainJava || 'src/main/java/';
          const entityFilePath = `${srcMainJava}${packagePath}/domain/${entity.entityClass}.java`;
          this.log.info(`Looking for entity file at: ${entityFilePath}`);

          // Check if file exists before editing
          if (!this.existsDestination(entityFilePath)) {
            this.log.warn(`Entity file not found: ${entityFilePath}. Skipping @Immutable annotation.`);
            continue;
          }

          // Add Hibernate @Immutable annotation with error handling
          try {
            this._addImmutableToEntity(entityFilePath);
            this.log.info(`Successfully added @Immutable to ${entity.name}`);
          } catch (error) {
            this.log.error(`Failed to edit ${entityFilePath}: ${error.message}`);
            continue;
          }

          // Make repository read-only
          try {
            this._makeRepositoryReadOnly(srcMainJava, packagePath, entity);
          } catch (error) {
            this.log.error(`Failed to modify repository for ${entity.name}: ${error.message}`);
          }

          // Make REST API read-only
          try {
            this._makeRestApiReadOnly(srcMainJava, packagePath, entity);
          } catch (error) {
            this.log.error(`Failed to modify REST API for ${entity.name}: ${error.message}`);
          }

          // Make Service read-only
          try {
            this._makeServiceReadOnly(srcMainJava, packagePath, entity);
          } catch (error) {
            this.log.error(`Failed to modify service for ${entity.name}: ${error.message}`);
          }
        }
      },
    });
  }

  // ============================================
  // Entity modification methods
  // ============================================

  /**
   * Add @Immutable annotation to entity content (pure function for testing)
   * @param {string} content - Java source code
   * @returns {string} - Modified source code
   */
  _addImmutableAnnotationToContent(content) {
    // Add import
    if (!content.includes(HIBERNATE_IMMUTABLE_IMPORT)) {
      const hibernateImportMatch = content.match(/^import org\.hibernate\.annotations\.[^;]+;$/m);
      if (hibernateImportMatch) {
        content = content.replace(hibernateImportMatch[0], `${HIBERNATE_IMMUTABLE_IMPORT}\n${hibernateImportMatch[0]}`);
      } else {
        const jakartaPersistenceMatch = content.match(/^import jakarta\.persistence\.\*;$/m);
        if (jakartaPersistenceMatch) {
          content = content.replace(jakartaPersistenceMatch[0], `${jakartaPersistenceMatch[0]}\n${HIBERNATE_IMMUTABLE_IMPORT}`);
        } else {
          throw new Error('Could not find suitable import location');
        }
      }
    }

    // Add annotation (OS-independent)
    if (!content.includes('@Immutable')) {
      content = content.replace(/^(\s*)(@Entity\b)/m, '$1@Immutable\n$1$2');
    }

    return content;
  }

  /**
   * Add @Immutable annotation to entity file (I/O wrapper)
   * @param {string} entityFilePath - Path to entity Java file
   */
  _addImmutableToEntity(entityFilePath) {
    this.editFile(entityFilePath, content => {
      try {
        return this._addImmutableAnnotationToContent(content);
      } catch (error) {
        this.log.warn(`${error.message} in ${entityFilePath}`);
        return content;
      }
    });
  }

  /**
   * Make repository read-only by adding documentation
   */
  _makeRepositoryReadOnly(srcMainJava, packagePath, entity) {
    const repositoryFilePath = `${srcMainJava}${packagePath}/repository/${entity.entityClass}Repository.java`;

    if (!this.existsDestination(repositoryFilePath)) {
      this.log.debug(`Repository not found for ${entity.name}, skipping`);
      return;
    }

    this.editFile(repositoryFilePath, content => {
      if (!content.includes(READ_ONLY_REPOSITORY_MARKER)) {
        content = content.replace(
          /(public interface \w+Repository)/,
          `/**\n * ${READ_ONLY_REPOSITORY_MARKER}: ${entity.entityTableName}\n * This entity is mapped to a database view and should not be modified.\n */\n$1`
        );
      }
      return content;
    });
  }

  /**
   * Make REST API read-only by removing mutating endpoints
   */
  _makeRestApiReadOnly(srcMainJava, packagePath, entity) {
    const resourceFilePath = `${srcMainJava}${packagePath}/web/rest/${entity.entityClass}Resource.java`;

    if (!this.existsDestination(resourceFilePath)) {
      this.log.debug(`REST resource not found for ${entity.name}, skipping`);
      return;
    }

    this.log.info(`Making REST API read-only for ${entity.name}`);
    this.editFile(resourceFilePath, content => {
      // Remove mutating methods using brace-counting algorithm
      content = this._removeMethodByAnnotation(content, '@PostMapping');
      content = this._removeMethodByAnnotation(content, '@PutMapping');
      content = this._removeMethodByAnnotation(content, '@PatchMapping');
      content = this._removeMethodByAnnotation(content, '@DeleteMapping');

      // Add class documentation (OS-independent regex)
      if (!content.includes(READ_ONLY_RESOURCE_MARKER)) {
        content = content.replace(
          /(@RestController\s*[\r\n]+\s*@RequestMapping)/,
          `/**\n * ${READ_ONLY_RESOURCE_MARKER}: ${entity.entityTableName}\n * POST/PUT/PATCH/DELETE operations are not supported for views.\n */\n$1`
        );
      }

      // Remove unused imports
      content = this._removeUnusedImports(content);

      return content;
    });
  }

  /**
   * Make Service read-only by removing mutating methods
   */
  _makeServiceReadOnly(srcMainJava, packagePath, entity) {
    const serviceFilePath = `${srcMainJava}${packagePath}/service/${entity.entityClass}Service.java`;

    if (!this.existsDestination(serviceFilePath)) {
      this.log.debug(`Service not found for ${entity.name}, skipping`);
      return;
    }

    this.log.info(`Making Service read-only for ${entity.name}`);
    this.editFile(serviceFilePath, content => {
      content = this._removeMethodBySignature(content, /public\s+\S+\s+save\s*\(/);
      content = this._removeMethodBySignature(content, /public\s+\S+\s+partialUpdate\s*\(/);
      content = this._removeMethodBySignature(content, /public\s+\S+\s+update\s*\(/);
      content = this._removeMethodBySignature(content, /public\s+void\s+delete\s*\(/);

      // Add class documentation (OS-independent regex)
      if (!content.includes(READ_ONLY_SERVICE_MARKER)) {
        content = content.replace(
          /(@Service\s*[\r\n]+\s*@Transactional)/,
          `/**\n * ${READ_ONLY_SERVICE_MARKER}: ${entity.entityTableName}\n * Create/Update/Delete operations are not supported for views.\n */\n$1`
        );
      }

      return content;
    });
  }

  // ============================================
  // Java code parsing utilities
  // ============================================

  /**
   * Normalize a Java line by removing string literals and single-line comments
   * This prevents false positive brace counting in strings/comments
   * @param {string} line - Line to normalize
   * @returns {string} - Normalized line
   */
  _normalizeJavaLine(line) {
    let result = line;

    // Remove string literals (both " and ')
    result = result.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    result = result.replace(/'(?:[^'\\]|\\.)*'/g, "''");

    // Remove single-line comments
    result = result.replace(/\/\/.*$/, '');

    return result;
  }

  /**
   * Find the end of a method body starting from a given line index
   * Handles nested braces, string literals, and comments safely
   * @param {string[]} lines - Array of source lines
   * @param {number} startIndex - Line index to start searching
   * @returns {number} - Line index after method closing brace, or -1 if not found
   */
  _findMethodEnd(lines, startIndex) {
    let i = startIndex;
    let inBlockComment = false;

    // Skip to opening brace
    while (i < lines.length && !lines[i].includes('{')) {
      i++;
    }

    if (i >= lines.length) {
      return -1; // Method body not found
    }

    // Count braces with normalization
    let braceCount = 0;
    let foundOpen = false;

    while (i < lines.length) {
      const currentLine = lines[i];
      const trimmed = currentLine.trim();

      // Handle block comments
      if (inBlockComment) {
        if (trimmed.includes('*/')) {
          inBlockComment = false;
        }
        i++;
        continue;
      }

      if (trimmed.startsWith('/*')) {
        inBlockComment = true;
        if (trimmed.includes('*/')) {
          inBlockComment = false;
        }
        i++;
        continue;
      }

      // Normalize line to ignore strings and single-line comments
      const normalized = this._normalizeJavaLine(currentLine);

      for (const char of normalized) {
        if (char === '{') {
          braceCount++;
          foundOpen = true;
        } else if (char === '}') {
          braceCount--;
          if (foundOpen && braceCount === 0) {
            return i + 1; // Return line after closing brace
          }
        }
      }
      i++;
    }

    return -1; // Method end not found
  }

  /**
   * Remove a method from Java source by its annotation using brace counting
   * Handles arbitrary nesting levels, string literals, and comments safely
   * @param {string} content - Java source code
   * @param {string} annotation - Annotation to match (e.g., '@PostMapping')
   * @returns {string} - Modified source code
   */
  _removeMethodByAnnotation(content, annotation) {
    const lines = content.split(/\r?\n/);
    const result = [];
    let i = 0;
    let inJavadoc = false;

    while (i < lines.length) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Handle Javadoc blocks - don't match annotations inside them
      if (trimmedLine.startsWith('/**')) {
        inJavadoc = true;
      }
      if (inJavadoc) {
        result.push(line);
        if (trimmedLine.includes('*/')) {
          inJavadoc = false;
        }
        i++;
        continue;
      }

      // Detect target annotation (only outside Javadoc)
      if (trimmedLine.startsWith(annotation)) {
        const startIndex = i;
        const endIndex = this._findMethodEnd(lines, i);

        if (endIndex === -1) {
          // Malformed method, keep remaining lines
          for (let j = startIndex; j < lines.length; j++) {
            result.push(lines[j]);
          }
          break;
        }

        this.log.debug(`Removed method with ${annotation} (lines ${startIndex + 1}-${endIndex})`);
        i = endIndex;
      } else {
        result.push(line);
        i++;
      }
    }

    return result.join('\n');
  }

  /**
   * Remove a method from Java source by matching its signature pattern
   * Uses brace counting for safe removal
   * @param {string} content - Java source code
   * @param {RegExp} signaturePattern - Regex pattern for method signature
   * @returns {string} - Modified source code
   */
  _removeMethodBySignature(content, signaturePattern) {
    const lines = content.split(/\r?\n/);
    const result = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Check if line matches method signature pattern
      if (signaturePattern.test(line)) {
        const startIndex = i;
        const endIndex = this._findMethodEnd(lines, i);

        if (endIndex === -1) {
          // Malformed method, keep remaining lines
          for (let j = startIndex; j < lines.length; j++) {
            result.push(lines[j]);
          }
          break;
        }

        this.log.debug(`Removed method matching ${signaturePattern} (lines ${startIndex + 1}-${endIndex})`);
        i = endIndex;
      } else {
        result.push(line);
        i++;
      }
    }

    return result.join('\n');
  }

  // ============================================
  // Import management utilities
  // ============================================

  /**
   * Create usage patterns for a class name (memoized for performance)
   * @param {string} className - Class name to check
   * @returns {RegExp[]} - Array of patterns to detect usage
   */
  _createUsagePatterns(className) {
    if (!this._usagePatternCache.has(className)) {
      const patterns = [
        new RegExp(`@${className}\\b`), // Annotation
        new RegExp(`\\b${className}\\.`), // Static method/constant
        new RegExp(`\\bnew\\s+${className}\\b`), // Constructor
        new RegExp(`\\b${className}\\s+\\w+`), // Type declaration
        new RegExp(`<${className}[>,]`), // Generics
        new RegExp(`\\(${className}\\b`), // Parameter type
        new RegExp(`throws\\s+.*\\b${className}\\b`), // Exception declaration
        new RegExp(`extends\\s+${className}\\b`), // Inheritance
        new RegExp(`implements\\s+.*\\b${className}\\b`), // Interface implementation
      ];
      this._usagePatternCache.set(className, patterns);
    }

    return this._usagePatternCache.get(className);
  }

  /**
   * Remove unused imports from Java source using word boundary matching
   * @param {string} content - Java source code
   * @returns {string} - Modified source code
   */
  _removeUnusedImports(content) {
    const importsToCheck = [
      // Spring Web annotations
      'import org.springframework.web.bind.annotation.PostMapping;',
      'import org.springframework.web.bind.annotation.PutMapping;',
      'import org.springframework.web.bind.annotation.PatchMapping;',
      'import org.springframework.web.bind.annotation.DeleteMapping;',
      'import org.springframework.web.bind.annotation.RequestBody;',
      'import org.springframework.web.bind.annotation.ResponseStatus;',
      'import org.springframework.http.HttpStatus;',
      // Validation
      'import jakarta.validation.Valid;',
      'import jakarta.validation.constraints.NotNull;',
      // Java utilities
      'import java.net.URI;',
      'import java.net.URISyntaxException;',
      'import java.util.Objects;',
      // JHipster utilities
      'import tech.jhipster.web.util.HeaderUtil;',
    ];

    for (const importLine of importsToCheck) {
      const classNameMatch = importLine.match(/\.([A-Za-z]+);$/);
      if (!classNameMatch) continue;

      const className = classNameMatch[1];
      const contentWithoutImport = content.replace(importLine, '');

      // Use memoized patterns for performance
      const usagePatterns = this._createUsagePatterns(className);
      const isUsed = usagePatterns.some(pattern => pattern.test(contentWithoutImport));

      if (!isUsed) {
        // Remove import line (handle both \n and \r\n)
        content = content.replace(new RegExp(importLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\r?\\n'), '');
        this.log.debug(`Removed unused import: ${className}`);
      }
    }

    return content;
  }
}
