/**
 * JHipster View Blueprint - Server Generator
 * Adds @Immutable annotation to View entities and makes repositories read-only
 * Also generates MyBatis POJOs and Mapper interfaces for entities with @MyBatis annotation
 */
import BaseApplicationGenerator from 'generator-jhipster/generators/server';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Constants
const HIBERNATE_IMMUTABLE_IMPORT = 'import org.hibernate.annotations.Immutable;';
const READ_ONLY_REPOSITORY_MARKER = 'Read-only repository for database view';
const READ_ONLY_RESOURCE_MARKER = 'Read-only REST controller for database view';
const READ_ONLY_SERVICE_MARKER = 'Read-only service for database view';

// MyBatis default configuration
const MYBATIS_DEFAULT_CONFIG = {
  modelSuffix: 'Model',
  mapperSuffix: 'ModelMapper',
  modelPackage: 'mybatis.model',
  mapperPackage: 'mybatis.mapper',
};

export default class extends BaseApplicationGenerator {
  constructor(args, opts, features) {
    super(args, opts, { ...features, sbsBlueprint: true });
    this._usagePatternCache = new Map();
    this._myBatisConfig = null;
    this._myBatisEntities = [];
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

        // Check if entity has @MyBatis annotation
        const isMyBatis = entity.annotations?.mybatis || entity.annotations?.MyBatis || entity.annotations?.Mybatis;
        if (isMyBatis) {
          this.log.info(`Marking entity ${entity.name} for MyBatis generation`);
          entity.isMyBatis = true;

          // Track MyBatis entities for later processing
          this._myBatisEntities.push(entity);

          // Log the combination with View
          if (entity.isView) {
            this.log.info(`  Entity ${entity.name} is a View + MyBatis combination (read-only mapper)`);
          } else {
            this.log.info(`  Entity ${entity.name} is MyBatis only (CRUD mapper)`);
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

          // Make Integration Test read-only
          try {
            this._makeIntegrationTestReadOnly(application, packagePath, entity);
          } catch (error) {
            this.log.error(`Failed to modify integration test for ${entity.name}: ${error.message}`);
          }
        }
      },

      async generateMyBatisFiles({ application, entities }) {
        // Filter for MyBatis entities
        const myBatisEntities = entities.filter(e =>
          e.isMyBatis || e.annotations?.mybatis || e.annotations?.MyBatis || e.annotations?.Mybatis
        );

        if (myBatisEntities.length === 0) {
          return;
        }

        this.log.info(`Generating MyBatis files for ${myBatisEntities.length} entities`);

        // Load MyBatis configuration from .yo-rc.json
        const myBatisConfig = this._loadMyBatisConfig();
        const packagePath = application.packageName?.replace(/\./g, '/') || 'com/example/app';
        const srcMainJava = application.srcMainJava || 'src/main/java/';

        for (const entity of myBatisEntities) {
          const isReadOnly = entity.isView || entity.annotations?.view || entity.annotations?.View;

          // Generate MyBatis POJO
          try {
            this._generateMyBatisPojo(srcMainJava, packagePath, application.packageName, entity, myBatisConfig);
            this.log.info(`Generated MyBatis POJO for ${entity.name}`);
          } catch (error) {
            this.log.error(`Failed to generate MyBatis POJO for ${entity.name}: ${error.message}`);
          }

          // Generate Mapper Interface
          try {
            this._generateMapperInterface(srcMainJava, packagePath, application.packageName, entity, myBatisConfig, isReadOnly);
            this.log.info(`Generated MyBatis Mapper for ${entity.name} (${isReadOnly ? 'read-only' : 'CRUD'})`);
          } catch (error) {
            this.log.error(`Failed to generate MyBatis Mapper for ${entity.name}: ${error.message}`);
          }
        }

        // Append MyBatis configuration to application.yml
        try {
          this._appendMyBatisConfigToYaml(application, myBatisConfig);
          this.log.info('Appended MyBatis configuration to application.yml');
        } catch (error) {
          this.log.error(`Failed to append MyBatis config to application.yml: ${error.message}`);
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

  /**
   * Make Integration Test read-only by disabling tests that require data insertion
   * View entities cannot use saveAndFlush/delete operations
   */
  _makeIntegrationTestReadOnly(application, packagePath, entity) {
    const srcTestJava = application.srcTestJava || 'src/test/java/';
    const testFilePath = `${srcTestJava}${packagePath}/web/rest/${entity.entityClass}ResourceIT.java`;

    if (!this.existsDestination(testFilePath)) {
      this.log.debug(`Integration test not found for ${entity.name}, skipping`);
      return;
    }

    this.log.info(`Making Integration Test read-only for ${entity.name}`);
    this.editFile(testFilePath, content => {
      const originalContent = content;
      const modifications = [];

      // Detect line ending style
      const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';

      // Add @Disabled import if not present
      if (!content.includes('import org.junit.jupiter.api.Disabled;')) {
        const explicitImport = /import org\.junit\.jupiter\.api\.Test;/;
        const wildcardImport = /import org\.junit\.jupiter\.api\.\*;/;

        if (explicitImport.test(content)) {
          content = content.replace(
            explicitImport,
            `import org.junit.jupiter.api.Disabled;${lineEnding}import org.junit.jupiter.api.Test;`
          );
          modifications.push('@Disabled import');
        } else if (wildcardImport.test(content)) {
          // Wildcard import already covers @Disabled
          this.log.debug(`Using wildcard import - @Disabled already available in ${entity.name}`);
        } else {
          // Fallback: add import after package statement
          content = content.replace(/^(package\s+[^;]+;)/m,
            `$1${lineEnding}${lineEnding}import org.junit.jupiter.api.Disabled;`);
          modifications.push('@Disabled import (fallback)');
          this.log.warn(`Added @Disabled import after package statement in ${testFilePath}`);
        }
      }

      // Add @Disabled annotation to the test class (check for annotation at class level, not just substring)
      const hasDisabledAnnotation = /@Disabled\s*(?:\([^)]*\))?\s*[\r\n]/.test(content);
      if (!hasDisabledAnnotation) {
        const newContent = content.replace(
          /(@IntegrationTest\s*[\r\n]+)/,
          `$1@Disabled("View entity tests are disabled - @Immutable entities cannot use saveAndFlush/delete operations")${lineEnding}`
        );
        if (newContent !== content) {
          content = newContent;
          modifications.push('@Disabled annotation');
        }
      }

      // Add documentation comment
      const viewTestMarker = 'This test class is disabled because the entity is a database view';
      if (!content.includes(viewTestMarker)) {
        // More flexible pattern that handles singular/plural and different whitespace
        const javadocPattern = /\/\*\*\s*[\r\n]+\s*\*\s*Integration tests? for/i;
        if (javadocPattern.test(content)) {
          content = content.replace(
            javadocPattern,
            `/**${lineEnding} * ${viewTestMarker}.${lineEnding} * @Immutable entities cannot be persisted or deleted via JPA repository.${lineEnding} * To test view queries, use native SQL to populate the underlying table.${lineEnding} *${lineEnding} * Integration tests for`
          );
          modifications.push('Javadoc comment');
        } else {
          this.log.warn(`Could not find standard Javadoc pattern in ${testFilePath}`);
        }
      }

      // Log modification summary
      if (content === originalContent) {
        this.log.warn(`No modifications made to ${testFilePath} - file may already be modified or patterns don't match`);
      } else if (modifications.length > 0) {
        this.log.info(`Applied modifications to ${entity.name} test: ${modifications.join(', ')}`);
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
    // Detect and preserve line ending style
    const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
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

    return result.join(lineEnding);
  }

  /**
   * Remove a method from Java source by matching its signature pattern
   * Uses brace counting for safe removal
   * @param {string} content - Java source code
   * @param {RegExp} signaturePattern - Regex pattern for method signature
   * @returns {string} - Modified source code
   */
  _removeMethodBySignature(content, signaturePattern) {
    // Detect and preserve line ending style
    const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
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

    return result.join(lineEnding);
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

  // ============================================
  // MyBatis generation methods
  // ============================================

  /**
   * Load MyBatis configuration from .yo-rc.json
   * @returns {Object} - MyBatis configuration with defaults
   */
  _loadMyBatisConfig() {
    if (this._myBatisConfig) {
      return this._myBatisConfig;
    }

    // Try to read from .yo-rc.json
    let config = { ...MYBATIS_DEFAULT_CONFIG };

    try {
      const yoRcPath = this.destinationPath('.yo-rc.json');
      if (this.existsDestination('.yo-rc.json')) {
        const yoRcContent = this.readDestination('.yo-rc.json');
        const yoRc = JSON.parse(yoRcContent);
        const blueprintConfig = yoRc['generator-jhipster-view-blueprint'];

        if (blueprintConfig?.mybatis) {
          config = {
            ...MYBATIS_DEFAULT_CONFIG,
            ...blueprintConfig.mybatis,
          };
          this.log.info('Loaded MyBatis configuration from .yo-rc.json');
        }
      }
    } catch (error) {
      this.log.warn(`Failed to load MyBatis config from .yo-rc.json: ${error.message}. Using defaults.`);
    }

    this._myBatisConfig = config;
    return config;
  }

  /**
   * Convert camelCase to snake_case
   * Handles consecutive uppercase letters properly (e.g., XMLParser -> xml_parser)
   * @param {string} str - camelCase string
   * @returns {string} - snake_case string
   */
  _toSnakeCase(str) {
    return str
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
      .replace(/([a-z\d])([A-Z])/g, '$1_$2')
      .toLowerCase()
      .replace(/^_/, '');
  }

  /**
   * Map JHipster field type to Java type for MyBatis POJO
   * @param {Object} field - JHipster field object
   * @returns {string} - Java type
   */
  _mapFieldTypeToJava(field) {
    const typeMapping = {
      String: 'String',
      Integer: 'Integer',
      Long: 'Long',
      Float: 'Float',
      Double: 'Double',
      BigDecimal: 'java.math.BigDecimal',
      LocalDate: 'java.time.LocalDate',
      Instant: 'java.time.Instant',
      ZonedDateTime: 'java.time.ZonedDateTime',
      Duration: 'java.time.Duration',
      UUID: 'java.util.UUID',
      Boolean: 'Boolean',
      Enum: field.fieldType, // Use actual enum type
      byte: 'byte[]',
      ByteBuffer: 'java.nio.ByteBuffer',
    };

    // Handle blob types
    if (field.fieldTypeBlobContent) {
      return 'byte[]';
    }

    return typeMapping[field.fieldType] || field.fieldType || 'Object';
  }

  /**
   * Determine if a type needs to be imported
   * @param {string} javaType - Java type string
   * @returns {string|null} - Import statement or null if not needed
   */
  _getImportForType(javaType) {
    // Primitive types and java.lang types don't need imports
    if (!javaType || javaType.startsWith('java.lang.') || ['String', 'Integer', 'Long', 'Float', 'Double', 'Boolean', 'Object', 'byte[]'].includes(javaType)) {
      return null;
    }

    // Types with full package path
    if (javaType.includes('.')) {
      return `import ${javaType};`;
    }

    return null;
  }

  /**
   * Generate MyBatis POJO class
   * @param {string} srcMainJava - Source main java path
   * @param {string} packagePath - Package path (e.g., 'com/example/app')
   * @param {string} packageName - Package name (e.g., 'com.example.app')
   * @param {Object} entity - Entity object
   * @param {Object} config - MyBatis configuration
   */
  _generateMyBatisPojo(srcMainJava, packagePath, packageName, entity, config) {
    const modelClassName = `${entity.entityClass}${config.modelSuffix}`;
    const modelPackage = `${packageName}.${config.modelPackage}`;
    const modelPackagePath = config.modelPackage.replace(/\./g, '/');
    const filePath = `${srcMainJava}${packagePath}/${modelPackagePath}/${modelClassName}.java`;

    // Detect line ending style (default to LF for new files)
    const lineEnding = '\n';

    // Collect imports for field types
    const imports = new Set();
    imports.add('import lombok.Data;');

    // Generate fields
    const fields = [];

    // Add id field (typically Long for JHipster entities)
    const idFieldType = entity.primaryKey?.type || 'Long';
    fields.push(`    private ${idFieldType} id;`);

    // Add entity fields
    if (entity.fields) {
      for (const field of entity.fields) {
        const javaType = this._mapFieldTypeToJava(field);
        const importStmt = this._getImportForType(javaType);
        if (importStmt) {
          imports.add(importStmt);
        }

        // Use simple type name in field declaration
        const simpleType = javaType.includes('.') ? javaType.split('.').pop() : javaType;
        fields.push(`    private ${simpleType} ${field.fieldName};`);
      }
    }

    // Build the file content
    const content = [
      `package ${modelPackage};`,
      '',
      ...Array.from(imports).sort(),
      '',
      '/**',
      ` * MyBatis POJO for ${entity.entityClass} entity.`,
      entity.isView ? ' * This is a read-only model mapped to a database view.' : ' * This model is used for MyBatis data access.',
      ' */',
      '@Data',
      `public class ${modelClassName} {`,
      '',
      fields.join(lineEnding),
      '',
      '}',
      '',
    ].join(lineEnding);

    // Write the file
    this.writeDestination(filePath, content);
    this.log.debug(`Created MyBatis POJO: ${filePath}`);
  }

  /**
   * Generate MyBatis Mapper interface
   * @param {string} srcMainJava - Source main java path
   * @param {string} packagePath - Package path (e.g., 'com/example/app')
   * @param {string} packageName - Package name (e.g., 'com.example.app')
   * @param {Object} entity - Entity object
   * @param {Object} config - MyBatis configuration
   * @param {boolean} isReadOnly - Whether this is a read-only mapper (for Views)
   */
  _generateMapperInterface(srcMainJava, packagePath, packageName, entity, config, isReadOnly) {
    const modelClassName = `${entity.entityClass}${config.modelSuffix}`;
    const mapperClassName = `${entity.entityClass}${config.mapperSuffix}`;
    const modelPackage = `${packageName}.${config.modelPackage}`;
    const mapperPackage = `${packageName}.${config.mapperPackage}`;
    const mapperPackagePath = config.mapperPackage.replace(/\./g, '/');
    const filePath = `${srcMainJava}${packagePath}/${mapperPackagePath}/${mapperClassName}.java`;
    // Use JHipster's table name if available, otherwise convert from entity class name
    const tableName = entity.entityTableName || this._toSnakeCase(entity.entityClass);

    // Detect line ending style (default to LF for new files)
    const lineEnding = '\n';

    // Get the ID type from entity (supports Long, UUID, etc.)
    const idType = entity.primaryKey?.type || 'Long';

    // Build imports
    const imports = [
      `import ${modelPackage}.${modelClassName};`,
      'import org.apache.ibatis.annotations.Mapper;',
      'import org.apache.ibatis.annotations.Select;',
    ];

    if (!isReadOnly) {
      imports.push('import org.apache.ibatis.annotations.Delete;');
      imports.push('import org.apache.ibatis.annotations.Insert;');
      imports.push('import org.apache.ibatis.annotations.Options;');
      imports.push('import org.apache.ibatis.annotations.Update;');
    }

    imports.push('import java.util.List;');

    // Add UUID import if the ID type is UUID
    if (idType === 'UUID') {
      imports.push('import java.util.UUID;');
    }

    imports.sort();

    // Build methods
    const methods = [];

    // findAll method
    methods.push('    /**');
    methods.push('     * Retrieves all records.');
    methods.push('     * @return List of all records');
    methods.push('     */');
    methods.push(`    @Select("SELECT * FROM ${tableName}")`);
    methods.push(`    List<${modelClassName}> findAll();`);

    // findById method
    methods.push('');
    methods.push('    /**');
    methods.push('     * Retrieves a record by ID.');
    methods.push('     * @param id the record ID');
    methods.push('     * @return the record, or null if not found');
    methods.push('     */');
    methods.push(`    @Select("SELECT * FROM ${tableName} WHERE id = #{id}")`);
    methods.push(`    ${modelClassName} findById(${idType} id);`);

    if (!isReadOnly) {
      // Generate INSERT columns and values from entity fields (exclude 'id' - auto-generated by database)
      const insertColumns = [];
      const insertValues = [];

      if (entity.fields) {
        for (const field of entity.fields) {
          insertColumns.push(this._toSnakeCase(field.fieldName));
          insertValues.push(`#{${field.fieldName}}`);
        }
      }

      // insert method (only if there are fields to insert)
      if (insertColumns.length > 0) {
        methods.push('');
        methods.push('    /**');
        methods.push('     * Inserts a new record.');
        methods.push(`     * @param ${entity.entityInstance} the record to insert`);
        methods.push('     */');
        methods.push(`    @Insert("INSERT INTO ${tableName} (${insertColumns.join(', ')}) VALUES (${insertValues.join(', ')})")`);
        methods.push('    @Options(useGeneratedKeys = true, keyProperty = "id")');
        methods.push(`    void insert(${modelClassName} ${entity.entityInstance});`);
      } else {
        this.log.info(`Entity ${entity.name} has no fields - skipping INSERT method generation`);
      }

      // Generate UPDATE SET clause
      const updateSetParts = [];
      if (entity.fields) {
        for (const field of entity.fields) {
          updateSetParts.push(`${this._toSnakeCase(field.fieldName)} = #{${field.fieldName}}`);
        }
      }

      // update method (only if there are fields to update)
      if (updateSetParts.length > 0) {
        const updateSetClause = updateSetParts.join(', ');

        methods.push('');
        methods.push('    /**');
        methods.push('     * Updates an existing record.');
        methods.push(`     * @param ${entity.entityInstance} the record to update`);
        methods.push('     */');
        methods.push(`    @Update("UPDATE ${tableName} SET ${updateSetClause} WHERE id = #{id}")`);
        methods.push(`    void update(${modelClassName} ${entity.entityInstance});`);
      } else {
        this.log.info(`Entity ${entity.name} has no fields - skipping UPDATE method generation`);
      }

      // deleteById method
      methods.push('');
      methods.push('    /**');
      methods.push('     * Deletes a record by ID.');
      methods.push('     * @param id the record ID');
      methods.push('     */');
      methods.push(`    @Delete("DELETE FROM ${tableName} WHERE id = #{id}")`);
      methods.push(`    void deleteById(${idType} id);`);
    }

    // Build the file content
    const classComment = isReadOnly
      ? [
          '/**',
          ` * MyBatis Mapper for ${entity.entityClass} view.`,
          ' * This is a read-only mapper - INSERT/UPDATE/DELETE operations are not supported.',
          ' */',
        ]
      : [
          '/**',
          ` * MyBatis Mapper for ${entity.entityClass} entity.`,
          ' * Provides CRUD operations via annotation-based SQL.',
          ' */',
        ];

    const content = [
      `package ${mapperPackage};`,
      '',
      ...imports,
      '',
      ...classComment,
      '@Mapper',
      `public interface ${mapperClassName} {`,
      '',
      methods.join(lineEnding),
      '',
      '}',
      '',
    ].join(lineEnding);

    // Write the file
    this.writeDestination(filePath, content);
    this.log.debug(`Created MyBatis Mapper: ${filePath}`);
  }

  /**
   * Append MyBatis configuration to application.yml using JHipster needle
   * Tries multiple needle markers for compatibility, falls back to appending at end of file
   * @param {Object} application - Application object
   * @param {Object} config - MyBatis configuration
   */
  _appendMyBatisConfigToYaml(application, config) {
    const packageName = application.packageName || 'com.example.app';
    const modelPackage = `${packageName}.${config.modelPackage}`;

    // Build YAML content to append
    const yamlContent = [
      'mybatis:',
      `  type-aliases-package: ${modelPackage}`,
      '  configuration:',
      '    map-underscore-to-camel-case: true',
    ].join('\n');

    // Paths to check
    const configPath = 'src/main/resources/config/application.yml';

    if (!this.existsDestination(configPath)) {
      this.log.warn(`application.yml not found at ${configPath}. Skipping MyBatis config append.`);
      return;
    }

    this.editFile(configPath, content => {
      // Detect line ending style
      const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';

      // Check if mybatis config already exists
      if (content.includes('mybatis:')) {
        this.log.debug('MyBatis configuration already exists in application.yml');
        return content;
      }

      // List of JHipster needle markers to try (in order of preference)
      // Different JHipster versions may use different needle names
      const needleMarkers = [
        '# jhipster-needle-application-properties',
        '# jhipster-needle-add-application-yaml-document',
      ];

      // Try each needle marker
      for (const needleMarker of needleMarkers) {
        if (content.includes(needleMarker)) {
          const insertContent = yamlContent.split('\n').join(lineEnding) + lineEnding + lineEnding;
          content = content.replace(needleMarker, insertContent + needleMarker);
          this.log.debug(`Inserted MyBatis config before needle: ${needleMarker}`);
          return content;
        }
      }

      // Fallback: append at the end of the file
      // This handles cases where no needle marker is found
      const insertContent = lineEnding + yamlContent.split('\n').join(lineEnding) + lineEnding;
      content = content + insertContent;
      this.log.debug('No JHipster needle found - appended MyBatis config at end of file');

      return content;
    });
  }
}
